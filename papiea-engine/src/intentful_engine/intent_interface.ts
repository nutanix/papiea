import { Metadata, Spec, IntentWatcher } from "papiea-core"

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

    public static filter(intentWatchers: IntentWatcher[], entities: [Metadata, Spec][]): IntentWatcher[] {
        const watchers: IntentWatcher[] = []
        entities.forEach(entity => {
            intentWatchers.forEach(watcher => {
                if (entity[0].uuid === watcher.entity_ref.uuid && !watchers.includes(watcher)) {
                    watchers.push(watcher)
                }
            })
        })
        return watchers
    }

    public static toResponses(intentWatchers: IntentWatcher[]): Partial<IntentWatcher>[] {
        return intentWatchers.map(watcher => {
            return {
                uuid: watcher.uuid,
                entity_ref: watcher.entity_ref,
                spec_version: watcher.spec_version,
                status: watcher.status,
                created_at: watcher.created_at
            }
        })
    }
}
