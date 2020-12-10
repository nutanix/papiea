import axios from "axios"
import {Status_DB} from "../databases/status_db_interface"
import {Spec_DB} from "../databases/spec_db_interface"
import {Entity_API, OperationSuccess} from "./entity_api_interface"
import {Validator} from "../validator"
import {Authorizer} from "../auth/authz"
import {UserAuthInfo} from "../auth/authn"
import {
    Action,
    Entity,
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
import {Logger} from "papiea-backend-utils"
import {IntentfulContext} from "../intentful_core/intentful_context"
import {Provider_DB} from "../databases/provider_db_interface"
import {IntentWatcherMapper} from "../intentful_engine/intent_interface"
import {IntentWatcher_DB} from "../databases/intent_watcher_db_interface"
import {Graveyard_DB} from "../databases/graveyard_db_interface"

export type SortParams = { [key: string]: number };

export class Entity_API_Impl implements Entity_API {
    private status_db: Status_DB;
    private spec_db: Spec_DB;
    private intent_watcher_db: IntentWatcher_DB
    private authorizer: Authorizer;
    private logger: Logger;
    private validator: Validator
    private readonly intentfulCtx: IntentfulContext
    private providerDb: Provider_DB
    private graveyardDb: Graveyard_DB

    constructor(logger: Logger, status_db: Status_DB, spec_db: Spec_DB, graveyardDb: Graveyard_DB, provider_db: Provider_DB, intent_watcher_db: IntentWatcher_DB, authorizer: Authorizer, validator: Validator, intentfulCtx: IntentfulContext) {
        this.status_db = status_db;
        this.spec_db = spec_db;
        this.graveyardDb = graveyardDb
        this.providerDb = provider_db;
        this.authorizer = authorizer;
        this.logger = logger;
        this.validator = validator;
        this.intentfulCtx = intentfulCtx
        this.intent_watcher_db = intent_watcher_db
    }

    private async get_provider(prefix: string, version: Version): Promise<Provider> {
        return this.providerDb.get_provider(prefix, version);
    }

    async get_intent_watcher(user: UserAuthInfo, id: string): Promise<Partial<IntentWatcher>> {
        const intent_watcher = await this.intent_watcher_db.get_watcher(id)
        // TODO: this should be a separate authorizer not a PerProvider one
        // await this.authorizer.checkPermission(user, { "metadata": metadata }, Action.Update);
        return IntentWatcherMapper.toResponse(intent_watcher)
    }

    async filter_intent_watcher(user: UserAuthInfo, fields: any, sortParams?: SortParams): Promise<Partial<IntentWatcher>[]> {
        const intent_watchers = await this.intent_watcher_db.list_watchers(fields, sortParams)
        // TODO: this should be a separate authorizer not a PerProvider one
        // const filteredRes = await this.authorizer.filter(user, entities, Action.Update, x => { return { "metadata": x[0] } });
        // const filteredWatchers = IntentWatcherMapper.filter(intent_watchers, filteredRes)
        return IntentWatcherMapper.toResponses(intent_watchers)
    }

    async save_entity(user: UserAuthInfo, prefix: string, kind_name: string, version: Version, input: unknown): Promise<{
        intent_watcher: IntentWatcher | null,
        metadata: Metadata,
        spec: Spec,
        status: Status | null
    }> {
        const provider = await this.get_provider(prefix, version);
        const kind = this.providerDb.find_kind(provider, kind_name);
        const strategy = this.intentfulCtx.getEntityCreationStrategy(provider, kind, user)
        return await strategy.create(input)
    }

    async get_entity_spec(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, entity_uuid: uuid4): Promise<[Metadata, Spec]> {
        const provider = await this.get_provider(prefix, version);
        const entity_ref: Provider_Entity_Reference = { kind: kind_name, uuid: entity_uuid, provider_prefix: prefix, provider_version: version };
        const [metadata, spec] = await this.spec_db.get_spec(entity_ref);
        await this.authorizer.checkPermission(user, {"metadata": metadata}, Action.Read, provider);
        return [metadata, spec];
    }

    async get_entity_status(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, entity_uuid: uuid4): Promise<[Metadata, Status]> {
        const provider = await this.get_provider(prefix, version);
        const entity_ref: Provider_Entity_Reference = { provider_prefix: prefix, provider_version: version,
            kind: kind_name, uuid: entity_uuid };
        const [metadata, status] = await this.status_db.get_status(entity_ref);
        await this.authorizer.checkPermission(user, {"metadata": metadata}, Action.Read, provider);
        return [metadata, status];
    }

    async filter_entity_spec(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, fields: any, exact_match: boolean, sortParams?: SortParams): Promise<[Metadata, Spec][]> {
        const provider = await this.providerDb.get_provider(prefix, version);
        fields.metadata.kind = kind_name;
        const res = await this.spec_db.list_specs(fields, exact_match, sortParams);
        const filteredRes = await this.authorizer.filter(user, res, Action.Read, provider, x => {
            return {"metadata": x[0]}
        });
        return filteredRes;
    }

    async filter_entity_status(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, fields: any, exact_match: boolean, sortParams?: SortParams): Promise<[Metadata, Status][]> {
        const provider = await this.providerDb.get_provider(prefix, version);
        fields.metadata.kind = kind_name;
        const res = await this.status_db.list_status(fields, exact_match, sortParams);
        const filteredRes = await this.authorizer.filter(user, res, Action.Read, provider, x => {
            return {"metadata": x[0]}
        });
        return filteredRes;
    }

    async filter_deleted(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, fields: any, exact_match: boolean, sortParams?: SortParams): Promise<Entity[]> {
        const provider = await this.providerDb.get_provider(prefix, version);
        fields.metadata.kind = kind_name;
        const res = await this.graveyardDb.list_entities(fields, exact_match, sortParams)
        const filteredRes = await this.authorizer.filter(user, res, Action.Read, provider, x => {
            return {"metadata": x.metadata}
        });
        return filteredRes
    }

    async update_entity_spec(user: UserAuthInfo, uuid: uuid4, prefix: string, spec_version: number, extension: {[key: string]: any}, kind_name: string, version: Version, spec_description: Spec): Promise<IntentWatcher | null> {
        const provider = await this.get_provider(prefix, version);
        const kind = this.providerDb.find_kind(provider, kind_name);
        this.validator.validate_spec(spec_description, kind, provider.allowExtraProps);
        const entity_ref: Provider_Entity_Reference = { kind: kind_name, uuid: uuid, provider_prefix: prefix, provider_version: version };
        const metadata: Metadata = (await this.spec_db.get_spec(entity_ref))[0];
        await this.authorizer.checkPermission(user, {"metadata": metadata}, Action.Update, provider);
        metadata.spec_version = spec_version;
        metadata.provider_prefix = prefix
        metadata.provider_version = version
        const strategy = this.intentfulCtx.getIntentfulStrategy(kind, user)
        const watcher = await strategy.update(metadata, spec_description)
        return watcher;
    }

    async delete_entity(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, entity_uuid: uuid4): Promise<void> {
        const provider = await this.get_provider(prefix, version);
        const kind = this.providerDb.find_kind(provider, kind_name);
        const entity_ref: Provider_Entity_Reference = { kind: kind_name, uuid: entity_uuid, provider_prefix: prefix, provider_version: version };
        const [metadata, spec] = await this.spec_db.get_spec(entity_ref);
        const [_, status] = await this.status_db.get_status(entity_ref);
        await this.authorizer.checkPermission(user, {"metadata": metadata}, Action.Delete, provider);
        const strategy = this.intentfulCtx.getIntentfulStrategy(kind, user)
        await strategy.delete({ metadata, spec, status })
    }

    async call_procedure(user: UserAuthInfo, prefix: string, kind_name: string, version: Version, entity_uuid: uuid4, procedure_name: string, input: any): Promise<any> {
        const provider = await this.get_provider(prefix, version);
        const kind = this.providerDb.find_kind(provider, kind_name);
        const entity_spec: [Metadata, Spec] = await this.get_entity_spec(user, prefix, version, kind_name, entity_uuid);
        const entity_status: [Metadata, Status] = await this.get_entity_status(
            user, prefix, version, kind_name, entity_uuid);
        const procedure: Procedural_Signature | undefined = kind.entity_procedures[procedure_name];
        if (procedure === undefined) {
            throw new Error(`Procedure ${procedure_name} not found for kind ${kind.name}`);
        }
        const schemas: any = {};
        Object.assign(schemas, procedure.argument);
        Object.assign(schemas, procedure.result);
        try {
            this.validator.validate(input, Object.values(procedure.argument)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
        } catch (err) {
            throw ProcedureInvocationError.fromError(err, 400)
        }
        try {
            const { data } = await axios.post(procedure.procedure_callback,
                {
                    metadata: entity_spec[0],
                    spec: entity_spec[1],
                    status: entity_status[1],
                    input: input
                }, {
                    headers: user
                });
            this.validator.validate(data, Object.values(procedure.result)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
            return data;
        } catch (err) {
            throw ProcedureInvocationError.fromError(err)
        }
    }

    async call_provider_procedure(user: UserAuthInfo, prefix: string, version: Version, procedure_name: string, input: any): Promise<any> {
        const provider = await this.get_provider(prefix, version);
        if (provider.procedures === undefined) {
            throw new Error(`Procedure ${procedure_name} not found for provider ${prefix}`);
        }
        const procedure: Procedural_Signature | undefined = provider.procedures[procedure_name];
        if (procedure === undefined) {
            throw new Error(`Procedure ${procedure_name} not found for provider ${prefix}`);
        }
        const schemas: any = {};
        Object.assign(schemas, procedure.argument);
        Object.assign(schemas, procedure.result);
        try {
            this.validator.validate(input, Object.values(procedure.argument)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
        } catch (err) {
            throw ProcedureInvocationError.fromError(err, 400)
        }
        try {
            const { data } = await axios.post(procedure.procedure_callback,
                {
                    input: input
                }, {
                    headers: user
                });
            this.validator.validate(data, Object.values(procedure.result)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
            return data;
        } catch (err) {
            throw ProcedureInvocationError.fromError(err)
        }
    }

    async call_kind_procedure(user: UserAuthInfo, prefix: string, kind_name: string, version: Version, procedure_name: string, input: any): Promise<any> {
        const provider = await this.get_provider(prefix, version);
        const kind = this.providerDb.find_kind(provider, kind_name);
        const procedure: Procedural_Signature | undefined = kind.kind_procedures[procedure_name];
        if (procedure === undefined) {
            throw new Error(`Procedure ${procedure_name} not found for kind ${kind.name}`);
        }
        const schemas: any = {};
        Object.assign(schemas, procedure.argument);
        Object.assign(schemas, procedure.result);
        try {
            this.validator.validate(input, Object.values(procedure.argument)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
        } catch (err) {
            throw ProcedureInvocationError.fromError(err, 400)
        }
        try {
            const { data } = await axios.post(procedure.procedure_callback,
                {
                    input: input
                }, {
                    headers: user
                });
            this.validator.validate(data, Object.values(procedure.result)[0], schemas,
                provider.allowExtraProps, Object.keys(procedure.argument)[0], procedure_name);
            return data;
        } catch (err) {
            throw ProcedureInvocationError.fromError(err)
        }
    }

    async check_permission(user: UserAuthInfo, prefix: string, version: Version, entityAction: [Action, Provider_Entity_Reference][]): Promise<OperationSuccess> {
        const provider = await this.providerDb.get_provider(prefix, version)
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
                throw new PermissionDeniedError()
            }
        } else {
            const [metadata, _] = await this.spec_db.get_spec(entityRef);
            const has_perm = await this.has_permission(user, provider, metadata, action)
            if (has_perm) {
                return {"success": "Ok"}
            } else {
                throw new PermissionDeniedError()
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
            throw new PermissionDeniedError()
        }
    }

    async has_permission(user: UserAuthInfo, provider: Provider, metadata: Metadata, action: Action) {
        try {
            await this.authorizer.checkPermission(user, {"metadata": metadata}, action, provider);
            return true;
        } catch (e) {
            return false;
        }
    }
}
