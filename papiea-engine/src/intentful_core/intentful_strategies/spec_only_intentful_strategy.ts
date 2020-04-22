import { Spec_DB } from "../../databases/spec_db_interface"
import { Status_DB } from "../../databases/status_db_interface"
import { IntentfulStrategy } from "./intentful_strategy_interface"
import { Metadata, Spec } from "papiea-core"
import { IntentfulTask } from "../../tasks/task_interface"

export class SpecOnlyIntentfulStrategy extends IntentfulStrategy {
    constructor(specDb: Spec_DB, statusDb: Status_DB) {
        super(specDb, statusDb)
    }

    // Replace spec and status with spec changes received
    async update_entity(metadata: Metadata, spec: Spec): Promise<Spec> {
        const [updatedMetadata, updatedSpec] = await this.specDb.update_spec(metadata, spec);
        await this.statusDb.replace_status(metadata, spec)
        return [updatedMetadata, updatedSpec]
    }

    // Update spec and status with spec changes received
    async update(metadata: Metadata, spec: Spec): Promise<IntentfulTask | null> {
        await this.update_entity(metadata, spec)
        return null
    }

    // Create status with spec
    async create(metadata: Metadata, spec: Spec): Promise<[Metadata, Spec]> {
        return this.create_entity(metadata, spec)
    }

    // Simply delete from DB both spec and status
    async delete(metadata: Metadata): Promise<void> {
        return this.delete_entity(metadata)
    }
}