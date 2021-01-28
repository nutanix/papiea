import { SortParams } from "../entity/entity_api_impl"
import { ValidationError } from "../errors/validation_error"
import { AxiosError } from "axios"

function validatePaginationParams(offset: number | undefined, limit: number | undefined) {
    if (offset !== undefined) {
        if (offset <= 0) {
            throw new ValidationError([new Error("Offset should not be less or equal to zero")])
        }
    }
    if (limit !== undefined) {
        if (limit <= 0) {
            throw new ValidationError([new Error("Limit should not be less or equal to zero")])
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
                throw new ValidationError([new Error("Sorting key's value must be either 'asc' or 'desc'")])
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
        console.error(`Safe json parse failed: ${e}, Falling back to undefined`)
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

export function calculateBackoff(retries: number, maximumBackoff: number, entropy: number) {
    return Math.min(Math.pow(2, retries) + entropy, maximumBackoff)
}

export function getEntropyFn(papieaDebug: boolean) {
    let min: number
    let max: number
    if (papieaDebug) {
        min = 1
        max = 2
    } else {
        min = 10
        max = 20
    }
    return (diff_delay?: number) => {
        if (diff_delay !== undefined && diff_delay !== null) {
            return diff_delay + getRandomInt(1, 10)
        }
        return getRandomInt(min, max)
    }
}

export function getPapieaVersion(): string {
    const packageJSON = require('../../package.json');
    const engineSDKVersion: string = packageJSON.version.split('+')[0];
    return engineSDKVersion
}

// Transform request function to handle number input
export const transformRequestAxiosNumToString = function (data: any, headers: any) {
    if (typeof data === 'number') {
        return data.toString();
    }
    return data;
}


// JSON parse reviver function to convert non-json numeric value to
export const convertNumToStringJSONReviver = function (key: string, value: any) {
    if (key === '' && typeof value === 'number') {
        return value.toString();
    }
    return value;
}