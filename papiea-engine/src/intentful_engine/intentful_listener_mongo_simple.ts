import { Status, Spec, Entity } from "papiea-core"
import { Handler, IntentfulListener } from "./intentful_listener_interface"
import { timeout } from "../utils/utils"
import deepEqual = require("deep-equal");
import {Watchlist_DB} from "../databases/watchlist_db_interface";
import { Entity_DB } from "../databases/entity_db_interface"

export class IntentfulListenerMongo implements IntentfulListener {
    onChange: Handler<(entity: Entity) => Promise<void>>;
    private watchlistDb: Watchlist_DB
    private entities: Map<string, [Spec, Status]>
    private entityDb: Entity_DB

    private async check_watchlist_changes(): Promise<void> {
        const entries = await this.watchlistDb.edit_watchlist(
            async watchlist => watchlist.entries());
        const uuids = Object.values(entries).map(ent => ent[0].entity_reference.uuid)
        const metadata_entities = await this.entityDb.list_entities_in(uuids)
        for (const { metadata, spec, status } of metadata_entities) {
            // These are guaranteed to be in order because they are sorted by uuids
            const entry = this.entities.get(metadata.uuid)
            if (!entry) {
                this.entities.set(metadata.uuid, [spec, status])
                continue
            }
            if (!deepEqual(spec, entry[0]) || !deepEqual(status, entry[1])) {
                this.entities.set(metadata.uuid, [spec, status])
                await this.onChange.call({ metadata, spec, status })
            }
        }
    }

    constructor(entityDb: Entity_DB, watchlistDb: Watchlist_DB) {
        this.entityDb = entityDb
        this.onChange = new Handler()
        this.watchlistDb = watchlistDb
        this.entities = new Map<string, [Spec, Status]>()
    }

    public async run(delay: number) {
        try {
            await this._run(delay)
        } catch (e) {
            console.error(`Run method for intentful listener mongo simple failed: ${e}`)
            throw e
        }
    }

    protected async _run(delay: number) {
        while (true) {
            await timeout(delay)
            await this.check_watchlist_changes()
        }
    }
}
