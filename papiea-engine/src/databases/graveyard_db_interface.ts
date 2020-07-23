import { SortParams } from "../entity/entity_api_impl"
import { Provider_Entity_Reference, Entity } from "papiea-core"

export interface Graveyard_DB {
    dispose(entity: Entity): Promise<void>

    save_to_graveyard(entity: Entity): Promise<void>

    delete_entity(entity_ref: Provider_Entity_Reference): Promise<void>

    list_entities(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<Entity[]>

    get_entity(entity_ref: Provider_Entity_Reference): Promise<Entity>
}
