// [[file:~/work/papiea-js/Papiea-design.org::*/src/databases/status_db_interface.ts][/src/databases/status_db_interface.ts:1]]
import { EntityStatusUpdateInput, Provider_Entity_Reference, Status, Metadata } from "papiea-core";
import { SortParams } from "../entity/entity_api_impl";

// [[file:~/work/papiea-js/Papiea-design.org::#h-Interface-548][status-db-interface]]

export interface Status_DB {

    /**
     * Replaces status for the entity
     * @async
     * @method
     * @param  {EntityStatusUpdateInput} metadata
     * @param  {Status} status
     * @returns Promise<[Metadata, Status]>
     * @throws {StatusConflictingEntityError} when the status hash is stale/incorrect
     */
    replace_status(metadata: EntityStatusUpdateInput, status: Status): Promise<[Metadata, Status]>;

    /**
     * Updates status for the entity
     * @param  {EntityStatusUpdateInput} metadata
     * @param  {Status} status
     * @returns Promise<[Metadata, Status]>
     * @throws {StatusConflictingEntityError} when the status hash is stale/incorrect
     */
    
    update_status(metadata: EntityStatusUpdateInput, status: Status): Promise<[Metadata, Status]>

    // Gets the status of a particular entity from the db. Returns
    // both current metadata and status of the entity.
    get_status(entity_ref: Provider_Entity_Reference): Promise<[Metadata, Status]>;

    // Get statuses by their entity references
    get_statuses_by_ref(entity_refs: Provider_Entity_Reference[]): Promise<[Metadata, Status][]>

    // List all status that have their fields match the ones given in
    // fields_map. E.g. we could look for all statuses for `vm` kind that
    // have a certain ip:
    // list_status({"metadata": {"kind": "vm"},
    //              "status":   {"ip":   "10.0.0.10"}})
    //
    // We could come up with command such as greater-than etc at some
    // later point, or we could use a similar dsl to mongodb search
    // dsl.
    list_status(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<([Metadata, Status])[]>;

    list_status_in(filter_list: any[], field_name?: string): Promise<([Metadata, Status])[]>
}

// status-db-interface ends here
// /src/databases/status_db_interface.ts:1 ends here
