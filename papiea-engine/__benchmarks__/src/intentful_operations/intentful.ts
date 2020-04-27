import { Version, IntentfulStatus } from "papiea-core";
import axios from "axios"
import { Benchmarks } from "../base_benchmark";
import { timeout } from "../../../src/utils/utils";

export class IntentfulBenchmarks extends Benchmarks {
    private entities: string[]
    private tasks: string[]
    private intentful_opts: { amount: number };

    constructor(papiea_url: string, provider_prefix: string, provider_version: Version, kind_name: string) {
        super(papiea_url, provider_prefix, provider_version, kind_name)
        this.full_url = `${ papiea_url }/services/${ provider_prefix }/${ provider_version }/${ kind_name }`
        this.papiea_url = papiea_url
        this.intentful_opts = { amount: 2 }
        this.entities = []
        this.tasks = []
    }

    async runIntentfulCAS() {
        this.entities = await this.createEntities(this.full_url, this.intentful_opts.amount)
        await timeout(5000)
        const api = axios.create({
            baseURL: `${this.full_url}`,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            }
        });
        // Inject request start timing
        api.interceptors.request.use(function (config) {
            (config as any).metadata = { startTime: new Date().getTime() }
            return config;
        }, function (error) {
            return Promise.reject(error);
        })
        // Calculate request end timing
        api.interceptors.response.use(function (response) {
            (response.config as any).metadata.endTime = new Date().getTime();
            (response as any).duration = ((response.config as any).metadata.endTime - (response.config as any).metadata.startTime) / 1000
            return response;
        }, function (error) {
            error.config.metadata.endTime = new Date();
            error.duration = (error.config.metadata.endTime - error.config.metadata.startTime) / 1000;
            return Promise.reject(error);
        });
        let durations: any[] = []
        let promises: Promise<any>[] = []
        for (let uuid of this.entities) {
            const promise = api.put(`/${ uuid }`, {
                spec: {
                    x: 2020,
                    y: 1200
                },
                metadata: {
                    spec_version: 1
                }
            }).then((res) => {
                durations.push((res as any).duration)
                return res
            })
            promises.push(promise)
        }
        const res = await Promise.all(promises)
        this.tasks = res.map(result => result.data.task.uuid)
        const sum = durations.reduce((acc, c) => acc + c, 0)
        const avg = sum / durations.length
        console.log(`CAS average time: ${avg} seconds`)
    }

    async runIntentfulTask() {
        let completedIn = []
        let startTime = new Date()
        let tasks = new Set([...this.tasks])
        // Timeout 120 seconds OR all tasks finished
        while (((new Date().getTime() - startTime.getTime()) / 1000) < 120 && completedIn.length !== this.tasks.length) {
            for (let uuid of tasks) {
                const resp = await axios.get(`${ this.papiea_url }/services/intentful_task/${ uuid }`)
                if (resp.data.status === IntentfulStatus.Completed_Successfully) {
                    completedIn.push((new Date().getTime() - startTime.getTime())/ 1000)
                    tasks.delete(uuid)
                }
            }
        }
        if (completedIn.length === 0) {
            throw new Error("Couldn't complete intentful task benchmarks")
        }
        const sum = completedIn.reduce((acc, c) => acc + c, 0)
        const avg = sum / completedIn.length
        console.log(`Wait til intentful task is completed average time: ${avg} seconds`)
        await this.deleteEntities(this.full_url, this.entities)
    }

    setOpts(opts: { amount: number }) {
        this.intentful_opts = { amount: opts.amount }
    }
}