import { Provider_API, Provider_Power } from "./provider_api_interface";
import { Provider_DB } from "../databases/provider_db_interface";
import { Status_DB } from "../databases/status_db_interface";
import { S2S_Key_DB } from "../databases/s2skey_db_interface";
import { Validator } from "../validator";
import { Authorizer } from "../auth/authz";
import { UserAuthInfo } from "../auth/authn";
import { createHash } from "../auth/crypto";
import * as Async from "../utils/async";
import { Action, Provider, S2S_Key, Secret, Status, Version, Metadata, Spec, IntentWatcher, EntityCreateOrUpdateResult, EntityStatusUpdateInput } from "papiea-core";
import {Logger, RequestContext, spanOperation} from "papiea-backend-utils"
import { Watchlist_DB } from "../databases/watchlist_db_interface";
import { SpecOnlyUpdateStrategy } from "../intentful_core/intentful_strategies/status_update_strategy";
import { IntentfulContext } from "../intentful_core/intentful_context";
import { PapieaException, PapieaExceptionContextImpl } from "../errors/papiea_exception"
import uuid = require("uuid");

export class Provider_API_Impl implements Provider_API {
    private providerDb: Provider_DB;
    private statusDb: Status_DB;
    private s2skeyDb: S2S_Key_DB;
    private authorizer: Authorizer;
    private logger: Logger;
    private validator: Validator
    private watchlistDb: Watchlist_DB;
    private intentfulContext: IntentfulContext;
    private readonly registeredAuthorizers: Authorizer[]

    constructor(logger: Logger, providerDb: Provider_DB, statusDb: Status_DB,
                s2skeyDb: S2S_Key_DB, watchlistDb: Watchlist_DB,
                intentfulContext: IntentfulContext, authorizer: Authorizer,
                registeredAuthorizers: Authorizer[],
                validator: Validator)
    {
        this.providerDb = providerDb;
        this.statusDb = statusDb;
        this.s2skeyDb = s2skeyDb;
        this.watchlistDb = watchlistDb
        this.intentfulContext = intentfulContext
        this.authorizer = authorizer;
        this.registeredAuthorizers = registeredAuthorizers
        this.logger = logger;
        this.validator = validator
    }

    async register_provider(user: UserAuthInfo, provider: Provider, ctx: RequestContext): Promise<void> {
        await this.authorizer.checkPermission(user, provider, Action.RegisterProvider, provider);
        this.validator.validate_provider(provider)
        this.validator.validate_sfs(provider)
        const span = spanOperation(`save_provider_db`,
                                   ctx.tracing_ctx)
        await this.providerDb.save_provider(provider);
        span.finish()
    }

    async list_providers(user: UserAuthInfo, ctx: RequestContext): Promise<Provider[]> {
        const span = spanOperation(`list_providers_db`,
                                   ctx.tracing_ctx)
        const providers = await this.providerDb.list_providers();
        span.finish()
        return await Async.collect(this.authorizer.filter(this.logger, user, providers, Action.ReadProvider));
    };

    async unregister_provider(user: UserAuthInfo, provider_prefix: string, version: Version, ctx: RequestContext): Promise<void> {
        await this.authorizer.checkPermission(user, {prefix: provider_prefix}, Action.UnregisterProvider);
        const span = spanOperation(`delete_provider_db`,
                                   ctx.tracing_ctx)
        await this.providerDb.delete_provider(provider_prefix, version);
        span.finish()
    }

    async replace_status(user: UserAuthInfo, provider_prefix: string, provider_version: Version, metadata: EntityStatusUpdateInput, status: Status, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        const span = spanOperation(`get_provider_db`,
                                   ctx.tracing_ctx)
        const provider: Provider = await this.providerDb.get_provider(provider_prefix, provider_version);
        span.finish()
        const kind = this.providerDb.find_kind(provider, metadata.kind)
        const strategy = this.intentfulContext.getStatusUpdateStrategy(provider, kind, user)
        // if this is not critical, we can swap the order of checkPermission() and update()
        // to remove the verbose check
        if (strategy instanceof SpecOnlyUpdateStrategy) {
            throw new PapieaException({ message: `Cannot replace status for spec-only entity of kind: ${provider.prefix}/${provider.version}/${kind.name}. Make sure the entity and entity type is correct.`, entity_info: { provider_prefix: provider.prefix, provider_version: provider.version, kind_name: kind.name, additional_info: { "entity_uuid": metadata.uuid }}})
        }
        await this.authorizer.checkPermission(user, provider, Action.UpdateStatus, provider);
        metadata.provider_prefix = provider_prefix
        metadata.provider_version = provider_version
        await this.validator.validate_status(provider, metadata, status);

        return await strategy.replace(metadata, status, ctx)
    }

    async update_status(user: UserAuthInfo, provider_prefix: string, provider_version: Version, metadata: EntityStatusUpdateInput, partialStatus: Status, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        const getProviderSpan = spanOperation(`get_provider_db`,
                                   ctx.tracing_ctx)
        const provider: Provider = await this.providerDb.get_provider(provider_prefix, provider_version);
        getProviderSpan.finish()
        const kind = this.providerDb.find_kind(provider, metadata.kind)
        const strategy = this.intentfulContext.getStatusUpdateStrategy(provider, kind, user)
        // if this is not critical, we can swap the order of checkPermission() and update()
        // to remove the verbose check
        if (strategy instanceof SpecOnlyUpdateStrategy) {
            throw new PapieaException({ message: `Cannot update status for spec-only entity of kind: ${provider.prefix}/${provider.version}/${kind.name}. Make sure the entity and entity type is correct.`, entity_info: { provider_prefix: provider.prefix, provider_version: provider.version, kind_name: kind.name, additional_info: { "entity_uuid": metadata.uuid }}})
        }
        await this.authorizer.checkPermission(user, provider, Action.UpdateStatus, provider);
        metadata.provider_prefix = provider_prefix
        metadata.provider_version = provider_version

        // We receive update in form of partial status
        // e.g. full status: {name: {last: 'Foo', first: 'Bar'}}
        // e.g. partial status update: {name: {last: 'BBB'}}
        // Thus we get the merged version and validate it
        // Only after that we transform partial status into mongo dot notation query
        const getStatusSpan = spanOperation(`get_status_db`,
                                   ctx.tracing_ctx)
        const [,currentStatus] = await this.statusDb.get_status(metadata)
        getStatusSpan.finish()
        let mergedStatus: any
        // Replace status if dealing with arrays
        if (Array.isArray(currentStatus) && Array.isArray(partialStatus)) {
            this.logger.debug(`Status for entity is an array, using the replace semantics!\nEntity Info:${ new PapieaExceptionContextImpl(provider.prefix, provider.version, kind.name, { "entity_uuid": metadata.uuid }).toString() }`)
            mergedStatus = partialStatus
        } else {
            mergedStatus = {...currentStatus, ...partialStatus}
        }
        await this.validator.validate_status(provider, metadata, mergedStatus);

        return await strategy.update(metadata, partialStatus, ctx)
    }

    async update_progress(user: UserAuthInfo, provider_prefix: string, version: Version, message: string, done_percent: number, ctx: RequestContext): Promise<void> {
        // TODO(adolgarev)
        throw new PapieaException({ message: "Not implemented" });
    }

    async power(user: UserAuthInfo, provider_prefix: string, version: Version, power_state: Provider_Power, ctx: RequestContext): Promise<void> {
        // TODO(adolgarev)
        throw new PapieaException({ message: "Not implemented" });
    }

    private async get_provider_unchecked(provider_prefix: string, provider_version: Version, ctx: RequestContext): Promise<Provider> {
        const span = spanOperation(`get_provider_unchecked_db`,
                                   ctx.tracing_ctx)
        const provider = await this.providerDb.get_provider(provider_prefix, provider_version);
        span.finish()
        return provider
    }

    async get_provider(user: UserAuthInfo, provider_prefix: string, provider_version: Version, ctx: RequestContext): Promise<Provider> {
        await this.authorizer.checkPermission(user, {prefix: provider_prefix}, Action.ReadProvider);
        const span = spanOperation(`get_provider_db`,
                                   ctx.tracing_ctx)
        const provider = await this.providerDb.get_provider(provider_prefix, provider_version);
        span.finish()
        return provider
    }

    async list_providers_by_prefix(user: UserAuthInfo, provider_prefix: string, ctx: RequestContext): Promise<Provider[]> {
        const span = spanOperation(`get_providers_db`,
                                   ctx.tracing_ctx)
        const res = await this.providerDb.find_providers(provider_prefix);
        span.finish()
        return await Async.collect(this.authorizer.filter(this.logger, user, res, Action.ReadProvider));
    }

    async update_auth(user: UserAuthInfo, provider_prefix: string, provider_version: Version, auth: any, ctx: RequestContext): Promise<void> {
        const provider: Provider = await this.get_provider_unchecked(provider_prefix, provider_version, ctx);
        await this.authorizer.checkPermission(user, provider, Action.UpdateAuth, provider);
        if (auth.authModel !== undefined) {
            provider.authModel = auth.authModel;
        }
        if (auth.policy !== undefined) {
            provider.policy = auth.policy;
        }
        if (auth.oauth2 !== undefined) {
            provider.oauth2 = auth.oauth2;
        }
        const span = spanOperation(`save_provider_auth_db`,
                                   ctx.tracing_ctx)
        await this.providerDb.save_provider(provider);
        span.finish()
        for (let authorizer of this.registeredAuthorizers) {
            authorizer.on_auth_changed(provider)
        }
    }

    async create_key(user: UserAuthInfo, name: string, owner: string, provider_prefix: string, ctx: RequestContext, user_info?: any, key?: Secret): Promise<S2S_Key> {
        // - name is not mandatory, displayed in UI
        // - owner is the owner of the key (usually email),
        // it is not unique, different providers may have same owner
        // - provider_prefix determines provider key belongs to,
        // tuple (owner, provider_prefix) determines a set of keys owner owns for given provider
        // - extension is a UserAuthInfo which will be used when s2s key provided, that is
        // if s2skey A is provided in Authoriation
        // then casbin will do all checks against A.extension.owner,
        // A.extension.provider_prefix, A.extension.tenant, etc.
        // In other words user with s2skey A talks on behalf of user in A.extension
        // All rules who can talk on behalf of whom are defined in AdminAuthorizer
        const s2skey: S2S_Key = {
            name: name,
            uuid: uuid(),
            owner: owner,
            provider_prefix: provider_prefix,
            key: "",
            created_at: new Date(),
            deleted_at: undefined,
            user_info: Object.assign({}, user_info ? user_info : user)
        };
        s2skey.key = key ? key : createHash(s2skey);
        await this.authorizer.checkPermission(user, s2skey, Action.CreateS2SKey);
        const createKeySpan = spanOperation(`create_key_db`,
                                   ctx.tracing_ctx)
        await this.s2skeyDb.create_key(s2skey);
        createKeySpan.finish()
        const getKeySpan = spanOperation(`get_key_db`,
                                   ctx.tracing_ctx)
        const resKey = await this.s2skeyDb.get_key(s2skey.uuid);
        getKeySpan.finish()
        return resKey
    }

    async get_key(user: UserAuthInfo, uuid: string, ctx: RequestContext): Promise<S2S_Key> {
        const span = spanOperation(`get_key_db`,
                                   ctx.tracing_ctx)
        const s2skey = await this.s2skeyDb.get_key(uuid);
        span.finish()
        await this.authorizer.checkPermission(user, s2skey, Action.ReadS2SKey);
        return s2skey;
    }

    async inactivate_key(user: UserAuthInfo, uuid: string, ctx: RequestContext): Promise<void> {
        const getKeySpan = spanOperation(`get_key_db`,
                                   ctx.tracing_ctx)
        const s2skey: S2S_Key = await this.s2skeyDb.get_key(uuid);
        getKeySpan.finish()
        await this.authorizer.checkPermission(user, s2skey, Action.InactivateS2SKey);
        const inactivateKeySpan = spanOperation(`inactivate_key_db`,
                                   ctx.tracing_ctx)
        await this.s2skeyDb.inactivate_key(s2skey.uuid);
        inactivateKeySpan.finish()
    }

    async filter_keys(user: UserAuthInfo, fields: any, ctx: RequestContext): Promise<S2S_Key[]> {
        const span = spanOperation(`list_key_db`,
                                   ctx.tracing_ctx)
        const res = await this.s2skeyDb.list_keys(fields);
        span.finish()
        let secret;
        for (let s2s_key of res) {
            secret = s2s_key.key;
            s2s_key.key = secret.slice(0, 2) + "*****" + secret.slice(-2);
        }
        return await Async.collect(this.authorizer.filter(this.logger, user, res, Action.ReadS2SKey));
    }
}
