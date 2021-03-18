import {UserAuthInfo} from "./authn"
import {Spec_DB} from "../databases/spec_db_interface"
import {Provider_DB} from "../databases/provider_db_interface"
import {Action, Provider, IntentWatcher, PapieaEngineTags, Provider_Entity_Reference} from "papiea-core"
import {PermissionDeniedError, UnauthorizedError} from "../errors/permission_error"
import {BadRequestError} from "../errors/bad_request_error"
import {Logger} from "papiea-backend-utils"

function mapAsync<T, U>(array: T[], callbackfn: (value: T, index: number, array: T[]) => Promise<U>): Promise<U[]> {
    return Promise.all(array.map(callbackfn));
}

async function filterAsync<T>(array: T[], callbackfn: (value: T, index: number, array: T[]) => Promise<boolean>): Promise<T[]> {
    const filterMap = await mapAsync(array, callbackfn);
    return array.filter((value, index) => filterMap[index]);
}

export abstract class Authorizer {
    constructor() {
    }

    abstract checkPermission(user: UserAuthInfo, object: any, action: Action, provider?: Provider): Promise<void>;

    async filter(user: UserAuthInfo, objectList: any[], action: Action, provider?: Provider, transformfn?: (object: any) => any): Promise<any[]> {
        return filterAsync(objectList, async (object) => {
            try {
                if (transformfn) {
                    await this.checkPermission(user, transformfn(object), action, provider);
                } else {
                    await this.checkPermission(user, object, action, provider);
                }
                return true;
            } catch (e) {
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
    private spec_db: Spec_DB;
    private provider_db: Provider_DB;
    private logger: Logger;

    constructor(logger: Logger, perProviderAuthorizer: PerProviderAuthorizer, spec_db: Spec_DB, provider_db: Provider_DB) {
        super()
        this.logger = logger;
        this.perProviderAuthorizer = perProviderAuthorizer;
        this.spec_db = spec_db;
        this.provider_db = provider_db;
    }

    async checkPermission(user: UserAuthInfo, object: IntentWatcher, action: Action): Promise<void> {
        this.logger.debug(`BEGIN ${this.checkPermission.name} for intent watcher`, { tags: [PapieaEngineTags.Auth] })
        if (object === undefined || object === null) {
            // We shouldn't reach this under normal circumstances
            throw new BadRequestError("No intent watcher provided in the authorizer permission check")
        }
        if (user === undefined || user === null) {
            // We shouldn't reach this under normal circumstances
            throw new PermissionDeniedError(`No user provided to check permission for intent watcher on kind ${object.entity_ref.provider_prefix}/${object.entity_ref.provider_version}/${object.entity_ref.kind}`, { provider_prefix: object.entity_ref.provider_prefix, provider_version: object.entity_ref.provider_version, kind_name: object.entity_ref.kind, additional_info: { "entity_uuid": object.entity_ref.uuid, "watcher_uuid": object.uuid }})
        }
        const entity_ref: Provider_Entity_Reference = object.entity_ref;
        if (entity_ref === undefined || object === null) {
            // We shouldn't reach this under normal circumstances
            throw new BadRequestError(`No entity ref present in the intent watcher object for check permission for provider ${object.entity_ref.provider_prefix}/${object.entity_ref.provider_version}`, { provider_prefix: object.entity_ref.provider_prefix, provider_version: object.entity_ref.provider_version, additional_info: { "watcher_uuid": object.uuid }})
        }

        const provider: Provider = await this.provider_db.get_provider(entity_ref.provider_prefix, entity_ref.provider_version);
        const [entity_metadata, ] = await this.spec_db.get_spec(entity_ref);
        await this.perProviderAuthorizer.checkPermission(user, entity_metadata, action, provider)
        this.logger.debug(`END ${this.checkPermission.name} for intent watcher`, { tags: [PapieaEngineTags.Auth] })
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
        this.logger.debug(`BEGIN ${this.getAuthorizerByObject.name} for per provider`, { tags: [PapieaEngineTags.Auth] })
        if (provider.prefix in this.providerToAuthorizer) {
            this.logger.debug(`END ${this.getAuthorizerByObject.name} for per provider`, { tags: [PapieaEngineTags.Auth] })
            return this.providerToAuthorizer[provider.prefix];
        }
        if (!provider.authModel || !provider.policy) {
            this.providerToAuthorizer[provider.prefix] = null;
            this.logger.debug(`END ${this.getAuthorizerByObject.name} for per provider`, { tags: [PapieaEngineTags.Auth] })
            return null;
        }
        const authorizer = await this.providerAuthorizerFactory.createAuthorizer(provider);
        this.providerToAuthorizer[provider.prefix] = authorizer;
        this.logger.debug(`END ${this.getAuthorizerByObject.name} for per provider`, { tags: [PapieaEngineTags.Auth] })
        return authorizer;
    }

    async checkPermission(user: UserAuthInfo, object: any, action: Action, provider?: Provider): Promise<void> {
        this.logger.debug(`BEGIN ${this.checkPermission.name} for per provider`, { tags: [PapieaEngineTags.Auth] })
        if (provider === undefined || provider === null) {
            // We shouldn't reach this under normal circumstances
            throw new BadRequestError("No provider exists in the provider check permission")
        }
        const authorizer: Authorizer | null = await this.getAuthorizerByObject(provider!)
        if (authorizer === null) {
            this.logger.debug(`END ${this.checkPermission.name} for per provider`, { tags: [PapieaEngineTags.Auth] })
            return;
        }
        if (!user) {
            throw new UnauthorizedError(`No user provided in the provider check permission for provider ${provider.prefix}/${provider.version}`, { provider_prefix: provider.prefix, provider_version: provider.version });
        }
        if (user.is_admin) {
            this.logger.debug(`END ${this.checkPermission.name} for per provider`, { tags: [PapieaEngineTags.Auth] })
            return;
        }
        if (user.is_provider_admin) {
            // For provider-admin provider_prefix must be set
            if (user.provider_prefix === provider!.prefix) {
                this.logger.debug(`END ${this.checkPermission.name} for per provider`, { tags: [PapieaEngineTags.Auth] })
                return;
            } else {
                throw new PermissionDeniedError(`Provider admin has wrong prefix for the provider in check permission ${provider.prefix}/${provider.version}`, { provider_prefix: provider.prefix, provider_version: provider.version, additional_info: { "provider_admin": JSON.stringify(user) }});
            }
        }
        await authorizer.checkPermission(user, object, action, provider);
        this.logger.debug(`END ${this.checkPermission.name} for per provider`, { tags: [PapieaEngineTags.Auth] })
    }
}

export class AdminAuthorizer extends Authorizer {
    private logger: Logger

    constructor(logger: Logger) {
        super()
        this.logger = logger
    }

    async checkPermission(user: UserAuthInfo, object: any, action: Action): Promise<void> {
        this.logger.debug(`BEGIN ${this.checkPermission.name} for admin`, { tags: [PapieaEngineTags.Auth] })
        if (!user) {
            throw new UnauthorizedError("No user provided in the admin authorizer permission check");
        }
        if (user.is_admin) {
            this.logger.debug(`END ${this.checkPermission.name} for admin`, { tags: [PapieaEngineTags.Auth] })
            return;
        }
        if (action === Action.CreateS2SKey) {
            // object.user_info contains UserInfo which will be used when s2s key is passed
            // check who can talk on behalf of whom
            if (object.owner !== user.owner || object.user_info.is_admin) {
                throw new PermissionDeniedError(`User has wrong owner for the object in admin permission check to create s2skey`, { additional_info: { "user": JSON.stringify(user), "object_owner": object.owner }});
            }
            if (user.provider_prefix !== undefined
                && object.provider_prefix !== user.provider_prefix) {
                throw new PermissionDeniedError(`User has wrong provider prefix for the object in admin permission check to create s2skey for provider ${object.provider_prefix}`, { provider_prefix: object.provider_prefix, additional_info: { "user": JSON.stringify(user) }});
            }
            if (user.is_provider_admin) {
                this.logger.debug(`END ${this.checkPermission.name} for admin`, { tags: [PapieaEngineTags.Auth] })
                return;
            }
            if (object.user_info.is_provider_admin
                || object.user_info.owner !== user.owner) {
                throw new PermissionDeniedError(`User has wrong owner for the object's user info in admin permission check to create s2skey`, { additional_info: { "user": JSON.stringify(user), "object_owner": object.owner }});
            }
            this.logger.debug(`END ${this.checkPermission.name} for admin`, { tags: [PapieaEngineTags.Auth] })
            return;
        }
        if (action === Action.ReadS2SKey || action === Action.InactivateS2SKey) {
            if (object.owner !== user.owner
                || (user.provider_prefix !== undefined && object.provider_prefix !== user.provider_prefix)) {
                throw new PermissionDeniedError(`User has wrong provider prefix for the object in admin permission check to read/inactivate s2skey for provider ${object.provider_prefix}`, { provider_prefix: object.provider_prefix, additional_info:{ "user": JSON.stringify(user) }});
            } else {
                this.logger.debug(`END ${this.checkPermission.name} for admin`, { tags: [PapieaEngineTags.Auth] })
                return;
            }
        }
        if (user.is_provider_admin && object.prefix === user.provider_prefix) {
            this.logger.debug(`END ${this.checkPermission.name} for admin`, { tags: [PapieaEngineTags.Auth] })
            return;
        }
        throw new PermissionDeniedError(`Something went wrong in admin permission check`, { additional_info: { "user": JSON.stringify(user), "action": action, "entity": JSON.stringify(object) }});
    }
}
