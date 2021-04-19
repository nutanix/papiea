import { Collection, Db } from "mongodb"
import { SortParams } from "../entity/entity_api_impl"
import { Logger } from 'papiea-backend-utils'
import { IntentWatcher_DB } from "./intent_watcher_db_interface"
import { IntentWatcher } from "papiea-core"
import { EntityNotFoundError } from "./utils/errors"
import { PapieaException } from "../errors/papiea_exception"

export class IntentWatcher_DB_Mongo implements IntentWatcher_DB {
    collection: Collection;
    logger: Logger;

    constructor(logger: Logger, db: Db) {
        this.collection = db.collection("watcher");
        this.logger = logger;
    }

    async init(): Promise<void> {
        try {
            await this.collection.createIndex(
                { "uuid": 1 },
                { unique: true },
            )
        } catch (err) {
            throw new PapieaException({ message: "Failed to setup the intent watcher database.", cause: err })
        }
    }

    async save_watcher(watcher: IntentWatcher): Promise<void> {
        watcher.created_at = new Date()
        await this.collection.insertOne(watcher);
    }

    async get_watcher(uuid: string): Promise<IntentWatcher> {
        const result: IntentWatcher | null = await this.collection.findOne({
            "uuid": uuid,
        });
        if (result === null) {
            throw new EntityNotFoundError('IntentWatcher', uuid);
        }
        return result;
    }

    async update_watcher(uuid: string, delta: Partial<IntentWatcher>): Promise<void> {
        const result = await this.collection.updateOne({
            uuid
        }, {
            $set: delta
        })
        if (result.result.n === undefined || result.result.ok !== 1) {
            throw new PapieaException({ message: `MongoDBError: Failed to update intent watcher with uuid: ${uuid}.` });
        }
        if (result.result.n !== 1 && result.result.n !== 0) {
            throw new PapieaException({ message: `MongoDBError: Amount of intent watchers updated must be 0 or 1, found ${result.result.n} for uuid: ${uuid}.` });
        }
    }


    list_watchers(fields_map: any, sortParams?: SortParams): AsyncIterable<IntentWatcher> {
        const filter: any = Object.assign({}, fields_map);
        if (sortParams) {
            return this.collection.find(filter).sort(sortParams);
        } else {
            return this.collection.find(filter);
        }
    }

    async delete_watcher(uuid: string): Promise<void> {
        const result = await this.collection.deleteOne({
            uuid
        })
        if (result.result.n === undefined || result.result.ok !== 1) {
            throw new PapieaException({ message: `MongoDBError: Failed to delete intent watcher with uuid: ${uuid}.` });
        }
        if (result.result.n !== 1 && result.result.n !== 0) {
            throw new PapieaException({ message: `MongoDBError: Amount of deleted intent watchers must be 0 or 1, found ${result.result.n} for uuid: ${uuid}.` });
        }
        return;
    }
}
