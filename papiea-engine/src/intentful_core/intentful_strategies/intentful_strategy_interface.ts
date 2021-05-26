import { Metadata, Spec, Kind, Entity, EntityCreateOrUpdateResult, Status } from "papiea-core"
import { UserAuthInfo } from "../../auth/authn"
import axios from "axios"
import { OnActionError } from "../../errors/on_action_error";
import { Graveyard_DB } from "../../databases/graveyard_db_interface"
import {
    GraveyardConflictingEntityError
} from "../../databases/utils/errors"
import {RequestContext, spanOperation} from "papiea-backend-utils"
import {UnauthorizedError} from "../../errors/permission_error"
import { Entity_DB } from "../../databases/entity_db_interface"

export abstract class IntentfulStrategy {
    protected readonly entityDb: Entity_DB
    protected readonly graveyardDb: Graveyard_DB
    protected kind?: Kind
    protected user?: UserAuthInfo

    protected constructor(entityDb: Entity_DB, graveyardDb: Graveyard_DB) {
        this.entityDb = entityDb
        this.graveyardDb = graveyardDb
    }

    protected async check_spec_version(metadata: Metadata, spec_version: number, spec: Spec) {
        const exists = await this.graveyardDb.check_spec_version_exists(metadata, spec_version)
        if (exists) {
            const highest_spec_version = await this.graveyardDb.get_highest_spec_version(metadata)
            metadata.spec_version = spec_version
            throw new GraveyardConflictingEntityError(metadata, highest_spec_version)
        }
    }

    async update_entity(metadata: Metadata, spec: Spec): Promise<Entity> {
        await this.check_spec_version(metadata, metadata.spec_version, spec)
        await this.entityDb.update_spec(metadata, spec);
        await this.entityDb.update_status(metadata, spec)
        const updatedEntity = await this.entityDb.get_entity(metadata)
        return updatedEntity
    }

    async delete_entity(entity: Entity): Promise<void> {
        await this.graveyardDb.dispose(entity)
    }

    async update(metadata: Metadata, spec: Spec, ctx: RequestContext): Promise<EntityCreateOrUpdateResult> {
        const updatedEntity = await this.update_entity(metadata, spec)
        return {
            intent_watcher: null,
            ...updatedEntity
        }
    }

    protected async invoke_destructor(procedure_name: string, entity: Entity, ctx: RequestContext): Promise<void> {
        if (this.kind) {
            if (this.kind.kind_procedures[procedure_name]) {
                if (this.user === undefined) {
                    throw new UnauthorizedError({ message: `No user provided in the delete entity request for kind: ${entity.metadata?.provider_prefix}/${entity.metadata?.provider_version}/${entity.metadata?.kind}. Make sure you have a correct user.`, entity_info: { provider_prefix: entity.metadata?.provider_prefix, provider_version: entity.metadata?.provider_version, kind_name: entity.metadata?.kind, additional_info: { "entity_uuid": entity.metadata?.uuid ?? '', "procedure_name": procedure_name }}})
                }
                try {
                    const span = spanOperation(`destructor`,
                                               ctx.tracing_ctx,
                                               {entity_uuid: entity.metadata?.uuid})
                    const { data } =  await axios.post(this.kind.kind_procedures[procedure_name].procedure_callback, {
                        input: entity
                    }, { headers: this.user })
                    span.finish()
                    return data
                } catch (e) {
                    throw new OnActionError({ message: `Failed to execute destructor for entity of kind: ${entity.metadata?.provider_prefix}/${entity.metadata?.provider_version}/${entity.metadata?.kind}.`, entity_info: { provider_prefix: entity.metadata?.provider_prefix, provider_version: entity.metadata?.provider_version, kind_name: entity.metadata?.kind, additional_info: { "entity_uuid": entity.metadata?.uuid ?? '', "procedure_name": procedure_name }}, cause: e })
                }
            }
        } else {
            throw new OnActionError({ message: `Could not delete the entity since kind: ${entity.metadata?.provider_prefix}/${entity.metadata?.provider_version}/${entity.metadata?.kind} is not defined for the strategy.`, entity_info: { provider_prefix: entity.metadata?.provider_prefix, provider_version: entity.metadata?.provider_version, kind_name: entity.metadata?.kind, additional_info: { "entity_uuid": entity.metadata?.uuid ?? '', "procedure_name": procedure_name }}})
        }
    }

    setKind(kind: Kind): void {
        this.kind = kind
    }

    setUser(user: UserAuthInfo) {
        this.user = user
    }

    async delete(entity: Entity, ctx: RequestContext): Promise<void> {
        await this.invoke_destructor(`__${entity.metadata.kind}_delete`, entity, ctx)
        const span = spanOperation(`delete_entity_db`,
                                   ctx.tracing_ctx,
                                   {entity_uuid: entity.metadata.uuid})
        await this.delete_entity(entity)
        span.finish()
    }
}
