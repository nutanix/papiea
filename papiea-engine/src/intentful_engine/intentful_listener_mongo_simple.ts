import { Status, Spec, Entity } from "papiea-core"
import { Handler, IntentfulListener } from "./intentful_listener_interface"
import { Watchlist } from "./watchlist"
import { Status_DB } from "../databases/status_db_interface"
import { timeout } from "../utils/utils"
import { Spec_DB } from "../databases/spec_db_interface";
import deepEqual = require("deep-equal");
import {Watchlist_DB} from "../databases/watchlist_db_interface";

export class IntentfulListenerMongo implements IntentfulListener {
    onChange: Handler<(entity: Entity) => Promise<void>>;
    private watchlistDb: Watchlist_DB
    private entities: Map<string, [Spec, Status]>
    private statuses: Map<string, Status>
    private specs: Map<string, Spec>
    private specDb: Spec_DB
    private statusDb: Status_DB

    private async check_watchlist_changes(): Promise<void> {
        const entries = await this.watchlistDb.edit_watchlist(
            async watchlist => watchlist.entries());
        const uuids = Object.values(entries).map(ent => ent[0].entity_reference.uuid)
        const metadata_specs = await this.specDb.list_specs_in(uuids)
        const metadata_statuses = await this.statusDb.list_status_in(uuids)
        for (let i in metadata_specs) {
            // These are guaranteed to be in order because they are sorted by uuids
            const [metadata, spec] = metadata_specs[i]
            const [, status] = metadata_statuses[i]
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

    constructor(statusDb: Status_DB, specDb: Spec_DB, watchlistDb: Watchlist_DB) {
        this.statusDb = statusDb
        this.specDb = specDb
        this.onChange = new Handler()
        this.watchlistDb = watchlistDb
        this.entities = new Map<string, [Spec, Status]>()
        this.statuses = new Map<string, Status>()
        this.specs = new Map<string, Spec>()
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
