import { ValidationError } from "../errors/validation_error"
import {DiffContent, Spec, Status} from "papiea-core"
import { PapieaException } from "../errors/papiea_exception";
import { Logger } from "papiea-backend-utils";
import { cloneDeep } from "lodash"

// TODO: add d.ts for type annotations
const papi_clj = require("../../papiea-lib-clj/papiea-lib-clj.js").papiea_lib_clj;
const clj_str = (a: any) => papi_clj.core.clj_str(a);
const sfs_parser = (sfs_ast: string) => papi_clj.core.parse_sfs(sfs_ast);
const sfs_optimizer = (sfs_ast: string) => papi_clj.core.optimize_sfs_ast(sfs_ast);
const sfs_compiler = (sfs_signature: string) => papi_clj.core.compile_sfs(sfs_signature);
const run_compiled_sfs = (compiled_sfs: any, spec: any, status: any) =>
    papi_clj.core.run_compiled_sfs(compiled_sfs, spec, status);

// Removes all the status-only fields from the entity status using the schema
function remove_status_only_fields(schema: any, status: Status): Status {
    if (schema) {
        // Return null for fields that are status-only
        if (schema.hasOwnProperty('x-papiea') && schema['x-papiea'] === 'status-only') {
            return null
        }
        if (schema.type === 'object' && schema['properties'] && status && Object.keys(status).length !== 0) {
            const properties = schema['properties']
            Object.entries(status).forEach(([k, v]) => {
                status[k] = remove_status_only_fields(properties[k], status[k])
                // If received null i.e. a status-only field, delete the field from status object
                if (status[k] === null) {
                    delete status[k]
                }
            })
        } else if (schema.type === 'array' && status && status.length !== 0) {
            let i = 0;
            // Loop through all values in array and inspect status-only for each
            for (let item of status) {
                status[i] = remove_status_only_fields(schema['items'], item)
                i++
            }
            // If the array element has all status-only fields, it would be set to empty object
            // based on the above logic, so remove the element from array to avoid empty values.
            status = status.filter((item: any) => Object.keys(item).length !== 0);
        }
    }
    return status
}

// Removes all the null and undefined fields from the entity
function remove_undefined_or_null_values(entity: any, logger?: Logger, kind_name: string = '', entity_name: string = '', field_name: string = ''): any {
    if (entity === null || entity === undefined) {
        return null
    } else if (Array.isArray(entity)) {
        let newArray: any = []
        entity.forEach(entity_item => {
            const ret_val = remove_undefined_or_null_values(entity_item, logger, kind_name, entity_name, field_name)
            if (ret_val !== null) {
                newArray.push(ret_val)
            } else {
                if (logger !== undefined) {
                    logger.debug(`Removing undefined/null list item from field: ${field_name} from ${kind_name}/${entity_name}.`);
                } else {
                    console.debug(`Removing undefined/null list item from field: ${field_name} from ${kind_name}/${entity_name}.`)
                }
            }
        });
        return newArray
    } else if (typeof entity === 'object') {
        let newObject: any = {}
        Object.entries(entity).forEach(([k, v]) => {
            const ret_val = remove_undefined_or_null_values(v, logger, kind_name, entity_name, field_name + "/" + k)
            if (ret_val !== null) {
                newObject[k] = ret_val
            } else {
                if (logger !== undefined) {
                    logger.debug(`Removing undefined/null field: ${field_name}/${k} from ${kind_name}/${entity_name}.`);
                } else {
                    console.debug(`Removing undefined/null field: ${field_name}/${k} from ${kind_name}/${entity_name}.`)
                }
            }
        })
        return newObject
    } else {
        return entity
    }
}

function cleanup_spec_for_sfs_run(spec: Spec, kind_name: string, logger?: Logger): Spec {
    let diff_spec = JSON.parse(JSON.stringify(spec))
    diff_spec = remove_undefined_or_null_values(diff_spec, logger, kind_name, "spec")
    return diff_spec
}

function cleanup_status_for_sfs_run(status: Status, schema: any, kind_name: string, logger?: Logger): Status {
    let diff_status = JSON.parse(JSON.stringify(status))
    diff_status = remove_undefined_or_null_values(diff_status, logger, kind_name, "status")
    diff_status = remove_status_only_fields(schema, diff_status)
    return diff_status
}

export class SFSCompiler {
    static try_parse_sfs(sfs: string, provider_prefix: string, provider_version: string,kind_name: string): void {
        try {
            sfs_parser(sfs)
        } catch(e) {
            throw new ValidationError({
                message: `Failed to validate the sfs on kind: ${provider_prefix}/${provider_version}/${kind_name}.`,
                entity_info: { provider_prefix, provider_version, kind_name, additional_info: { "sfs": sfs }},
            }, [e])
        }
    }

    static try_compile_sfs(sfs: string, kind: string, provider_prefix: string = '', provider_version: string = ''): any {
        this.try_parse_sfs(sfs, provider_prefix, provider_version, kind)
        return sfs_compiler(sfs)
    }

    static run_sfs(compiled_sfs: any, spec: any, status: any, schema: any, kind_name: string, logger?: Logger): DiffContent[] | null {
        const diff_spec = cleanup_spec_for_sfs_run(spec, kind_name, logger)
        const diff_status = cleanup_status_for_sfs_run(status, schema, kind_name, logger)
        return run_compiled_sfs(compiled_sfs, diff_spec, diff_status)
    }
}
