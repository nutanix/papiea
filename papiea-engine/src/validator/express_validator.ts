import { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../errors/bad_request_error";

interface RequestValidatorOptions {
    allowed_query_params: String[],
    allowed_body_params?: String[]
}

export function check_request(request_validator_options: RequestValidatorOptions) {
    const allowed_query_params_set = new Set(request_validator_options.allowed_query_params);
    const allowed_body_params_set = request_validator_options.allowed_body_params ? new Set(request_validator_options.allowed_body_params) : undefined;
    return (req: Request, res: Response, next: NextFunction) => {
        for (var req_query_param in req.query) {
            if (!allowed_query_params_set.has(req_query_param)) {
                throw new BadRequestError(`Allowed query params ${Object.keys(request_validator_options.allowed_query_params)}`);
            }
        }
        if (request_validator_options.allowed_body_params && allowed_body_params_set) {
            for (var req_body_param in req.body) {
                if (!allowed_body_params_set.has(req_body_param)) {
                    throw new BadRequestError(`Allowed body params ${Object.keys(request_validator_options.allowed_body_params)}`);
                }
            }
        }
        return next();
    };
}

export const CheckNoQueryParams = check_request({
    allowed_query_params: []
});