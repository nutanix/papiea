import * as express from "express"

import { logLevelFromString, LoggerFactory } from "papiea-backend-utils"

import { ProviderAPIImpl } from "./provider/provider_api_impl"
import { MongoConnection } from "./databases/mongo"
import { createEntityAPIRouter } from "./entity/entity_routes"
import { EntityAPIImpl } from "./entity/entity_api_impl"
import {
    createAuthnRouter, CompositeUserAuthInfoExtractor, AdminUserAuthInfoExtractor,
} from "./auth/authn"
import { createOAuth2Router } from "./auth/oauth2"
import { S2SKeyUserAuthInfoExtractor } from "./auth/s2s"
import { Authorizer, AdminAuthorizer, PerProviderAuthorizer } from "./auth/authz"
import { ValidatorImpl } from "./validator"
import { ProviderCasbinAuthorizerFactory } from "./auth/casbin"
import { PapieaErrorResponseImpl } from "./errors/papiea_error_impl"
import { SessionKeyAPI, SessionKeyUserAuthInfoExtractor } from "./auth/session_key"
import { IntentfulContext } from "./intentful_core/intentful_context"
import { AuditLogger } from "./audit_logging"
import { BasicDiffer } from "./intentful_core/differ_impl"
import { ApiDocsGenerator } from "./api_docs/api_docs_generator"
import { createProviderAPIRouter } from "./provider/provider_routes"
import { createAPIDocsRouter } from "./api_docs/api_docs_routes"

const cookieParser = require("cookie-parser")

declare var process: {
    env: {
        SERVER_PORT: string,
        MONGO_DB: string,
        MONGO_URL: string,
        PAPIEA_PUBLIC_URL: string,
        DEBUG_LEVEL: string,
        PAPIEA_ADMIN_S2S_KEY: string,
        LOGGING_LEVEL: string
        PAPIEA_DEBUG: string,
        DELETED_TASK_PERSIST_SECONDS: string,
    },
    title: string;
}
process.title = "papiea"
const serverPort = parseInt(process.env.SERVER_PORT || "3000", 10)
const publicAddr: string = process.env.PAPIEA_PUBLIC_URL || "http://localhost:3000"
const oauth2RedirectUri: string = `${ publicAddr }/provider/auth/callback`
const mongoUrl = process.env.MONGO_URL || "mongodb://mongo:27017"
const mongoDb = process.env.MONGO_DB || "papiea"
const adminKey = process.env.PAPIEA_ADMIN_S2S_KEY || ""
const loggingLevel = logLevelFromString(process.env.LOGGING_LEVEL) ?? "info"
const papieaDebug = process.env.PAPIEA_DEBUG === "true"

async function setUpApplication(): Promise<express.Express> {
    const logger = LoggerFactory.makeLogger({ level: loggingLevel })
    const auditLogger: AuditLogger = new AuditLogger(logger, papieaDebug)
    const app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use(auditLogger.middleware())
    const mongoConnection: MongoConnection = new MongoConnection(mongoUrl, mongoDb)
    await mongoConnection.connect()
    const differ = new BasicDiffer()
    const providerDb = await mongoConnection.get_provider_db(logger)
    const specDb = await mongoConnection.get_spec_db(logger)
    const statusDb = await mongoConnection.get_status_db(logger)
    const s2skeyDb = await mongoConnection.get_s2skey_db(logger)
    const intentfulTaskDb = await mongoConnection.get_intentful_task_db(logger)
    const sessionKeyDb = await mongoConnection.get_session_key_db(logger)
    const watchlistDb = await mongoConnection.get_watchlist_db(logger)
    const validator = new ValidatorImpl()
    const intentfulContext = new IntentfulContext(specDb, statusDb, differ,
                                                  intentfulTaskDb, watchlistDb)
    const providerApi = new ProviderAPIImpl(logger, providerDb, statusDb, s2skeyDb, watchlistDb,
                                            intentfulContext, new AdminAuthorizer(), validator)
    const sessionKeyApi = new SessionKeyAPI(sessionKeyDb)
    const userAuthInfoExtractor = new CompositeUserAuthInfoExtractor([
        new AdminUserAuthInfoExtractor(adminKey),
        new S2SKeyUserAuthInfoExtractor(s2skeyDb),
        new SessionKeyUserAuthInfoExtractor(sessionKeyApi, providerDb),
    ])
    app.use(createAuthnRouter(logger, userAuthInfoExtractor))
    app.use(createOAuth2Router(logger, oauth2RedirectUri, providerDb, sessionKeyApi))
    const entityApiAuthorizer: Authorizer = new PerProviderAuthorizer(
        logger, providerApi, new ProviderCasbinAuthorizerFactory(logger))
    app.use("/provider", createProviderAPIRouter(providerApi))
    app.use("/services", createEntityAPIRouter(
        new EntityAPIImpl(logger, statusDb, specDb, providerDb, intentfulTaskDb,
                          entityApiAuthorizer, validator, intentfulContext),
    ))
    app.use("/api-docs", createAPIDocsRouter(
        "/api-docs", new ApiDocsGenerator(providerDb), providerDb),
    )
    app.use((err: any, req: any, res: any, next: any) => {
        if (res.headersSent) {
            return next(err)
        }
        const papieaError = PapieaErrorResponseImpl.create(err)
        res.status(papieaError.status)
        res.json(papieaError.toResponse())
        logger.error(papieaError.toString(), err.stack)
    })
    return app
}

setUpApplication().then(app => {
    app.listen(serverPort, () => {
        console.info(`Papiea app listening on port ${ serverPort }!`)
    })
}).catch(console.error)
