import { Collection, Db, UpdateWriteOpResult } from "mongodb";
import { Logger } from "papiea-backend-utils";
import { Watchlist_DB } from "./watchlist_db_interface";
import { SerializedWatchlist, Watchlist } from "../intentful_engine/watchlist";
import { PapieaException } from "../errors/papiea_exception";
import { getObjectHash } from "../utils/utils";

const WATCHLIST_CONFLICT_MESSAGE = "Watchlist Conflict Error"

type WatchlistResult = {
    id: number
    watchlist: SerializedWatchlist
}

export class Watchlist_Db_Mongo implements Watchlist_DB {
    collection: Collection;
    logger: Logger

    constructor(logger: Logger, db: Db) {
        this.collection = db.collection("watchlist");
        this.logger = logger;
    }

    async init(): Promise<void> {
        await this.collection.createIndex(
            { "id": 1 },
            { name: "watchlist_id", unique: true }
        );
    }

    async edit_watchlist<R>(editor: (watchlist: Watchlist) => Promise<R>): Promise<R> {
        let res: R
        while (true) {
            const watchlist = await this.get_watchlist();
            res = await editor(watchlist);
            try {
                await this.update_watchlist(watchlist);
                return res
            } catch (e) {
                if (e.constructor === PapieaException && e.message === WATCHLIST_CONFLICT_MESSAGE) {
                    this.logger.debug("Found conflict in watchlist db. Retrying...")
                } else {
                    throw new PapieaException({ message: "Something went wrong in update watchlist." })
                }
            }
        }
    }

    private async update_watchlist(watchlist: Watchlist): Promise<void> {
        let result: UpdateWriteOpResult
        try {
            result = await this.collection.updateOne({
                "id": 1,
                "hash": watchlist.hash()
            }, {
                $set: {
                    watchlist: watchlist.serialize(),
                    hash: getObjectHash(watchlist.entries())
                }
            }, {
                upsert: true
            });
        } catch (err) {
            /* duplicate key index error */
            if (err.code === 11000) {
                throw new PapieaException({ message: WATCHLIST_CONFLICT_MESSAGE });
            } else {
                throw new PapieaException({ message: `MongoDBError: Something went wrong in update watchlist.`, cause: err}) 
            }
        }
        if (result!.result.n !== 1) {
            throw new PapieaException({ message: `MongoDBError: Amount of updated watchlist entries should equal to 1, found ${result!.result.n} entries.`})
        }
    }

    private async get_watchlist(): Promise<Watchlist> {
        const result: WatchlistResult | null = await this.collection.findOne({
            "id": 1,
        });
        if (result === null) {
            const watchlist = new Watchlist()
            await this.update_watchlist(watchlist)
            return watchlist
        }
        return new Watchlist(result.watchlist)
    }
}
