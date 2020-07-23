import { ClientSession, Collection, Db, MongoClient } from "mongodb"
import { Graveyard_DB } from "./graveyard_db_interface"
import { Logger } from 'papiea-backend-utils'
import { Provider_Entity_Reference, Entity } from "papiea-core";
import { SortParams } from "../entity/entity_api_impl"
import { build_filter_query } from "./utils/filtering"

export class Graveyard_DB_Mongo implements Graveyard_DB {
    collection: Collection
    logger: Logger
    entity_collection: Collection
    client: MongoClient
    session?: ClientSession

    constructor(logger: Logger, db: Db, client: MongoClient) {
        this.collection = db.collection("graveyard")
        this.entity_collection = db.collection("entity")
        this.logger = logger
        this.client = client
    }

    async dispose(entity: Entity): Promise<void> {
        // TODO: this is a transaction operation
        // TODO: Mongo only allows transactions on replica sets
        // const session = this.client.startSession()
        // this.session = session
        // try {
        //     await session.withTransaction(async () => {
        //
        //         await this.save_to_graveyard(entity);
        //         await this.delete_entity(entity.metadata);
        //     });
        // } finally {
        //     this.session = undefined
        //     await session.endSession();
        // }
        await this.save_to_graveyard(entity);
        await this.delete_entity(entity.metadata);
    }

    async delete_entity(entity_ref: Provider_Entity_Reference): Promise<void> {
        const result = await this.entity_collection.deleteOne(
            {
                "metadata.uuid": entity_ref.uuid,
                "metadata.kind": entity_ref.kind,
                "metadata.provider_prefix": entity_ref.provider_prefix,
                "metadata.provider_version": entity_ref.provider_version
            }, {session: this.session})
        if (result.result.n === undefined || result.result.ok !== 1) {
            throw new Error("Failed to remove entity");
        }
        if (result.result.n !== 1 && result.result.n !== 0) {
            throw new Error(`Amount of entities deleted must be 0 or 1, found: ${result.result.n}`);
        }
        return;
    }

    async init(): Promise<void> {
        try {
            await this.collection.createIndex(
                { "metadata.uuid": 1, "metadata.provider_version": 1,
                    "metadata.kind": 1, "metadata.provider_prefix": 1, "metadata.deleted_at": 1 },
                { unique: true },
            )
        } catch (err) {
            throw err
        }
    }

    async save_to_graveyard(entity: Entity): Promise<void> {
        entity.metadata.spec_version++
        entity.metadata.deleted_at = new Date()
        const result = await this.collection.insertOne(entity, {session: this.session})
        if (result.result.n !== 1) {
            throw new Error(`Amount of saved entries doesn't equal to 1: ${result.result.n}`)
        }
    }

    async list_entities(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<Entity[]> {
        const filter = build_filter_query(fields_map, exact_match)
        if (filter["metadata.deleted_at"] === null) {
            delete filter["metadata.deleted_at"]
        }
        if (sortParams) {
            return await this.collection.find(filter).sort(sortParams).toArray();
        } else {
            return await this.collection.find(filter).toArray();
        }
    }

    async get_entity(entity_ref: Provider_Entity_Reference): Promise<Entity> {
        const result = await this.collection.findOne(
            {
                "metadata.uuid": entity_ref.uuid,
                "metadata.provider_prefix": entity_ref.provider_prefix,
                "metadata.provider_version": entity_ref.provider_version,
                "metadata.kind": entity_ref.kind
            }
        );
        if (result === null) {
            throw new Error("Entity not found");
        }
        return result;
    }
}
