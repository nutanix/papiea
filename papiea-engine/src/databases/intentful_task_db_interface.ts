import { SortParams } from "../entity/entity_api_impl"
import { IntentfulTask } from "../tasks/task_interface"
import { Provider, Kind } from "papiea-core"

export interface IntentfulTask_DB {

    create_task(task: IntentfulTask): Promise<void>

    list_tasks(fields_map: any, sortParams?: SortParams): Promise<IntentfulTask[]>

    list_provider_tasks(provider: Provider): Promise<[string, IntentfulTask[]][]>

    list_kind_tasks(kind: Kind): Promise<IntentfulTask[]>

    get_task(uuid: string): Promise<IntentfulTask>

    update_task(uuid: string, delta: Partial<IntentfulTask>): Promise<void>

    delete_task(uuid: string): Promise<void>

}