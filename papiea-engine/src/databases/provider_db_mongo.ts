import { Provider_DB } from "./provider_db_interface";
import { Collection, Db } from "mongodb"
import { IntentfulBehaviour, Kind, Provider, Version } from "papiea-core";
import { Logger } from "papiea-backend-utils"

export interface IntentfulKindReference {
    provider_prefix: string,
    provider_version: Version,
    kind_name: string
}

export class Provider_DB_Mongo implements Provider_DB {
    subCollection: Collection;
    collection: Collection;
    logger: Logger

    constructor(logger: Logger, db: Db) {
        this.collection = db.collection("provider");
        this.subCollection = db.collection("intentful_kinds")
        this.logger = logger;
    }

    async init(): Promise<void> {
        try {
            await this.collection.createIndex({
                "prefix": 1,
                "version": 1
            }, { unique: true });
            await this.subCollection.createIndex({
                "provider_prefix": 1,
                "provider_version": 1,
                "kind_name": 1
            }, { unique: true })
        } catch (err) {
            throw err;
        }
    }

    async save_provider(provider: Provider): Promise<void> {
        delete provider["created_at"];
        const result = await this.collection.updateOne({
                "prefix": provider.prefix,
                "version": provider.version
            }, {
                $set: provider,
                $setOnInsert: {
                    "created_at": new Date()
                }
            },
            {
                upsert: true
            });
        if (result.result.n !== 1) {
            throw new Error(`Amount of updated entries doesn't equal to 1: ${ result.result.n }`)
        }
        const intentful_kinds = provider.kinds
            .filter(kind => kind.intentful_behaviour === IntentfulBehaviour.Differ)
            .map(kind => {
                return {
                    kind_name: kind.name,
                    provider_prefix: provider.prefix,
                    provider_version: provider.version
                }
            })
        if (intentful_kinds.length === 0) {
            return
        }
        await this.subCollection.insertMany(intentful_kinds)
    }

    async get_provider(provider_prefix: string, version: Version): Promise<Provider> {
        const filter: any = { prefix: provider_prefix, version };
        const provider: Provider | null = await this.collection.findOne(filter);
        if (provider === null) {
            throw new Error(`Provider with prefix ${ provider_prefix } and version ${ version } not found`);
        } else {
            return provider;
        }
    }

    async list_providers(): Promise<Provider[]> {
        return this.collection.find({}).toArray();
    }

    async delete_provider(provider_prefix: string, version: Version): Promise<void> {
        const result = await this.collection.findOneAndDelete({ "prefix": provider_prefix, version });
        const provider: Provider = result.value
        if (result.ok !== 1) {
            throw new Error("Failed to remove provider");
        }
        if (result.lastErrorObject.n === 0) {
            throw new Error("Failed to remove provider")
        }
        if (!provider) {
            this.logger.debug("Didn't return provider after delete")
            return
        }
        const intentful_kinds = provider.kinds
            .filter(kind => kind.intentful_behaviour === IntentfulBehaviour.Differ)
            .map(kind => kind.name)
        if (intentful_kinds.length === 0) {
            return
        }
        await this.subCollection.deleteMany({ "provider_prefix": provider_prefix, "provider_version": version, "kind_name": { $in: intentful_kinds }})
    }

    async get_latest_provider_by_kind(kind_name: string): Promise<Provider> {
        const providers = await this.collection.find({ "kinds.name": kind_name }).sort({ _id : -1 }).toArray()
        if (providers.length === 0) {
            throw new Error(`Provider with kind ${ kind_name } not found`);
        } else {
            return providers[0];
        }
    }

    async get_intentful_kinds(): Promise<IntentfulKindReference[]> {
        return await this.subCollection.find({}).toArray()
    }

    async find_providers(provider_prefix: string): Promise<Provider[]> {
        return this.collection.find({ "prefix": provider_prefix }).toArray();
    }

    async get_latest_provider(provider_prefix: string): Promise<Provider> {
        const providers = await this.collection.find({ "prefix": provider_prefix }).sort({ _id : -1 }).toArray();
        if (providers.length === 0) {
            throw new Error(`Provider with prefix ${ provider_prefix } not found`);
        } else {
            return providers[0];
        }
    }

    find_kind(provider: Provider, kind_name: string): Kind {
        const found_kind: Kind | undefined = provider.kinds.find(elem => elem.name === kind_name);
        if (found_kind === undefined) {
            throw new Error(`Kind: ${kind_name} not found`);
        }
        return found_kind;
    }
}
