import {Spec_DB} from "../databases/spec_db_interface"
import {Status_DB} from "../databases/status_db_interface"
import {IntentWatcher_DB} from "../databases/intent_watcher_db_interface"
import {Provider_DB} from "../databases/provider_db_interface"
import {Handler, IntentfulListener} from "./intentful_listener_interface"
import {Watchlist} from "./watchlist"
import {Diff, DiffContent, Differ, Entity, IntentfulStatus, IntentWatcher} from "papiea-core"
import {timeout} from "../utils/utils"
import {Logger} from "papiea-backend-utils"

export class IntentResolver {
    private readonly specDb: Spec_DB
    private readonly statusDb: Status_DB
    private readonly intentWatcherDb: IntentWatcher_DB
    private readonly providerDb: Provider_DB

    private intentfulListener: IntentfulListener
    private differ: Differ
    private logger: Logger;
    private watchlist: Watchlist;
    private static TERMINAL_STATES = [IntentfulStatus.Completed_Partially, IntentfulStatus.Completed_Successfully, IntentfulStatus.Outdated]

    constructor(specDb: Spec_DB, statusDb: Status_DB,
                intentWatcherDb: IntentWatcher_DB, providerDb: Provider_DB,
                intentfulListener: IntentfulListener, differ: Differ,
                watchlist: Watchlist, logger: Logger)
    {
        this.specDb = specDb
        this.statusDb = statusDb
        this.providerDb = providerDb
        this.intentWatcherDb = intentWatcherDb
        this.logger = logger

        this.onChange = this.onChange.bind(this)

        this.watchlist = watchlist
        this.differ = differ
        this.intentfulListener = intentfulListener
        this.intentfulListener.onChange = new Handler(this.onChange)
    }

    private static getExisting(current_diffs: Diff[], watcher_diff: Diff): Diff | null {
        for (let diff of current_diffs) {
            for (let idx in watcher_diff.diff_fields) {
                const watcher_diff_path = JSON.stringify(watcher_diff.diff_fields[idx].path)
                const current_diff_path = JSON.stringify(diff.diff_fields[idx].path)
                if (watcher_diff_path === current_diff_path) {
                    return diff
                }
            }
        }
        return null
    }

    private pathValuesEqual(diff_fields: DiffContent[], entity: Entity): boolean {
        for (let idx in diff_fields) {
            const current_value = this.differ.get_diff_path_value(diff_fields[idx], entity.spec)
            const diff_value = diff_fields[idx].spec[0]
            if (current_value !== diff_value) {
                return false
            }
        }
        return true
    }

    private static inTerminalState(watcher: IntentWatcher): boolean {
        return this.TERMINAL_STATES.includes(watcher.status)
    }

    private async clearTerminalStateWatchers(watcherExpirySeconds: number) {
        const watchers = await this.intentWatcherDb.list_watchers({})
        for (let watcher of watchers) {
            if (IntentResolver.inTerminalState(watcher)) {
                if (watcher.last_status_changed && (new Date().getTime() - watcher.last_status_changed.getTime()) / 1000 > watcherExpirySeconds) {
                    await this.intentWatcherDb.delete_watcher(watcher.uuid)
                }
            }
        }
    }

    private async rediff(entity: Entity): Promise<Diff[]> {
        const provider = await this.providerDb.get_provider(entity.metadata.provider_prefix, entity.metadata.provider_version)
        const kind = this.providerDb.find_kind(provider, entity.metadata.kind)
        return this.differ.all_diffs(kind, entity.spec, entity.status)
    }

    private async processActiveWatcher(active: IntentWatcher, entity: Entity): Promise<void> {
        const current_spec_version = entity.metadata.spec_version
        const watcher_spec_version = active.spec_version
        const current_diffs = await this.rediff(entity)
        let resolved_diff_count = 0
        const unresolved_diffs = []
        let status: IntentfulStatus
        if (current_spec_version > watcher_spec_version) {
            let affected_diff_count = 0
            for (let watcher_diff of active.diffs) {
                // Current set of diff fields are more up to date, thus replacing
                const existing_diff = IntentResolver.getExisting(current_diffs, watcher_diff)
                if (!this.pathValuesEqual(watcher_diff.diff_fields, entity)) {
                    affected_diff_count++
                } else if (existing_diff) {
                    unresolved_diffs.push(existing_diff)
                } else {
                    resolved_diff_count++
                }
            }
            status = IntentResolver.determineWatcherStatus(affected_diff_count, resolved_diff_count, active)
        } else {
            for (let watcher_diff of active.diffs) {
                // Current set of diff fields are more up to date, thus replacing
                const existing_diff = IntentResolver.getExisting(current_diffs, watcher_diff)
                if (existing_diff) {
                    unresolved_diffs.push(existing_diff)
                } else {
                    resolved_diff_count++
                }
            }
            status = IntentResolver.determineWatcherStatus(0, resolved_diff_count, active)
        }
        await this.intentWatcherDb.update_watcher(active.uuid, { status: status, last_status_changed: new Date(), diffs: unresolved_diffs })
    }

    private static determineWatcherStatus(affected_diff_count: number, resolved_diff_count: number, active: IntentWatcher): IntentfulStatus {
        if (affected_diff_count > 0) {
            if (resolved_diff_count > 0) {
                return IntentfulStatus.Completed_Partially
            }
            if (affected_diff_count === active.diffs.length) {
                return IntentfulStatus.Outdated
            }
        } else if (resolved_diff_count === active.diffs.length) {
            return IntentfulStatus.Completed_Successfully
        }
        return IntentfulStatus.Active
    }

    private async onChange(entity: Entity) {
        try {
            const watchers = await this.intentWatcherDb.list_watchers({ entity_ref: { uuid: entity.metadata.uuid, kind: entity.metadata.kind }, status: IntentfulStatus.Active })
            for (let watcher of watchers) {
                await this.processActiveWatcher(watcher, entity)
            }
        } catch (e) {
            this.logger.debug(`Couldn't process entity with uuid: ${entity.metadata.uuid}`)
        }
    }

    private async updateActiveWatchersStatuses() {
        let entries = this.watchlist.entries();
        for (let key in entries) {
            if (!entries.hasOwnProperty(key)) {
                continue
            }
            const [entry_ref, _] = entries[key]
            const watchers = await this.intentWatcherDb.list_watchers({ entity_ref: entry_ref.entity_reference, status: IntentfulStatus.Active })
            if (watchers.length !== 0) {
                try {
                    const [metadata, spec] = await this.specDb.get_spec(entry_ref.entity_reference)
                    const [, status] = await this.statusDb.get_status({...entry_ref.provider_reference, ...entry_ref.entity_reference})
                    this.onChange({ metadata, spec, status })
                } catch (e) {

                }
            }
        }
    }

    public async run(delay: number, watcherExpirySeconds: number) {
        try {
            await this._run(delay, watcherExpirySeconds)
        } catch (e) {
            console.error(e)
            throw e
        }
    }

    protected async _run(delay: number, watcherExpirySeconds: number) {
        while (true) {
            await timeout(delay)
            this.clearTerminalStateWatchers(watcherExpirySeconds)
            this.updateActiveWatchersStatuses()
        }
    }
}
