import { SortParams } from "../entity/entity_api_impl"
import { ValidationError } from "../errors/validation_error"
import { AxiosError } from "axios"
import { Logger } from "papiea-backend-utils"
import { BadRequestError } from "../errors/bad_request_error"
import { PapieaException } from "../errors/papiea_exception"
import * as hash from "object-hash"
import { PapieaError, PapieaExceptionContext } from "papiea-core"
import { ProcedureInvocationError } from "../errors/procedure_invocation_error";
import { PermissionDeniedError, UnauthorizedError } from "../errors/permission_error";
import { SpecConflictingEntityError, StatusConflictingEntityError, EntityNotFoundError } from "../databases/utils/errors"
import { OnActionError } from "../errors/on_action_error"
export { hash as getObjectHash }

const semver = require('semver')

function validatePaginationParams(offset: number | undefined, limit: number | undefined) {
    if (offset !== undefined) {
        if (offset < 0) {
            throw new ValidationError({ message: `Failed to validate offset value. Offset should be greater than or equal to zero, received ${offset}.` })
        }
    }
    if (limit !== undefined) {
        if (limit <= 0) {
            throw new ValidationError({ message: `Failed to validate limit value. Limit should be greater than zero, received ${limit}.` })
        }
    }
}

export function processPaginationParams(offset: number | undefined, limit: number | undefined): [number, number] {
    let skip = 0;
    let size = 30;
    if (!offset && !limit) {
        validatePaginationParams(offset, limit);
        return [skip, size]
    }
    else if (!offset && limit) {
        validatePaginationParams(offset, limit);
        size = Number(limit);
        return [skip, size]
    }
    else if (offset && !limit) {
        validatePaginationParams(offset, limit);
        skip = Number(offset);
        return [skip, size]
    } else {
        validatePaginationParams(offset, limit);
        size = Number(limit);
        skip = Number(offset);
        return [skip, size]
    }

}

export function processSortQuery(query: string | undefined): undefined | SortParams {
    if (query === undefined) {
        return undefined;
    }
    const processedQuery: SortParams = {};
    const splitFields = query.split(",");
    splitFields.forEach(fieldQuery => {
        const [field, sortOrd] = fieldQuery.split(":");
        switch (sortOrd) {
            case "asc":
                processedQuery[field] = 1;
                break;
            case "desc":
                processedQuery[field] = -1;
                break;
            case undefined:
                processedQuery[field] = 1;
                break;
            default:
                throw new ValidationError({ message: `Failed to validate sorting key. Sorting key's value must be either 'asc' or 'desc', received ${sortOrd}.` })
        }
    });
    return processedQuery;
}

export function isEmpty(obj: any) {
    // JS type system note:
    // axios returns "" as response.data if no data was returned
    // thus if a procedure returns "" it is considered as no response
    if (obj === undefined || obj === null || obj === "") {
        return false
    }
    for(let key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

export function safeJSONParse(chunk: string): Object | null {
    try {
        return JSON.parse(chunk)
    } catch (e) {
        console.error(`Safe json parse failed for input: ${chunk} with error: ${e}, Falling back to undefined`)
        return null
    }
}

export function timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function isAxiosError(e: Error): e is AxiosError {
    return e.hasOwnProperty("response");
}

export function isObject(item: any): item is Object {
    return (item && typeof item === 'object' && !Array.isArray(item));
}


export function deepMerge(target: any, ...sources: any[]): any {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                deepMerge(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return deepMerge(target, ...sources);
}

export function getCalculateBackoffFn(retryExponent: number, logger: Logger) {
    return (retries?: number, maximumBackoff?: number, entropy?: number, kind_retry_exponent?: number, kind_name: string = '') => {
        if (retries !== undefined && retries !== null &&
            maximumBackoff !== undefined && maximumBackoff !== null &&
            entropy !== undefined && entropy !== null) {
            if (kind_retry_exponent !== null && kind_retry_exponent !== undefined) {
                logger.info(`Retry exponent for kind: ${ kind_name } is set to ${kind_retry_exponent} sec, not using the config exponent value`)
                retryExponent = kind_retry_exponent
            }
            return Math.min(Math.pow(retryExponent, retries) + entropy, maximumBackoff)
        }
        logger.warn("Received null/undefined input in calculate backoff, using default backoff set to 10 sec.")
        return 10
    }
}

export function getEntropyFn(papieaDebug: boolean) {
    let min: number = 0
    let max: number = 5
    return (diff_delay?: number) => {
        if (diff_delay !== undefined && diff_delay !== null) {
            return diff_delay + getRandomInt(min, max)
        }
        return getRandomInt(min, max)
    }
}

export function getPapieaVersion(): string {
    const packageJSON = require('../../package.json');
    const engineSDKVersion: string = packageJSON.version.split('+')[0];
    return engineSDKVersion
}

export function getVersionVerifier(enginePapieaVersion: string) {
    return (req: any, res: any, next: any) => {
        const headersPapieaVersion = req.headers['papiea-version']
        if (headersPapieaVersion) {
            if (semver.valid(headersPapieaVersion) === null) {
                throw new BadRequestError({ message: `Received invalid papiea version: ${headersPapieaVersion}, valid version: ${enginePapieaVersion}` })
            }
            if (semver.diff(headersPapieaVersion, enginePapieaVersion) === 'major') {
                throw new BadRequestError({ message: `Received incompatible papiea version: ${headersPapieaVersion}, expected version compatible with ${headersPapieaVersion}` })
            }
        }
        next();
    }
}

export function convertEntityInfoToExceptionContext(entity_info: any): PapieaExceptionContext {
    const provider_prefix = entity_info.provider_prefix
    const provider_version = entity_info.provider_version
    const kind_name = entity_info.kind_name
    let additional_info: { [key: string]: string; } = {};

    for (let field in entity_info) {
        if (field !== "provider_prefix" && field !== "provider_version" && field !== "kind_name") {
            additional_info[field] = entity_info[field]
        }
    }

    return { provider_prefix, provider_version, kind_name, additional_info }
}
export function convertAxiosErrorToEngineError(error: any): Error {
    if (error === undefined) {
        return new PapieaException({ message: 'Unknown Error' })
    }
    if (error.cause === undefined || error.cause.type === undefined) {
        return new PapieaException({ message: error.message })
    }

    const message = error.cause.error_details.message ?? 'Unknown Error';
    const entity_info = error.cause.error_details.entity_info ?? {};
    const context = convertEntityInfoToExceptionContext(entity_info)

    switch (error.cause.type) {
        case PapieaError.BadRequest:
            return new BadRequestError({ message, entity_info: context })
        case PapieaError.Validation:
            return new ValidationError({ message, entity_info: context })
        case PapieaError.ProcedureInvocation:
            return new ProcedureInvocationError({ message, entity_info: context}, error.cause.code)
        case PapieaError.EntityNotFound:
            return new EntityNotFoundError(entity_info.kind_name, entity_info.entity_uuid, entity_info.provider_prefix, entity_info.provider_version)
        case PapieaError.Unauthorized:
            return new UnauthorizedError({ message, entity_info: context })
        case PapieaError.PermissionDenied:
            return new PermissionDeniedError({ message, entity_info: context })
        case PapieaError.SpecConflictingEntity:
            const metadata = { provider_prefix: entity_info.provider_prefix, provider_version: entity_info.provider_version, kind: entity_info.kind_name, uuid: entity_info.entity_uuid, spec_version: parseInt(entity_info.existing_spec_version) }
            return new SpecConflictingEntityError(message, metadata)
        case PapieaError.StatusConflictingEntity:
            const status_conflict_metadata = { provider_prefix: entity_info.provider_prefix, provider_version: entity_info.provider_version, kind: entity_info.kind_name, uuid: entity_info.entity_uuid, status_hash:entity_info.existing_status_hash }
            return new StatusConflictingEntityError(status_conflict_metadata)
        case PapieaError.OnActionError:
            return new OnActionError({ message, entity_info: context })
        case PapieaError.PapieaException:
            return new PapieaException({ message, entity_info: context })
        default:
            return new Error(message)
    }
}
