import {Metadata, Spec, Entity_Reference, Provider_Entity_Reference, Status} from "papiea-core"
import { SortParams } from "../entity/entity_api_impl";
import { IntentfulKindReference } from "./provider_db_mongo";


// [[file:~/work/papiea-js/Papiea-design.org::*/src/databases/spec_db_interface.ts][/src/databases/spec_db_interface.ts:1]]


// [[file:~/work/papiea-js/Papiea-design.org::#h-Interface-229][spec-db-interface]]

export interface Spec_DB {

    // Tries to update the spec. Succeeds only if the spec_version
    // field in metadata is currently equals to the one on record. The
    // implementation needs to CAS the spec_version to the increment
    // of itself, and return the new metadata with the new
    // spec_version and the new CASed in spec.
    update_spec(entity_metadata: Metadata, spec:Spec): Promise<[Metadata, Spec]>;

    // Get the spec of a particular entity from the db. Returns both
    // current metadata and the spec of that entity.
    get_spec(entity_ref: Provider_Entity_Reference): Promise<[Metadata, Spec]>;

    // Get the spec and status of a particular entity from the db. Returns the
    // current metadata, spec and status of that entity.
    get_spec_status(entity_ref: Provider_Entity_Reference): Promise<[Metadata, Spec, Status]>;

    // Get specs by their entity references
    get_specs_by_ref(entity_refs: Entity_Reference[]): Promise<[Metadata, Spec][]>

    // List all specs that have their fields match the ones given in
    // fields_map. E.g. we could look for all specs for `vm` kind that
    // have a certain ip:
    // list_specs({"metadata": {"kind": "vm"},
    //             "spec":     {"ip":   "10.0.0.10"}})
    //
    // We could come up with command such as greater-than etc at some
    // later point, or we could use a similar dsl to mongodb search
    // dsl.
    list_specs(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<([Metadata, Spec])[]>;

    list_specs_statuses(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<([Metadata, Spec, Status])[]>;

    list_specs_statuses_in(filter_list: any[], field_name?: string): Promise<([Metadata, Spec, Status])[]>

    list_random_intentful_specs(size: number, kind_refs: IntentfulKindReference[], sortParams?: SortParams): Promise<([Metadata, Spec])[]>;
}

// spec-db-interface ends here
// /src/databases/spec_db_interface.ts:1 ends here
