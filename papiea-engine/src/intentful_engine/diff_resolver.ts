// [[file:~/work/papiea-js/Papiea-design.org::*/src/intentful_engine/task_manager_interface.ts][/src/intentful_engine/task_manager_interface.ts:1]]
import { timeout } from "../utils/utils"
import { Spec_DB } from "../databases/spec_db_interface"
import { Status_DB } from "../databases/status_db_interface"
import { create_entry, Backoff, EntryReference, Watchlist, Delay } from "./watchlist"
import { Watchlist_DB } from "../databases/watchlist_db_interface";
import { Differ, Diff, Metadata, Spec, Status, Kind, Provider, PapieaEngineTags } from "papiea-core";
import { Provider_DB } from "../databases/provider_db_interface";
import axios from "axios"
import { IntentfulContext } from "../intentful_core/intentful_context";
import { Logger } from "papiea-backend-utils";
import deepEqual = require("deep-equal");

type DiffContext = {
    metadata: Metadata,
    provider: Provider,
    kind: Kind,
    spec: Spec,
    status: Status,
};
type RediffResult = {diffs: Diff[]} & DiffContext;
type DiffWithContext = {diff: Diff} & DiffContext;

export class DiffResolver {
    protected readonly specDb: Spec_DB
    protected readonly statusDb: Status_DB
    private readonly watchlistDb: Watchlist_DB
    private readonly providerDb: Provider_DB
    protected watchlist: Watchlist
    private differ: Differ
    private intentfulContext: IntentfulContext;
    private logger: Logger;
    private batchSize: number;
    private static MAXIMUM_BACKOFF = 100
    private entropyFn: (diff_delay?: number) => number
    private calculateBackoffFn: (retries?: number, maximumBackoff?: number, entropy?: number, kind_retry_exponent?: number, kind_name?: string) => number

    constructor(watchlist: Watchlist, watchlistDb: Watchlist_DB, specDb: Spec_DB, statusDb: Status_DB, providerDb: Provider_DB, differ: Differ, intentfulContext: IntentfulContext, logger: Logger, batchSize: number, entropyFn: (diff_delay?: number) => number, calculateBackoffFn: (retries?: number, maximumBackoff?: number, entropy?: number) => number) {
        this.specDb = specDb
        this.statusDb = statusDb
        this.watchlistDb = watchlistDb
        this.providerDb = providerDb
        this.watchlist = watchlist
        this.differ = differ
        this.intentfulContext = intentfulContext
        this.logger = logger
        this.batchSize = batchSize
        this.entropyFn = entropyFn
        this.calculateBackoffFn = calculateBackoffFn
    }

    public async run(delay: number) {
        try {
            await this._run(delay)
        } catch (e) {
            this.logger.error(`Error in run method for diff resolver: ${e}`)
            throw e
        }
    }

    private async _run(delay: number) {
        while (true) {
            this.logger.debug(`BEGIN ${this._run.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
            await timeout(delay)
            await this.updateWatchlist()
            await this.resolveDiffs()
            await this.addRandomEntities()
            this.logger.debug(`END ${this._run.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
        }
    }

    private async updateWatchlist() {
        try {
            this.logger.debug(`BEGIN ${this.updateWatchlist.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
            const updated_watchlist = await this.watchlistDb.get_watchlist()
            this.watchlist.update(updated_watchlist)
            this.logger.debug(`END ${this.updateWatchlist.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
        } catch (e) {
            this.logger.debug(`END ${this.updateWatchlist.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
            return
        }
    }

    private createDiffBackoff(kind: Kind, delay: Delay | null | undefined, retries: number = 0): Backoff {
        if (delay !== undefined && delay !== null) {
            return {
                delay,
                retries
            }
        } else {
            return {
                delay: {
                    delay_seconds: this.calculateBackoffFn(retries, DiffResolver.MAXIMUM_BACKOFF, this.entropyFn(kind.diff_delay), kind.diff_retry_exponent, kind.name),
                    delay_set_time: new Date()
                },
                retries
            }
        }
    }

    private incrementDiffBackoff(backoff: Backoff, delay: Delay | null | undefined, kind: Kind): Backoff {
        const retries = backoff.retries + 1
        return this.createDiffBackoff(kind, delay, retries)
    }

    private async rediff(entry_reference: EntryReference): Promise<RediffResult | null> {
        try {
            this.logger.debug(`BEGIN ${this.rediff.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
            const [metadata, spec] = await this.specDb.get_spec({...entry_reference.provider_reference, ...entry_reference.entity_reference})
            const [, status] = await this.statusDb.get_status({...entry_reference.provider_reference, ...entry_reference.entity_reference})
            const provider = await this.providerDb.get_provider(entry_reference.provider_reference.provider_prefix, entry_reference.provider_reference.provider_version)
            const kind = this.providerDb.find_kind(provider, metadata.kind)
            this.logger.debug(`END ${this.rediff.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
            return {
                diffs: this.differ.all_diffs(kind, spec, status, this.logger),
                metadata, provider, kind, spec, status,
            };
        } catch (e) {
            this.logger.debug(`Couldn't generate diff for entity with uuid: ${entry_reference.entity_reference.uuid} and kind: ${entry_reference.entity_reference.kind} due to error: ${e}. Removing from watchlist`)
            this.logger.debug(`END ${this.rediff.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
            return null
        }
    }

    private async launchOperation({diff, metadata, spec, status}: DiffWithContext): Promise<Delay | null> {
        this.logger.debug(`BEGIN ${this.launchOperation.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
        this.logger.debug("launchOperation", diff.intentful_signature.procedure_callback,
            { metadata: metadata,
                spec: spec,
                status: status,
                input: diff.diff_fields})
        // This yields delay
        const result = await axios.post(diff.intentful_signature.procedure_callback, {
            metadata: metadata,
            spec: spec,
            status: status,
            input: diff.diff_fields
        })
        if (result.data !== null && result.data !== undefined && result.data.delay_secs !== undefined
            && result.data.delay_secs !== null && !Number.isNaN(result.data.delay_secs)) {
            this.logger.debug(`END ${this.launchOperation.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
            return {
                delay_seconds: result.data.delay_secs,
                delay_set_time: new Date()
            }
        } else {
            this.logger.debug(`END ${this.launchOperation.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
            return null
        }
    }

    private async checkHealthy(diff: Diff): Promise<boolean> {
        try {
            await axios.get(diff.handler_url!)
            return true
        } catch (e) {
            return false
        }
    }

    private async removeFromWatchlist(ref: EntryReference) {
        this.watchlist.delete(ref)
        await this.watchlistDb.update_watchlist(this.watchlist)
    }

    private static includesDiff(diffs: Diff[], diff: Diff) {
        for (let d of diffs) {
            if (deepEqual(d, diff)) {
                return true
            }
        }
        return false
    }

    private async resolveDiffs() {
        this.logger.debug(`BEGIN ${this.resolveDiffs.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
        const entries = this.watchlist.entries()
        const promises = []

        for (let key in entries) {
            if (!entries.hasOwnProperty(key)) {
                continue
            }

            let [entry_reference, diff_results] = entries[key]
            this.logger.debug(`Diff engine resolving diffs for entity with uuid: ${entry_reference.entity_reference.uuid} and kind: ${entry_reference.entity_reference.kind}`)
            let rediff: RediffResult | null = await this.rediff(entry_reference)
            if (!rediff) {
                await this.removeFromWatchlist(entry_reference)
                continue
            }
            if (diff_results.length === 0) {
                if (rediff.diffs.length === 0) {
                    await this.removeFromWatchlist(entry_reference)
                    continue
                }
            }
            if (rediff.diffs.length > diff_results.length) {
                for (let diff of rediff.diffs) {
                    const watched_diffs = diff_results.map(watch => watch[0])
                    if (!DiffResolver.includesDiff(watched_diffs, diff)) {
                        entries[key][1].push([diff, null])
                    }
                }
            } else if (diff_results.length > rediff.diffs.length) {
                const watched_diffs = diff_results.map(watch => watch[0])
                for (let idx = 0; idx <= watched_diffs.length; idx++) {
                    if (!DiffResolver.includesDiff(rediff.diffs, watched_diffs[idx])) {
                        entries[key][1].splice(idx, 1)
                    }
                }
            }
            const promise = this.startDiffsResolution(diff_results, rediff)
            promises.push(promise)
        }
        await Promise.all(promises)
        await this.watchlistDb.update_watchlist(this.watchlist)
        this.logger.debug(`END ${this.resolveDiffs.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
    }

    private async calculate_batch_size(): Promise<number> {
        return this.batchSize
    }

    private async startDiffsResolution(diff_results: [Diff, Backoff | null][], rediff: RediffResult) {
        this.logger.debug(`BEGIN ${this.startDiffsResolution.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
        const {diffs, metadata, provider, kind} = rediff
        let next_diff: Diff
        let idx: number
        const diff_selection_strategy = this.intentfulContext.getDiffSelectionStrategy(kind!)
        try {
            [next_diff, idx] = diff_selection_strategy.selectOne(diffs)
        } catch (e) {
            this.logger.debug(`Failed to select diff for entity with uuid: ${metadata!.uuid} and kind: ${metadata!.kind} due to error: ${e}`)
            this.logger.debug(`END ${this.startDiffsResolution.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
            return null
        }
        const backoff: Backoff | null = diff_results[idx][1]
        if (!backoff) {
            diff_results[idx][0].handler_url = `${next_diff.intentful_signature.base_callback}/healthcheck`
            const getBackoff = (index: number) => {
                return (delay: Delay | null | undefined) => {
                    const backoff = this.createDiffBackoff(kind, delay)
                    this.logger.info(`Starting to resolve diff for entity with uuid: ${metadata!.uuid} and kind: ${metadata!.kind}`)
                    diff_results[index][1] = backoff
                }
            }
            const getBackoffErrorHandler = (index: number) => {
                return (e: Error) => {
                    this.logger.debug(`Couldn't invoke intent handler to resolve diff for entity with uuid: ${metadata!.uuid} and kind: ${metadata!.kind} due to error: ${e}`)
                    const backoff = this.createDiffBackoff(kind, null)
                    diff_results[index][1] = backoff
                }
            }
            const delay = await this.launchOperation({diff: next_diff, ...rediff}).then(getBackoff(idx)).catch(getBackoffErrorHandler(idx))
            this.logger.debug(`END ${this.startDiffsResolution.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
            return delay
        } else {
            // Delay for rediffing
            if ((new Date().getTime() - backoff.delay.delay_set_time.getTime()) / 1000 > backoff.delay.delay_seconds) {
                const diff_index = rediff.diffs.findIndex(diff => deepEqual(diff.diff_fields, next_diff!.diff_fields))
                // Diff still exists, we should check the health of the handler and retry if healthy
                if (diff_index !== -1) {
                    try {
                        if (!await this.checkHealthy(diff_results[idx][0])) {
                            this.logger.debug(`Handler for entity with uuid: ${metadata!.uuid} and kind: ${metadata!.kind} health check has failed.`)
                            this.logger.debug(`END ${this.startDiffsResolution.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
                            return
                        }
                        this.logger.info(`Starting to retry resolving diff for entity with uuid: ${rediff.metadata!.uuid} and kind: ${rediff.metadata!.kind}`)
                        const getBackoff = (index: number) => {
                            return (delay: Delay | null | undefined) => {
                                diff_results[index][1] = this.incrementDiffBackoff(backoff, delay, rediff.kind)
                            }
                        }
                        const getBackoffErrorHandler = (index: number) => {
                            return (e: Error) => {
                                this.logger.debug(`Couldn't invoke retry intent handler for entity with uuid: ${rediff.metadata!.uuid} and: kind ${rediff.kind!.name} due to error: ${e}`)
                                diff_results[index][1] = this.incrementDiffBackoff(backoff, null, rediff.kind)
                            }
                        }
                        const delay = await this.launchOperation({diff: rediff.diffs[diff_index], ...rediff}).then(getBackoff(idx)).catch(getBackoffErrorHandler(idx))
                        this.logger.debug(`END ${this.startDiffsResolution.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
                        return delay
                    } catch (e) {
                        this.logger.debug(`Couldn't invoke retry intent handler for entity with uuid: ${rediff.metadata!.uuid} and: kind ${rediff.kind!.name} due to error: ${e}`)
                        diff_results[idx][1] = this.incrementDiffBackoff(backoff, null, rediff.kind)
                        this.logger.debug(`END ${this.startDiffsResolution.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
                    }
                }
            }
        }
    }

    // This method is needed to avoid race condition
    // when diffs may be added between the check and removing from the watchlist
    // the batch size maybe static or dynamic
    private async addRandomEntities() {
        this.logger.debug(`BEGIN ${this.addRandomEntities.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
        const batch_size = await this.calculate_batch_size()
        const intentful_kind_refs = await this.providerDb.get_intentful_kinds()
        const entities = await this.specDb.list_random_intentful_specs(batch_size, intentful_kind_refs)

        for (let [metadata, _] of entities) {
            const ent = create_entry(metadata)
            if (!this.watchlist.has(ent)) {
                this.watchlist.set([ent, []])
            }
        }
        await this.watchlistDb.update_watchlist(this.watchlist)
        this.logger.debug(`END ${this.addRandomEntities.name} in diff resolver`, { tags: [PapieaEngineTags.IntentfulEngine] })
    }
}
