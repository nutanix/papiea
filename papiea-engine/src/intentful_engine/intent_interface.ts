import { IntentWatcher, Entity } from "papiea-core"
import * as Async from "../utils/async"

export class IntentWatcherMapper {
    public static toResponse(intentWatcher: IntentWatcher): Partial<IntentWatcher> {
        return {
            uuid: intentWatcher.uuid,
            entity_ref: intentWatcher.entity_ref,
            spec_version: intentWatcher.spec_version,
            status: intentWatcher.status,
            created_at: intentWatcher.created_at,
        }
    }

    public static filter(intentWatchers: AsyncIterable<IntentWatcher>, entities: Entity[]): AsyncIterable<IntentWatcher> {
        return Async.filter(intentWatchers, async watcher =>
            !!entities.find(entity => entity.metadata.uuid === watcher.entity_ref.uuid));
    }

    public static toResponses(intentWatchers: AsyncIterable<IntentWatcher>): AsyncIterable<Partial<IntentWatcher>> {
        return Async.map(intentWatchers, async watcher => ({
                uuid: watcher.uuid,
                entity_ref: watcher.entity_ref,
                spec_version: watcher.spec_version,
                status: watcher.status,
                created_at: watcher.created_at
            }))
    }
}
