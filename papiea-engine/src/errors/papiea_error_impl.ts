import { PapieaResponse } from "papiea-core";
import { EntityNotFoundError, ConflictingEntityError } from "../databases/utils/errors";
import { ValidationError } from "./validation_error";
import { ProcedureInvocationError } from "./procedure_invocation_error";
import { PermissionDeniedError, UnauthorizedError } from "./permission_error";
import { BadRequestError } from "./bad_request_error";
import { PapieaError } from "papiea-core";


export class PapieaErrorResponseImpl implements PapieaResponse {
    error: {
        errors: { [key: string]: any }[],
        code: number
        message: string,
        type: PapieaError
    }

    constructor(code: number, errorMsg: string, type: PapieaError, errors?: { [key: string]: any }[]) {
        if (errors) {
            this.error = {
                code,
                errors,
                message: errorMsg,
                type
            }
        } else {
            this.error = {
                code,
                errors: [
                    { message: errorMsg }
                ],
                message: errorMsg,
                type
            }
        }

    }

    public get status(): number {
        return this.error.code
    }

    public toResponse() {
        return this
    }

    static create(err: Error) {
        let errorPayload: { message: string }[];
        switch (err.constructor) {
            case BadRequestError:
                return new PapieaErrorResponseImpl(400, "Bad Request", PapieaError.BadRequest,
                    [{ message: err.message }])
            case ValidationError:
                errorPayload = (err as ValidationError).errors.map(description => {
                    return { message: description }
                })
                return new PapieaErrorResponseImpl(400, "Validation failed.", PapieaError.Validation, errorPayload)
            case ProcedureInvocationError:
                return new PapieaErrorResponseImpl((err as ProcedureInvocationError).status, "Procedure invocation failed.", PapieaError.ProcedureInvocation, (err as ProcedureInvocationError).errors)
            case EntityNotFoundError:
                return new PapieaErrorResponseImpl(
                    404,
                    "Entity not found.",
                    PapieaError.EntityNotFound,
                    [{ message: `Entity with kind: ${(err as EntityNotFoundError).kind}, uuid: ${(err as EntityNotFoundError).uuid} not found` }],
                )
            case UnauthorizedError:
                return new PapieaErrorResponseImpl(401, "Unauthorized.", PapieaError.Unauthorized)
            case PermissionDeniedError:
                return new PapieaErrorResponseImpl(403, "Permission denied.", PapieaError.PermissionDenied)
            case ConflictingEntityError:
                let conflictingError = err as ConflictingEntityError
                let metadata = conflictingError.existing_metadata

                return new PapieaErrorResponseImpl(409, `Conflicting Entity: ${metadata.uuid} has version ${metadata.spec_version}`, PapieaError.ConflictingEntity)
            default:
                console.log(`Default handle got error: ${err.message}`)
                return new PapieaErrorResponseImpl(500, err.message, PapieaError.ServerError)
        }
    }
}