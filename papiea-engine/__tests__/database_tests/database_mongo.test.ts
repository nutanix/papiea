import "jest"
import { MongoConnection } from "../../src/databases/mongo";
import { Entity_DB } from "../../src/databases/entity_db_interface";
import { Provider_DB } from "../../src/databases/provider_db_interface";
import { S2S_Key_DB } from "../../src/databases/s2skey_db_interface";
import { v4 as uuid4 } from 'uuid';
import { SpecConflictingEntityError } from "../../src/databases/utils/errors";
import {
    Metadata,
    Spec,
    Provider_Entity_Reference,
    Entity_Reference,
    Status,
    Kind,
    Provider,
    S2S_Key,
    IntentfulBehaviour,
    Diff,
    EntityStatusUpdateInput
} from "papiea-core"
import { SessionKeyDb } from "../../src/databases/session_key_db_interface"
import { Entity, Intentful_Signature, SessionKey, IntentfulStatus, IntentWatcher } from "papiea-core"
import { LoggerFactory } from 'papiea-backend-utils';
import uuid = require("uuid")
import { IntentWatcher_DB } from "../../src/databases/intent_watcher_db_interface"
import { Watchlist_DB } from "../../src/databases/watchlist_db_interface";
import { Watchlist } from "../../src/intentful_engine/watchlist";
import { Graveyard_DB } from "../../src/databases/graveyard_db_interface"

declare var process: {
    env: {
        MONGO_DB: string,
        MONGO_HOST: string,
        MONGO_PORT: string
    }
};
const mongoHost = process.env.MONGO_HOST || 'mongo';
const mongoPort = process.env.MONGO_PORT || '27017';

describe("MongoDb tests", () => {
    const connection: MongoConnection = new MongoConnection(`mongodb://${mongoHost}:${mongoPort}`, process.env.MONGO_DB || 'papiea');
    const logger = LoggerFactory.makeLogger({level: 'info'});
    const exact_match = false

    beforeEach(() => {
        jest.setTimeout(50000);
    });

    beforeAll(done => {
        connection.connect().then(done).catch(done.fail);
    });

    afterAll(done => {
        connection.close().then(done).catch(done.fail);
    });

    const entityA_uuid = uuid4();

    test("Insert Spec", async () => {
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const entity_metadata: Metadata = {
            uuid: entityA_uuid,
            kind: "test",
            spec_version: 0,
            status_hash: 'test-hash',
            created_at: new Date(),
            deleted_at: undefined,
            provider_version: "1",
            provider_prefix: "test",
            extension: {}
        };
        const spec: Spec = { a: "A" };
        await entityDb.update_spec(entity_metadata, spec);
    });

    test("Update Spec", async () => {
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const entity_metadata: Metadata = {
            uuid: entityA_uuid,
            kind: "test",
            spec_version: 1,
            status_hash: 'test-hash',
            created_at: new Date(),
            deleted_at: undefined,
            provider_version: "1",
            provider_prefix: "test",
            extension: {}
        };
        const spec: Spec = { a: "A1" };
        await entityDb.update_spec(entity_metadata, spec);
    });

    test("Update Spec with same version should fail", async () => {
        expect.assertions(2);
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const entity_metadata: Metadata = {
            uuid: entityA_uuid,
            kind: "test",
            spec_version: 1,
            status_hash: 'test-hash',
            created_at: new Date(),
            deleted_at: undefined,
            provider_version: "1",
            provider_prefix: "test",
            extension: {}
        };
        const spec: Spec = { a: "A2" };
        try {
            await entityDb.update_spec(entity_metadata, spec);
        } catch (err) {
            expect(err).toBeInstanceOf(SpecConflictingEntityError);
            expect(err.entity_info.additional_info.existing_spec_version).toEqual("2");
        }
    });

    test("Get Spec", async () => {
        expect.assertions(5);
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const entity_ref: Provider_Entity_Reference = { uuid: entityA_uuid, kind: "test", provider_prefix: "test", provider_version: "1" };
        const res = await entityDb.get_entity(entity_ref);
        expect(res).not.toBeNull();
        if (res === null) {
            throw new Error("Entity without spec");
        }
        const { metadata, spec } = res;
        expect(metadata.uuid).toEqual(entity_ref.uuid);
        expect(metadata.created_at).not.toBeNull();
        expect(metadata.deleted_at).toBeFalsy();
        expect(spec.a).toEqual("A1");
    });

    test("Get Spec for non existing entity should fail", async () => {
        expect.assertions(1);
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const entity_ref: Provider_Entity_Reference = { uuid: uuid4(), kind: "test", provider_prefix: "test", provider_version: "0.1.0" };
        try {
            await entityDb.get_entity(entity_ref);
        } catch (err) {
            expect(err).not.toBeNull();
        }
    });

    test("List Specs", async () => {
        expect.assertions(1);
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const res = await entityDb.list_entities({ metadata: { "kind": "test" } }, exact_match);
        expect(res.length).toBeGreaterThanOrEqual(1);
    });

    test("List Specs - check spec data", async () => {
        expect.assertions(4);
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const res = await entityDb.list_entities({ metadata: { "kind": "test" }, spec: { "a": "A1" } }, exact_match);
        expect(res).not.toBeNull();
        expect(res[0]).not.toBeNull();
        expect(res.length).toBeGreaterThanOrEqual(1);
        // @ts-ignore
        expect(res[0].spec.a).toEqual("A1");
    });

    test("Insert Status", async () => {
        expect.assertions(2)
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const entity_metadata: EntityStatusUpdateInput = {
            uuid: entityA_uuid,
            kind: "test",
            status_hash: 'test-hash',
            provider_version: "test_version",
            provider_prefix: "test_prefix"
        };
        const status: Status = { a: "A" };
        const { metadata, status: ret_status } = await entityDb.replace_status(entity_metadata, status);
        expect(metadata.uuid).toEqual(entityA_uuid);
        expect(ret_status.a).toEqual("A");
    });

    test("Update Status", async () => {
        expect.assertions(2)
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const { metadata: entity_metadata } = await entityDb.get_entity({
            uuid: entityA_uuid,
            kind: "test",
            provider_version: "test_version",
            provider_prefix: "test_prefix"
        });
        const status: Status = { a: "A1" };
        const{ metadata, status: ret_status } = await entityDb.replace_status(entity_metadata, status);
        expect(metadata.uuid).toEqual(entityA_uuid);
        expect(ret_status.a).toEqual("A1");
    });

    test("Get Status", async () => {
        expect.assertions(3);
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const entity_ref: Provider_Entity_Reference = { uuid: entityA_uuid, kind: "test",
            provider_prefix: "test_prefix", provider_version: "test_version" };
        const res = await entityDb.get_entity(entity_ref);
        expect(res).not.toBeNull();
        if (res === null) {
            throw new Error("Entity without status");
        }
        const { metadata, status } = res;
        expect(metadata.uuid).toEqual(entity_ref.uuid);
        expect(status.a).toEqual("A1");
    });

    test("Partially update Status", async () => {
        expect.assertions(4);
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const { metadata: entity_metadata } = await entityDb.get_entity({
            uuid: entityA_uuid,
            kind: "test",
            provider_version: "test_version",
            provider_prefix: "test_prefix"
        });
        const initial_status: Status = { b: "A3" };
        await entityDb.update_status(entity_metadata, initial_status);
        const res = await entityDb.get_entity(entity_metadata);
        expect(res).not.toBeNull();
        if (res === null) {
            throw new Error("Entity without status");
        }
        const { metadata, status } = res;
        expect(metadata.uuid).toEqual(entity_metadata.uuid);
        expect(status.a).toEqual("A1");
        expect(status.b).toEqual("A3");
    });

    test("Update Status with incorrect stale hash should fail", async () => {
        expect.assertions(5)
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const { metadata: entity_metadata } = await entityDb.get_entity({
            uuid: entityA_uuid,
            kind: "test",
            provider_version: "test_version",
            provider_prefix: "test_prefix"
        });
        const initial_status: Status = { b: "A4" };
        await entityDb.update_status(entity_metadata, initial_status);
        const { metadata, status } = await entityDb.get_entity(entity_metadata);
        expect(metadata.uuid).toEqual(entity_metadata.uuid);
        expect(metadata.status_hash).not.toBeNull();
        expect(status.a).toEqual("A1");
        expect(status.b).toEqual("A4");
        const new_status: Status = { b: "A5" };
        await expect(entityDb.update_status(entity_metadata, new_status))
            .rejects
            .toThrow(`Entity status with UUID ${entity_metadata.uuid} of kind: ${entity_metadata.provider_prefix}/${entity_metadata.provider_version}/${entity_metadata.kind} exists with a different hash. Please verify the status hash.`)
    })

    test("Get Status for non existing entity should fail", async () => {
        expect.assertions(1);
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const entity_ref: Provider_Entity_Reference = { uuid: uuid4(), kind: "test",
            provider_prefix: "test_prefix", provider_version: "test_version" };
        try {
            await entityDb.get_entity(entity_ref);
        } catch (err) {
            expect(err).not.toBeNull();
        }
    });

    test("List Statuses", async () => {
        expect.assertions(1);
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const res = await entityDb.list_entities({ metadata: { "kind": "test" } }, exact_match);
        expect(res.length).toBeGreaterThanOrEqual(1);
    });

    test("List Statuses - check status data", async () => {
        expect.assertions(3);
        const entityDb: Entity_DB = await connection.get_entity_db(logger);
        const res = await entityDb.list_entities({ metadata: { "kind": "test" }, status: { a: "A1" } }, exact_match);
        expect(res.length).toBeGreaterThanOrEqual(1);
        expect(res[0]).not.toBeNull();
        // @ts-ignore
        expect(res[0].status.a).toEqual("A1");
    });

    test("Register Provider", async () => {
        const providerDb: Provider_DB = await connection.get_provider_db(logger);
        const test_kind = {} as Kind;
        const provider: Provider = { prefix: "test", version: "0.1.0", kinds: [test_kind], procedures: {}, extension_structure: {}, allowExtraProps: false };
        await providerDb.save_provider(provider);
    });

    test("Get provider", async () => {
        expect.assertions(2);
        const providerDb: Provider_DB = await connection.get_provider_db(logger);
        const prefix_string: string = "test";
        const version: string = "0.1.0";
        const res = await providerDb.get_provider(prefix_string, version);
        expect(res.prefix).toBe(prefix_string);
        expect(res.version).toBe(version);
    });

    test("Get provider using his prefix", async () => {
        expect.assertions(2);
        const providerDb: Provider_DB = await connection.get_provider_db(logger);
        const prefix_string: string = "test";
        const version: string = "0.1.0";
        const res = await providerDb.get_provider(prefix_string, version);
        expect(res.prefix).toBe(prefix_string);
        expect(res.version).toBe(version);
    });

    test("Get non-existing provider fail", async () => {
        expect.assertions(1);
        const providerDb: Provider_DB = await connection.get_provider_db(logger);
        const prefix_string: string = "testFail";
        const version: string = "0.1.0";
        try {
            await providerDb.get_provider(prefix_string, version);
        } catch (err) {
            expect(err).not.toBeNull();
        }
    });

    test("List Providers", async () => {
        expect.assertions(3);
        const providerDb: Provider_DB = await connection.get_provider_db(logger);
        const res = await providerDb.list_providers();
        expect(res).not.toBeNull();
        expect(res).not.toBeUndefined();
        expect(res.length).toBeGreaterThanOrEqual(1);
    });

    test("Delete provider", async () => {
        const providerDb: Provider_DB = await connection.get_provider_db(logger);
        const prefix_string: string = "test";
        const version: string = "0.1.0";
        await providerDb.delete_provider(prefix_string, version);
    });

    test("Register and Delete Provider with intenful kind", async () => {
        expect.assertions(2)
        const providerDb: Provider_DB = await connection.get_provider_db(logger);
        const test_kind = { name: "intentful_kind_test", intentful_behaviour: IntentfulBehaviour.Differ } as Kind;
        const provider: Provider = { prefix: "testIntentful", version: "0.1.0", kinds: [test_kind], procedures: {}, extension_structure: {}, allowExtraProps: false };
        await providerDb.save_provider(provider);
        const kind_refs = await providerDb.get_intentful_kinds()
        const kind_names = kind_refs.map(k => k.kind_name)
        expect(kind_names).toContain("intentful_kind_test")
        await providerDb.delete_provider(provider.prefix, provider.version)
        const deleted_kind_refs = await providerDb.get_intentful_kinds()
        expect(deleted_kind_refs.length).toEqual(kind_refs.length - 1)
    });

    test("Create and get s2s key", async () => {
        const s2skeyDb: S2S_Key_DB = await connection.get_s2skey_db(logger);
        const s2skey: S2S_Key = {
            name: uuid4(),
            owner: uuid4(),
            uuid: uuid4(),
            provider_prefix: "test_provider",
            key: uuid4(),
            created_at: new Date(),
            deleted_at: undefined,
            user_info: {}
        };
        await s2skeyDb.create_key(s2skey);
        const res: S2S_Key = await s2skeyDb.get_key(s2skey.uuid);
        expect(res.name).toEqual(s2skey.name);
        expect(res.owner).toEqual(s2skey.owner);
        expect(res.provider_prefix).toEqual(s2skey.provider_prefix);
        expect(res.key).toEqual(s2skey.key);
        expect(res.deleted_at).toBeFalsy();
    });

    test("Duplicate s2s key shoud throw an error", async () => {
        expect.assertions(1);
        const s2skeyDb: S2S_Key_DB = await connection.get_s2skey_db(logger);
        const s2skey: S2S_Key = {
            name: uuid4(),
            owner: uuid4(),
            uuid: uuid4(),
            provider_prefix: "test_provider",
            key: uuid4(),
            created_at: new Date(),
            deleted_at: undefined,
            user_info: {}
        };
        await s2skeyDb.create_key(s2skey);
        try {
            await s2skeyDb.create_key(s2skey);
        } catch(e) {
            expect(e).toBeDefined();
        }
    });

    test("List s2s keys", async () => {
        expect.hasAssertions();
        const s2skeyDb: S2S_Key_DB = await connection.get_s2skey_db(logger);
        const s2skey: S2S_Key = {
            name: uuid4(),
            owner: uuid4(),
            uuid: uuid4(),
            provider_prefix: "test_provider",
            key: uuid4(),
            created_at: new Date(),
            deleted_at: undefined,
            user_info: {}
        };
        await s2skeyDb.create_key(s2skey);
        const res: S2S_Key = (await s2skeyDb.list_keys({
            owner: s2skey.owner,
            provider_prefix: s2skey.provider_prefix
        }))[0];
        expect(res.name).toEqual(s2skey.name);
        expect(res.owner).toEqual(s2skey.owner);
        expect(res.provider_prefix).toEqual(s2skey.provider_prefix);
        expect(res.key).toEqual(s2skey.key);
        expect(res.deleted_at).toBeFalsy();
    });

    test("Inactivate s2s key", async () => {
        expect.assertions(1);
        const s2skeyDb: S2S_Key_DB = await connection.get_s2skey_db(logger);
        const s2skey: S2S_Key = {
            name: uuid4(),
            owner: uuid4(),
            uuid: uuid4(),
            provider_prefix: "test_provider",
            key: uuid4(),
            created_at: new Date(),
            deleted_at: undefined,
            user_info: {}
        };
        await s2skeyDb.create_key(s2skey);
        await s2skeyDb.inactivate_key(s2skey.uuid);
        try {
            await s2skeyDb.get_key(s2skey.uuid);
        } catch(e) {
            expect(e).toBeDefined();
        }
    });

    test("Create and get session key", async () => {
        const sessionKeyDb: SessionKeyDb = await connection.get_session_key_db(logger);
        const sessionKey: SessionKey = {
            key: uuid(),
            user_info: {
                owner: "test"
            },
            expireAt: new Date(),
            idpToken: {}
        };
        await sessionKeyDb.create_key(sessionKey);
        const res: SessionKey = await sessionKeyDb.get_key(sessionKey.key);
        expect(res.user_info.owner).toEqual(sessionKey.user_info.owner);
        expect(res.expireAt).toBeDefined()
    });

    test("Duplicate s2s key shoud throw an error", async () => {
        expect.assertions(1);
        const sessionKeyDb: SessionKeyDb = await connection.get_session_key_db(logger);
        const sessionKey: SessionKey = {
            key: uuid(),
            user_info: {
                owner: "test"
            },
            expireAt: new Date(),
            idpToken: {}
        };
        await sessionKeyDb.create_key(sessionKey);
        try {
            await sessionKeyDb.create_key(sessionKey);
        } catch (e) {
            expect(e).toBeDefined()
        }
    });

    test("Inactivate session key", async () => {
        expect.assertions(1);
        const sessionKeyDb: SessionKeyDb = await connection.get_session_key_db(logger);
        const sessionKey: SessionKey = {
            key: uuid(),
            user_info: {
                owner: "test"
            },
            expireAt: new Date(),
            idpToken: {}
        };
        await sessionKeyDb.create_key(sessionKey);
        await sessionKeyDb.inactivate_key(sessionKey.key);
        try {
            await sessionKeyDb.get_key(sessionKey.key)
        } catch (e) {
            expect(e).toBeDefined()
        }
    });

    test("Delete watcher", async () => {
        expect.assertions(1);
        const watcherDb: IntentWatcher_DB = await connection.get_intent_watcher_db(logger);
        const watcher: IntentWatcher = {
            uuid: uuid4(),
            diffs: [{
                kind: "dummy",
                intentful_signature: {} as Intentful_Signature,
                diff_fields: []
            }],
            spec_version: 1,
            status: IntentfulStatus.Active,
            entity_ref: {} as Provider_Entity_Reference,
        };
        await watcherDb.save_watcher(watcher)
        await watcherDb.delete_watcher(watcher.uuid)
        try {
            await watcherDb.get_watcher(watcher.uuid);
        } catch(e) {
            expect(e).toBeDefined();
        }
    });

    test("Create and get watcher", async () => {
        expect.hasAssertions()
        const watcherDb: IntentWatcher_DB = await connection.get_intent_watcher_db(logger);
        const watcher: IntentWatcher = {
            uuid: uuid4(),
            diffs: [{
                kind: "dummy",
                intentful_signature: {} as Intentful_Signature,
                diff_fields: []
            }],
            spec_version: 1,
            status: IntentfulStatus.Active,
            entity_ref: {} as Provider_Entity_Reference,
        };
        await watcherDb.save_watcher(watcher);
        const res: IntentWatcher = await watcherDb.get_watcher(watcher.uuid);
        expect(res.status).toEqual(watcher.status);
        expect(res.diffs).toEqual(watcher.diffs);
        expect(res.uuid).toEqual(watcher.uuid);
        await watcherDb.delete_watcher(watcher.uuid)
    });

    test("Duplicate watcher should throw an error", async () => {
        expect.assertions(1);
        const watcherDb: IntentWatcher_DB = await connection.get_intent_watcher_db(logger);
        const watcher: IntentWatcher = {
            uuid: uuid4(),
            diffs: [{
                kind: "dummy",
                intentful_signature: {} as Intentful_Signature,
                diff_fields: []
            }],
            spec_version: 1,
            status: IntentfulStatus.Active,
            entity_ref: {} as Provider_Entity_Reference,
        };
        await watcherDb.save_watcher(watcher);
        try {
            await watcherDb.save_watcher(watcher);
        } catch(e) {
            expect(e).toBeDefined();
        }
        await watcherDb.delete_watcher(watcher.uuid)
    });

    test("List intentful_engine", async () => {
        expect.hasAssertions();
        const watcherDb: IntentWatcher_DB = await connection.get_intent_watcher_db(logger);
        const watcher: IntentWatcher = {
            uuid: uuid4(),
            diffs: [{
                kind: "dummy",
                intentful_signature: {} as Intentful_Signature,
                diff_fields: []
            }],
            spec_version: 1,
            status: IntentfulStatus.Active,
            entity_ref: {} as Provider_Entity_Reference,
        };
        await watcherDb.save_watcher(watcher);
        const watcher_cursor = watcherDb.list_watchers({ uuid: watcher.uuid })
        const res = await watcher_cursor.next()
        expect(res!.uuid).toEqual(watcher.uuid);
        await watcher_cursor.close()
        await watcherDb.delete_watcher(watcher.uuid)
    });

    test("Update watcher", async () => {
        expect.assertions(1);
        const watcherDb: IntentWatcher_DB = await connection.get_intent_watcher_db(logger);
        const watcher: IntentWatcher = {
            uuid: uuid4(),
            diffs: [{
                kind: "dummy",
                intentful_signature: {} as Intentful_Signature,
                diff_fields: []
            }],
            spec_version: 1,
            status: IntentfulStatus.Active,
            entity_ref: {} as Provider_Entity_Reference,
        };
        await watcherDb.save_watcher(watcher)
        await watcherDb.update_watcher(watcher.uuid, { status: IntentfulStatus.Completed_Successfully })
        const updatedWatcher = await watcherDb.get_watcher(watcher.uuid);
        expect(updatedWatcher.status).toEqual(IntentfulStatus.Completed_Successfully)
        await watcherDb.delete_watcher(watcher.uuid)
    });

    test("Get watchlist", async () => {
        expect.assertions(1);
        const watchlistDb: Watchlist_DB = await connection.get_watchlist_db(logger);
        const watchlist = new Watchlist()
        const entry_ref = {
            provider_reference: {
                provider_prefix: "test",
                provider_version: "1"
            },
            entity_reference: {
                uuid: uuid4(),
                kind: "test_kind"
            }
        }
        await watchlistDb.edit_watchlist(async watchlist => {
            watchlist.set([entry_ref, [[{} as Diff, {delay: {delay_seconds: 120, delay_set_time: new Date()}, retries: 0}]]])
            return watchlist
        })
        const watchlistUpdated = await watchlistDb.edit_watchlist(async w => w)
        // ![1]![0]![1] === [EntryReference, [Diff, Backoff | null][]], which is a Backoff.
        // It is not null because of the definition above
        expect(watchlistUpdated.get(entry_ref)![1]![0]![1]!.delay!.delay_seconds).toBe(120)
        await watchlistDb.edit_watchlist(async watchlist => watchlist.update(new Watchlist()))
    });

    const entity: Entity = {
        metadata: {
            uuid: uuid(),
            provider_version: "0.1.1",
            provider_prefix: "test_pref",
            kind: "test_kind",
            spec_version: 1,
            status_hash: "test-hash",
            created_at: new Date(),
            extension: {}
        },
        spec: {
            test: "test"
        },
        status: {
            test: "test"
        }
    }

    test("Save and get deleted entity in graveyard, delete from graveyard afterwards", async () => {
        expect.assertions(1);
        const sample_entity = JSON.parse(JSON.stringify(entity))
        const graveyardDb: Graveyard_DB = await connection.get_graveyard_db(logger);
        await graveyardDb.save_to_graveyard(sample_entity)
        const received = await graveyardDb.get_entity(sample_entity.metadata)
        expect(received.spec.test).toEqual("test")
    });

    test("Save and list deleted entities in graveyard, delete from graveyard afterwards", async () => {
        expect.assertions(2);
        const sample_entity = JSON.parse(JSON.stringify(entity))
        const graveyardDb: Graveyard_DB = await connection.get_graveyard_db(logger);
        await graveyardDb.save_to_graveyard(sample_entity)
        const received_with_date = await graveyardDb.list_entities({metadata: {deleted_at: "papiea_one_hour_ago"}, spec: {test: "test"}}, false)
        expect(received_with_date[0].spec.test).toEqual("test")
        const received = await graveyardDb.list_entities({spec: {test: "test"}}, false)
        expect(received[0].spec.test).toEqual("test")
    });

    test("Dispose entity to graveyard", async () => {
        expect.assertions(3);
        const sample_entity = JSON.parse(JSON.stringify(entity))
        const graveyardDb: Graveyard_DB = await connection.get_graveyard_db(logger);
        const entityDb: Entity_DB = await connection.get_entity_db(logger)
        await entityDb.update_spec(sample_entity.metadata, sample_entity.spec)
        await graveyardDb.dispose(sample_entity)
        try {
            await entityDb.get_entity(sample_entity.metadata)
        } catch (e) {
            expect(e).toBeDefined()
        }
        const received = await graveyardDb.get_entity(sample_entity.metadata)
        expect(received.spec.test).toEqual("test")
        expect(received.metadata.spec_version).toEqual(2)
    });
});
