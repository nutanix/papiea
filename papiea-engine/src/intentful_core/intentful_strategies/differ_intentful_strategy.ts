import { IntentfulStrategy } from "./intentful_strategy_interface"
import { Differ, Metadata, Spec, IntentWatcher, Status, Entity } from "papiea-core"
import { IntentWatcher_DB } from "../../databases/intent_watcher_db_interface"
import { EntityCreateOrUpdateResult, IntentfulStatus } from "papiea-core"
import { Watchlist_DB } from "../../databases/watchlist_db_interface";
import uuid = require("uuid")
import { create_entry } from "../../intentful_engine/watchlist";
import { Graveyard_DB } from "../../databases/graveyard_db_interface"
import {RequestContext, spanOperation} from "papiea-backend-utils"
import { Entity_DB } from "../../databases/entity_db_interface"

export class DifferIntentfulStrategy extends IntentfulStrategy {
    protected differ: Differ
    protected intentWatcherDb: IntentWatcher_DB
    protected watchlistDb: Watchlist_DB;

    constructor(entityDb: Entity_DB, graveyardDb: Graveyard_DB, differ: Differ, intentWatcherDb: IntentWatcher_DB, watchlistDb: Watchlist_DB) {
        super(entityDb, graveyardDb)
        this.differ = differ
        this.intentWatcherDb = intentWatcherDb
        this.watchlistDb = watchlistDb
    }

    async update_entity(metadata: Metadata, spec: Spec): Promise<Entity> {
        await this.entityDb.update_spec(metadata, spec);
        const updatedEntity = await this.entityDb.get_entity(metadata)
        return updatedEntity
    }

    async update(metadata: Metadata, spec: Spec, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        const statusSpan = spanOperation(`get_entity_db`,
                                   ctx.tracing_ctx,
                                   {entity_uuid: metadata.uuid})
        statusSpan.finish()
        let watcher_spec_version = metadata.spec_version + 1
        const updateSpan = spanOperation(`update_entity_db`,
                                   ctx.tracing_ctx,
                                   {entity_uuid: metadata.uuid})
        const updatedEntity = await this.update_entity(metadata, spec)
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
        for (let diff of this.differ.diffs(this.kind!, updatedEntity.spec, updatedEntity.status)) {
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
            ...updatedEntity
        }
    }
}
