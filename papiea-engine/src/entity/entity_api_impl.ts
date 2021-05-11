import axios from "axios"
import {Status_DB} from "../databases/status_db_interface"
import {Spec_DB} from "../databases/spec_db_interface"
import {Entity_API, OperationSuccess} from "./entity_api_interface"
import {Validator} from "../validator"
import {Authorizer, IntentWatcherAuthorizer} from "../auth/authz"
import {UserAuthInfo} from "../auth/authn"
import {
    Action,
    Entity,
    EntityCreateOrUpdateResult,
    IntentWatcher,
    Metadata,
    Procedural_Signature,
    Provider,
    Provider_Entity_Reference,
    Spec,
    Status,
    uuid4,
    Version
} from "papiea-core"
import {ProcedureInvocationError} from "../errors/procedure_invocation_error"
import {PermissionDeniedError} from "../errors/permission_error"
import {PapieaException} from "../errors/papiea_exception"
import {Logger, RequestContext, getTraceHeaders, spanOperation} from "papiea-backend-utils"
import {IntentfulContext} from "../intentful_core/intentful_context"
import {Provider_DB} from "../databases/provider_db_interface"
import {IntentWatcherMapper} from "../intentful_engine/intent_interface"
import {IntentWatcher_DB} from "../databases/intent_watcher_db_interface"
import {Graveyard_DB} from "../databases/graveyard_db_interface"
import { Cursor } from "mongodb"

export type SortParams = { [key: string]: number };

export class Entity_API_Impl implements Entity_API {
    private status_db: Status_DB;
    private spec_db: Spec_DB;
    private intent_watcher_db: IntentWatcher_DB
    private authorizer: Authorizer;
    private intentWatcherAuthorizer: IntentWatcherAuthorizer;
    private logger: Logger;
    private validator: Validator
    private readonly intentfulCtx: IntentfulContext
    private providerDb: Provider_DB
    private graveyardDb: Graveyard_DB

    constructor(logger: Logger, status_db: Status_DB, spec_db: Spec_DB, graveyardDb: Graveyard_DB, provider_db: Provider_DB, intent_watcher_db: IntentWatcher_DB, authorizer: Authorizer, intentWatcherAuthorizer: IntentWatcherAuthorizer, validator: Validator, intentfulCtx: IntentfulContext) {
        this.status_db = status_db;
        this.spec_db = spec_db;
        this.graveyardDb = graveyardDb
        this.providerDb = provider_db;
        this.authorizer = authorizer;
        this.intentWatcherAuthorizer = intentWatcherAuthorizer;
        this.logger = logger;
        this.validator = validator;
        this.intentfulCtx = intentfulCtx
        this.intent_watcher_db = intent_watcher_db
    }

    private async get_provider(prefix: string, version: Version, ctx: RequestContext): Promise<Provider> {
        const span = spanOperation(`get_provider_db`,
                                   ctx.tracing_ctx,
                                   {prefix, version})
        const provider = await this.providerDb.get_provider(prefix, version);
        span.finish()
        return provider
    }

    async get_intent_watcher(user: UserAuthInfo, id: string, ctx: RequestContext): Promise<Partial<IntentWatcher>> {
        const intent_watcher = await this.intent_watcher_db.get_watcher(id)
        await this.intentWatcherAuthorizer.checkPermission(user, intent_watcher, Action.Read);
        return IntentWatcherMapper.toResponse(intent_watcher)
    }

    filter_intent_watcher(user: UserAuthInfo, fields: any, ctx: RequestContext, sortParams?: SortParams): [AsyncIterable<Partial<IntentWatcher>>, Cursor<IntentWatcher>] {
        const watcher_cursor = this.intent_watcher_db.list_watchers(fields, sortParams)
        const filteredRes = this.intentWatcherAuthorizer.filter(this.logger, user, watcher_cursor, Action.Read);
        return [IntentWatcherMapper.toResponses(filteredRes), watcher_cursor]
    }

    async save_entity(user: UserAuthInfo, prefix: string, kind_name: string, version: Version, input: unknown, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        const provider = await this.get_provider(prefix, version, ctx);
        const kind = this.providerDb.find_kind(provider, kind_name);
        const strategy = this.intentfulCtx.getEntityCreationStrategy(provider, kind, user)
        return await strategy.create(input, ctx)
    }

    async get_entity(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, entity_uuid: uuid4, ctx: RequestContext,): Promise<[Metadata, Spec, Status]> {
        const provider = await this.get_provider(prefix, version, ctx);
        const entity_ref: Provider_Entity_Reference = { kind: kind_name, uuid: entity_uuid, provider_prefix: prefix, provider_version: version };
        const span = spanOperation(`get_spec_db`,
                                   ctx.tracing_ctx,
                                   {entity_uuid})
        const [metadata, spec, status] = await this.spec_db.get_spec_status(entity_ref);
        span.finish()
        await this.authorizer.checkPermission(user, {"metadata": metadata}, Action.Read, provider);
        return [metadata, spec, status];
    }

    async get_entity_status(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, entity_uuid: uuid4, ctx: RequestContext,): Promise<[Metadata, Status]> {
        const provider = await this.get_provider(prefix, version, ctx);
        const entity_ref: Provider_Entity_Reference = { provider_prefix: prefix, provider_version: version,
            kind: kind_name, uuid: entity_uuid };
        const span = spanOperation(`get_status_db`,
                                   ctx.tracing_ctx,
                                   {entity_uuid})
        const [metadata, status] = await this.status_db.get_status(entity_ref);
        span.finish()
        await this.authorizer.checkPermission(user, {"metadata": metadata}, Action.Read, provider);
        return [metadata, status];
    }

    async* filter_entity_spec(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, fields: any, exact_match: boolean, ctx: RequestContext, sortParams?: SortParams): AsyncIterable<[Metadata, Spec]> {
        const provider = await this.get_provider(prefix, version, ctx);
        fields.metadata.kind = kind_name;
        const span = spanOperation(`filter_spec_db`,
                                   ctx.tracing_ctx)
        const res = await this.spec_db.list_specs(fields, exact_match, sortParams);
        span.finish()
        yield* await this.authorizer.filter(this.logger, user, res, Action.Read, provider, x => {
            return {"metadata": x[0]}
        });
    }

    async* filter_entity_status(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, fields: any, exact_match: boolean, ctx: RequestContext, sortParams?: SortParams): AsyncIterable<[Metadata, Status]> {
        const provider = await this.get_provider(prefix, version, ctx);
        fields.metadata.kind = kind_name;
        const span = spanOperation(`filter_status_db`,
                                   ctx.tracing_ctx)
        const res = await this.status_db.list_status(fields, exact_match, sortParams);
        span.finish()
        yield* this.authorizer.filter(this.logger, user, res, Action.Read, provider, x => {
            return {"metadata": x[0]}
        });
    }

    async* filter_deleted(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, fields: any, exact_match: boolean, ctx: RequestContext, sortParams?: SortParams): AsyncIterable<Entity> {
        const provider = await this.get_provider(prefix, version, ctx);
        fields.metadata.kind = kind_name;
        const span = spanOperation(`filter_deleted_db`,
                                   ctx.tracing_ctx)
        const res = await this.graveyardDb.list_entities(fields, exact_match, sortParams)
        span.finish()
        yield* await this.authorizer.filter(this.logger, user, res, Action.Read, provider, x => {
            return {"metadata": x.metadata}
        });
    }

    async update_entity_spec(user: UserAuthInfo, uuid: uuid4, prefix: string, spec_version: number, extension: {[key: string]: any}, kind_name: string, version: Version, spec_description: Spec, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        const provider = await this.get_provider(prefix, version, ctx);
        const kind = this.providerDb.find_kind(provider, kind_name);
        this.validator.validate_spec(provider, spec_description, kind, provider.allowExtraProps);
        const entity_ref: Provider_Entity_Reference = { kind: kind_name, uuid: uuid, provider_prefix: prefix, provider_version: version };
        const metadata: Metadata = (await this.spec_db.get_spec(entity_ref))[0];
        await this.authorizer.checkPermission(user, {"metadata": metadata}, Action.Update, provider);
        metadata.spec_version = spec_version;
        metadata.provider_prefix = prefix
        metadata.provider_version = version
        const strategy = this.intentfulCtx.getIntentfulStrategy(provider, kind, user)
        return await strategy.update(metadata, spec_description, ctx)
    }

    async delete_entity(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, entity_uuid: uuid4, ctx: RequestContext): Promise<void> {
        const provider = await this.get_provider(prefix, version, ctx);
        const kind = this.providerDb.find_kind(provider, kind_name);
        const entity_ref: Provider_Entity_Reference = { kind: kind_name, uuid: entity_uuid, provider_prefix: prefix, provider_version: version };
        const [metadata, spec, status] = await this.spec_db.get_spec_status(entity_ref);
        await this.authorizer.checkPermission(user, {"metadata": metadata}, Action.Delete, provider);
        const strategy = this.intentfulCtx.getIntentfulStrategy(provider, kind, user)
        await strategy.delete({ metadata, spec, status }, ctx)
    }

    async call_procedure(user: UserAuthInfo, prefix: string, kind_name: string, version: Version, entity_uuid: uuid4, procedure_name: string, input: any, ctx: RequestContext): Promise<any> {
        const provider = await this.get_provider(prefix, version, ctx);
        const kind = this.providerDb.find_kind(provider, kind_name);
        const entity: [Metadata, Spec, Status] = await this.get_entity(user, prefix, version, kind_name, entity_uuid, ctx);
        const procedure: Procedural_Signature | undefined = kind.entity_procedures[procedure_name];
        if (procedure === undefined) {
            throw new PapieaException({ message: `Entity procedure not found for kind: ${prefix}/${version}/${kind.name}. Make sure the procedure name is correct & procedure is registered.`, entity_info: { provider_prefix: prefix, provider_version: version, kind_name: kind.name, additional_info: { "procedure_name": procedure_name }}});
        }
        const schemas: any = {};
        Object.assign(schemas, procedure.argument);
        Object.assign(schemas, procedure.result);
        try {
            this.validator.validate(provider.prefix, provider.version, kind.name,
                input, Object.values(procedure.argument)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
        } catch (err) {
            throw ProcedureInvocationError.fromError(err, { provider_prefix: prefix, provider_version: version, kind_name: kind_name, additional_info: { "procedure_name": procedure_name }}, 400)
        }
        try {
            const span = spanOperation(`entity_procedure_${procedure_name}`,
                                             ctx.tracing_ctx,
                                             {entity_uuid})
            const { data } = await axios.post(procedure.procedure_callback,
                {
                    metadata: entity[0],
                    spec: entity[1],
                    status: entity[2],
                    input: input
                }, {
                    headers: {...getTraceHeaders(ctx.tracing_ctx.headers), ...user}
                });
            span.finish()
            this.validator.validate(provider.prefix, provider.version, kind.name,
                data, Object.values(procedure.result)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
            return data;
        } catch (err) {
            throw ProcedureInvocationError.fromError(err, { provider_prefix: prefix, provider_version: version, kind_name: kind.name, additional_info: { "procedure_name": procedure_name }})
        }
    }

    async call_provider_procedure(user: UserAuthInfo, prefix: string, version: Version, procedure_name: string, input: any, ctx: RequestContext): Promise<any> {
        const provider = await this.get_provider(prefix, version, ctx);
        if (provider.procedures === undefined) {
            throw new PapieaException({ message: `No provider procedures exist for provider: ${prefix}/${version}. Make sure the provider is correct.`, entity_info: { provider_prefix: prefix, provider_version: version }});
        }
        const procedure: Procedural_Signature | undefined = provider.procedures[procedure_name];
        if (procedure === undefined) {
            throw new PapieaException({ message: `Provider procedure not found for provider: ${prefix}/${version}. Make sure the procedure name is correct & procedure is registered`, entity_info: { provider_prefix: prefix, provider_version: version, additional_info: { "procedure_name": procedure_name }}});
        }
        const schemas: any = {};
        Object.assign(schemas, procedure.argument);
        Object.assign(schemas, procedure.result);
        try {
            this.validator.validate(provider.prefix, provider.version, 'ProviderProcedure',
                input, Object.values(procedure.argument)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
        } catch (err) {
            throw ProcedureInvocationError.fromError(err, { provider_prefix: prefix, provider_version: version, additional_info: { "procedure_name": procedure_name }}, 400)
        }
        try {
            const span = spanOperation(`provider_procedure_${procedure_name}`,
                                             ctx.tracing_ctx)
            const { data } = await axios.post(procedure.procedure_callback,
                {
                    input: input
                }, {
                    headers: {...getTraceHeaders(ctx.tracing_ctx.headers), ...user}
                });
            span.finish()
            this.validator.validate(provider.prefix, provider.version, 'ProviderProcedure',
                data, Object.values(procedure.result)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
            return data;
        } catch (err) {
            throw ProcedureInvocationError.fromError(err, { provider_prefix: prefix, provider_version: version, additional_info: { "procedure_name": procedure_name }})
        }
    }

    async call_kind_procedure(user: UserAuthInfo, prefix: string, kind_name: string, version: Version, procedure_name: string, input: any, ctx: RequestContext,): Promise<any> {
        const provider = await this.get_provider(prefix, version, ctx);
        const kind = this.providerDb.find_kind(provider, kind_name);
        const procedure: Procedural_Signature | undefined = kind.kind_procedures[procedure_name];
        if (procedure === undefined) {
            throw new PapieaException({ message: `Kind procedure not found for kind: ${prefix}/${version}/${kind_name}. Make sure the procedure name is correct & procedure is registered.`, entity_info: { provider_prefix: prefix, provider_version: version, kind_name: kind_name, additional_info: { "procedure_name": procedure_name }}});
        }
        const schemas: any = {};
        Object.assign(schemas, procedure.argument);
        Object.assign(schemas, procedure.result);
        try {
            this.validator.validate(provider.prefix, provider.version, kind.name,
                input, Object.values(procedure.argument)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
        } catch (err) {
            throw ProcedureInvocationError.fromError(err, { provider_prefix: prefix, provider_version: version, kind_name: kind_name, additional_info: { "procedure_name": procedure_name }}, 400)
        }
        try {
            const span = spanOperation(`kind_procedure_${procedure_name}`,
                                       ctx.tracing_ctx)
            const { data } = await axios.post(procedure.procedure_callback,
                {
                    input: input
                }, {
                    headers: {...getTraceHeaders(ctx.tracing_ctx.headers), ...user}
                });
            span.finish()
            this.validator.validate(provider.prefix, provider.version, kind.name,
                data, Object.values(procedure.result)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
            return data;
        } catch (err) {
            throw ProcedureInvocationError.fromError(err, { provider_prefix: prefix, provider_version: version, kind_name: kind_name, additional_info: { "procedure_name": procedure_name }})
        }
    }

    async check_permission(user: UserAuthInfo, prefix: string, version: Version, entityAction: [Action, Provider_Entity_Reference][], ctx: RequestContext): Promise<OperationSuccess> {
        const provider = await this.get_provider(prefix, version, ctx)
        if (entityAction.length === 1) {
            return await this.check_single_permission(user, provider, entityAction[0])
        } else {
            return await this.check_multiple_permissions(user, provider, entityAction)
        }
    }

    async check_single_permission(user: UserAuthInfo, provider: Provider, entityAction: [Action, Provider_Entity_Reference]): Promise<OperationSuccess> {
        const [action, entityRef] = entityAction;
        if (action === Action.Create) {
            const has_perm = await this.has_permission(user, provider, entityRef as Metadata, action)
            if (has_perm) {
                return {"success": "Ok"}
            } else {
                throw new PermissionDeniedError({ message: `User does not have create permission on entity of kind: ${entityRef.provider_prefix}/${entityRef.provider_version}/${entityRef.kind}. Make sure you have the correct user.`, entity_info: { provider_prefix: entityRef.provider_prefix, provider_version: entityRef.provider_version, kind_name: entityRef.kind, additional_info: { "entity_uuid": entityRef.uuid, "user": JSON.stringify(user) }}})
            }
        } else {
            const [metadata, _] = await this.spec_db.get_spec(entityRef);
            const has_perm = await this.has_permission(user, provider, metadata, action)
            if (has_perm) {
                return {"success": "Ok"}
            } else {
                throw new PermissionDeniedError({ message: `User does not have permission on entity of kind: ${entityRef.provider_prefix}/${entityRef.provider_version}/${entityRef.kind}. Make sure the permission is set for user.`, entity_info: { provider_prefix: entityRef.provider_prefix, provider_version: entityRef.provider_version, kind_name: entityRef.kind, additional_info: { "entity_uuid": entityRef.uuid, "user": JSON.stringify(user), "action": action }}})
            }
        }
    }

    async check_multiple_permissions(user: UserAuthInfo, provider: Provider, entityAction: [Action, Provider_Entity_Reference][]): Promise<OperationSuccess> {
        const checkPromises: Promise<boolean>[] = [];
        for (let [action, entityRef] of entityAction) {
            if (action === Action.Create) {
                checkPromises.push(this.has_permission(user, provider, entityRef as Metadata, action));
            } else {
                const [metadata, _] = await this.spec_db.get_spec(entityRef);
                checkPromises.push(this.has_permission(user, provider, metadata, action));
            }
        }
        const has_perm = (await Promise.all(checkPromises)).every((val, index, arr) => val)
        if (has_perm) {
            return { "success": "Ok" }
        } else {
            throw new PermissionDeniedError({ message: `User does not have permission to one or all of the entities for provider: ${provider.prefix}/${provider.version}. Make sure the permission is set.`, entity_info: { provider_prefix: provider.prefix, provider_version: provider.version, additional_info: { "user": JSON.stringify(user) }}})
        }
    }

    async has_permission(user: UserAuthInfo, provider: Provider, metadata: Metadata, action: Action) {
        try {
            await this.authorizer.checkPermission(user, {"metadata": metadata}, action, provider);
            return true;
        } catch (e) {
            this.logger.debug(`Authorizer check permission failed on entity with uuid: ${metadata.uuid} of kind ${metadata.provider_prefix}/${metadata.provider_version}/${metadata.kind} due to error: ${e}`)
            return false;
        }
    }
}
