import axios from "axios";
import { promisify } from "util"
import { MongoClient, Db } from "mongodb";
import { Provider_DB_Mongo } from "./provider_db_mongo";
import { S2S_Key_DB_Mongo } from "./s2skey_db_mongo";
import { SessionKeyDbMongo } from "./session_key_db_mongo"
import { Logger } from 'papiea-backend-utils'
import { IntentWatcher_DB_Mongo } from "./intent_watcher_db_mongo"
import { Watchlist_Db_Mongo } from "./watchlist_db_mongo";
import { Graveyard_DB } from "./graveyard_db_interface"
import { Graveyard_DB_Mongo } from "./graveyard_db_mongo"
import { PapieaException } from "../errors/papiea_exception";
import { Entity_DB_Mongo } from "./entity_db_mongo";
const fs = require('fs'),
    url = require('url');

const exists = promisify(fs.access);

export class MongoConnection {
    url: string;
    dbName: string;
    client: MongoClient;
    db: Db | undefined;
    entityDb: Entity_DB_Mongo | undefined;
    providerDb: Provider_DB_Mongo | undefined;
    s2skeyDb: S2S_Key_DB_Mongo | undefined;
    sessionKeyDb: SessionKeyDbMongo | undefined
    intentWatcherDb: IntentWatcher_DB_Mongo | undefined
    watchlistDb: Watchlist_Db_Mongo | undefined;
    graveyardDb: Graveyard_DB_Mongo | undefined

    constructor(url: string, dbName: string) {
        this.url = url;
        this.dbName = dbName;
        this.client = new MongoClient(this.url, {
            useNewUrlParser: true,
            reconnectInterval: 2000,
            reconnectTries: 60,
            autoReconnect: true
        });
        this.db = undefined;
        this.entityDb = undefined;
        this.providerDb = undefined;
        this.s2skeyDb = undefined;
        this.intentWatcherDb = undefined
        this.graveyardDb = undefined
    }

    async download_rds_cert(): Promise<void> {
        try {
            await exists('rds-combined-ca-bundle.pem');
            return;
        } catch {
            const writer = fs.createWriteStream('rds-combined-ca-bundle.pem');
            const response = await axios({
                url: 'https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem',
                method: 'GET',
                responseType: 'stream'
            })
            response.data.pipe(writer);
            return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });   
        }
    }

    async connect(): Promise<void> {
        const parsedUrl = url.parse(this.url, true);
        if (parsedUrl.query && parsedUrl.query.ssl_ca_certs === 'rds-combined-ca-bundle.pem') {
            await this.download_rds_cert();
        }
        await this.client.connect();
        this.db = this.client.db(this.dbName);
    }

    async close(): Promise<void> {
        return this.client.close(true);
    }

    async get_entity_db(logger: Logger): Promise<Entity_DB_Mongo> {
        if (this.entityDb !== undefined)
            return this.entityDb;
        if (this.db === undefined)
            throw new PapieaException({ message: "MongoDBError: Failed to connect to entity database." });
        this.entityDb = new Entity_DB_Mongo(logger, this.db);
        await this.entityDb.init();
        return this.entityDb;
    }

    async get_provider_db(logger: Logger): Promise<Provider_DB_Mongo> {
        if (this.providerDb !== undefined)
            return this.providerDb;
        if (this.db === undefined)
            throw new PapieaException({ message: "MongoDBError: Failed to connect to provider database." });
        this.providerDb = new Provider_DB_Mongo(logger, this.db);
        await this.providerDb.init();
        return this.providerDb;
    }

    async get_s2skey_db(logger: Logger): Promise<S2S_Key_DB_Mongo> {
        if (this.s2skeyDb !== undefined)
            return this.s2skeyDb;
        if (this.db === undefined)
            throw new PapieaException({ message: "MongoDBError: Failed to connect to s2skey database." });
        this.s2skeyDb = new S2S_Key_DB_Mongo(logger, this.db);
        await this.s2skeyDb.init();
        return this.s2skeyDb;
    }

    async get_session_key_db(logger: Logger): Promise<SessionKeyDbMongo> {
        if (this.sessionKeyDb !== undefined)
            return this.sessionKeyDb;
        if (this.db === undefined)
            throw new PapieaException({ message: "MongoDBError: Failed to connect to session key database." });
        this.sessionKeyDb = new SessionKeyDbMongo(logger, this.db);
        await this.sessionKeyDb.init();
        return this.sessionKeyDb;
    }

    async get_intent_watcher_db(logger: Logger): Promise<IntentWatcher_DB_Mongo> {
        if (this.intentWatcherDb !== undefined)
            return this.intentWatcherDb;
        if (this.db === undefined)
            throw new PapieaException({ message: "MongoDBError: Failed to connect to intent watcher database." });
        this.intentWatcherDb = new IntentWatcher_DB_Mongo(logger, this.db);
        await this.intentWatcherDb.init();
        return this.intentWatcherDb;
    }

    async get_watchlist_db(logger: Logger): Promise<Watchlist_Db_Mongo> {
        if (this.watchlistDb !== undefined)
            return this.watchlistDb;
        if (this.db === undefined)
            throw new PapieaException({ message: "MongoDBError: Failed to connect to watchlist database." });
        this.watchlistDb = new Watchlist_Db_Mongo(logger, this.db);
        await this.watchlistDb.init();
        return this.watchlistDb;
    }

    async get_graveyard_db(logger: Logger): Promise<Graveyard_DB> {
        if (this.graveyardDb !== undefined)
            return this.graveyardDb;
        if (this.db === undefined)
            throw new PapieaException({ message: "MongoDBError: Failed to connect to graveyard database." });
        this.graveyardDb = new Graveyard_DB_Mongo(logger, this.db, this.client);
        await this.graveyardDb.init();
        return this.graveyardDb;
    }
}
