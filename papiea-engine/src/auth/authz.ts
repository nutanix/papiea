import {UserAuthInfo} from "./authn"
import {Provider_DB} from "../databases/provider_db_interface"
import {Action, Provider, IntentWatcher, Entity, Provider_Entity_Reference} from "papiea-core"
import {PermissionDeniedError, UnauthorizedError} from "../errors/permission_error"
import {BadRequestError} from "../errors/bad_request_error"
import {Logger} from "papiea-backend-utils"
import * as Async from '../utils/async'
import { Entity_DB } from "../databases/entity_db_interface"

export abstract class Authorizer {
    constructor() {
    }

    abstract checkPermission(user: UserAuthInfo, object: any, action: Action, provider?: Provider): Promise<void>;

    filter<T>(logger: Logger, user: UserAuthInfo, objectList: Async.AnyIterable<T>, action: Action, provider?: Provider, transformfn?: (object: any) => any): AsyncIterable<T> {
        return Async.filter(objectList, async (object) => {
            try {
                if (transformfn) {
                    await this.checkPermission(user, transformfn(object), action, provider);
                } else {
                    await this.checkPermission(user, object, action, provider);
                }
                return true;
            } catch (e) {
                logger.debug(`Failed to filter in authorizer for provider ${provider?.prefix}/${provider?.version} due to error: ${e}`)
                return false;
            }
        });
    }

    on_auth_changed(provider: Readonly<Provider>) {

    }
}

export class NoAuthAuthorizer extends Authorizer {
    async checkPermission(user: UserAuthInfo, object: any, action: Action, provider?: Provider): Promise<void> {
    }
}

export interface ProviderAuthorizerFactory {
    createAuthorizer(provider: Provider): Promise<Authorizer>;
}

export interface EntityAuthorizerFactory {
    createAuthorizer(entity: any): Promise<Authorizer>;
}

export class IntentWatcherAuthorizer extends Authorizer {
    private perProviderAuthorizer: PerProviderAuthorizer;
    private entity_db: Entity_DB;
    private provider_db: Provider_DB;
    private logger: Logger;

    constructor(logger: Logger, perProviderAuthorizer: PerProviderAuthorizer, entity_db: Entity_DB, provider_db: Provider_DB) {
        super()
        this.logger = logger;
        this.perProviderAuthorizer = perProviderAuthorizer;
        this.entity_db = entity_db;
        this.provider_db = provider_db;
    }

    async checkPermission(user: UserAuthInfo, object: IntentWatcher, action: Action): Promise<void> {
        if (object === undefined || object === null) {
            // We shouldn't reach this under normal circumstances
            throw new BadRequestError({ message: "No intent watcher provided in the authorizer permission check." })
        }
        if (user === undefined || user === null) {
            // We shouldn't reach this under normal circumstances
            throw new PermissionDeniedError({ message: `No user provided to check permission for intent watcher on kind: ${object.entity_ref.provider_prefix}/${object.entity_ref.provider_version}/${object.entity_ref.kind}. Specify a valid user.`, entity_info: { provider_prefix: object.entity_ref.provider_prefix, provider_version: object.entity_ref.provider_version, kind_name: object.entity_ref.kind, additional_info: { "entity_uuid": object.entity_ref.uuid, "watcher_uuid": object.uuid }}})
        }
        const entity_ref: Provider_Entity_Reference = object.entity_ref;
        if (entity_ref === undefined || object === null) {
            // We shouldn't reach this under normal circumstances
            throw new BadRequestError({ message: `No entity ref present in the intent watcher object for check permission for provider: ${object.entity_ref.provider_prefix}/${object.entity_ref.provider_version}. Make sure the watcher has an associated entity.`, entity_info: { provider_prefix: object.entity_ref.provider_prefix, provider_version: object.entity_ref.provider_version, additional_info: { "watcher_uuid": object.uuid }}})
        }

        const provider: Provider = await this.provider_db.get_provider(entity_ref.provider_prefix, entity_ref.provider_version);
        const { metadata: entity_metadata } = await this.entity_db.get_entity(entity_ref);
        return await this.perProviderAuthorizer.checkPermission(user, entity_metadata, action, provider)
    }
}

export class PerProviderAuthorizer extends Authorizer {
    private providerToAuthorizer: { [key: string]: Authorizer | null; };
    private kindToProviderPrefix: { [key: string]: string; };
    private providerAuthorizerFactory: ProviderAuthorizerFactory;
    private logger: Logger;

    constructor(logger: Logger, providerAuthorizerFactory: ProviderAuthorizerFactory) {
        super();
        this.providerToAuthorizer = {};
        this.kindToProviderPrefix = {};
        this.providerAuthorizerFactory = providerAuthorizerFactory;
        this.logger = logger;
    }

    on_auth_changed(provider: Readonly<Provider>) {
        delete this.providerToAuthorizer[provider.prefix];
    }

    private async getAuthorizerByObject(provider: Provider): Promise<Authorizer | null> {
        if (provider.prefix in this.providerToAuthorizer) {
            return this.providerToAuthorizer[provider.prefix];
        }
        if (!provider.authModel || !provider.policy) {
            this.providerToAuthorizer[provider.prefix] = null;
            return null;
        }
        const authorizer = await this.providerAuthorizerFactory.createAuthorizer(provider);
        this.providerToAuthorizer[provider.prefix] = authorizer;
        return authorizer;
    }

    async checkPermission(user: UserAuthInfo, object: any, action: Action, provider?: Provider): Promise<void> {
        if (provider === undefined || provider === null) {
            // We shouldn't reach this under normal circumstances
            throw new BadRequestError({ message: "No provider exists in the provider check permission. Specify a valid provider." })
        }
        const authorizer: Authorizer | null = await this.getAuthorizerByObject(provider!)
        if (authorizer === null) {
            return;
        }
        if (!user) {
            throw new UnauthorizedError({ message: `No user provided in the provider check permission for provider: ${provider.prefix}/${provider.version}. Make sure you have a valid user.`, entity_info: { provider_prefix: provider.prefix, provider_version: provider.version }});
        }
        if (user.is_admin) {
            return;
        }
        if (user.is_provider_admin) {
            // For provider-admin provider_prefix must be set
            if (user.provider_prefix === provider!.prefix) {
                return;
            } else {
                throw new PermissionDeniedError({ message: `Provider admin has wrong prefix for the provider in check permission: ${provider.prefix}/${provider.version}. Make sure the provider admin has correct prefix for provider.`, entity_info: { provider_prefix: provider.prefix, provider_version: provider.version, additional_info: { "provider_admin": JSON.stringify(user) }}});
            }
        }
        return authorizer.checkPermission(user, object, action, provider);
    }
}

export class AdminAuthorizer extends Authorizer {
    async checkPermission(user: UserAuthInfo, object: any, action: Action): Promise<void> {
        if (!user) {
            throw new UnauthorizedError({ message: "No user provided in the admin authorizer permission check. Make sure you have a valid user." });
        }
        if (user.is_admin) {
            return;
        }
        if (action === Action.CreateS2SKey) {
            // object.user_info contains UserInfo which will be used when s2s key is passed
            // check who can talk on behalf of whom
            if (object.owner !== user.owner || object.user_info.is_admin) {
                throw new PermissionDeniedError({ message: `User has wrong owner for the object in admin permission check to create s2skey. Make sure the object has correct owner.`, entity_info: { additional_info: { "user": JSON.stringify(user), "object_owner": object.owner }}});
            }
            if (user.provider_prefix !== undefined
                && object.provider_prefix !== user.provider_prefix) {
                throw new PermissionDeniedError({ message: `User has wrong provider prefix for the object in admin permission check to create s2skey for provider: ${object.provider_prefix}. Make sure the user has correct prefix for provider.`, entity_info: { provider_prefix: object.provider_prefix, additional_info: { "user": JSON.stringify(user) }}});
            }
            if (user.is_provider_admin) {
                return;
            }
            if (object.user_info.is_provider_admin
                || object.user_info.owner !== user.owner) {
                throw new PermissionDeniedError({ message: `User has wrong owner for the object's user info in admin permission check to create s2skey. Provider valid owner in the object's user info.`, entity_info: { additional_info: { "user": JSON.stringify(user), "object_owner": object.owner }}});
            }
            return;
        }
        if (action === Action.ReadS2SKey || action === Action.InactivateS2SKey) {
            if (object.owner !== user.owner
                || (user.provider_prefix !== undefined && object.provider_prefix !== user.provider_prefix)) {
                throw new PermissionDeniedError({ message: `User has wrong provider prefix for the object in admin permission check to read/inactivate s2skey for provider: ${object.provider_prefix}. Make sure the user has correct prefix for provider.`, entity_info: { provider_prefix: object.provider_prefix, additional_info:{ "user": JSON.stringify(user) }}});
            } else {
                return;
            }
        }
        if (user.is_provider_admin && object.prefix === user.provider_prefix) {
            return;
        }
        throw new PermissionDeniedError({ message: `Something went wrong in admin permission check.`, entity_info: { additional_info: { "user": JSON.stringify(user), "action": action, "entity": JSON.stringify(object) }}});
    }
}
