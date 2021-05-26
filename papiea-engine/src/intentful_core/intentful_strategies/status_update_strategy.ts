import { EntityCreateOrUpdateResult, Status, Kind, Differ, Diff, EntityStatusUpdateInput } from "papiea-core";
import { UserAuthInfo } from "../../auth/authn";
import { Watchlist_DB } from "../../databases/watchlist_db_interface";
import { create_entry } from "../../intentful_engine/watchlist";
import {RequestContext, spanOperation} from "papiea-backend-utils"
import { PapieaException } from "../../errors/papiea_exception"
import { Entity_DB } from "../../databases/entity_db_interface";

export abstract class StatusUpdateStrategy {
    entityDb: Entity_DB
    kind?: Kind
    user?: UserAuthInfo

    protected constructor(entityDb: Entity_DB) {
        this.entityDb = entityDb
    }

    async update(metadata: EntityStatusUpdateInput, status: Status, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        await this.entityDb.update_status(metadata, status);
        const updatedEntity = await this.entityDb.get_entity(metadata)
        return {
            intent_watcher: null,
            ...updatedEntity
        }
    }

    async replace(metadata: EntityStatusUpdateInput, status: Status, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        await this.entityDb.replace_status(metadata, status);
        const updatedEntity = await this.entityDb.get_entity(metadata)
        return {
            intent_watcher: null,
            ...updatedEntity
        }
    }

    setKind(kind: Kind) {
        this.kind = kind
    }

    setUser(user: UserAuthInfo) {
        this.user = user
    }
}

export class SpecOnlyUpdateStrategy extends StatusUpdateStrategy {
    constructor(entityDb: Entity_DB) {
        super(entityDb)
    }

    async update(metadata: EntityStatusUpdateInput, status: Status): Promise<any> {
        throw new PapieaException({ message: `Cannot update status for spec-only entity. Verify the entity and entity type.`, entity_info: { provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid }}})
    }

    async replace(metadata: EntityStatusUpdateInput, status: Status): Promise<any> {
        throw new PapieaException({ message: `Cannot replace status for spec-only entity. Verify the entity and entity type.`, entity_info: { provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid }}})
    }
}

export class BasicUpdateStrategy extends StatusUpdateStrategy {
    constructor(entityDb: Entity_DB) {
        super(entityDb)
    }
}

export class DifferUpdateStrategy extends StatusUpdateStrategy {
    private readonly differ: Differ
    private readonly watchlistDb: Watchlist_DB

    constructor(entityDb: Entity_DB, differ: Differ, watchlistDb: Watchlist_DB) {
        super(entityDb)
        this.differ = differ
        this.watchlistDb = watchlistDb
    }

    async update(metadata: EntityStatusUpdateInput, status: Status, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        let diffs: Diff[] = []
        const getSpecSpan = spanOperation(`get_entity_db`,
                                   ctx.tracing_ctx)
        const { spec } = await this.entityDb.get_entity(metadata)
        getSpecSpan.finish()
        for (let diff of this.differ.diffs(this.kind!, spec, status)) {
            diffs.push(diff)
        }
        await this.watchlistDb.edit_watchlist(async watchlist => {
            const ent = create_entry(metadata)
            if (!watchlist.has(ent)) {
                watchlist.set([ent, []])
            }
        })
        const span = spanOperation(`update_status_db`,
                                   ctx.tracing_ctx)
        const res = await super.update(metadata, status, ctx)
        span.finish()
        return res
    }

    async replace(metadata: EntityStatusUpdateInput, status: Status, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        const span = spanOperation(`replace_status_db`,
                                   ctx.tracing_ctx)
        const res = await super.replace(metadata, status, ctx);
        span.finish()
        return res
    }
}
