import { SortParams } from "../entity/entity_api_impl"
import { IntentWatcher } from "papiea-core"

export interface IntentWatcher_DB {

    save_watcher(watcher: IntentWatcher): Promise<void>

    list_watchers(fields_map: any, sortParams?: SortParams): AsyncIterable<IntentWatcher>

    get_watcher(uuid: string): Promise<IntentWatcher>

    update_watcher(uuid: string, delta: Partial<IntentWatcher>): Promise<void>

    delete_watcher(uuid: string): Promise<void>
}
