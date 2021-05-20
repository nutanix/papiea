import "jest"
import axios from "axios"
import { DescriptionBuilder, DescriptionType, KindBuilder, ProviderBuilder } from "../test_data_factory"
import { IntentfulBehaviour, Provider } from "papiea-core";
import { AxiosResponseParser } from "papiea-backend-utils"
import { resolve } from "path";
import { readFileSync } from "fs";
const https = require('https')

declare var process: {
    env: {
        SERVER_PORT: string,
        PAPIEA_ADMIN_S2S_KEY: string
    }
};
const serverPort = parseInt(process.env.SERVER_PORT || '3000');
const adminKey = process.env.PAPIEA_ADMIN_S2S_KEY || '';
const httpsAgent = new https.Agent({
    ca: readFileSync(resolve(__dirname, '../../certs/ca.crt'), 'utf8')
})

const providerApi = axios.create({
    baseURL: `https://localhost:${serverPort}/provider/`,
    timeout: 1000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
    },
    httpsAgent
});

const entityApi = axios.create({
    baseURL: `https://localhost:${ serverPort }/services`,
    timeout: 1000,
    headers: { 'Content-Type': 'application/json' },
    httpsAgent
});

describe("Provider API tests", () => {
    const providerPrefix = "test_provider";
    const providerVersion = "0.1.0";
    const clusterDescription = new DescriptionBuilder(DescriptionType.Cluster).build()
    const clusterKinds = [new KindBuilder(IntentfulBehaviour.Basic).withDescription(clusterDescription).build()]
    const nullableClusterDescription = new DescriptionBuilder(DescriptionType.Cluster).withNullableFields().build()
    const nullableClusterKinds = [new KindBuilder(IntentfulBehaviour.Basic).withDescription(nullableClusterDescription).build()]
    const arrayDescription = new DescriptionBuilder(DescriptionType.Array).build()
    const locationArrayKinds = [new KindBuilder(IntentfulBehaviour.Basic).withDescription(arrayDescription).build()]

    test("Non-existent route", done => {
        providerApi.delete(`/abc`).then(() => done.fail()).catch(() => done());
    });

    test("Register provider", done => {
        const provider: Provider = { prefix: providerPrefix, version: providerVersion, kinds: [], procedures: {}, extension_structure: {}, allowExtraProps: false };
        providerApi.post('/', provider).then(() => done()).catch(done.fail);
    });

    test("Register provider with missing prefix", done => {
        const provider: any = { version: providerVersion, kinds: [], procedures: {}, extension_structure: {}, allowExtraProps: false };
        providerApi.post('/', provider).then(() => done.fail()).catch(() => done());
    });

    test("Register provider with malformed procedures", done => {
        const provider: any = { version: providerVersion, prefix: providerPrefix, kinds: [], procedures: {"argument": {malformed_field: "test" }}, extension_structure: {}, allowExtraProps: false };
        providerApi.post('/', provider).then(() => done.fail()).catch(() => done());
    });

    test("Register provider with malformed kind procedures", done => {
        const provider: any = { version: providerVersion, prefix: providerPrefix, kinds: [ {kind_procedures: {"argument": {malformed_field: "test" }}}], procedures: {}, extension_structure: {}, allowExtraProps: false };
        providerApi.post('/', provider).then(() => done.fail()).catch(() => done());
    });

    test("Register provider with spec only kind structure with status only fields", async () => {
        expect.assertions(1)
        const desc = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.SpecOnly).withStatusOnlyField().build()
        const kind = new KindBuilder(IntentfulBehaviour.SpecOnly).withDescription(desc).build()
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds([kind]).build();
        try {
            await providerApi.post('/', provider);
        } catch (e) {
            expect(AxiosResponseParser.getAxiosErrorMessage(e)).toBe("x-papiea has wrong value: status-only, the field should not be present.");
        }
    });

    test("Register provider with spec only kind structure with spec only fields", async () => {
        expect.assertions(1)
        const desc = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.SpecOnly).withSpecOnlyField().build()
        const kind = new KindBuilder(IntentfulBehaviour.SpecOnly).withDescription(desc).build()
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds([kind]).build();
        try {
            await providerApi.post('/', provider);
        } catch (e) {
            expect(AxiosResponseParser.getAxiosErrorMessage(e)).toBe("x-papiea has wrong value: spec-only, correct values are: status-only.");
        }
    });

    test("Register provider with spec only kind structure", async () => {
        expect.assertions(1)
        const kind = new KindBuilder(IntentfulBehaviour.Basic).build()
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds([kind]).build();
        const result = await providerApi.post('/', provider);
        expect(result.status).toEqual(200)
    });

    test("Register provider with malformed entity procedures", done => {
        const provider: any = { version: providerVersion, prefix: providerPrefix, kinds: [ {entity_procedures: {"argument": {malformed_field: "test" }}}], procedures: {}, extension_structure: {}, allowExtraProps: false };
        providerApi.post('/', provider).then(() => done.fail()).catch(() => done());
    });

    test("Register provider with malformed intentful definitions", done => {
        const provider: any = { version: providerVersion, prefix: providerPrefix, kinds: [ {intentful_signature: [{"sfs": "wrong_sfs", "argument": {malformed_field: "test" }}]}], procedures: {}, extension_structure: {}, allowExtraProps: false };
        providerApi.post('/', provider).then(() => done.fail()).catch(() => done());
    });

    test("Register malformed provider", done => {
        providerApi.post('/', {}).then(() => done.fail()).catch(() => done());
    });
    test("Get provider", async () => {
        const res = await providerApi.get(`/${ providerPrefix }/${ providerVersion }`);
        expect(res.data.kinds).not.toBeUndefined();
    });

    test("ReRegister provider", async () => {
        const prefix = "test_provider_reregister"
        const original_provider: Provider = { prefix: prefix, version: providerVersion, kinds: [], procedures: {}, extension_structure: {}, allowExtraProps: true };
        await providerApi.post('/', original_provider)
        const res = await providerApi.get(`/${ prefix }/${ providerVersion }`)
        expect(res.data.allowExtraProps).toBeTruthy()
        const overriden_provider: Provider = { prefix: prefix, version: providerVersion, kinds: [], procedures: {}, extension_structure: {}, allowExtraProps: false };
        await providerApi.post('/', overriden_provider)
        const result = await providerApi.get(`/${ prefix }/${ providerVersion }`)
        expect(result.data.allowExtraProps).toBeFalsy()
        await providerApi.delete(`/${prefix}/${providerVersion}`)
    });

    test("Get multiple providers", async () => {
        const version1 = "1.0.0";
        const provider1: Provider = { prefix: providerPrefix, version: version1, kinds: [], procedures: {}, extension_structure: {}, allowExtraProps: false };
        await providerApi.post('/', provider1);
        const version2 = "2.0.0";
        const provider2: Provider = { prefix: providerPrefix, version: version2, kinds: [], procedures: {}, extension_structure: {}, allowExtraProps: false };
        await providerApi.post('/', provider2);
        const res = await providerApi.get(`/${providerPrefix}`);
        expect(res.data.length).toBeGreaterThanOrEqual(2);
        await providerApi.delete(`/${providerPrefix}/${version1}`);
        await providerApi.delete(`/${providerPrefix}/${version2}`);
    });

    test("Unregister provider", done => {
        providerApi.delete(`/${providerPrefix}/${providerVersion}`).then(() => done()).catch(done.fail);
    });

    test("Unregister non-existent provider", done => {
        providerApi.delete(`/${providerPrefix}/${providerVersion}`).then(() => done.fail()).catch(() => done());
    });

    test("Unregister never existed provider", done => {
        providerApi.delete(`/123/123`).then(() => done.fail()).catch(() => done());
    });

    test("Update status", async () => {
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds(clusterKinds).build();
        await providerApi.post('/', provider);
        const kind_name = provider.kinds[0].name;
        const { data: { metadata, spec } } = await entityApi.post(`/${ provider.prefix }/${provider.version}/${ kind_name }`, {
            spec: {
                host: "small",
                ip: "0.0.0.0"
            }
        });

        const newStatus = { host: "medium", ip: "127.0.0.1", name: "test_cluster" };
        await providerApi.post(`/${provider.prefix}/${provider.version}/update_status`, {
            context: "some context",
            metadata: metadata,
            status: newStatus
        });

        const res = await entityApi.get(`/${ provider.prefix }/${provider.version}/${ kind_name }/${ metadata.uuid }`);
        expect(res.data.status).toEqual(newStatus);
    });

    test("Update status replaces array values at the very top level", async () => {
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds(locationArrayKinds).build();
        await providerApi.post('/', provider);
        const kind_name = provider.kinds[0].name;
        const { data: { metadata, spec } } = await entityApi.post(`/${ provider.prefix }/${provider.version}/${ kind_name }`, {
            spec: [{
                x: 10,
                y: 10
            }]
        });

        const newStatus = [{ x: 15, y: 15 }];
        await providerApi.patch(`/${provider.prefix}/${provider.version}/update_status`, {
            context: "some context",
            metadata: metadata,
            status: newStatus
        });

        const res = await entityApi.get(`/${ provider.prefix }/${provider.version}/${ kind_name }/${ metadata.uuid }`);
        expect(res.data.status).toEqual(newStatus);
    });

    test("Update status replaces array values inside the object", async () => {
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds(clusterKinds).build();
        await providerApi.post('/', provider);
        const kind_name = provider.kinds[0].name;
        const { data: { metadata, spec } } = await entityApi.post(`/${ provider.prefix }/${provider.version}/${ kind_name }`, {
            spec: {
                host: "small",
                ip: "0.0.0.0",
                priorities: [1, 3, 4]
            }
        });

        const newStatus = { priorities: [2, 7, 4] };
        await providerApi.patch(`/${provider.prefix}/${provider.version}/update_status`, {
            context: "some context",
            metadata: metadata,
            status: newStatus
        });

        const res = await entityApi.get(`/${ provider.prefix }/${provider.version}/${ kind_name }/${ metadata.uuid }`);
        expect(res.data.status.host).toEqual("small");
        expect(res.data.status.priorities).toEqual([2, 7, 4]);
    });

    test("Update status with undefined values error should be meaningful", async () => {
        expect.assertions(3)
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds(clusterKinds).build();
        await providerApi.post('/', provider);
        const kind_name = provider.kinds[0].name;
        const { data: { metadata, spec } } = await entityApi.post(`/${ provider.prefix }/${provider.version}/${ kind_name }`, {
            spec: {
                host: "small",
                ip: "0.0.0.0"
            }
        });

        const newStatus = { host: undefined, ip: undefined, name: undefined };
        try {
            await providerApi.post(`/${ provider.prefix }/${ provider.version }/update_status`, {
                context: "some context",
                metadata: metadata,
                status: newStatus
            });
        } catch (e) {
            expect(e).toBeDefined()
            expect(AxiosResponseParser.getAxiosError(e).message).toEqual("Validation Failed")
            expect(AxiosResponseParser.getAxiosErrorMessage(e)).toContain(`Failed to validate status for kind: ${ provider.prefix }/${ provider.version }/${ kind_name }. Use null values instead of undefined to remove the status field.`)
        }
    });

    test("Kinds with nullable fields should not get registered", async () => {
        expect.hasAssertions()
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds(nullableClusterKinds).build();
        try {
            await providerApi.post("/", provider)
        } catch (e) {
            expect(AxiosResponseParser.getAxiosResponseStatus(e)).toEqual(400)
            expect(AxiosResponseParser.getAxiosErrorMessage(e)).toContain("Papiea doesn't support 'nullable' fields. Please make a field 'host' non-required instead.")
        }
    });

    test("Nullable procedure fields shouldn't be accepted", async () => {
        expect.hasAssertions()
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds(clusterKinds).withEntityProcedures().build();
        const modified_provider = JSON.parse(JSON.stringify(provider))
        modified_provider.kinds[0].entity_procedures["moveX"].argument["MoveInput"]["properties"]["x"]["nullable"] = true
        try {
            await providerApi.post("/", modified_provider)
        } catch (e) {
            expect(AxiosResponseParser.getAxiosResponseStatus(e)).toEqual(400)
            expect(AxiosResponseParser.getAxiosErrorMessage(e)).toContain("Papiea doesn't support 'nullable' fields. Please make a field 'x' non-required instead.")
        }
    });

    test("Update status with malformed status should fail validation", async () => {
        expect.hasAssertions();
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds(clusterKinds).build();
        await providerApi.post('/', provider);
        const kind_name = provider.kinds[0].name;
        const { data: { metadata, spec } } = await entityApi.post(`/${ provider.prefix }/${provider.version}/${ kind_name }`, {
            spec: {
                host: "small",
                ip: "0.0.0.0"
            }
        });

        try {
            await providerApi.post(`/${provider.prefix}/${provider.version}/update_status`, {
                context: "some context",
                metadata: metadata,
                status: { host: "small", ip: 100 }
            });
        } catch (err) {
            expect(err).toBeDefined();
        }
    });

    test("Update policy", async () => {
        expect.hasAssertions();
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds().build();
        await providerApi.post('/', provider);

        const originalPolicy = "g, admin, admin_group";
        await providerApi.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: originalPolicy
        });
        const { data: { policy } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }`);
        expect(policy).toEqual(originalPolicy);
    });

    test("Update status with partial status definition", async () => {
        expect.hasAssertions();
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds(clusterKinds).build();
        await providerApi.post('/', provider);
        const kind_name = provider.kinds[0].name;
        const { data: { metadata, spec } } = await entityApi.post(`/${ provider.prefix }/${ provider.version }/${ kind_name }`, {
            spec: {
                host: "small",
                ip: "0.0.0.0"
            }
        });

        const newStatus = { host: "big", name: "test_cluster" };
        await providerApi.patch(`/${provider.prefix}/${provider.version}/update_status`, {
            context: "some context",
            metadata: metadata,
            status: newStatus
        });

        const res = await entityApi.get(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ metadata.uuid }`);
        expect(res.data.status.host).toEqual("big");
        expect(res.data.status.ip).toEqual("0.0.0.0");
        expect(res.data.status.name).toEqual("test_cluster");
    });

    test("Register provider with extension structure", async () => {
        const extension_desc = new DescriptionBuilder(DescriptionType.Metadata).build();
        const provider: Provider = { prefix: providerPrefix, version: providerVersion, kinds: [], procedures: {}, extension_structure: extension_desc, allowExtraProps: false };
        await providerApi.post('/', provider);
        await providerApi.delete(`/${ providerPrefix }/${ providerVersion }`);
    });

    test("Update status of spec-only entity should fail", async () => {
        expect.assertions(1)
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds().build();
        await providerApi.post('/', provider);
        const kind_name = provider.kinds[0].name;
        const { data: { metadata, spec } } = await entityApi.post(`/${ provider.prefix }/${provider.version}/${ kind_name }`, {
            spec: {
                x: 10,
                y: 20
            }
        });

        const newStatus = { x: 15, y: 100 };
        try {
            await providerApi.post(`/${provider.prefix}/${provider.version}/update_status`, {
                context: "some context",
                metadata: metadata,
                status: newStatus
            });
        } catch (e) {
            expect(e).toBeDefined()
        }
    });
});

describe('Status-only fields are not overridden by spec changes', function () {
    const clusterDescription = new DescriptionBuilder(DescriptionType.Cluster).build()
    const clusterKinds = [new KindBuilder(IntentfulBehaviour.Basic).withDescription(clusterDescription).build()]

    test("Create entity, update status, update spec, status-only fields remain untouched, delete entity", async () => {
        expect.assertions(4)
        const provider: Provider = new ProviderBuilder().withVersion("0.1.0").withKinds(clusterKinds).build();
        await providerApi.post('/', provider);
        const kind_name = provider.kinds[0].name;
        const providerPrefix = provider.prefix
        const providerVersion = provider.version
        const { data: { metadata, spec } } = await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                host: "medium",
                ip: "0.0.0.0"
            }
        });

        await providerApi.patch(`/${provider.prefix}/${provider.version}/update_status`, {
            context: "some context",
            metadata: metadata,
            status: {
                name: "test_cluster"
            }
        });

        let res = await entityApi.get(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ metadata.uuid }`);
        expect(res.data.status).toEqual({
            host: "medium",
            ip: "0.0.0.0",
            name: "test_cluster"
        })
        await entityApi.put(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ metadata.uuid }`, {
            spec: {
                host: "large",
                ip: "1.1.1.1"
            },
            metadata: {
                spec_version: 1
            }
        });
        res = await entityApi.get(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ metadata.uuid }`);
        expect(res.data.status).toEqual({
            host: "medium",
            ip: "0.0.0.0",
            name: "test_cluster"
        })
        expect(res.data.spec).toEqual({
            host: "large",
            ip: "1.1.1.1"
        })
        expect(res.data.spec.name).toBeUndefined()
        await entityApi.delete(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ metadata.uuid }`);
    });
})
