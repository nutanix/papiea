import {Entity, Entity_Reference, Metadata, Provider_Entity_Reference, Spec, Status, EntityStatusUpdateInput} from "papiea-core"
import { SortParams } from "../entity/entity_api_impl";
import { IntentfulKindReference } from "./provider_db_mongo";


// [[file:~/work/papiea-js/Papiea-design.org::*/src/databases/entity_db_interface.ts][/src/databases/entity_db_interface.ts:1]]


// [[file:~/work/papiea-js/Papiea-design.org::#h-Interface-229][entity-db-interface]]

export interface Entity_DB {

    // Tries to update the spec. Succeeds only if the spec_version
    // field in metadata is currently equals to the one on record. The
    // implementation needs to CAS the spec_version to the increment
    // of itself, and return the new metadata with the new
    // spec_version and the new CASed in spec and status.
    update_spec(entity_metadata: Metadata, spec: Spec): Promise<Entity>;

    /**
     * Replaces status for the entity
     * @async
     * @method
     * @param  {EntityStatusUpdateInput} metadata
     * @param  {Spec} spec
     * @param  {Status} status
     * @returns Promise<Entity>
     * @throws {StatusConflictingEntityError} when the status hash is stale/incorrect
     */
    replace_status(metadata: EntityStatusUpdateInput, status: Status): Promise<Entity>;

    /**
     * Updates status for the entity
     * @param  {EntityStatusUpdateInput} metadata
     * @param  {Spec} spec
     * @param  {Status} status
     * @returns Promise<Entity>
     * @throws {StatusConflictingEntityError} when the status hash is stale/incorrect
     */
    update_status(metadata: EntityStatusUpdateInput, status: Status): Promise<Entity>

    // Get the particular entity from the db. Returns the
    // current metadata, spec and status of that entity.
    get_entity(entity_ref: Provider_Entity_Reference): Promise<Entity>;

    // Get entities by their entity references
    get_entities_by_ref(entity_refs: Entity_Reference[]): Promise<Entity[]>

    // List all entities that have their fields match the ones given in
    // fields_map. E.g. we could look for all specs for `vm` kind that
    // have a certain ip:
    // list_specs({"metadata": {"kind": "vm"},
    //             "spec":     {"ip":   "10.0.0.10"}})
    //
    // We could come up with command such as greater-than etc at some
    // later point, or we could use a similar dsl to mongodb search
    // dsl.
    list_entities(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<Entity[]>;

    list_entities_in(filter_list: any[], field_name?: string): Promise<Entity[]>

    list_random_intentful_specs(size: number, kind_refs: IntentfulKindReference[], sortParams?: SortParams): Promise<Entity[]>;
}

// entity-db-interface ends here
// /src/databases/entity_db_interface.ts:1 ends here