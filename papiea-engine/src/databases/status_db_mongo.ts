import { Status_DB } from "./status_db_interface";
import { Db, Collection, UpdateWriteOpResult } from "mongodb"
import { Entity_Reference, Status, Metadata, Entity } from "papiea-core";
import { SortParams } from "../entity/entity_api_impl";
import { Logger, dotnotation } from "papiea-backend-utils";
import { build_filter_query } from "./utils/filtering"
import { Provider_Entity_Reference } from "../../../papiea-core/src/core"

export class Status_DB_Mongo implements Status_DB {
    collection: Collection;
    logger: Logger

    constructor(logger: Logger, db: Db) {
        this.collection = db.collection("entity");
        this.logger = logger;
    }

    async init(): Promise<void> {

    }

    async replace_status(entity_ref: Provider_Entity_Reference, status: Status): Promise<void> {
        const result = await this.collection.updateOne({
            "metadata.provider_prefix": entity_ref.provider_prefix,
            "metadata.provider_version": entity_ref.provider_version,
            "metadata.uuid": entity_ref.uuid,
            "metadata.kind": entity_ref.kind
        }, {
                $set: {
                    "status": status
                },
                $setOnInsert: {
                    "metadata.created_at": new Date()
                }
            }, {
                upsert: true
            });
        if (result.result.n !== 1) {
            throw new Error(`Amount of updated entries doesn't equal to 1: ${result.result.n}`)
        }
    }

    async update_status(entity_ref: Provider_Entity_Reference, status: Status): Promise<void> {
        let result: UpdateWriteOpResult
        const partial_status_query = dotnotation({"status": status});
        try {
            result = await this.collection.updateOne(
                {
                    "metadata.provider_prefix": entity_ref.provider_prefix,
                    "metadata.provider_version": entity_ref.provider_version,
                    "metadata.uuid": entity_ref.uuid,
                    "metadata.kind": entity_ref.kind
                }, { $set: partial_status_query });
        } catch (e) {
            if (e.code === 9) {
                throw new Error(`Error parsing update query. Update body might be 'undefined', if this is expected, please use 'null'.`)
            }
            throw e
        }
        if (result.result.n !== 1) {
            throw new Error(`Amount of updated entries doesn't equal to 1: ${result.result.n}`)
        }
    }

    async get_status(entity_ref: Provider_Entity_Reference): Promise<[Metadata, Status]> {
        const result: Entity | null = await this.collection.findOne({
            "metadata.provider_prefix": entity_ref.provider_prefix,
            "metadata.provider_version": entity_ref.provider_version,
            "metadata.uuid": entity_ref.uuid,
            "metadata.kind": entity_ref.kind
        });
        if (result === null) {
            throw new Error("Status Not found")
        }
        return [result.metadata, result.status]
    }

    async get_statuses_by_ref(entity_refs: Provider_Entity_Reference[]): Promise<[Metadata, Status][]> {
        const ids = entity_refs.map(ref => ref.uuid)
        const result = await this.collection.find({
            "metadata.uuid": {
                $in: ids
            }
        }).toArray();
        return result.map((x: any): [Metadata, Status] => {
            if (x.spec !== null) {
                return [x.metadata, x.status]
            } else {
                throw new Error("No valid entities found");
            }
        });
    }

    async list_status(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<([Metadata, Status])[]> {
        const filter = build_filter_query(fields_map, exact_match)
        let result: any[];
        if (sortParams) {
            result = await this.collection.find(filter).sort(sortParams).toArray();
        } else {
            result = await this.collection.find(filter).toArray();
        }
        return result.map((x: any): [Metadata, Status] => {
            if (x.status !== null) {
                return [x.metadata, x.status]
            } else {
                throw new Error("No entities found")
            }
        });
    }

    async list_status_in(filter_list: any[], field_name: string = "metadata.uuid"): Promise<([Metadata, Status])[]> {
        const result = await this.collection.find({ [field_name]: { $in: filter_list } }).sort({ "metadata.uuid": 1 }).toArray();
        return result.map((x: any): [Metadata, Status] => {
            if (x.status !== null) {
                return [x.metadata, x.status]
            } else {
                throw new Error("No valid entities found");
            }
        });
    }

    async delete_status(entity_ref: Provider_Entity_Reference): Promise<void> {
        const result = await this.collection.updateOne({
            "metadata.provider_prefix": entity_ref.provider_prefix,
            "metadata.provider_version": entity_ref.provider_version,
            "metadata.uuid": entity_ref.uuid,
            "metadata.kind": entity_ref.kind
        }, {
                $set: {
                    "metadata.deleted_at": new Date()
                }
            });
        if (result.result.n === undefined || result.result.ok !== 1) {
            throw new Error("Failed to remove status");
        }
        if (result.result.n !== 1 && result.result.n !== 0) {
            throw new Error("Amount of entities must be 0 or 1");
        }
        return;
    }
}
