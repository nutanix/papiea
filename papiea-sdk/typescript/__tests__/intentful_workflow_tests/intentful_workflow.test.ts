import { DescriptionBuilder, DescriptionType, } from "../../../../papiea-engine/__tests__/test_data_factory"
import axios from "axios"
import { timeout } from "../../../../papiea-engine/src/utils/utils"
import { AxiosResponseParser } from "papiea-backend-utils";
import {IntentfulBehaviour, IntentfulStatus, Metadata, Version} from "papiea-core"
import { ProviderSdk, BackgroundTaskBuilder } from "../../src/provider_sdk/typescript_sdk";
import { IntentfulCtx_Interface } from "../../src/provider_sdk/typescript_sdk_interface";
import uuid = require("uuid");

declare var process: {
    env: {
        SERVER_PORT: string,
        PAPIEA_ADMIN_S2S_KEY: string,
    }
};
const serverPort = parseInt(process.env.SERVER_PORT || '3000');
const adminKey = process.env.PAPIEA_ADMIN_S2S_KEY || '';
const papieaUrl = 'http://127.0.0.1:3000';

const server_config = {
    host: "127.0.0.1",
    port: 9000
};

const server_config_2nd_provider = {
    host: "127.0.0.1",
    port: 9011
};

const entityApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/services`,
    timeout: 5000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
    }
});

const providerApiAdmin = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/provider`,
    timeout: 5000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
    }
});

describe("Intentful Workflow tests single provider", () => {

    const locationDataDescription = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.Differ).build()
    const locationDataDescriptionNonDiffer = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.SpecOnly).build()
    const locationDataDescriptionDuplicate = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.Differ).build()
    const xFieldStructure = {"type": "array", "items": {"type": "object", "properties": {"ip": {"type": "string"}}}}
    const locationDataDescriptionArraySfs = new DescriptionBuilder(DescriptionType.Location, "Location").withBehaviour(IntentfulBehaviour.Differ).withStatusOnlyField("z").withField("x", xFieldStructure).build()
    let first_provider_prefix: string | null
    let provider_version: Version = "0.1.0"
    let first_provider_to_delete_entites: Metadata[] = []

    afterEach(async () => {
        for (let metadata of first_provider_to_delete_entites) {
            await entityApi.delete(`${first_provider_prefix}/${provider_version}/${metadata.kind}/${metadata.uuid}`)
        }
        first_provider_to_delete_entites = []
        if (first_provider_prefix !== null) {
            await providerApiAdmin.delete(`${first_provider_prefix}/${provider_version}`)
        }
        first_provider_prefix = null
    })

    test("Change single field differ resolver should pass", async () => {
        expect.assertions(2);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_1"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            location.on("x", async (ctx, entity, input) => {
                await providerApiAdmin.patch(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                    context: "some context",
                    metadata: entity.metadata,
                    status: { x: entity.spec.x }
                })
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            let { data: { intent_watcher } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 20,
                    y: 11
                },
                metadata: {
                    spec_version: 1

                }
            })
            let retries = 10
            let watcher_status = IntentfulStatus.Completed_Successfully
            try {
                let watcherApi = sdk.get_intent_watcher_client()
                await watcherApi.wait_for_status_change(intent_watcher, watcher_status, 50 /* timeout_secs */)
                for (let i = 1; i <= retries; i++) {
                    intent_watcher = await watcherApi.get(intent_watcher.uuid)
                    if (intent_watcher.status === IntentfulStatus.Completed_Successfully) {
                        expect(intent_watcher.status).toBe(IntentfulStatus.Completed_Successfully)
                        const result = await entityApi.get(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
                        expect(result.data.status.x).toEqual(20)
                        return
                    }
                    await timeout(5000)
                }
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Differ should retry if error is encountered", async () => {
        expect.assertions(1)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        first_provider_prefix = "location_provider_intentful_error"
        try {
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            let times_invoked = 0
            location.on("x", async (ctx, entity, input) => {
                times_invoked++
                throw new Error("Error in handler")
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            let { data: { intent_watcher } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 20,
                    y: 11
                },
                metadata: {
                    spec_version: 1

                }
            })
            let retries = 5
            try {
                let watcherApi = sdk.get_intent_watcher_client()
                for (let i = 1; i <= retries; i++) {
                    intent_watcher = await watcherApi.get(intent_watcher.uuid)
                    if (intent_watcher.status !== IntentfulStatus.Active) {
                        expect(intent_watcher.status).toBe(IntentfulStatus.Active)
                    }
                    await timeout(2000)
                }
                expect(times_invoked).toBeGreaterThan(1)
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Differ shouldn't retry if error is encountered but entity is deleted", async () => {
        expect.assertions(1)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        first_provider_prefix = null
        try {
            const prefix = "location_provider_intentful_error_entity_deleted"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(prefix);
            let times_invoked = 0
            location.on("x", async (ctx, entity, input) => {
                times_invoked++
                throw new Error("Error in handler")
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const {
                data: {
                    metadata,
                    spec
                }
            } = await entityApi.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            await entityApi.put(`/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}`, {
                spec: {
                    x: 20,
                    y: 11
                },
                metadata: {
                    spec_version: 1

                }
            })
            await timeout(3000)
            const times_invoked_before_deletion = times_invoked
            await entityApi.delete(`/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}`)
            await timeout(5000)
            const times_invoked_after_deletion = times_invoked
            expect(times_invoked_before_deletion).toEqual(times_invoked_after_deletion)
            await providerApiAdmin.delete(`${prefix}/${provider_version}`)
        } finally {
            sdk.cleanup()
        }
    })

    test("Delay to intentful operations should be awaited", async () => {
        expect.assertions(3);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            let times_requested = 0
            first_provider_prefix = "location_provider_intentful_3"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            location.on("x", async (ctx, entity, input) => {
                times_requested++
                if (times_requested === 2) {
                    await providerApiAdmin.patch(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                        context: "some context",
                        metadata: entity.metadata,
                        status: { x: entity.spec.x }
                    })
                    return {"delay_secs": 2}
                } else {
                    // 12 seconds delay
                    return {"delay_secs": 12}
                }
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            let { data: { intent_watcher } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 30,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            try {
                await timeout(5000)
                let watcherApi = sdk.get_intent_watcher_client()
                intent_watcher = await watcherApi.get(intent_watcher.uuid)
                expect(intent_watcher.status).toBe(IntentfulStatus.Active)
                await timeout(3000)
                intent_watcher = await watcherApi.get(intent_watcher.uuid)
                expect(intent_watcher.status).toBe(IntentfulStatus.Active)
                await timeout(15000)
                intent_watcher = await watcherApi.get(intent_watcher.uuid)
                expect(intent_watcher.status).toBe(IntentfulStatus.Completed_Successfully)
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
                expect(e).toBeUndefined()
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Exponential backoff should be activated", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            let times_requested = 0
            first_provider_prefix = "location_provider_exponential_backoff"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            location.on("x", async (ctx, entity, input) => {
                times_requested++
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 30,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            await timeout(5000)
            expect(times_requested).toBeLessThanOrEqual(5)
        } finally {
            sdk.cleanup();
        }
    })

    test("Exponential backoff should be activated using the exponent value set for kind", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            let times_requested = 0
            first_provider_prefix = "location_provider_exponential_backoff_kind_exponent"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            location.on("x", async (ctx, entity, input) => {
                times_requested++
            })
            location.diff_retry_exponent(1.5)
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 30,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            await timeout(5000)
            expect(times_requested).toBeLessThanOrEqual(5)
        } finally {
            sdk.cleanup()
        }
    })

    test("Delay of null should be eligible", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_null_delay"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            location.on("x", async (ctx, entity, input) => {
                await providerApiAdmin.patch(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                    context: "some context",
                    metadata: entity.metadata,
                    status: { x: entity.spec.x }
                })
                return null
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            let { data: { intent_watcher } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 30,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            let retries = 10
            try {
                let watcherApi = sdk.get_intent_watcher_client()
                for (let i = 1; i <= retries; i++) {
                    intent_watcher = await watcherApi.get(intent_watcher.uuid)
                    if (intent_watcher.status === IntentfulStatus.Completed_Successfully) {
                        expect(intent_watcher.status).toBe(IntentfulStatus.Completed_Successfully)
                        const result = await entityApi.get(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
                        expect(result.data.status.x).toEqual(30)
                        return
                    }
                    await timeout(5000)
                }
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
                expect(e).toBeUndefined()
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Differ resolver with 2 kinds and shared uuid entities should pass", async () => {
        expect.hasAssertions();
        let test_result = false
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_1_kinds"
            const first_location = sdk.new_kind(locationDataDescription)
            const second_location = sdk.new_kind(locationDataDescriptionDuplicate)
            sdk.version(provider_version)
            sdk.prefix(first_provider_prefix)
            const intentful_handler = () => {
                return async (ctx: any, entity: any, input: any) => {
                    await providerApiAdmin.patch(`/${ sdk.provider.prefix }/${ sdk.provider.version }/update_status`, {
                        context: "some context",
                        metadata: entity.metadata,
                        status: { x: entity.spec.x }
                    })
                }
            }
            first_location.on("x", intentful_handler())
            second_location.on("x", intentful_handler())
            await sdk.register();
            const first_kind_name = sdk.provider.kinds[0].name;
            const second_kind_name = sdk.provider.kinds[1].name;

            const shared_uuid = uuid()

            const first_result = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ first_kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: shared_uuid
                }
            })
            const second_result = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ second_kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: shared_uuid
                }
            })
            first_provider_to_delete_entites.push(first_result.data.metadata)
            first_provider_to_delete_entites.push(second_result.data.metadata)
            const first_watcher_result = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ first_kind_name }/${ first_result.data.metadata.uuid }`, {
                spec: {
                    x: 20,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            const second_watcher_result = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ second_kind_name }/${ second_result.data.metadata.uuid }`, {
                spec: {
                    x: 20,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            const first_watcher = first_watcher_result.data.intent_watcher
            const second_watcher = second_watcher_result.data.intent_watcher
            const watchers = [first_watcher, second_watcher]
            let retries = 10
            try {
                let watcherApi = sdk.get_intent_watcher_client()
                for (let i = 1; i <= retries; i++) {
                    const promises = watchers.map(watcher => watcherApi.get(watcher.uuid))
                    const results = await Promise.all(promises)
                    if (results.every(intent_watcher => intent_watcher.status === IntentfulStatus.Completed_Successfully)) {
                        const first_res = await entityApi.get(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ first_kind_name }/${ first_result.data.metadata.uuid }`)
                        expect(first_res.data.status.x).toEqual(20)
                        const second_res = await entityApi.get(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ second_kind_name }/${ second_result.data.metadata.uuid }`)
                        expect(second_res.data.status.x).toEqual(20)
                        test_result = true
                    }
                    await timeout(5000)
                }
            } catch (e) {
                console.log(`Couldn't get entity: ${ e }`)
                expect(e).toBeUndefined()
            }
        } finally {
            sdk.cleanup()
            expect(test_result).toBeTruthy()
        }
    })

    test("Change single field differ resolver should fail because of CAS fail", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_1"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            location.on("x", async (ctx, entity, input) => {
                await providerApiAdmin.patch(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                    context: "some context",
                    metadata: entity.metadata,
                    status: { x: entity.spec.x }
                })
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            try {
                await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                    spec: {
                        x: 20,
                        y: 11
                    },
                    metadata: {
                        spec_version: 0
                    }
                })
            } catch (e) {
                expect(AxiosResponseParser.getAxiosResponseStatus(e)).toEqual(409)
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Two concurrent updates with the same spec version should fail", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_2_concurrent_cas"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            location.on("x", async (ctx, entity, input) => {
                await providerApiAdmin.patch(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                    context: "some context",
                    metadata: entity.metadata,
                    status: { x: entity.spec.x }
                })
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            const promises = []
            for (let i = 0; i < 2; i++) {
                promises.push(entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                    spec: {
                        x: 20,
                        y: 11
                    },
                    metadata: {
                        spec_version: 1
                    }
                }))
            }
            try {
                await Promise.all(promises)
            } catch (e) {
                expect(AxiosResponseParser.getAxiosResponseStatus(e)).toEqual(409)
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Two serial updates with the same spec version should fail", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_2_concurrent_cas_serial"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            location.on("x", async (ctx, entity, input) => {
                await providerApiAdmin.patch(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                    context: "some context",
                    metadata: entity.metadata,
                    status: { x: entity.spec.x }
                })
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 20,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            try {
                await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                    spec: {
                        x: 20,
                        y: 11
                    },
                    metadata: {
                        spec_version: 1
                    }
                })
            } catch (e) {
                expect(AxiosResponseParser.getAxiosResponseStatus(e)).toEqual(409)
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Change single array sfs field differ resolver should pass", async () => {
        expect.assertions(2);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_4"
            const location = sdk.new_kind(locationDataDescriptionArraySfs);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            location.on("x.+{ip}", async (ctx, entity, input) => {
                await providerApiAdmin.post(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                    context: "some context",
                    metadata: entity.metadata,
                    status: entity.spec
                })
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: [{
                        ip: "1"
                    }],
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            let { data: { intent_watcher } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: [
                        { ip: "1" },
                        { ip: "2" }
                    ],
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            let retries = 10
            try {
                let watcherApi = sdk.get_intent_watcher_client()
                for (let i = 1; i <= retries; i++) {
                    intent_watcher = await watcherApi.get(intent_watcher.uuid)
                    if (intent_watcher.status === IntentfulStatus.Completed_Successfully) {
                        expect(intent_watcher.status).toBe(IntentfulStatus.Completed_Successfully)
                        const result = await entityApi.get(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
                        expect(result.data.status.x.length).toEqual(2)
                        return
                    }
                    await timeout(5000)
                }
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
            }
        } finally {
            sdk.cleanup()
        }
    })

    /*
    The flow of this test is as follows:
    1. Create an intentful handler watching on array addition operation SFS
    2. Add 2 array members to spec
    3. In the handler update status including a single array element, fail 2nd addition with 409 (conflicting entity)
    4. Add second array member to the status while inside the retrying handler
    5. Check that intent resolved successfully, record amount of diffs observed in the handler (should be 2 -> 1 diff)
     */
    test("Change array fields with 2 members, making one member initially fail", async () => {
        expect.assertions(3);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_5"
            const location_array = sdk.new_kind(locationDataDescriptionArraySfs);
            const location = sdk.new_kind(locationDataDescriptionNonDiffer).kind.name;
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            const id = uuid()
            let last_recorded_diff_length = 0
            location_array.on("x.+{ip}", async (ctx, entity, diff) => {
                last_recorded_diff_length = diff.length
                let status: any[] = []
                if (diff.length === 2) {
                    // Initially set a status of only one object
                    status = [
                        {ip: '1'}
                    ]
                }
                if (diff.length === 1) {
                    // Set to status that satisfies spec
                    status = [
                        {ip: '1'},
                        {ip: '2'}
                    ]
                }
                for (let {spec: [fields]} of diff) {
                    const ip = Number.parseInt(fields.ip)
                    if (diff.length == 2) {
                        // This should trigger duplicate spec version error when there are 2 diffs
                        //     [
                        //       { keys: { ip: '1' }, key: 'x', spec: [ [Object] ], status: [] },
                        //       { keys: { ip: '2' }, key: 'x', spec: [ [Object] ], status: [] }
                        //     ]
                        // But should be omitted when we receive one
                        // [ { keys: { ip: '2' }, key: 'x', spec: [ [Object] ], status: [] } ]
                        await entityApi.put(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${location}/${id}`, {
                            spec: {
                                x: ip,
                                y: 11
                            },
                            metadata: {
                                spec_version: 1
                            }
                        })
                    }
                    await providerApiAdmin.post(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                        context: "some context",
                        metadata: entity.metadata,
                        status: {
                            x: status,
                            y: 11
                        }
                    })
                }
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ location }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: id
                }
            })
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: [],
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            let { data: { intent_watcher } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: [
                        { ip: "1" },
                        { ip: "2" }
                    ],
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            let retries = 10
            try {
                let watcherApi = sdk.get_intent_watcher_client()
                for (let i = 1; i <= retries; i++) {
                    intent_watcher = await watcherApi.get(intent_watcher.uuid)
                    if (intent_watcher.status === IntentfulStatus.Completed_Successfully) {
                        expect(intent_watcher.status).toBe(IntentfulStatus.Completed_Successfully)
                        const result = await entityApi.get(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
                        expect(result.data.status.x.length).toEqual(2)
                        expect(last_recorded_diff_length).toEqual(1)
                        return
                    }
                    await timeout(5000)
                }
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Diff handling shouldn't be stuck if a handler fails", async () => {
        expect.assertions(2);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_7"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            let x_invoked = 0
            let y_invoked = 0
            location.on("x", async (ctx, entity, input) => {
                x_invoked++
            })
            location.on("y", async (ctx, entity, input) => {
                y_invoked++
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 20,
                    y: 21
                },
                metadata: {
                    spec_version: 1
                }
            })
            try {
                await timeout(10000)
                expect(x_invoked).toBeGreaterThanOrEqual(1)
                expect(y_invoked).toBeGreaterThanOrEqual(1)
            } catch (e) {
                console.log(`Couldn't wait timeout: ${e}`)
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Diff handling should find a resolving path if handlers are dependant", async () => {
        expect.assertions(3)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_7"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            let locked = true
            location.on("x", async (ctx, entity, input) => {
                if (!locked) {
                    await providerApiAdmin.post(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                        context: "some context",
                        metadata: entity.metadata,
                        status: {
                            x: 20,
                            y: 21
                        }
                    })
                }
            })
            location.on("y", async (ctx, entity, input) => {
                await providerApiAdmin.post(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                    context: "some context",
                    metadata: entity.metadata,
                    status: {
                        x: 10,
                        y: 21
                    }
                })
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await entityApi.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            first_provider_to_delete_entites.push(metadata)
            let { data: { intent_watcher } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 20,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })

            try {
                await timeout(3000)
                const watcherApi = sdk.get_intent_watcher_client()
                intent_watcher = await watcherApi.get(intent_watcher.uuid)
                expect(intent_watcher.status).toEqual(IntentfulStatus.Active)
                const { data: { intent_watcher: second_watcher } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                    spec: {
                        x: 20,
                        y: 21
                    },
                    metadata: {
                        spec_version: 2
                    }
                })
                await timeout(4000)
                locked = false
                await timeout(10000)
                const updated_intent_watcher = await watcherApi.get(intent_watcher.uuid)
                expect(updated_intent_watcher.status).toEqual(IntentfulStatus.Completed_Successfully)
                const second_intent_watcher = await watcherApi.get(second_watcher.uuid)
                expect(second_intent_watcher.status).toEqual(IntentfulStatus.Completed_Successfully)
            } catch (e) {
                console.log(`Error encountered: ${e}`)
            }
        } finally {
            sdk.cleanup()
        }
    })
})

describe("Intentful Workflow test sfs validation", () => {

    const locationDataDescription = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.Differ).build()
    let provider_prefix: string
    let provider_version: Version = "0.1.0"

    test("Registering provider with wrong sfs shouldn't pass", async () => {
        expect.assertions(2);
        let kind_name: string = ''
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            provider_prefix = "location_provider_intentful_fail_validation"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(provider_prefix);
            location.on("wrong, wrong2", async (ctx, entity, input) => {
                await providerApiAdmin.patch(`/${ sdk.provider.prefix }/${ sdk.provider.version }/update_status`, {
                    context: "some context",
                    metadata: entity.metadata,
                    status: { x: entity.spec.x }
                })
            })
            kind_name = location.kind.name
            await sdk.register();
        } catch (e) {
            expect(AxiosResponseParser.getAxiosResponseStatus(e)).toEqual(400)
            expect(AxiosResponseParser.getAxiosErrorMessage(e)).toContain(`Failed to validate the sfs on kind: ${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }.`)
        } finally {
            sdk.cleanup()
        }
    })
})

describe("Intentful workflow multiple providers", () => {
    const locationDataDescription = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.Differ).build()
    let first_provider_prefix: string
    let second_provider_prefix: string
    let provider_version: Version = "0.1.0"
    let first_provider_to_delete_entites: Metadata[] = []
    let second_provider_to_delete_entites: Metadata[] = []

    afterEach(async () => {
        for (let metadata of first_provider_to_delete_entites) {
            await entityApi.delete(`${first_provider_prefix}/${provider_version}/${metadata.kind}/${metadata.uuid}`)
        }
        for (let metadata of second_provider_to_delete_entites) {
            await entityApi.delete(`${second_provider_prefix}/${provider_version}/${metadata.kind}/${metadata.uuid}`)
        }
        first_provider_to_delete_entites = []
        second_provider_to_delete_entites = []
        await providerApiAdmin.delete(`${first_provider_prefix}/${provider_version}`)
        await providerApiAdmin.delete(`${second_provider_prefix}/${provider_version}`)
    })

    test("Differ resolver with 2 providers and entities with same uuid should pass", async () => {
        expect.hasAssertions();
        let test_result = false
        const sdk1 = ProviderSdk.create_provider(
            papieaUrl, adminKey, server_config.host, server_config.port);
        const sdk2 = ProviderSdk.create_provider(
            papieaUrl, adminKey, server_config_2nd_provider.host, server_config_2nd_provider.port);
        try {
            first_provider_prefix = "location_provider_intentful_1"
            second_provider_prefix = "2nd_location_provider_intentful_1"
            const first_location = sdk1.new_kind(locationDataDescription);
            const second_location = sdk2.new_kind(locationDataDescription);
            sdk1.version(provider_version);
            sdk1.prefix(first_provider_prefix);
            sdk2.prefix(second_provider_prefix);
            sdk2.version(provider_version);
            const intentful_handler = (sdk: ProviderSdk) => {
                return async (ctx: any, entity: any, input: any) => {
                    await providerApiAdmin.patch(`/${ sdk.provider.prefix }/${ sdk.provider.version }/update_status`, {
                        context: "some context",
                        metadata: entity.metadata,
                        status: { x: entity.spec.x }
                    })
                }
            }
            first_location.on("x", intentful_handler(sdk1))
            second_location.on("x", intentful_handler(sdk2))
            await sdk1.register();
            await sdk2.register();
            const first_kind_name = sdk1.provider.kinds[0].name;
            const second_kind_name = sdk2.provider.kinds[0].name;

            const shared_uuid = uuid()

            const first_result = await entityApi.post(`${ sdk1.entity_url }/${ sdk1.provider.prefix }/${ sdk1.provider.version }/${ first_kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: shared_uuid
                }
            })
            first_provider_to_delete_entites.push(first_result.data.metadata)
            const second_result = await entityApi.post(`${ sdk2.entity_url }/${ sdk2.provider.prefix }/${ sdk2.provider.version }/${ second_kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: shared_uuid
                }
            })
            second_provider_to_delete_entites.push(second_result.data.metadata)
            const first_watcher_result = await entityApi.put(
                `/${ sdk1.provider.prefix }/${ sdk1.provider.version }/${ first_kind_name }/${ first_result.data.metadata.uuid }`, {
                    spec: {
                        x: 20,
                        y: 11
                    },
                    metadata: {
                        spec_version: 1
                    }
                })

            const second_watcher_result = await entityApi.put(
                `/${ sdk2.provider.prefix }/${ sdk2.provider.version }/${ second_kind_name }/${ second_result.data.metadata.uuid }`, {
                    spec: {
                        x: 20,
                        y: 11
                    },
                    metadata: {
                        spec_version: 1
                    }
                })
            const first_watcher = first_watcher_result.data.intent_watcher
            const second_watcher = second_watcher_result.data.intent_watcher
            const watchers = [first_watcher, second_watcher]
            let retries = 10

            try {
                let watcherApi = sdk1.get_intent_watcher_client()
                for (let i = 1; i <= retries; i++) {
                    const promises = watchers.map(watcher => watcherApi.get(watcher.uuid))
                    const results = await Promise.all(promises)
                    if (results.every(intent_watcher => intent_watcher.status === IntentfulStatus.Completed_Successfully)) {
                        const first_res = await entityApi.get(`/${ sdk1.provider.prefix }/${ sdk1.provider.version }/${ first_kind_name }/${ first_result.data.metadata.uuid }`)
                        expect(first_res.data.status.x).toEqual(20)
                        const second_res = await entityApi.get(`/${ sdk2.provider.prefix }/${ sdk2.provider.version }/${ second_kind_name }/${ second_result.data.metadata.uuid }`)
                        expect(second_res.data.status.x).toEqual(20)
                        test_result = true
                    }
                    await timeout(5000)
                }
            } catch (e) {
                console.log(`Couldn't get entity: ${ e }`)
                expect(e).toBeUndefined()
            }
        } catch (e) {
            console.log(`Error: ${e}`)
        } finally {
            sdk1.cleanup();
            sdk2.cleanup();
            expect(test_result).toBeTruthy()
        }
    })

    test("Differ resolver with 2 providers, same kinds and entities with same uuid should pass", async () => {
        expect.hasAssertions();
        let test_result = false
        const sdk1 = ProviderSdk.create_provider(
            papieaUrl, adminKey, server_config.host, server_config.port);
        const sdk2 = ProviderSdk.create_provider(
            papieaUrl, adminKey, server_config_2nd_provider.host, server_config_2nd_provider.port);
        try {
            first_provider_prefix = "location_provider_intentful_1_same_kind"
            second_provider_prefix = "2nd_location_provider_intentful_1_same_kind"
            const first_location = sdk1.new_kind(JSON.parse(JSON.stringify(locationDataDescription)));
            const second_location = sdk2.new_kind(JSON.parse(JSON.stringify(locationDataDescription)));
            sdk1.version(provider_version);
            sdk1.prefix(first_provider_prefix);
            sdk2.prefix(second_provider_prefix);
            sdk2.version(provider_version);
            const intentful_handler = (sdk: ProviderSdk) => {
                return async (ctx: any, entity: any, input: any) => {
                    await providerApiAdmin.patch(`/${ sdk.provider.prefix }/${ sdk.provider.version }/update_status`, {
                        context: "some context",
                        metadata: entity.metadata,
                        status: { x: entity.spec.x }
                    })
                }
            }
            first_location.on("x", intentful_handler(sdk1))
            second_location.on("x", intentful_handler(sdk2))
            await sdk1.register();
            await sdk2.register();
            const first_kind_name = sdk1.provider.kinds[0].name;
            const second_kind_name = sdk2.provider.kinds[0].name;

            const shared_uuid = uuid()

            const first_result = await entityApi.post(`${ sdk1.entity_url }/${ sdk1.provider.prefix }/${ sdk1.provider.version }/${ first_kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: shared_uuid
                }
            })
            first_provider_to_delete_entites.push(first_result.data.metadata)
            const second_result = await entityApi.post(`${ sdk2.entity_url }/${ sdk2.provider.prefix }/${ sdk2.provider.version }/${ second_kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: shared_uuid
                }
            })
            second_provider_to_delete_entites.push(second_result.data.metadata)
            const first_watcher_result = await entityApi.put(
                `/${ sdk1.provider.prefix }/${ sdk1.provider.version }/${ first_kind_name }/${ first_result.data.metadata.uuid }`, {
                    spec: {
                        x: 20,
                        y: 11
                    },
                    metadata: {
                        spec_version: 1
                    }
                })

            const second_watcher_result = await entityApi.put(
                `/${ sdk2.provider.prefix }/${ sdk2.provider.version }/${ second_kind_name }/${ second_result.data.metadata.uuid }`, {
                    spec: {
                        x: 20,
                        y: 11
                    },
                    metadata: {
                        spec_version: 1
                    }
                })
            const first_watcher = first_watcher_result.data.intent_watcher
            const second_watcher = second_watcher_result.data.intent_watcher
            const watchers = [first_watcher, second_watcher]
            let retries = 10
            try {
                let watcherApi = sdk1.get_intent_watcher_client()
                for (let i = 1; i <= retries; i++) {
                    const promises = watchers.map(watcher => watcherApi.get(watcher.uuid))
                    const results = await Promise.all(promises)
                    if (results.every(intent_watcher => intent_watcher.status === IntentfulStatus.Completed_Successfully)) {
                        const first_res = await entityApi.get(`/${ sdk1.provider.prefix }/${ sdk1.provider.version }/${ first_kind_name }/${ first_result.data.metadata.uuid }`)
                        expect(first_res.data.status.x).toEqual(20)
                        const second_res = await entityApi.get(`/${ sdk2.provider.prefix }/${ sdk2.provider.version }/${ second_kind_name }/${ second_result.data.metadata.uuid }`)
                        expect(second_res.data.status.x).toEqual(20)
                        test_result = true
                    }
                    await timeout(5000)
                }
            } catch (e) {
                console.log(`Couldn't get entity: ${ e }`)
                expect(e).toBeUndefined()
            }
        } catch (e) {
            console.log(`Error: ${e}`)
        } finally {
            sdk1.cleanup();
            sdk2.cleanup();
            expect(test_result).toBeTruthy()
        }
    })
})

describe("Background Tasks test", () => {

    const locationDataDescription = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.Differ).build()
    let first_provider_prefix: string | null
    let provider_version: Version = "0.1.0"
    let first_provider_to_delete_entites: Metadata[] = []
    let task: BackgroundTaskBuilder

    beforeEach(async () => {
        try {
            await task.kill_task()
        } catch (e) {

        }
    })

    afterEach(async () => {
        for (let metadata of first_provider_to_delete_entites) {
            await entityApi.delete(`${first_provider_prefix}/${provider_version}/${metadata.kind}/${metadata.uuid}`)
        }
        first_provider_to_delete_entites = []
        if (first_provider_prefix !== null) {
            await providerApiAdmin.delete(`${first_provider_prefix}/${provider_version}`)
        }
        first_provider_prefix = null
    })

    test("Background tasks should work", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            let times_invoked = 0
            first_provider_prefix = "location_provider_intentful_background_task"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            task = sdk.background_task("sample-task", 5, async (ctx: IntentfulCtx_Interface) => {
                times_invoked++
            })
            try {
                await sdk.register();
                await task.start_task()
                await timeout(4000)
                expect(times_invoked).toEqual(1)
                await task.kill_task()
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
                expect(e).toBeUndefined()
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Background task shouldn't register if metadata extension should be present but is not specified", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = null
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix("metadata_extension");
            sdk.metadata_extension({
                SampleMetaExt: {
                    type: "object",
                    properties: {
                        sample: {
                            type: "string"
                        }
                    }
                }
            })
            try {
                task = sdk.background_task("sample-task", 5, async (ctx: IntentfulCtx_Interface) => {
                })
            } catch (e) {
                console.log(e.message)
                expect(e.message).toContain("without the required metadata extension")
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Background task with metadata extension should work", async () => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            first_provider_prefix = "location_provider_intentful_background_task_meta"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            sdk.metadata_extension({
                SampleMetaExt: {
                    type: "object",
                    properties: {
                        sample: {
                            type: "string"
                        }
                    }
                }
            })
            task = sdk.background_task("sample-task", 5, async (ctx: IntentfulCtx_Interface) => {
            }, {sample: "test"})
            try {
                await sdk.register();
                await task.start_task()
                await task.kill_task()
            } catch (e) {
                expect(e).toBeUndefined()
            }
        } finally {
            sdk.cleanup()
        }
    })

    test("Background task with custom fields should work", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            let times_invoked = 0
            let count = 0
            first_provider_prefix = "location_provider_intentful_background_task_custom"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(first_provider_prefix);
            task = sdk.background_task("sample-task", 5, async (ctx: IntentfulCtx_Interface, task_ctx: any | undefined) => {
                if (task_ctx) {
                    count = task_ctx.count
                }
                times_invoked++
            }, null, {
                type: "object",
                properties: {
                    count: {
                        type: "number"
                    }
                }
            })
            try {
                await sdk.register();
                await task.start_task()
                await timeout(4000)
                expect(times_invoked).toEqual(1)
                await task.update_task({
                    count: 1
                })
                await timeout(5000)
                expect(count).toEqual(1)
                await task.kill_task()
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
                expect(e).toBeUndefined()
            }
        } finally {
            sdk.cleanup()
        }
    })
})
