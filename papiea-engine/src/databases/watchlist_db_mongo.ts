import { Collection, Db } from "mongodb";
import { Logger } from "papiea-backend-utils";
import { Watchlist_DB } from "./watchlist_db_interface";
import { SerializedWatchlist, Watchlist } from "../intentful_engine/watchlist";
import { PapieaException } from "../errors/papiea_exception";

type WatchlistResult = {
    id: number
    watchlist: SerializedWatchlist
}

class Mutex {
    readonly name: string;

    // The Rust programmer in me cringes at the fact that the value is outside
    // the mutex... but that's for another day ;)
    private _q = [] as (() => void)[];

    constructor(name: string) { this.name = name; }

    with_lock<R>(fn: () => Promise<R>): Promise<R> {
        return new Promise<R>((resolve, reject) => {
            this._q.push(() => {
                fn().then(resolve, reject)
                    .finally(() => {
                        this._q.shift();
                        // console.log(`[Mutex ${this.name}] Finished task -- ${this._q.length} remaining`);
                        if (this._q.length > 0) this.next();
                    });
            });
            if (this._q.length === 1) this.next();
        });
    }

    private next() {
        // console.log(`[Mutex ${this.name}] Starting next task`);
        this._q[0]();
    }
}

const DB_LOCK = new Mutex("watchlistDb");

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

    edit_watchlist<R>(editor: (watchlist: Watchlist) => Promise<R>): Promise<R> {
        return DB_LOCK.with_lock(async() => {
            const watchlist = await this.get_watchlist();
            const res = await editor(watchlist);
            await this.update_watchlist(watchlist);
            return res;
        });
    }

    private async update_watchlist(watchlist: Watchlist): Promise<void> {
        const result = await this.collection.updateOne({
            "id": 1,
        }, {
            $set: {
                watchlist: watchlist.serialize()
            }
        }, {
            upsert: true
        });
        if (result.result.n !== 1) {
            throw new PapieaException({ message: `MongoDBError: Amount of updated watchlist entries should equal to 1, found ${result.result.n} entries.`})
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
