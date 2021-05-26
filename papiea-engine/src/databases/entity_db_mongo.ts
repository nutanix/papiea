import { Entity_DB } from "./entity_db_interface";
import { Collection, Db, UpdateWriteOpResult } from "mongodb";
import { SpecConflictingEntityError, EntityNotFoundError, StatusConflictingEntityError } from "./utils/errors";
import {Entity_Reference, Metadata, Spec, Entity, Provider_Entity_Reference, Status, EntityStatusUpdateInput} from "papiea-core"
import { SortParams } from "../entity/entity_api_impl";
import { Logger, dotnotation } from "papiea-backend-utils";
import { IntentfulKindReference } from "./provider_db_mongo";
import { build_filter_query } from "./utils/filtering"
import { PapieaException } from "../errors/papiea_exception"
import { getObjectHash } from "../utils/utils"

export class Entity_DB_Mongo implements Entity_DB {
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

    async update_spec(entity_metadata: Metadata, spec: Spec): Promise<Entity> {
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
            return await this.get_entity(entity_metadata);
        } catch (err) {
            if (err.code === 11000) {
                let res:any
                try {
                  res = await this.get_entity(entity_metadata);
                } catch (e) {
                    throw new PapieaException({ message: `MongoDBError: Cannot create entity spec for kind: ${entity_metadata.provider_prefix}/${entity_metadata.provider_version}/${entity_metadata.kind}.`, entity_info: { provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version, kind_name: entity_metadata.kind, additional_info: { "entity_uuid": entity_metadata.uuid }}, cause: e})
                }
                const { metadata } = res
                throw new SpecConflictingEntityError(`MongoDBError: Spec with this version already exists for entity with UUID ${entity_metadata.uuid} of kind: ${entity_metadata.provider_prefix}/${entity_metadata.provider_version}/${entity_metadata.kind}.`, metadata);
            } else {
                throw new PapieaException({ message: `MongoDBError: Something went wrong in update spec for entity of kind: ${entity_metadata.provider_prefix}/${entity_metadata.provider_version}/${entity_metadata.kind}.`, entity_info: { provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version, kind_name: entity_metadata.kind, additional_info: { "entity_uuid": entity_metadata.uuid }}, cause: err });
            }
        }
    }

    async replace_status(metadata: EntityStatusUpdateInput, status: Status): Promise<Entity> {
        try {
            const current_status_hash = getObjectHash({
                "status": status
            })
            const result = await this.collection.updateOne({
                "metadata.provider_prefix": metadata.provider_prefix,
                "metadata.provider_version": metadata.provider_version,
                "metadata.status_hash": metadata.status_hash,
                "metadata.uuid": metadata.uuid,
                "metadata.kind": metadata.kind
            }, {
                    $set: {
                        "status": status,
                        "metadata.status_hash": current_status_hash
                    },
                    $setOnInsert: {
                        "metadata.created_at": new Date()
                    }
                }, {
                    upsert: true
                });
            if (result.result.n !== 1) {
                throw new PapieaException({ message: `MongoDBError: Amount of updated status entries should equal to 1, found ${result.result.n} entries for kind: ${metadata.provider_prefix}/${metadata.provider_version}/${metadata.kind},`, entity_info: { provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid }}})
            }
            return await this.get_entity(metadata)
        } catch (err) {
            /* duplicate key index error */
            if (err.code === 11000) {
                let res:any
                try {
                  res = await this.get_entity(metadata);
                } catch (e) {
                    throw new PapieaException({ message: `MongoDBError: Cannot create entity for kind ${metadata.provider_prefix}/${metadata.provider_version}/${metadata.kind}`, entity_info: { provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid }}})
                }
                const { metadata: updated_metadata, status } = res
                throw new StatusConflictingEntityError(updated_metadata);
            }
            throw err
        }
    }

    async update_status(metadata: EntityStatusUpdateInput, status: Status): Promise<Entity> {
        let result: UpdateWriteOpResult
        const partial_status_query = dotnotation({"status": status});

        let aggregrate_fields = []
        const {set_status_fields, unset_status_fields} = separate_null_fields(partial_status_query)
        const current_status_hash = getObjectHash({
            "status": status
        })
        if (Object.keys(set_status_fields).length !== 0) {
            aggregrate_fields.push({ $set: {"metadata.status_hash": current_status_hash, ...set_status_fields} })
        }
        if (Object.keys(unset_status_fields).length !== 0) {
            aggregrate_fields.push({ $unset: unset_status_fields })
        }

        try {
            result = await this.collection.updateOne(
                {
                    "metadata.provider_prefix": metadata.provider_prefix,
                    "metadata.provider_version": metadata.provider_version,
                    "metadata.status_hash": metadata.status_hash,
                    "metadata.uuid": metadata.uuid,
                    "metadata.kind": metadata.kind
                }, aggregrate_fields, {
                    upsert: true
                });
        } catch (err) {
            /* failed to parse input error */
            if (err.code === 9) {
                throw new PapieaException({ message: `MongoDBError: Update body might be 'undefined', if this is expected, please use 'null' for kind: ${metadata.provider_prefix}/${metadata.provider_version}/${metadata.kind}.`, entity_info: { provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid }}})
            }
            /* duplicate key index error */
            if (err.code === 11000) {
                let res:any
                try {
                  res = await this.get_entity(metadata);
                } catch (e) {
                    throw new PapieaException({ message: `MongoDBError: Something went wrong in update status for entity of kind: ${metadata.provider_prefix}/${metadata.provider_version}/${metadata.kind}.`, entity_info: { provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid }}, cause: e})
                }
                const { metadata: updated_metadata, status } = res
                throw new StatusConflictingEntityError(updated_metadata);
            }
            throw err
        }
        if (result.result.n !== 1) {
            throw new PapieaException({ message: `MongoDBError: Amount of updated status entries should equal to 1, found ${result.result.n} entries for kind ${metadata.provider_prefix}/${metadata.provider_version}/${metadata.kind}.`, entity_info: { provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid }}})
        }
        return await this.get_entity(metadata)
    }

    async get_entity(entity_ref: Provider_Entity_Reference): Promise<Entity> {
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
        return result;
    }

    async get_entities_by_ref(entity_refs: Entity_Reference[]): Promise<Entity[]> {
        const ids = entity_refs.map(ref => ref.uuid)
        const result = await this.collection.find({
            "metadata.uuid": {
                $in: ids
            }
        }).toArray();
        return result
    }

    async list_entities(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<Entity[]> {
        const filter = build_filter_query(fields_map, exact_match)
        let result: any[];
        if (sortParams) {
            result = await this.collection.find(filter).sort(sortParams).toArray();
        } else {
            result = await this.collection.find(filter).toArray();
        }
        return result
    }

    async list_entities_in(filter_list: any[], field_name: string = "metadata.uuid"): Promise<Entity[]> {
        const result = await this.collection.find({ [field_name]: { $in: filter_list } }).sort({ "metadata.uuid": 1 }).toArray();
        return result
    }

    async list_random_intentful_specs(size: number, kind_refs: IntentfulKindReference[], sortParams?: SortParams): Promise<Entity[]> {
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
        return result.map((x: any): Entity => {
            if (x.spec !== null) {
                return x
            } else {
                throw new PapieaException({ message: "MongoDBError: No valid entities found for list random intentful spec." });
            }
        });
    }
}

function separate_null_fields(status_dot_notation: any): any {
    let set_fields: any = {}
    let unset_fields: any = []

    for (const key in status_dot_notation) {
        if (status_dot_notation[key] === null) {
            unset_fields.push(key)
        } else {
            set_fields[key] = status_dot_notation[key]
        }
    }
    return { set_status_fields: set_fields,
            unset_status_fields: unset_fields }
}