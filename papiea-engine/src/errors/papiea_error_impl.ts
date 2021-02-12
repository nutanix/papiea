import { PapieaResponse } from "papiea-core";
import {
    EntityNotFoundError,
    ConflictingEntityError,
    GraveyardConflictingEntityError
} from "../databases/utils/errors"
import { ValidationError } from "./validation_error";
import { ProcedureInvocationError } from "./procedure_invocation_error";
import { PermissionDeniedError, UnauthorizedError } from "./permission_error";
import { BadRequestError } from "./bad_request_error";
import { PapieaError } from "papiea-core";
import {Logger} from "papiea-backend-utils"


export class PapieaErrorResponseImpl implements PapieaResponse {
    error: {
        url: string,
        errors: { [key: string]: any }[],
        code: number
        message: string,
        type: PapieaError
    }

    constructor(url: string, code: number, errorMsg: string, type: PapieaError, errors?: { [key: string]: any }[]) {
        if (errors) {
            this.error = {
                url,
                code,
                errors,
                message: errorMsg,
                type
            }
        } else {
            this.error = {
                url,
                code,
                errors: [
                    { message: errorMsg }
                ],
                message: errorMsg,
                type
            }
        }

    }

    public toString() {
        const error_details = this.error.errors.reduce((acc, current) => {
            for (let prop in current) {
                acc = `${acc}; 
                Cause: ${prop} - Error: ${current[prop]}`
            }
            return acc
        }, "")
        return `URL: ${this.error.url}\nError msg: ${this.error.message}.\nDetails: ${error_details}`
    }

    public get status(): number {
        return this.error.code
    }

    public toResponse() {
        return this
    }

    static create(logger: Logger): (err: Error, req: any) => PapieaErrorResponseImpl {
        return (err: Error, req: any) => {
            let errorPayload: { message: string }[];
            switch (err.constructor) {
                case BadRequestError:
                    return new PapieaErrorResponseImpl(req.url, 400, "Bad Request", PapieaError.BadRequest,
                                                       [{ message: err.message }])
                case ValidationError:
                    errorPayload = (err as ValidationError).errors.map(description => {
                        return { message: description }
                    })
                    return new PapieaErrorResponseImpl(req.url, 400, "Validation failed.", PapieaError.Validation, errorPayload)
                case ProcedureInvocationError:
                    return new PapieaErrorResponseImpl(req.url, (err as ProcedureInvocationError).status, "Procedure invocation failed.", PapieaError.ProcedureInvocation, (err as ProcedureInvocationError).errors)
                case EntityNotFoundError:
                    return new PapieaErrorResponseImpl(
                        req.url,
                        404,
                        "Entity not found.",
                        PapieaError.EntityNotFound,
                        [{ message: `Entity ${(err as EntityNotFoundError).uuid} not found` }],
                    )
                case UnauthorizedError:
                    return new PapieaErrorResponseImpl(req.url, 401, "Unauthorized.", PapieaError.Unauthorized, [{ message: err.message }])
                case PermissionDeniedError:
                    return new PapieaErrorResponseImpl(req.url, 403, "Permission denied.", PapieaError.PermissionDenied, [{ message: err.message }])
                case GraveyardConflictingEntityError:
                    let graveyardErr = err as GraveyardConflictingEntityError
                    let meta = graveyardErr.existing_metadata

                    return new PapieaErrorResponseImpl(req.url, 409, `${graveyardErr.message}: uuid - ${meta.uuid}, maximum current spec version - ${graveyardErr.highest_spec_version}`, PapieaError.ConflictingEntity)
                case ConflictingEntityError:
                    let conflictingError = err as ConflictingEntityError
                    let metadata = conflictingError.existing_metadata

                    return new PapieaErrorResponseImpl(req.url, 409, `Conflicting Entity: ${metadata.uuid}. Existing entity has version ${metadata.spec_version}`, PapieaError.ConflictingEntity)
                default:
                    logger.error(`Papiea encountered unexpected error: ${err}`)
                    return new PapieaErrorResponseImpl(req.url, 500, err.message, PapieaError.ServerError)
            }
        }
    }
}
