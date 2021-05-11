import { Spec_DB } from "./spec_db_interface";
import { Collection, Db } from "mongodb";
import { SpecConflictingEntityError, EntityNotFoundError } from "./utils/errors";
import {Entity_Reference, Metadata, Spec, Entity, Provider_Entity_Reference, Status} from "papiea-core"
import { SortParams } from "../entity/entity_api_impl";
import { Logger, dotnotation } from "papiea-backend-utils";
import { IntentfulKindReference } from "./provider_db_mongo";
import { build_filter_query } from "./utils/filtering"
import { PapieaException } from "../errors/papiea_exception"

export class Spec_DB_Mongo implements Spec_DB {
    collection: Collection;
    logger: Logger;

    constructor(logger: Logger, db: Db) {
        this.collection = db.collection("entity");
        this.logger = logger;
    }

    async init(): Promise<void> {
        try {
            await this.collection.createIndex(
                { "metadata.uuid": 1, "metadata.provider_version": 1,
                    "metadata.kind": 1, "metadata.provider_prefix": 1 },
                { name: "provider_specific_entity_uuid", unique: true },
            );
        } catch (err) {
            throw new PapieaException({ message: "Failed to setup the spec database.", cause: err })
        }
    }

    async update_spec(entity_metadata: Metadata, spec: Spec): Promise<[Metadata, Spec]> {
        let additional_fields: any = {};
        if (entity_metadata.extension !== undefined) {
            additional_fields = dotnotation({"metadata.extension": entity_metadata.extension});
        }
        additional_fields["metadata.created_at"] = new Date();
        additional_fields["metadata.status_hash"] = entity_metadata.status_hash
        const filter = {
            "metadata.uuid": entity_metadata.uuid,
            "metadata.kind": entity_metadata.kind,
            "metadata.spec_version": entity_metadata.spec_version,
            "metadata.provider_prefix": entity_metadata.provider_prefix,
            "metadata.provider_version": entity_metadata.provider_version
        };
        try {
            const result = await this.collection.updateOne(filter, {
                $inc: {
                    "metadata.spec_version": 1
                },
                $set: {
                    "spec": spec
                },
                $setOnInsert: additional_fields
            }, {
                    upsert: true
                });
            if (result.result.n !== 1) {
                throw new PapieaException({ message: `MongoDBError: Amount of updated spec entries should equal to 1, found ${result.result.n} entries for kind: ${entity_metadata.provider_prefix}/${entity_metadata.provider_version}/${entity_metadata.kind}.`, entity_info: { provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version, kind_name: entity_metadata.kind, additional_info: { "entity_uuid": entity_metadata.uuid }}})
            }
            return await this.get_spec(entity_metadata);
        } catch (err) {
            if (err.code === 11000) {
                let res:any
                try {
                  res = await this.get_spec(entity_metadata);
                } catch (e) {
                    throw new PapieaException({ message: `MongoDBError: Cannot create entity spec for kind: ${entity_metadata.provider_prefix}/${entity_metadata.provider_version}/${entity_metadata.kind}.`, entity_info: { provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version, kind_name: entity_metadata.kind, additional_info: { "entity_uuid": entity_metadata.uuid }}, cause: e})
                }
                const [metadata, spec] = res
                throw new SpecConflictingEntityError(`MongoDBError: Spec with this version already exists for entity with UUID ${entity_metadata.uuid} of kind: ${entity_metadata.provider_prefix}/${entity_metadata.provider_version}/${entity_metadata.kind}.`, metadata);
            } else {
                throw new PapieaException({ message: `MongoDBError: Something went wrong in update spec for entity of kind: ${entity_metadata.provider_prefix}/${entity_metadata.provider_version}/${entity_metadata.kind}.`, entity_info: { provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version, kind_name: entity_metadata.kind, additional_info: { "entity_uuid": entity_metadata.uuid }}, cause: err });
            }
        }
    }

    async get_spec(entity_ref: Provider_Entity_Reference): Promise<[Metadata, Spec]> {
        const result: Entity | null = await this.collection.findOne(
            {
                "metadata.uuid": entity_ref.uuid,
                "metadata.kind": entity_ref.kind,
                "metadata.provider_prefix": entity_ref.provider_prefix,
                "metadata.provider_version": entity_ref.provider_version,
                "metadata.deleted_at": null
            });
        if (result === null) {
            throw new EntityNotFoundError(entity_ref.kind, entity_ref.uuid, entity_ref.provider_prefix, entity_ref.provider_version)
        }
        return [result.metadata, result.spec];
    }

    async get_specs_by_ref(entity_refs: Entity_Reference[]): Promise<[Metadata, Spec][]> {
        const ids = entity_refs.map(ref => ref.uuid)
        const result = await this.collection.find({
            "metadata.uuid": {
                $in: ids
            }
        }).toArray();
        return result.map((x: any): [Metadata, Spec] => {
            if (x.spec !== null) {
                return [x.metadata, x.spec]
            } else {
                throw new PapieaException({ message: "MongoDBError: No valid entities found for get specs by entity reference." });
            }
        });
    }

    async get_spec_status(entity_ref: Provider_Entity_Reference): Promise<[Metadata, Spec, Status]> {
        const result: Entity | null = await this.collection.findOne(
            {
                "metadata.uuid": entity_ref.uuid,
                "metadata.kind": entity_ref.kind,
                "metadata.provider_prefix": entity_ref.provider_prefix,
                "metadata.provider_version": entity_ref.provider_version,
                "metadata.deleted_at": null
            });
        if (result === null) {
            throw new EntityNotFoundError(entity_ref.kind, entity_ref.uuid, entity_ref.provider_prefix, entity_ref.provider_version)
        }
        return [result.metadata, result.spec, result.status];
    }

    async list_specs(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<([Metadata, Spec])[]> {
        const filter = build_filter_query(fields_map, exact_match)
        let result: any[];
        if (sortParams) {
            result = await this.collection.find(filter).sort(sortParams).toArray();
        } else {
            result = await this.collection.find(filter).toArray();
        }
        return result.map((x: any): [Metadata, Spec] => {
            if (x.spec !== null) {
                return [x.metadata, x.spec]
            } else {
                throw new PapieaException({ message: "MongoDBError: No valid entities found for list specs." });
            }
        });
    }

    async list_specs_statuses(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<([Metadata, Spec, Status])[]> {
        const filter = build_filter_query(fields_map, exact_match)
        let result: any[];
        if (sortParams) {
            result = await this.collection.find(filter).sort(sortParams).toArray();
        } else {
            result = await this.collection.find(filter).toArray();
        }
        return result.map((x: any): [Metadata, Spec, Status] => {
            if (x.spec !== null) {
                return [x.metadata, x.spec, x.status]
            } else {
                throw new PapieaException({ message: "MongoDBError: No valid entities found for list specs." });
            }
        });
    }

    async list_specs_statuses_in(filter_list: any[], field_name: string = "metadata.uuid"): Promise<([Metadata, Spec, Status])[]> {
        const result = await this.collection.find({ [field_name]: { $in: filter_list } }).sort({ "metadata.uuid": 1 }).toArray();
        return result.map((x: any): [Metadata, Spec, Status] => {
            if (x.spec !== null) {
                return [x.metadata, x.spec, x.status]
            } else {
                throw new PapieaException({ message: "MongoDBError: No valid entities found for list specs." });
            }
        });
    }

    async list_random_intentful_specs(size: number, kind_refs: IntentfulKindReference[], sortParams?: SortParams): Promise<([Metadata, Spec])[]> {
        const intentful_kind_names = kind_refs.map(kind => kind.kind_name)
        if (intentful_kind_names.length === 0) {
            return []
        }
        let result: any[];
        if (sortParams) {
            result = await this.collection.aggregate([
                { $match: { "metadata.kind": { $in: intentful_kind_names } } },
                { $sample: { size } }
            ]).sort(sortParams).toArray();
        } else {
            result = await this.collection.aggregate([
                { $match: { "metadata.kind": { $in: intentful_kind_names } } },
                { $sample: { size } }
            ]).toArray();
        }
        return result.map((x: any): [Metadata, Spec] => {
            if (x.spec !== null) {
                return [x.metadata, x.spec]
            } else {
                throw new PapieaException({ message: "MongoDBError: No valid entities found for list random intentful spec." });
            }
        });
    }
}
