import {EntityCreationStrategy} from "./entity_creation_strategy_interface"
import {IntentfulBehaviour, EntityCreateOrUpdateResult, Metadata, Spec, Status} from "papiea-core"
import {create_entry} from "../../intentful_engine/watchlist"
import {Graveyard_DB} from "../../databases/graveyard_db_interface"
import {Watchlist_DB} from "../../databases/watchlist_db_interface"
import {Validator} from "../../validator"
import {Authorizer} from "../../auth/authz"
import {RequestContext, spanOperation} from "papiea-backend-utils"
import {ValidationError} from "../../errors/validation_error"
import { Entity_DB } from "../../databases/entity_db_interface"

export class BasicEntityCreationStrategy extends EntityCreationStrategy {
    public async create(input: {metadata: Metadata, spec: Spec}, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        const metadata = await this.create_metadata(input.metadata ?? {})
        if (input.spec === undefined || input.spec === null) {
            throw new ValidationError({
                message: `Spec is missing for entity of kind: ${metadata.provider_prefix}/${metadata.provider_version}/${metadata.kind}. Make sure you provide spec as input.`,
                entity_info: { provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid }}})
        }
        await this.validate_entity({metadata, spec: input.spec, status: input.spec})
        const span = spanOperation(`save_entity_db`,
                                   ctx.tracing_ctx)
        const { metadata: created_metadata, spec } = await this.create_entity(metadata, input.spec)
        span.finish()
        if (this.kind?.intentful_behaviour === IntentfulBehaviour.Differ) {
            await this.watchlistDb.edit_watchlist(async watchlist => {
                const ent = create_entry(created_metadata)
                if (!watchlist.has(ent)) {
                    watchlist.set([ent, []])
                }
            });
        }
        return {
            intent_watcher: null,
            metadata: created_metadata,
            spec: spec,
            status: spec
        }
    }

    public constructor(entityDb: Entity_DB, graveyardDb: Graveyard_DB, watchlistDb: Watchlist_DB, validator: Validator, authorizer: Authorizer) {
        super(entityDb, graveyardDb, watchlistDb, validator, authorizer)
    }
}
