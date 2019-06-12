import { MongoClient, Db } from "mongodb";
import { Spec_DB_Mongo } from "./spec_db_mongo";
import { Status_DB_Mongo } from "./status_db_mongo";
import { Provider_DB_Mongo } from "./provider_db_mongo";
import { S2S_Key_DB_Mongo } from "./s2skey_db_mongo";

export class MongoConnection {
    url: string;
    dbName: string;
    client: MongoClient;
    db: Db | undefined;
    specDb: Spec_DB_Mongo | undefined;
    providerDb: Provider_DB_Mongo | undefined;
    statusDb: Status_DB_Mongo | undefined;
    s2skeyDb: S2S_Key_DB_Mongo | undefined;

    constructor(url: string, dbName: string) {
        this.url = url;
        this.dbName = dbName;
        this.client = new MongoClient(this.url, { 
            useNewUrlParser: true,
            reconnectInterval: 2000,
            reconnectTries: 60,
            autoReconnect: true });
        this.db = undefined;
        this.specDb = undefined;
        this.providerDb = undefined;
        this.statusDb = undefined;
        this.s2skeyDb = undefined;
    }

    async connect(): Promise<void> {
        await this.client.connect();
        this.db = this.client.db(this.dbName);
    }

    async close(): Promise<void> {
        return this.client.close(true);
    }

    async get_spec_db(): Promise<Spec_DB_Mongo> {
        if (this.specDb !== undefined)
            return this.specDb;
        if (this.db === undefined)
            throw new Error("Not connected");
        this.specDb = new Spec_DB_Mongo(this.db);
        await this.specDb.init();
        return this.specDb;
    }

    async get_provider_db(): Promise<Provider_DB_Mongo> {
        if (this.providerDb !== undefined)
            return this.providerDb;
        if (this.db === undefined)
            throw new Error("Not connected");
        this.providerDb = new Provider_DB_Mongo(this.db);
        await this.providerDb.init();
        return this.providerDb;
    }

    async get_status_db(): Promise<Status_DB_Mongo> {
        if (this.statusDb !== undefined)
            return this.statusDb;
        if (this.db === undefined)
            throw new Error("Not connected");
        this.statusDb = new Status_DB_Mongo(this.db);
        await this.statusDb.init();
        return this.statusDb;
    }

    async get_s2skey_db(): Promise<S2S_Key_DB_Mongo> {
        if (this.s2skeyDb !== undefined)
            return this.s2skeyDb;
        if (this.db === undefined)
            throw new Error("Not connected");
        this.s2skeyDb = new S2S_Key_DB_Mongo(this.db);
        await this.s2skeyDb.init();
        return this.s2skeyDb;
    }
}