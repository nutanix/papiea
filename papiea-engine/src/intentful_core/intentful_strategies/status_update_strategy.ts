import { Entity_Reference, Status, Kind, Differ, Diff } from "papiea-core"
import { Status_DB } from "../../databases/status_db_interface"
import { UserAuthInfo } from "../../auth/authn"
import { Spec_DB } from "../../databases/spec_db_interface"
import { Watchlist_DB } from "../../databases/watchlist_db_interface"
import { create_entry } from "../../tasks/watchlist"

export abstract class StatusUpdateStrategy {
    statusDb: Status_DB
    kind?: Kind
    user?: UserAuthInfo

    protected constructor(statusDb: Status_DB) {
        this.statusDb = statusDb
    }

    async update(entity_ref: Entity_Reference, status: Status): Promise<any> {
        return this.statusDb.update_status(entity_ref, status)
    }

    async replace(entity_ref: Entity_Reference, status: Status): Promise<any> {
        return this.statusDb.replace_status(entity_ref, status)
    }

    setKind(kind: Kind) {
        this.kind = kind
    }

    setUser(user: UserAuthInfo) {
        this.user = user
    }
}

export class SpecOnlyUpdateStrategy extends StatusUpdateStrategy {
    constructor(statusDb: Status_DB) {
        super(statusDb)
    }

    async update(entity_ref: Entity_Reference, status: Status): Promise<any> {
        throw new Error("Cannot change status of a spec-only kind")
    }

    async replace(entity_ref: Entity_Reference, status: Status): Promise<any> {
        throw new Error("Cannot change status of a spec-only kind")
    }
}

export class BasicUpdateStrategy extends StatusUpdateStrategy {
    constructor(statusDb: Status_DB) {
        super(statusDb)
    }
}

export class DifferUpdateStrategy extends StatusUpdateStrategy {
    private readonly differ: Differ
    private readonly watchlistDb: Watchlist_DB
    private readonly specDb: Spec_DB

    constructor(statusDb: Status_DB, specDb: Spec_DB, differ: Differ, watchlistDb: Watchlist_DB) {
        super(statusDb)
        this.specDb = specDb
        this.differ = differ
        this.watchlistDb = watchlistDb
    }

    async update(entity_ref: Entity_Reference, status: Status): Promise<void> {
        const diffs: Diff[] = []
        const [metadata, spec] = await this.specDb.get_spec(entity_ref)
        for (const diff of this.differ.diffs(this.kind!, spec, status)) {
            diffs.push(diff)
        }
        const watchlist = await this.watchlistDb.get_watchlist()
        if (!watchlist.has(metadata.uuid)) {
            watchlist.set(metadata.uuid, [create_entry(metadata), undefined, undefined])
            await this.watchlistDb.update_watchlist(watchlist)
        }
        await super.update(entity_ref, status)
    }

    async replace(entity_ref: Entity_Reference, status: Status) {
        return this.statusDb.replace_status(entity_ref, status)
    }
}
