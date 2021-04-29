import { logLevelFromString, LoggerFactory } from "papiea-backend-utils"
import { MongoConnection } from "./databases/mongo"
import { Watchlist } from "./intentful_engine/watchlist"
import { DiffResolver } from "./intentful_engine/diff_resolver"
import { BasicDiffer } from "./intentful_core/differ_impl";
import { IntentfulContext } from "./intentful_core/intentful_context";
import { IntentResolver } from "./intentful_engine/intent_resolver";
import { IntentfulListenerMongo } from "./intentful_engine/intentful_listener_mongo_simple";
import { getCalculateBackoffFn, getEntropyFn } from "./utils/utils"
import { getConfig } from "./utils/arg_parser"
import {ValidatorImpl} from "./validator"
import {Authorizer, NoAuthAuthorizer} from "./auth/authz"

process.title = "papiea_diff_resolver"
const config = getConfig()
const mongoUrl = config.mongo_url
const mongoDb = config.mongo_db
const loggingLevel = logLevelFromString(config.logging_level)
const batchSize = config.entity_batch_size
const deletedWatcherPersists = config.deleted_watcher_persist_time
const papieaDebug = config.debug
const entityPollDelay = config.entity_poll_delay
const intentResolveDelay = config.intent_resolve_delay
const diffResolveDelay = config.diff_resolve_delay
const diffRetryExponent = config.diff_retry_exponent
const verbosityOptions = config.logging_verbosity
const prettyPrint = config.pretty_print

async function setUpDiffResolver() {
    const logger = LoggerFactory.makeLogger({level: loggingLevel, verbosity_options: verbosityOptions, pretty_print: prettyPrint});
    const mongoConnection: MongoConnection = new MongoConnection(mongoUrl, mongoDb);
    await mongoConnection.connect();

    const specDb = await mongoConnection.get_spec_db(logger);
    const statusDb = await mongoConnection.get_status_db(logger);
    const providerDb = await mongoConnection.get_provider_db(logger);
    const intentWatcherDB = await mongoConnection.get_intent_watcher_db(logger)
    const watchlistDb = await mongoConnection.get_watchlist_db(logger)
    const graveyardDb = await mongoConnection.get_graveyard_db(logger)

    const validator = ValidatorImpl.create()
    const noopAuthorizer: Authorizer = new NoAuthAuthorizer();

    const differ = new BasicDiffer()
    const intentfulContext = new IntentfulContext(specDb, statusDb, graveyardDb, differ, intentWatcherDB, watchlistDb, validator, noopAuthorizer)

    const intentfulListenerMongo = new IntentfulListenerMongo(statusDb, specDb, watchlistDb)
    intentfulListenerMongo.run(entityPollDelay)
    const entropyFunction = getEntropyFn(papieaDebug)
    const calculateBackoffFunction = getCalculateBackoffFn(diffRetryExponent, logger)

    const diffResolver = new DiffResolver(watchlistDb, specDb, statusDb, providerDb, differ, intentfulContext, logger, batchSize, entropyFunction, calculateBackoffFunction)

    const intentResolver = new IntentResolver(specDb, statusDb, intentWatcherDB, providerDb, intentfulListenerMongo, differ, watchlistDb, logger)

    console.log("Running diff resolver")
    intentResolver.run(intentResolveDelay, deletedWatcherPersists)
    await diffResolver.run(diffResolveDelay)
}

setUpDiffResolver().then(()=>console.debug("Exiting diff resolver")).catch(console.error)
