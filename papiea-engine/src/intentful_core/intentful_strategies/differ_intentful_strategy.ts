import { IntentfulStrategy } from "./intentful_strategy_interface"
import { Spec_DB } from "../../databases/spec_db_interface"
import { Status_DB } from "../../databases/status_db_interface"
import { Differ, Metadata, Spec, IntentWatcher, Status } from "papiea-core"
import { IntentWatcher_DB } from "../../databases/intent_watcher_db_interface"
import { EntityCreateOrUpdateResult, IntentfulStatus } from "papiea-core"
import { Watchlist_DB } from "../../databases/watchlist_db_interface";
import uuid = require("uuid")
import { create_entry } from "../../intentful_engine/watchlist";
import { Graveyard_DB } from "../../databases/graveyard_db_interface"
import {RequestContext, spanOperation} from "papiea-backend-utils"

export class DifferIntentfulStrategy extends IntentfulStrategy {
    protected differ: Differ
    protected intentWatcherDb: IntentWatcher_DB
    protected watchlistDb: Watchlist_DB;

    constructor(specDb: Spec_DB, statusDb: Status_DB, graveyardDb: Graveyard_DB, differ: Differ, intentWatcherDb: IntentWatcher_DB, watchlistDb: Watchlist_DB) {
        super(specDb, statusDb, graveyardDb)
        this.differ = differ
        this.intentWatcherDb = intentWatcherDb
        this.watchlistDb = watchlistDb
    }

    async update_entity(metadata: Metadata, spec: Spec): Promise<[Metadata, Spec, Status]> {
        await this.specDb.update_spec(metadata, spec);
        const [updatedMetadata, updatedSpec, updatedStatus] = await this.specDb.get_spec_status(metadata)
        return [updatedMetadata, updatedSpec, updatedStatus]
    }

    async update(metadata: Metadata, spec: Spec, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        const statusSpan = spanOperation(`get_status_db`,
                                   ctx.tracing_ctx,
                                   {entity_uuid: metadata.uuid})
        statusSpan.finish()
        let watcher_spec_version = metadata.spec_version + 1
        const updateSpan = spanOperation(`update_entity_db`,
                                   ctx.tracing_ctx,
                                   {entity_uuid: metadata.uuid})
        const [updated_metadata, updated_spec, updated_status] = await this.update_entity(metadata, spec)
        // console.debug(`[DELAY_DEBUG] Updated the entity with uuid: ${metadata.uuid}`)
        updateSpan.finish()
        const watcher: IntentWatcher = {
            uuid: uuid(),
            entity_ref: {
                uuid: metadata.uuid,
                kind: metadata.kind,
                provider_prefix: metadata.provider_prefix,
                provider_version: metadata.provider_version,
            },
            diffs: [],
            spec_version: watcher_spec_version,
            user: this.user,
            status: IntentfulStatus.Active,
        }
        for (let diff of this.differ.diffs(this.kind!, updated_spec, updated_status)) {
            watcher.diffs.push(diff)
        }
        const watcherSpan = spanOperation(`create_watcher_db`,
                                   ctx.tracing_ctx,
                                   {entity_uuid: metadata.uuid})
        await this.intentWatcherDb.save_watcher(watcher)
        // console.debug(`[DELAY_DEBUG] Saved the intent watcher for update entity: ${metadata.uuid} with id: ${watcher.uuid}`)
        watcherSpan.finish()
        await this.watchlistDb.edit_watchlist(async watchlist => {
            const ent = create_entry(metadata)
            if (!watchlist.has(ent)) {
                watchlist.set([ent, []])
            }
            return ent;
        });
        // console.debug(`[DELAY_DEBUG] Added entry in watchlist for entity: ${metadata.uuid}`)
        // console.debug(`[DELAY_DEBUG] ${JSON.stringify(ent)}`)
        return {
            intent_watcher: watcher,
            metadata: updated_metadata,
            spec: updated_spec,
            status: updated_status
        }
    }
}
