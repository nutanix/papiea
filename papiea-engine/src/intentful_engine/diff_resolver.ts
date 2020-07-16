// [[file:~/work/papiea-js/Papiea-design.org::*/src/intentful_engine/task_manager_interface.ts][/src/intentful_engine/task_manager_interface.ts:1]]
import { getRandomInt, timeout } from "../utils/utils"
import { Spec_DB } from "../databases/spec_db_interface"
import { Status_DB } from "../databases/status_db_interface"
import { create_entry, Delay, EntryReference, Watchlist } from "./watchlist"
import { Watchlist_DB } from "../databases/watchlist_db_interface";
import { Differ, Diff, Metadata, Spec, Status, Kind, Provider } from "papiea-core";
import { Provider_DB } from "../databases/provider_db_interface";
import axios from "axios"
import { IntentfulContext } from "../intentful_core/intentful_context";
import { Logger } from "papiea-backend-utils";
import { Handler } from "./intentful_listener_interface";
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

    onIntentfulHandlerFail: Handler<(entity: EntryReference, error_msg?: string) => Promise<void>>

    constructor(watchlist: Watchlist, watchlistDb: Watchlist_DB, specDb: Spec_DB, statusDb: Status_DB, providerDb: Provider_DB, differ: Differ, intentfulContext: IntentfulContext, logger: Logger, batchSize: number) {
        this.specDb = specDb
        this.statusDb = statusDb
        this.watchlistDb = watchlistDb
        this.providerDb = providerDb
        this.watchlist = watchlist
        this.differ = differ
        this.intentfulContext = intentfulContext
        this.logger = logger
        this.batchSize = batchSize
        this.onIntentfulHandlerFail = new Handler()
    }

    public async run(delay: number) {
        try {
            await this._run(delay)
        } catch (e) {
            console.error(e)
            throw e
        }
    }

    private async _run(delay: number) {
        while (true) {
            await timeout(delay)
            await this.updateWatchlist()
            await this.resolveDiffs()
            await this.addRandomEntities()
        }
    }

    private async updateWatchlist() {
        try {
            const updated_watchlist = await this.watchlistDb.get_watchlist()
            this.watchlist.update(updated_watchlist)
        } catch (e) {
            return
        }
    }

    private async rediff(entry_reference: EntryReference): Promise<RediffResult | null> {
        try {
            const [metadata, spec] = await this.specDb.get_spec(entry_reference.entity_reference)
            const [, status] = await this.statusDb.get_status({...entry_reference.provider_reference, ...entry_reference.entity_reference})
            const provider = await this.providerDb.get_provider(entry_reference.provider_reference.provider_prefix, entry_reference.provider_reference.provider_version)
            const kind = this.providerDb.find_kind(provider, metadata.kind)
            return {
                diffs: this.differ.all_diffs(kind, spec, status),
                metadata, provider, kind, spec, status,
            };
        } catch (e) {
            this.logger.debug(`Couldn't rediff entity with uuid ${entry_reference.entity_reference.uuid}: ${e}. Removing from watchlist`)
            return null
        }
    }

    private async launchOperation({diff, metadata, provider, kind, spec, status}: DiffWithContext): Promise<[Diff, Delay]> {
        let delay_time: number | undefined = undefined
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
        if (result.data.delay_secs !== undefined
            && result.data.delay_secs !== null && !Number.isNaN(result.data.delay_secs)) {
            delay_time = result.data.delay_secs
        }
        const delay = {
            delay_seconds: delay_time ?? kind.diff_delay ?? getRandomInt(10, 20),
            delaySetTime: new Date()
        }
        // This should be a concrete address of a handling process
        diff.handler_url = `${diff.intentful_signature.base_callback}/healthcheck`
        return [diff, delay]
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

    private async resolveDiffs() {
        const entries = this.watchlist.entries()

        for (let key in entries) {
            if (!entries.hasOwnProperty(key)) {
                continue
            }
            let [entry_reference, current_diff, current_delay] = entries[key]
            this.logger.debug(`Diff engine processing ${entry_reference.provider_reference.provider_prefix}/${entry_reference.provider_reference.provider_version}/${entry_reference.entity_reference.kind} entity with uuid: ${entry_reference.entity_reference.uuid}`)
            let rediff: RediffResult | null = null
            if (current_diff && current_delay) {
                // Delay for rediffing
                if ((new Date().getTime() - current_delay.delaySetTime.getTime()) / 1000 > current_delay.delay_seconds) {
                    rediff = await this.rediff(entry_reference)
                    if (!rediff) {
                        await this.removeFromWatchlist(entry_reference)
                        continue
                    }
                    const diff_index = rediff.diffs.findIndex(diff => deepEqual(diff, current_diff!.diff_fields))
                    // Diff still exists, we should check the health and retry if not healthy
                    if (diff_index !== -1) {
                        try {
                            if (await this.checkHealthy(rediff.diffs![diff_index])) {
                                continue
                            }
                            this.logger.info(`Starting to retry resolving diff for entity with uuid: ${rediff.metadata!.uuid}`)
                            const [, delay] = await this.launchOperation({diff: rediff.diffs[diff_index], ...rediff})
                            entries[key][2] = delay
                            continue
                        } catch (e) {
                            this.logger.debug(`Couldn't invoke retry handler for entity with uuid ${rediff.metadata!.uuid}: ${e}`)
                            entries[key][2] = {
                                delay_seconds: getRandomInt(10, 20),
                                delaySetTime: new Date()
                            }
                            const error_msg = e?.response?.data?.message
                            await this.onIntentfulHandlerFail.call(entry_reference, error_msg)
                            continue
                        }
                    }
                } else {
                    // Time for rediff hasn't come, continuing
                    continue
                }
            }
            // Check if we have already rediffed this entity
            if (!rediff) {
                rediff = await this.rediff(entry_reference)
                if (!rediff) {
                    await this.removeFromWatchlist(entry_reference)
                    continue
                }
            }
            if (rediff.diffs.length === 0) {
                await this.removeFromWatchlist(entry_reference)
                continue
            }
            // No active diffs found, choosing the next one
            const result = await this.startNewDiffResolution(entry_reference, rediff)
            if (result === null) {
                await this.removeFromWatchlist(entry_reference)
                continue
            }
            const new_diff = result![0]
            const new_delay = result![1]
            entries[key][1] = new_diff
            entries[key][2] = new_delay
        }
        await this.watchlistDb.update_watchlist(this.watchlist)
    }

    private async calculate_batch_size(): Promise<number> {
        return this.batchSize
    }

    private async startNewDiffResolution(entry_reference: EntryReference, rediff: RediffResult): Promise<null | [Diff, Delay]> {
        const {diffs, metadata, provider, kind} = rediff
        let next_diff: Diff
        const diff_selection_strategy = this.intentfulContext.getDiffSelectionStrategy(kind!)
        try {
            next_diff = diff_selection_strategy.selectOne(diffs)
        } catch (e) {
            this.logger.debug(`Entity with uuid ${metadata!.uuid}: ${e}`)
            return null
        }
        try {
            const [executing_diff, execution_delay] = await this.launchOperation({diff: next_diff, ...rediff})
            this.logger.info(`Starting to resolve diff for ${provider.prefix}/${provider.version}/${kind.name} entity with uuid: ${metadata!.uuid}`)
            return [executing_diff, execution_delay]
        } catch (e) {
            this.logger.debug(`Couldn't invoke handler for entity with uuid ${metadata!.uuid}: ${e}`)
            const delay = {
                delay_seconds: getRandomInt(10, 20),
                delaySetTime: new Date()
            }
            const diff = next_diff
            // This should be a concrete address of a handling process
            diff!.handler_url = `${next_diff.intentful_signature.base_callback}/healthcheck`
            const error_msg = e?.response?.data?.message
            await this.onIntentfulHandlerFail.call(entry_reference, error_msg)
            return [diff, delay]
        }
    }

    // This method is needed to avoid race condition
    // when diffs may be added between the check and removing from the watchlist
    // the batch size maybe static or dynamic
    private async addRandomEntities() {
        const batch_size = await this.calculate_batch_size()
        const intentful_kind_refs = await this.providerDb.get_intentful_kinds()
        const entities = await this.specDb.list_random_intentful_specs(batch_size, intentful_kind_refs)

        for (let [metadata, _] of entities) {
            const ent = create_entry(metadata)
            if (!this.watchlist.has(ent)) {
                this.watchlist.set([ent, undefined, undefined])
            }
        }
        return this.watchlistDb.update_watchlist(this.watchlist)
    }
}
