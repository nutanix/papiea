import { IntentfulStrategy } from "./intentful_strategy_interface"
import { EntityCreateOrUpdateResult, Metadata, Spec, Status, Entity } from "papiea-core"
import { Graveyard_DB } from "../../databases/graveyard_db_interface"
import {RequestContext, spanOperation} from "papiea-backend-utils"
import { Entity_DB } from "../../databases/entity_db_interface"

export class SpecOnlyIntentfulStrategy extends IntentfulStrategy {
    constructor(entityDb: Entity_DB, graveyardDb: Graveyard_DB) {
        super(entityDb, graveyardDb)
    }

    // Replace spec and status with spec changes received
    async update_entity(metadata: Metadata, spec: Spec): Promise<Entity> {
        await this.entityDb.update_spec(metadata, spec);
        await this.entityDb.replace_status(metadata, spec)
        const updatedEntity = await this.entityDb.get_entity(metadata)
        return updatedEntity
    }

    // Update spec and status with spec changes received
    async update(metadata: Metadata, spec: Spec, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        const span = spanOperation(`update_entity_db`,
                                   ctx.tracing_ctx,
                                   {entity_uuid: metadata.uuid})
        const updatedEntity = await this.update_entity(metadata, spec)
        span.finish()
        return {
            intent_watcher: null,
            ...updatedEntity
        }
    }
}
