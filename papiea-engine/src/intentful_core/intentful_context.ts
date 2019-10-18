import { Spec_DB } from "../databases/spec_db_interface"
import { Status_DB } from "../databases/status_db_interface"
import { IntentfulStrategy } from "./intentful_strategy_interface"
import { BasicIntentfulStrategy } from "./basic_intentful_strategy"
import { IntentfulBehaviour, Kind } from "papiea-core"
import { SpecOnlyIntentfulStrategy } from "./spec_only_intentful_strategy"
import { UserAuthInfo } from "../auth/authn"
import { DifferIntentfulStrategy } from "./differ_intentful_strategy"

export type BehaviourStrategyMap = Map<IntentfulBehaviour, IntentfulStrategy>

export class IntentfulContext {
    private readonly specDb: Spec_DB
    private readonly statusDb: Status_DB
    private readonly behaviourStrategy: BehaviourStrategyMap

    constructor(specDb: Spec_DB, statusDb: Status_DB) {
        this.specDb = specDb
        this.statusDb = statusDb
        this.behaviourStrategy = new Map<IntentfulBehaviour, IntentfulStrategy>()
        this.behaviourStrategy.set(IntentfulBehaviour.Basic, new BasicIntentfulStrategy(specDb, statusDb))
        this.behaviourStrategy.set(IntentfulBehaviour.SpecOnly, new SpecOnlyIntentfulStrategy(specDb, statusDb))
        this.behaviourStrategy.set(IntentfulBehaviour.Differ, new DifferIntentfulStrategy(specDb, statusDb))
    }

    getIntentfulStrategy(kind: Kind, user: UserAuthInfo): IntentfulStrategy {
        const strategy = this.behaviourStrategy.get(kind.intentful_behaviour)
        if (strategy === undefined) {
            throw new Error(`Strategy associated with behaviour: ${kind.intentful_behaviour} not found`)
        }
        strategy.setKind(kind)
        strategy.setUser(user)
        return strategy
    }
}