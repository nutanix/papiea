import * as pino from 'pino'
import {inspect} from 'util'

export type LoggingFieldOptions = "headers" | "request_body" | "response_body"

export interface LoggingVerbosityOptions {
    verbose: boolean,
    fields: LoggingFieldOptions[]
}

export const LOG_LEVELS = {
    emerg: 0,
    alert: 1,
    crit: 2,
    error: 3,
    audit: 4,
    warn: 5,
    notice: 6,
    info: 7,
    debug: 8,
}

export type LogLevel = keyof typeof LOG_LEVELS // 'debug' | 'info' | ...

export function logLevelFromString(str: string) : LogLevel | undefined {
    if (str in LOG_LEVELS) return str as LogLevel
    return undefined
}

export interface Logger {
    opts(): LoggerOptions
    emerg(msg: any, ...messages: any[]): void
    alert(msg: any, ...messages: any[]): void
    crit(msg: any, ...messages: any[]): void
    error(msg: any, ...messages: any[]): void
    audit(msg: any, ...messages: any[]): void
    warn(msg: any, ...messages: any[]): void
    notice(msg: any, ...messages: any[]): void
    info(msg: any, ...messages: any[]): void
    debug(msg: any, ...messages: any[]): void
}

export class LoggerHandle {
    constructor(private logger: pino.Logger) {
    }
}

export type LoggerOptions = {
    logPath?: string,
    level: LogLevel,
    pretty_print: boolean,
    verbosity_options: LoggingVerbosityOptions
}

export class LoggerFactory {
    readonly options: LoggerOptions

    private static readonly INSPECT_OPTIONS = {
        sorted: true, getters: true, depth: 10,
    }

    public static makeLogger(options: Partial<LoggerOptions>): Logger {
        const factory = new LoggerFactory(options)
        const [logger, _] = factory.createLogger()
        return logger
    }

    public static nested(parent: LoggerFactory,
                         options: Partial<LoggerOptions>): LoggerFactory
    {
        return new LoggerFactory(LoggerFactory.mergeOptions(
            parent.options, options))
    }

    constructor(options: Partial<LoggerOptions>) {
        this.options = LoggerFactory.mergeOptions({
            level: 'info',
            pretty_print: false,
            verbosity_options: {
                verbose: false,
                fields: []
            }
        }, options)
    }

    createLogger(options?: Partial<LoggerOptions>): [Logger, LoggerHandle] {
        const opts = LoggerFactory.mergeOptions(this.options, options ?? {})
        let destination = pino.destination(1)

        if (opts.logPath) {
            destination = pino.destination(opts.logPath)
        }

        let custom_logger: ((object: object) => object) | undefined = undefined

        switch (opts.pretty_print) {
        case false: // json
            break

        case true:  // pretty
            const skip_fields = ['level','timestamp','label','message','stack']

            custom_logger = (info: any): any => {
                let msg = `${info}`
                if (info.level) msg = `${msg} ${info.level}\t`
                if (info.timestamp) msg = `${msg} ${info.timestamp}`
                if (info.label) msg = `${msg} [${info.label}]`

                if (info.stack) {
                    // Stack trace includes the error message, so we only print
                    // the stack if we are given a stack.
                    msg = `${msg} ${info.stack}`
                } else if (info.message !== undefined) {
                    msg = `${msg} ${info.message}`
                }

                const extra: any = {}
                for (let k in info) {
                    if (skip_fields.includes(k)) continue
                    extra[k] = info[k]
                }

                if (Object.keys(extra).length > 0) {
                    msg = `${msg} -- ${LoggerFactory.prettyPrint(extra)}`
                }

                return {msg: msg}
            }
            break
        }

        const logger = pino({
            customLevels: LOG_LEVELS,
            level: opts.level,
            formatters: {
                log: custom_logger,
                bindings: (bindings: pino.Bindings) => {
                    return {}
                }
            },
            timestamp: true
        }, destination)

        return [new LoggerImpl(logger, opts), new LoggerHandle(logger)]
    }

    public static mergeOptions(first: LoggerOptions,
                               ...opts: Partial<LoggerOptions>[]): LoggerOptions
    {
        return opts.reduce<LoggerOptions>((res, opt) => {
            if (opt.logPath) {
                res.logPath = res.logPath ? `${res.logPath}/${opt.logPath}`
                                          : opt.logPath
            }
            if (opt.level) res.level = opt.level
            if (opt.pretty_print) res.pretty_print = opt.pretty_print
            if (opt.verbosity_options) res.verbosity_options = opt.verbosity_options
            return res
        }, Object.assign({}, first))
    }

    private static prettyPrint(obj: any): string {
        return inspect(obj, LoggerFactory.INSPECT_OPTIONS)
    }
}

class LoggerImpl implements Logger {
    private readonly _logger: pino.Logger
    private readonly _opts: LoggerOptions

    constructor(logger: pino.Logger, opts: LoggerOptions) { this._logger = logger; this._opts = opts }

    opts(): LoggerOptions {
        return this._opts
    }

    emerg(msg: any, ...messages: any[]): void {
        this._logger.emerg(msg, ...messages)
    }
    alert(msg: any, ...messages: any[]): void {
        this._logger.alert(msg, ...messages)
    }
    crit(msg: any, ...messages: any[]): void {
        this._logger.crit(msg, ...messages)
    }
    error(msg: any, ...messages: any[]): void {
        this._logger.error(msg, ...messages)
    }
    audit(msg: any, ...messages: any[]): void {
        this._logger.audit(msg, ...messages)
    }
    warn(msg: any, ...messages: any[]): void {
        this._logger.warn(msg, ...messages)
    }
    notice(msg: any, ...messages: any[]): void {
        this._logger.notice(msg, ...messages)
    }
    info(msg: any, ...messages: any[]): void {
        this._logger.info(msg, ...messages)
    }
    debug(msg: any, ...messages: any[]): void {
        this._logger.debug(msg, ...messages)
    }
}
