import { UserAuthInfo } from "../auth/authn";
import { Version, Spec, Metadata, uuid4, Status, Entity_Reference, Action, Entity, EntityCreateOrUpdateResult, IntentWatcher } from "papiea-core";
import { SortParams } from "./entity_api_impl";
import {RequestContext} from "papiea-backend-utils"
import { Cursor } from "mongodb";

export interface Entity_API {
    save_entity(user: UserAuthInfo, prefix: string, kind_name: string, version: Version, input: unknown, context: RequestContext): Promise<EntityCreateOrUpdateResult>

    get_entity(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, entity_uuid: uuid4, context: RequestContext): Promise<[Metadata, Spec, Status]>

    get_intent_watcher(user: UserAuthInfo, id: string, context: RequestContext): Promise<Partial<IntentWatcher>>

    get_entity_status(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, entity_uuid: uuid4, context: RequestContext): Promise<[Metadata, Status]>

    filter_intent_watcher(user: UserAuthInfo, fields: any, context: RequestContext, sortParams?: SortParams): [AsyncIterable<Partial<IntentWatcher>>, Cursor<IntentWatcher>]

    filter_entity_spec(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, fields: any, exact_match: boolean, context: RequestContext, sortParams?: SortParams): AsyncIterable<[Metadata, Spec]>

    filter_entity_status(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, fields: any, exact_match: boolean, context: RequestContext, sortParams?: SortParams): AsyncIterable<[Metadata, Status]>

    filter_deleted(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, fields: any, exact_match: boolean, context: RequestContext, sortParams?: SortParams): AsyncIterable<Entity>

    update_entity_spec(user: UserAuthInfo, uuid: uuid4, prefix: string, spec_version: number, extension: {[key: string]: any}, kind_name: string, version: Version, spec_description: Spec, context: RequestContext): Promise<EntityCreateOrUpdateResult>

    delete_entity(user: UserAuthInfo, prefix: string, version: Version, kind_name: string, entity_uuid: uuid4, context: RequestContext): Promise<void>

    call_procedure(user: UserAuthInfo, prefix: string, kind_name: string, version: Version, entity_uuid: uuid4, procedure_name: string, input: any, context: RequestContext): Promise<any>

    call_kind_procedure(user: UserAuthInfo, prefix: string, kind_name: string, version: Version, procedure_name: string, input: any, context: RequestContext): Promise<any>

    call_provider_procedure(user: UserAuthInfo, prefix: string, version: Version, procedure_name: string, input: any, context: RequestContext): Promise<any>

    check_permission(user: UserAuthInfo, prefix: string, version: Version, entityAction: [Action, Entity_Reference][], context: RequestContext): Promise<OperationSuccess>
}

export interface OperationSuccess {
    success: string
}
