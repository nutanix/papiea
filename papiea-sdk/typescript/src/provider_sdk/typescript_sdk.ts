import {
    IntentfulCtx_Interface,
    ProceduralCtx_Interface,
    ProcedureDescription,
    Provider as ProviderImpl,
    Provider_Power,
    SecurityApi
} from "./typescript_sdk_interface"
import axios, {AxiosInstance} from "axios"
import {plural} from "pluralize"
import * as express from "express"
import {Express, RequestHandler} from "express"
import * as asyncHandler from "express-async-handler"
import {Server} from "http"
import {ProceduralCtx} from "./typescript_sdk_context_impl"
import {EntityCRUD, intent_watcher_client, IntentWatcherClient, kind_client} from "papiea-client"
import {
    Data_Description,
    Entity,
    ErrorSchemas,
    Intentful_Execution_Strategy,
    Kind,
    Metadata,
    Procedural_Execution_Strategy,
    Procedural_Signature,
    Provider,
    S2S_Key,
    Secret,
    Spec,
    SpecOnlyEntityKind,
    Status,
    UserInfo,
    Version,
} from "papiea-core"
import {getTracer, LoggerFactory} from "papiea-backend-utils"
import { InvocationError, SecurityApiError } from "./typescript_sdk_exceptions"
import {get_papiea_version, spanSdkOperation, validate_error_codes, isAxiosError} from "./typescript_sdk_utils"
import {Tracer} from "opentracing"

class SecurityApiImpl implements SecurityApi {
    readonly provider: ProviderSdk;
    readonly s2s_key: Secret;
    constructor (provider: ProviderSdk, s2s_key: Secret) {
        this.provider = provider
        this.s2s_key = s2s_key
    }
    // Returns the user-info of user with s2skey or the current user
    public async user_info(): Promise<UserInfo> {
        try {
            const url = `${this.provider.get_prefix()}/${this.provider.get_version()}`;
            const {data: user_info } = await this.provider.provider_api_axios.get(`${url}/auth/user_info`, {headers: {'Authorization': `Bearer ${this.s2s_key}`}});
            return user_info
        } catch (e) {
            throw SecurityApiError.fromError(e, `Cannot get user info for provider: ${this.provider.get_prefix()}/${this.provider.get_version()}.`)
        }
    }

    public async list_keys(): Promise<S2S_Key[]>{
        try {
            const url = `${this.provider.get_prefix()}/${this.provider.get_version()}`;
            const {data: keys } = await this.provider.provider_api_axios.get(`${url}/s2skey`, {headers: {'Authorization': `Bearer ${this.s2s_key}`}});
            return keys
        } catch (e) {
            throw SecurityApiError.fromError(e, `Cannot list s2s keys for provider: ${this.provider.get_prefix()}/${this.provider.get_version()}.`)
        }
    }

    public async create_key(new_key: Partial<S2S_Key>): Promise<S2S_Key> {
        try {
            const url = `${this.provider.get_prefix()}/${this.provider.get_version()}`;
            const {data: s2skey } = await this.provider.provider_api_axios.post(`${url}/s2skey`, new_key, {headers: {'Authorization': `Bearer ${this.s2s_key}`}});
            return s2skey
        } catch (e) {
            throw SecurityApiError.fromError(e, `Cannot create s2s key for provider: ${this.provider.get_prefix()}/${this.provider.get_version()}.`)
        }
    }

    public async deactivate_key(key_to_deactivate: string) {
        try {
            const url = `${this.provider.get_prefix()}/${this.provider.get_version()}`;
            const {data: r } = await this.provider.provider_api_axios.put(`${url}/s2skey`, {key: key_to_deactivate, active:false}, {headers: {'Authorization': `Bearer ${this.s2s_key}`}});
            return r
        } catch (e) {
            throw SecurityApiError.fromError(e, `Cannot deactivate s2s key for provider: ${this.provider.get_prefix()}/${this.provider.get_version()}.`)
        }
    }
}

export class ProviderSdk implements ProviderImpl {
    protected readonly _kind: Kind[];
    protected readonly _procedures: { [key: string]: Procedural_Signature };
    protected readonly _server_manager: Provider_Server_Manager;
    protected readonly providerApiAxios: AxiosInstance;
    protected _version: Version | null;
    protected _prefix: string | null;
    protected meta_ext: { [key: string]: string } | null = null;
    protected _provider: Provider | null;
    protected readonly _papiea_url: string;
    protected readonly _s2skey: Secret;
    protected _policy: string | null = null;
    protected _oauth2: string | null = null;
    protected _authModel: any | null = null;
    protected readonly _securityApi : SecurityApi;
    protected readonly _intentWatcherClient : IntentWatcherClient
    protected allowExtraProps: boolean;
    protected readonly _sdk_version: Version;
    protected readonly _tracer: Tracer

    constructor(papiea_url: string, s2skey: Secret, server_manager?: Provider_Server_Manager, allowExtraProps?: boolean, tracer?: Tracer) {
        this._version = null;
        this._prefix = null;
        this._kind = [];
        this._provider = null;
        this._papiea_url = papiea_url;
        this._s2skey = s2skey;
        this._server_manager = server_manager || new Provider_Server_Manager();
        this._tracer = tracer ?? getTracer("papiea-sdk")
        this._procedures = {};
        this.allowExtraProps = allowExtraProps || false;
        this.get_prefix = this.get_prefix.bind(this);
        this.get_version = this.get_version.bind(this);
        this._securityApi = new SecurityApiImpl(this, s2skey);
        this._intentWatcherClient = intent_watcher_client(papiea_url, s2skey)
        this.providerApiAxios = axios.create({
            baseURL: this.provider_url,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this._s2skey}`
            }
        });
        this._sdk_version = get_papiea_version()
    }

    get provider() {
        if (this._provider !== null) {
            return this._provider
        } else {
            throw Error("Failed to create provider")
        }
    }

    get provider_url(): string {
        return `${ this._papiea_url }/provider`
    }

    get papiea_url(): string {
        return this._papiea_url
    }

    get provider_api_axios() {
        return this.providerApiAxios
    }

    get entity_url(): string {
        return `${ this._papiea_url }/services`
    }

    public get_prefix(): string {
        if (this._prefix !== null) {
            return this._prefix
        } else {
            throw new Error("Provider prefix is not set")
        }
    }

    public get_version(): string {
        if (this._version !== null) {
            return this._version
        } else {
            throw new Error("Provider version is not set")
        }
    }

    get server(): Server {
        return this._server_manager.server;
    }

    new_kind(entity_description: Data_Description): Kind_Builder {
        if (Object.keys(entity_description).length === 0) {
            throw new Error(`Kind registration is missing entity description for provider`)
        }
        const name = Object.keys(entity_description)[0];
        if (entity_description[name].hasOwnProperty("x-papiea-entity")) {
            const the_kind: SpecOnlyEntityKind = {
                name,
                name_plural: plural(name),
                kind_structure: entity_description,
                intentful_signatures: [],
                dependency_tree: new Map(),
                kind_procedures: {},
                entity_procedures: {},
                intentful_behaviour: entity_description[name]["x-papiea-entity"],
                differ: undefined,
            };

            const kind_builder = new Kind_Builder(the_kind, this, this.allowExtraProps, this._tracer);
            this._kind.push(the_kind);
            return kind_builder;
        } else {
            throw new Error(`Entity not a papiea entity. Please make sure you have 'x-papiea-entity' property in entity description for: ${name}`);
        }
    }

    add_kind(kind: Kind): Kind_Builder | null {
        if (this._kind.indexOf(kind) === -1) {
            this._kind.push(kind);
            const kind_builder = new Kind_Builder(kind, this, this.allowExtraProps, this._tracer);
            return kind_builder;
        } else {
            return null;
        }
    }

    remove_kind(kind: Kind): boolean {
        const found_idx = this._kind.indexOf(kind);
        if (found_idx !== -1) {
            this._kind.splice(found_idx, 1);
            return true;
        } else {
            return false;
        }
    }

    version(version: Version): ProviderSdk {
        this._version = version;
        return this
    }

    prefix(prefix: string): ProviderSdk{
        this._prefix = prefix;
        return this
    }

    public metadata_extension(ext: Data_Description) {
        this.meta_ext = ext;
        return this
    }

    public get_metadata_extension(): Data_Description | null {
        return this.meta_ext
    }

    provider_procedure(name: string,
                       description: ProcedureDescription,
                       handler: (ctx: ProceduralCtx_Interface, input: any) => Promise<any>): ProviderSdk {
        const procedure_callback_url = this._server_manager.procedure_callback_url(name);
        const callback_url = this._server_manager.callback_url();
        validate_error_codes(description.errors_schemas)
        const procedural_signature: Procedural_Signature = {
            name,
            argument: description.input_schema ?? {},
            result: description.output_schema ?? {},
            execution_strategy: Intentful_Execution_Strategy.Basic,
            procedure_callback: procedure_callback_url,
            base_callback: callback_url,
            errors_schemas: description.errors_schemas,
            description: description.description
        };
        this._procedures[name] = procedural_signature;
        this._server_manager.register_handler("/" + name, async (req, res) => {
            const ctx = new ProceduralCtx(this, req.headers, name)
            try {
                const span = spanSdkOperation(`${name}_provider_procedure_sdk_handler`, this._tracer, req, this.provider)
                const result = await handler(ctx, req.body.input)
                ctx.cleanup()
                res.json(result);
                span.finish()
            } catch (e) {
                ctx.get_logger().error(JSON.stringify(e?.response?.data.error, null, 4) ?? e)
                if (e instanceof InvocationError) {
                    return res.status(e.status_code).json(e.toResponse())
                }
                let error: InvocationError
                if (isAxiosError(e)) {
                    error = InvocationError.fromError(500, e);
                } else if (e instanceof SecurityApiError) {
                    error = InvocationError.fromError(500, e);
                } else {
                    error = InvocationError.fromError(500, e, e.message);
                }
                res.status(error.status_code).json(error.toResponse())
            }
        });
        return this
    }

    background_task(name: string, delay_sec: number, callback: BackgroundTaskCallback, metadata_extension?: any, provider_fields_schema?: any): BackgroundTaskBuilder {
        return BackgroundTaskBuilder.create_task(this, name, delay_sec, callback, this._tracer, metadata_extension, provider_fields_schema)
    }

    async register(): Promise<void> {
        if (this._prefix !== null && this._version !== null && this._kind.length !== 0) {
            this._provider = {
                kinds: [...this._kind],
                version: this._version!,
                prefix: this._prefix!,
                procedures: this._procedures,
                extension_structure: this.meta_ext ?? {},
                allowExtraProps: this.allowExtraProps,
                ...(this._policy) && {policy: this._policy},
                ...(this._oauth2) && {oauth2: this._oauth2},
                ...(this._authModel) && {authModel: this._authModel},
            };
            try {
                await this.providerApiAxios.post('/', this._provider);
                this._server_manager.startServer();
            } catch (err) {
                throw err;
            }
        } else if (this._prefix === null) {
            ProviderSdk.provider_description_error("prefix")
        } else if (this._version === null) {
            ProviderSdk.provider_description_error("version")
        } else if (this._kind.length === 0) {
            ProviderSdk.provider_description_error("kind")
        }
    }

    power(state: Provider_Power): Provider_Power {
        throw new Error("Unimplemented")
    }

    private static provider_description_error(missing_field: string) {
        throw new Error(`Malformed provider description. Missing: ${ missing_field }`)
    }

    static create_provider(papiea_url: string, s2skey: Secret, public_host?: string, public_port?: number, allowExtraProps: boolean = false): ProviderSdk {
        const server_manager = new Provider_Server_Manager(public_host, public_port);
        return new ProviderSdk(papiea_url, s2skey, server_manager, allowExtraProps)
    }

    public secure_with(oauth_config: any, casbin_model: string, casbin_initial_policy: string) : ProviderSdk {
        this._oauth2=oauth_config;
        this._authModel=casbin_model;
        this._policy=casbin_initial_policy;
        return this
    }

    public get server_manager() : Provider_Server_Manager{
        return this._server_manager
    }

    public get providerSecurityApi () : SecurityApi {
        return this._securityApi;
    }

    public new_security_api(s2s_key: string) {
        return new SecurityApiImpl(this, s2s_key)
    }

    public get s2s_key(): Secret {
        return this._s2skey
    }

    public get_intent_watcher_client(): IntentWatcherClient {
        return this._intentWatcherClient
    }

    public get_sdk_version(): Version {
        return this._sdk_version;
    }

    public cleanup(): void {
        try {
            this.server.close();
        } catch (e) {
            console.info("Failed to close server during cleanup")
        }
        try {
            // Assume a tracer has a close method
            (this._tracer as any).close()
            (this._intentWatcherClient.close())
        } catch (e) {
            console.info("Failed to close tracer/intent watcher client during cleanup")
        }
    }
}

class Provider_Server_Manager {
    private readonly public_host: string;
    private readonly public_port: number;
    private app: Express;
    private raw_http_server: Server | null;
    private should_run: boolean;

    constructor(public_host: string = "127.0.0.1", public_port: number = 9000) {
        this.public_host = public_host;
        this.public_port = public_port;
        this.app = express();
        this.init_express();
        this.raw_http_server = null;
        this.should_run = false;
    }

    init_express() {
        this.app.use(express.json({limit: "16mb"})) // same as papiea-engine
    }

    private escape_sfs_path(path: string) {
        const replaced_once = path.replace(/[*+?()]/g, '\\$&') // $& means the whole matched string
        return replaced_once.replace(/[:$]/g, '\[$&]')
    }

    // Beware this escapes special Express JS symbols
    // So no /watcher/:id will work!
    register_handler(route: string, handler: RequestHandler) {
        if (!this.should_run) {
            this.should_run = true;
        }
        this.app.post(this.escape_sfs_path(encodeURI(route)), asyncHandler(handler))
    }

    register_healthcheck() {
        if (!this.should_run) {
            this.should_run = true;
        }
        this.app.get("/healthcheck", asyncHandler(async (req, res) => {
            res.status(200).json({ status: "Available" })
        }))
    }

    startServer() {
        if (this.should_run) {
            this.raw_http_server = this.app.listen(this.public_port, () => {
                console.log(`Server running at http://localhost:${ this.public_port }/`);
            })
        }
    }

    get server(): Server {
        if (this.raw_http_server !== null) {
            return this.raw_http_server;
        } else {
            throw Error("Server is not created")
        }
    }

    callback_url() {
        return `http://${ this.public_host }:${ this.public_port }`
    }

    procedure_callback_url(procedure_name: string, kind?: string): string {
        if (kind !== undefined) {
            return `http://${ this.public_host }:${ this.public_port }/${ kind }/${ procedure_name }`
        } else {
            return `http://${ this.public_host }:${ this.public_port }/${ procedure_name }`
        }
    }
}

export type BackgroundTaskCallback = ((ctx: IntentfulCtx_Interface) => Promise<any>) | ((ctx: IntentfulCtx_Interface, task_ctx: any | undefined) => Promise<any>)

export class BackgroundTaskBuilder {
    private provider: ProviderSdk
    private tracer: Tracer
    private name: string
    private kind: Kind_Builder
    private task_entity: Entity | null = null
    private kind_client: EntityCRUD
    private metadata_extension?: any
    static BackgroundTaskState = class {
        static RunningSpecState() {
            return "Should Run"
        }
        static RunningStatusState() {
            return "Running"
        }
        static IdleSpecState() {
            return "Idle"
        }
        static IdleStatusState() {
            return "Idle"
        }
    }


    constructor(provider: ProviderSdk, tracer: Tracer, name: string, kind_builder: Kind_Builder, metadata_extension?: any) {
        this.provider = provider
        this.tracer = tracer
        this.name = name
        this.kind = kind_builder
        this.kind_client = kind_client(provider.papiea_url, provider.get_prefix(), name, provider.get_version(), provider.s2s_key)
        this.metadata_extension = metadata_extension
    }

    static create_task(provider: ProviderSdk, name: string, delay_sec: number, callback: BackgroundTaskCallback, tracer: Tracer, metadata_extension?: any, custom_schema?: any): BackgroundTaskBuilder {
        if (provider.get_metadata_extension() !== null && (metadata_extension === null || metadata_extension === undefined)) {
            throw new Error(`Attempting to create background task (${this.name}) on provider:
                            ${provider.get_prefix()}, ${provider.get_version()} without the required metadata extension.`)
        }
        const schema: any = {
            type: "object",
            "x-papiea-entity": "differ",
            properties: {
                state: {
                    type: "string"
                }
            }
        }
        if (custom_schema) {
            this.modify_task_schema(custom_schema)
            schema["properties"]["provider_fields"] = custom_schema
        }
        const kind = provider.new_kind({[name]: schema})
        kind.on("state", async (ctx, entity, input) => {
            await callback(ctx, entity?.status?.provider_fields ?? undefined)
            return {
                delay_secs: delay_sec
            }
        })
        return new BackgroundTaskBuilder(provider, tracer, name, kind, metadata_extension)
    }

    private async update_task_entity() {
        if (this.task_entity) {
            this.task_entity = await this.kind_client.get(this.task_entity.metadata)
        }
    }

    async start_task() {
        const states = BackgroundTaskBuilder.BackgroundTaskState
        if (this.task_entity === null) {
            if (this.metadata_extension) {
                this.task_entity = await this.kind_client.create({
                    spec: {state: states.RunningSpecState()},
                    metadata: {
                        extension: this.metadata_extension
                    }
                })
            } else {
                this.task_entity = await this.kind_client.create({spec: {state: states.RunningSpecState()}})
            }
            await this.provider.provider_api_axios.patch(`${this.provider.provider_url}/${this.provider.get_prefix()}/${this.provider.get_version()}/update_status`,{
                metadata: this.task_entity.metadata,
                status: {
                    state: states.RunningStatusState()
                }
            });
        } else {
            await this.update_task_entity()
            await this.kind_client.update(this.task_entity.metadata, {state: states.RunningSpecState()})
            await this.provider.provider_api_axios.patch(`${this.provider.provider_url}/${this.provider.get_prefix()}/${this.provider.get_version()}/update_status`,{
                metadata: this.task_entity.metadata,
                status: {
                    state: states.RunningStatusState()
                }
            });
        }
    }

    async stop_task() {
        const states = BackgroundTaskBuilder.BackgroundTaskState
        if (this.task_entity === null) {
            throw new Error(`Attempting to stop missing background task (${this.name}) on provider:
                            ${this.provider.get_prefix()}, ${this.provider.get_version()}`)
        } else {
            await this.update_task_entity()
            await this.kind_client.update(this.task_entity.metadata, {state: states.IdleSpecState()})
            await this.provider.provider_api_axios.patch(`${this.provider.provider_url}/${this.provider.get_prefix()}/${this.provider.get_version()}/update_status`,{
                metadata: this.task_entity.metadata,
                status: {
                    state: states.IdleStatusState()
                }
            });
        }
    }

    async kill_task() {
        if (this.task_entity === null) {
            throw new Error(`Attempting to kill missing background task (${this.name}) on provider:
                            ${this.provider.get_prefix()}, ${this.provider.get_version()}`)
        } else {
            await this.update_task_entity()
            await this.kind_client.delete(this.task_entity.metadata)
        }
    }

    // Make all the fields apart from 'task' status-only
    private static modify_task_schema(schema: any) {
        if (Object.keys(schema).length > 1 && schema["type"] && schema["properties"]) {
            this.modify_task_schema(schema["properties"])
        }
        for (let prop in schema) {
            if (schema.hasOwnProperty(prop)) {
                let nested_prop = schema[prop]
                if (nested_prop["type"]) {
                    if (
                        nested_prop["type"] === "object"
                        && nested_prop["properties"]
                        && Object.keys(nested_prop["properties"]).length > 0
                    ) {
                        this.modify_task_schema(nested_prop["properties"])
                    }
                    nested_prop["x-papiea"] = "status-only"
                }
            }
        }
    }

    async update_task(task_ctx: any) {
        if (this.task_entity === null) {
            throw new Error(`Attempting to update missing background task (${this.name}) on provider:
                            ${this.provider.get_prefix()}, ${this.provider.get_version()}`)
        } else {
            await this.update_task_entity()
            await this.provider.provider_api_axios.patch(`${this.provider.provider_url}/${this.provider.get_prefix()}/${this.provider.get_version()}/update_status`,{
                metadata: this.task_entity.metadata,
                status: {provider_fields: task_ctx}
            });
        }
    }
}

export class Kind_Builder {

    kind: Kind;
    entity_url: string;
    get_prefix: () => string;
    get_version: () => string;
    private server_manager: Provider_Server_Manager;
    provider_url: string;
    private readonly allowExtraProps: boolean;
    private readonly provider: ProviderSdk;
    private readonly tracer: Tracer

    constructor(kind: Kind, provider: ProviderSdk, allowExtraProps: boolean, tracer: Tracer) {
        this.provider = provider;
        this.server_manager = provider.server_manager;
        this.kind = kind;
        this.entity_url = provider.entity_url;
        this.provider_url = provider.provider_url;
        this.get_prefix = provider.get_prefix;
        this.get_version = provider.get_version;
        this.allowExtraProps = allowExtraProps
        this.tracer = tracer
    }

    entity_procedure(name: string,
                     description: ProcedureDescription,
                     handler: (ctx: ProceduralCtx_Interface, entity: Entity, input: any) => Promise<any>): Kind_Builder {
        const procedure_callback_url = this.server_manager.procedure_callback_url(name, this.kind.name);
        const callback_url = this.server_manager.callback_url();
        validate_error_codes(description.errors_schemas)
        const procedural_signature: Procedural_Signature = {
            name,
            argument: description.input_schema ?? {},
            result: description.output_schema ?? {},
            execution_strategy: Intentful_Execution_Strategy.Basic,
            procedure_callback: procedure_callback_url,
            base_callback: callback_url,
            errors_schemas: description.errors_schemas,
            description: description.description
        };
        this.kind.entity_procedures[name] = procedural_signature;
        this.server_manager.register_handler(`/${this.kind.name}/${name}`, async (req, res) => {
            const ctx = new ProceduralCtx(this.provider, req.headers,
                                          `${this.kind.name}/${name}`)
            try {
                const span = spanSdkOperation(`${name}_entity_procedure_sdk_handler`, this.tracer, req, this.provider.provider)
                const result = await handler(ctx, {
                    metadata: req.body.metadata,
                    spec: req.body.spec,
                    status: req.body.status
                }, req.body.input);
                ctx.cleanup()
                res.json(result);
                span.finish()
            } catch (e) {
                ctx.get_logger().error(JSON.stringify(e?.response?.data.error, null, 4) ?? e)
                if (e instanceof InvocationError) {
                    return res.status(e.status_code).json(e.toResponse())
                }
                let error: InvocationError
                if (isAxiosError(e)) {
                    error = InvocationError.fromError(500, e);
                } else if (e instanceof SecurityApiError) {
                    error = InvocationError.fromError(500, e);
                } else {
                    error = InvocationError.fromError(500, e, e.message);
                }
                res.status(error.status_code).json(error.toResponse())
            }
        });
        return this
    }

    on(sfs_signature: string,
       handler: (ctx: IntentfulCtx_Interface, entity: Entity, input: any) => Promise<any>): Kind_Builder {
        const procedure_callback_url = this.server_manager.procedure_callback_url(sfs_signature, this.kind.name);
        const callback_url = this.server_manager.callback_url();
        this.kind.intentful_signatures.push({
            signature: sfs_signature,
            name: sfs_signature,
            argument: {
                IntentfulInput: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            keys: {
                                type: 'object'
                            },
                            key: {
                                type: 'string'
                            },
                            "spec-val": {
                                type: 'array'
                            },
                            "status-val": {
                                type: 'array'
                            }
                        }
                    }
                }
            },
            result: {
                IntentfulOutput: {
                    type: 'object',
                    properties: {
                        delay_secs: {
                            type: "integer"
                        }
                    },
                    description: "Amount of seconds to wait before this entity will be checked again by the intent engine"
                }
            },
            execution_strategy: Intentful_Execution_Strategy.Basic,
            procedure_callback: procedure_callback_url,
            base_callback: callback_url
        })
        this.server_manager.register_handler(`/${this.kind.name}/${sfs_signature}`, async (req, res) => {
            const ctx = new ProceduralCtx(this.provider, req.headers,
                                          `${this.kind.name}/${sfs_signature}`)
            try {
                const span = spanSdkOperation(`${sfs_signature}_sdk_handler`, this.tracer, req, this.provider.provider)
                const result = await handler(ctx, {
                    metadata: req.body.metadata,
                    spec: req.body.spec,
                    status: req.body.status
                }, req.body.input);
                ctx.cleanup()
                res.json(result);
                span.finish()
            } catch (e) {
                ctx.get_logger().error(JSON.stringify(e?.response?.data.error, null, 4) ?? e)
                if (e instanceof InvocationError) {
                    return res.status(e.status_code).json(e.toResponse())
                }
                let error: InvocationError
                if (isAxiosError(e)) {
                    error = InvocationError.fromError(500, e);
                } else if (e instanceof SecurityApiError) {
                    error = InvocationError.fromError(500, e);
                } else {
                    error = InvocationError.fromError(500, e, e.message);
                }
                res.status(error.status_code).json(error.toResponse())
            }
        });
        this.server_manager.register_healthcheck()
        return this
    }

    kind_procedure(name: string,
                   description: ProcedureDescription,
                   handler: (ctx: ProceduralCtx_Interface, input: any) => Promise<any>): Kind_Builder {
        const procedure_callback_url = this.server_manager.procedure_callback_url(name, this.kind.name);
        const callback_url = this.server_manager.callback_url();
        validate_error_codes(description.errors_schemas)
        const procedural_signature: Procedural_Signature = {
            name,
            argument: description.input_schema ?? {},
            result: description.output_schema ?? {},
            execution_strategy: Intentful_Execution_Strategy.Basic,
            procedure_callback: procedure_callback_url,
            base_callback: callback_url,
            errors_schemas: description.errors_schemas,
            description: description.description
        };
        this.kind.kind_procedures[name] = procedural_signature;
        this.server_manager.register_handler(`/${this.kind.name}/${name}`, async (req, res) => {
            const ctx = new ProceduralCtx(this.provider, req.headers,
                                          `${this.kind.name}/${name}`)
            try {
                const span = spanSdkOperation(`${name}_kind_procedure_sdk_handler`, this.tracer, req, this.provider.provider, {kind: this.kind.name})
                const result = await handler(ctx, req.body.input);
                ctx.cleanup()
                res.json(result);
                span.finish()
            } catch (e) {
                ctx.get_logger().error(JSON.stringify(e?.response?.data.error, null, 4) ?? e)
                if (e instanceof InvocationError) {
                    return res.status(e.status_code).json(e.toResponse())
                }
                let error: InvocationError
                if (isAxiosError(e)) {
                    error = InvocationError.fromError(500, e);
                } else if (e instanceof SecurityApiError) {
                    error = InvocationError.fromError(500, e);
                } else {
                    error = InvocationError.fromError(500, e, e.message);
                }
                res.status(error.status_code).json(error.toResponse())
            }
        });
        return this
    }

    // Return type should always contain spec and status (metadata could be empty)
    on_create(description: {input_schema?: any, error_schemas?: ErrorSchemas}, handler: (ctx: ProceduralCtx_Interface, input: any) => Promise<{spec: Spec, status: Status, metadata?: Partial<Metadata>}>): Kind_Builder {
        const name = `__${this.kind.name}_create`
        const loggerFactory = new LoggerFactory({logPath: name})
        const [logger, handle] = loggerFactory.createLogger()
        logger.info(`You are registering on create handler for kind: ${this.kind.name}. Note, this is a post create handler. The behaviour is due to change`)
        if (!description.input_schema) {
            logger.info(`Input schema is undefined for on_create handler, using the schema for kind: ${this.kind.name}`)
            description.input_schema = this.kind.kind_structure
        }
        handle.cleanup()
        this.kind_procedure(name, description, handler)
        return this
    }

    on_delete(handler: (ctx: ProceduralCtx_Interface, entity: Entity) => Promise<void>): Kind_Builder {
        const name = `__${this.kind.name}_delete`
        const loggerFactory = new LoggerFactory({logPath: name})
        const [logger, handle] = loggerFactory.createLogger()
        logger.info(`You are registering on delete handler for kind: ${this.kind.name}. Note, this is a pre delete handler. The behaviour is due to change`)
        handle.cleanup()
        this.kind_procedure(name, {}, handler)
        return this
    }

    diff_retry_exponent(diff_retry_exponent?: number): Kind_Builder {
        this.kind.diff_retry_exponent = diff_retry_exponent
        return this;
    }
}

export {Version, Kind, Procedural_Signature, Provider, Data_Description, Procedural_Execution_Strategy, Entity, ProceduralCtx_Interface, Provider_Power, IntentfulCtx_Interface, UserInfo, S2S_Key, SecurityApi, ProcedureDescription}
