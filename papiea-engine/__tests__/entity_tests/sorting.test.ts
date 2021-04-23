import { ProviderBuilder } from "../test_data_factory";
import axios from "axios";
import { UserAuthInfo } from "../../src/auth/authn";
import { Authorizer } from "../../src/auth/authz";
import * as Async from "../../src/utils/async";
import { Action } from "papiea-core";
import { LoggerFactory } from 'papiea-backend-utils';


declare var process: {
    env: {
        SERVER_PORT: string,
        PAPIEA_ADMIN_S2S_KEY: string
    }
};
const serverPort = parseInt(process.env.SERVER_PORT || '3000');
const adminKey = process.env.PAPIEA_ADMIN_S2S_KEY || '';

class MockedAuthorizer extends Authorizer {
    async checkPermission(user: UserAuthInfo, object: any, action: Action): Promise<void> {
        const random_boolean = Math.random() >= 0.5;
        if (random_boolean) {
            throw new Error("Not authorized")
        }
    }
}

const entityApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/services`,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' }
});

const providerApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/provider/`,
    timeout: 1000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
    }
});

describe("Pagination tests", () => {
    const providerPrefix = "test";
    const providerVersion = "0.1.0";
    let kind_name: string

    let uuids: string[] = [];
    const entityPromises: Promise<any>[] = [];
    const sortingTestLogger = LoggerFactory.makeLogger({level: "info"});

    beforeAll(async () => {
        const provider = new ProviderBuilder(providerPrefix).withVersion(providerVersion).withKinds().build();
        kind_name = provider.kinds[0].name;
        await providerApi.post('/', provider);

        try {
            for (let i = 0; i < 70; i++) {
                entityPromises.push(entityApi.post(`/${providerPrefix}/${providerVersion}/${kind_name}`, {
                    spec: {
                        x: i,
                        y: 11
                    }
                }));
            }
            const entityResponses: any[] = await Promise.all(entityPromises);
            uuids = entityResponses.map(entityResp => entityResp.data.metadata.uuid);
            expect(entityResponses.length).toBe(70);
        } catch (e) {
            throw e;
        }
    });

    afterAll(async () => {
        const deletePromises: Promise<any>[] = [];
        await providerApi.delete(`${providerPrefix}/${providerVersion}`);
        try {
            uuids.forEach(uuid => {
                deletePromises.push(entityApi.delete(`/${providerPrefix}/${providerVersion}/${kind_name}/${uuid}`));
            });
            await Promise.all(deletePromises);
        } catch (e) {
            throw e;
        }
    });

    test("Sorting with no explicit order should be ascending", async (done) => {
        try {
            const { data } = await entityApi.post(`${providerPrefix}/${providerVersion}/${kind_name}/filter?sort=spec.x`, {
                spec: {
                    y: 11
                }
            });
            sortingTestLogger.info(data.results[0]);
            expect(data.results[0].spec.x).toBe(0);
            done();
        } catch (e) {
            done.fail(e);
        }
    });

    test("Authorizer doesn't affect the order of sorting", async () => {
        const authorizer = new MockedAuthorizer();
        const specs = [{spec: {x: 10, y: 11}}, {spec: {x: 18, y:27}}, {spec: {x: 22, y: 8}}, {spec: {x: 41, y: 50}}];
        const res = await Async.collect(authorizer.filter(LoggerFactory.makeLogger({}), {} as UserAuthInfo, specs, {} as Action));
        for (let i = 0; i < res.length - 1; i++) {
            expect(res[i+1].spec.x).toBeGreaterThan(res[i].spec.x)
        }
    })
});
