import { Entity_API } from "./entity_api_interface";
import { Router } from "express";
import { Query } from 'express-serve-static-core';
import { UserAuthInfo, asyncHandler } from '../auth/authn';
import { BadRequestError } from '../errors/bad_request_error';
import { processPaginationParams, processSortQuery } from "../utils/utils";
import { SortParams } from "./entity_api_impl";
import { CheckNoQueryParams, check_request } from "../validator/express_validator";
import {Version} from "papiea-core"
import {RequestContext} from "papiea-backend-utils"
import * as Async from "../utils/async"

const CheckProcedureCallParams = check_request({
    allowed_query_params: []
});

interface PaginatedResult<T> {
    results: T[],
    entity_count: number
}

export function createEntityAPIRouter(entity_api: Entity_API, trace: Function): Router {
    const router = Router();

    const paginateEntities = function<T>(entities: T[], skip: number, size: number): PaginatedResult<T> {
        const totalEntities: number = entities.length;
        const pageEntities = entities.slice(skip, skip + size);

        return { results: pageEntities, entity_count: totalEntities };
    }

    const filterEntities = async (user: UserAuthInfo, prefix: string, version: Version, kind_name: string, filter: any, skip: number, size: number, searchDeleted: boolean, exactMatch: boolean, ctx: RequestContext, sortParams?: SortParams): Promise<PaginatedResult<any>> => {
        if (searchDeleted) {
            const entities = await Async.collect(
                entity_api.filter_deleted(user, prefix, version, kind_name, filter, exactMatch, ctx, sortParams))
            return paginateEntities(entities, skip, size)
        }

        const resultSpecs = entity_api.filter_entity_spec(
            user, prefix, version, kind_name, filter, exactMatch, ctx, sortParams);
        const resultStatuses = entity_api.filter_entity_status(
            user, prefix, version, kind_name, filter, exactMatch, ctx, sortParams);

        const uuidToEntity = new Map<string, any>();
        for await (const x of resultSpecs) {
            uuidToEntity.set(x[0].uuid, {metadata: x[0], spec: x[1]});
        }
        for await (const x of resultStatuses) {
            const e = uuidToEntity.get(x[0].uuid);
            if (e) e.status = x[1];
        }

        const entities = Array.from(uuidToEntity.values());
        return paginateEntities(entities, skip, size)
    };

    router.post("/:prefix/:version/check_permission", CheckNoQueryParams, trace("check_permission"), asyncHandler(async (req, res) => {
        res.json(await entity_api.check_permission(req.user, req.params.prefix, req.params.version, req.body, res.locals.ctx))
    }));

    router.get("/intent_watcher/:id", CheckNoQueryParams, trace("get_intent_watcher"), asyncHandler(async (req, res) => {
        res.json(await entity_api.get_intent_watcher(req.user, req.params.id, res.locals.ctx))
    }))

    router.get("/intent_watcher", check_request({
        allowed_query_params: ['offset', 'limit', 'sort', 'entity_ref', 'created_at', 'status']
    }), trace("filter_intent_watcher"), asyncHandler(async (req, res) => {
        const filter: any = {};
        const offset = queryToNum(req.query.offset, 'offset');
        const limit = queryToNum(req.query.limit, 'limit');
        const rawSortQuery = queryToString(req.query.sort, 'sort');
        const sortParams = processSortQuery(rawSortQuery);
        const [skip, size] = processPaginationParams(offset, limit);
        if (req.query.entity_ref) {
            filter.entity_ref = JSON.parse(queryToString(req.query.entity_ref, 'entity_ref') ?? 'undefined')
        }
        if (req.query.created_at) {
            filter.created_at = req.query.created_at
        }
        if (req.query.status) {
            filter.status = req.query.status
        }
        const [watcher_iter, watcher_cursor] = entity_api.filter_intent_watcher(req.user, filter, res.locals.ctx, sortParams)
        const intent_watchers = await Async.collect(watcher_iter)
        await watcher_cursor.close()
        res.json(paginateEntities(intent_watchers, skip, size))
    }))

    router.post("/intent_watcher/filter", check_request({
        allowed_query_params: ['offset', 'limit', 'sort'],
        allowed_body_params: ['entity_ref', 'created_at', 'status']
    }), trace("filter_intent_watcher"), asyncHandler(async (req, res) => {
        const filter: any = {};
        const offset = queryToNum(req.query.offset, 'offset');
        const limit = queryToNum(req.query.limit, 'limit');
        const rawSortQuery = queryToString(req.query.sort, 'sort');
        const sortParams = processSortQuery(rawSortQuery);
        const [skip, size] = processPaginationParams(offset, limit);
        if (req.body.entity_ref) {
            filter.entity_ref = req.body.entity_ref
        }
        if (req.body.created_at) {
            filter.created_at = req.body.created_at
        }
        if (req.body.status) {
            filter.status = req.body.status
        }
        const [watcher_iter, watcher_cursor] = entity_api.filter_intent_watcher(req.user, filter, res.locals.ctx, sortParams)
        const intent_watchers = await Async.collect(watcher_iter)
        await watcher_cursor.close()
        res.json(paginateEntities(intent_watchers, skip, size))
    }))

    router.get("/:prefix/:version/:kind", check_request({
        allowed_query_params: ['offset', 'limit', 'sort', 'spec', 'status', 'metadata', 'exact', 'deleted']
    }), trace("filter_entity"), asyncHandler(async (req, res) => {
        const filter: any = {};
        const offset = queryToNum(req.query.offset, 'offset');
        const limit = queryToNum(req.query.limit, 'limit');
        const rawSortQuery = queryToString(req.query.sort, 'sort');
        const exactMatch = queryToBool(req.query.exact, 'exact') ?? false
        const searchDeleted = queryToBool(req.query.deleted, 'deleted') ?? false
        const sortParams = processSortQuery(rawSortQuery);
        const [skip, size] = processPaginationParams(offset, limit);

        filter.spec = JSON.parse(queryToString(req.query.spec, 'spec') ?? '{}');
        filter.status = JSON.parse(queryToString(req.query.status, 'status') ?? '{}');
        filter.metadata = JSON.parse(queryToString(req.query.metadata, 'metadata') ?? '{}');

        res.json(await filterEntities(req.user, req.params.prefix, req.params.version, req.params.kind, filter, skip, size, searchDeleted, exactMatch, res.locals.ctx, sortParams));
    }));

    router.get("/:prefix/:version/:kind/:uuid", CheckNoQueryParams, trace("get_entity"), asyncHandler(async (req, res) => {
        const [metadata, spec, status] = await entity_api.get_entity(req.user, req.params.prefix, req.params.version, req.params.kind, req.params.uuid, res.locals.ctx);
        res.json({ "metadata": metadata, "spec": spec, "status": status });
    }));

    router.post("/:prefix/:version/:kind/filter", check_request({
        allowed_query_params: ['offset', 'limit', 'sort', 'exact', 'deleted'],
        allowed_body_params: ['spec', 'status', 'metadata', 'offset', 'limit', 'sort']
    }), trace("filter_entity"), asyncHandler(async (req, res) => {
        const offset = queryToNum(req.query.offset, 'offset') ?? req.body.offset;
        const limit = queryToNum(req.query.limit, 'limit') ?? req.body.limit;
        const rawSortQuery = queryToString(req.query.sort, 'sort') ?? req.body.sort;
        const exactMatch = queryToBool(req.query.exact, 'exact') ?? false
        const searchDeleted = queryToBool(req.query.deleted, 'deleted') ?? false
        const sortParams: undefined | SortParams = processSortQuery(rawSortQuery);
        const [skip, size] = processPaginationParams(offset, limit);
        const filter: any = {};
        if (req.body.spec) {
            filter.spec = req.body.spec;
        } else {
            filter.spec = {};
        }
        if (req.body.status) {
            filter.status = req.body.status;
        } else {
            filter.status = {};
        }
        if (req.body.metadata) {
            filter.metadata = req.body.metadata;
        } else {
            filter.metadata = {};
        }

        res.json(await filterEntities(req.user, req.params.prefix, req.params.version, req.params.kind, filter, skip, size, searchDeleted, exactMatch, res.locals.ctx, sortParams));
    }));

    router.put("/:prefix/:version/:kind/:uuid", check_request({
        allowed_query_params: [],
        allowed_body_params: ['metadata', 'spec']
    }), trace("update_entity"), asyncHandler(async (req, res) => {
        const request_metadata = req.body.metadata;
        const result = await entity_api.update_entity_spec(req.user, req.params.uuid, req.params.prefix, request_metadata.spec_version, request_metadata.extension, req.params.kind, req.params.version, req.body.spec, res.locals.ctx);
        res.json(result);
    }));

    router.post("/:prefix/:version/:kind", check_request({
        allowed_query_params: [],
    }), trace("create_entity"), asyncHandler(async (req, res) => {
        const result = await entity_api.save_entity(req.user, req.params.prefix, req.params.kind, req.params.version, req.body, res.locals.ctx);
        res.json(result);
    }));

    router.delete("/:prefix/:version/:kind/:uuid", CheckNoQueryParams, trace("delete_entity"), asyncHandler(async (req, res) => {
        await entity_api.delete_entity(req.user, req.params.prefix, req.params.version, req.params.kind, req.params.uuid, res.locals.ctx);
        res.json("OK")
    }));

    router.post("/:prefix/:version/:kind/:uuid/procedure/:procedure_name", CheckProcedureCallParams, trace("entity_procedure"), asyncHandler(async (req, res) => {
        const result: any = await entity_api.call_procedure(req.user, req.params.prefix, req.params.kind, req.params.version, req.params.uuid, req.params.procedure_name, req.body, res.locals.ctx);
        res.json(result);
    }));

    router.post("/:prefix/:version/:kind/procedure/:procedure_name", CheckProcedureCallParams, trace("kind_procedure"), asyncHandler(async (req, res) => {
        const result: any = await entity_api.call_kind_procedure(req.user, req.params.prefix, req.params.kind, req.params.version, req.params.procedure_name, req.body, res.locals.ctx);
        res.json(result);
    }));

    router.post("/:prefix/:version/procedure/:procedure_name", CheckProcedureCallParams, trace("provider_procedure"), asyncHandler(async (req, res) => {
        const result: any = await entity_api.call_provider_procedure(req.user, req.params.prefix, req.params.version, req.params.procedure_name, req.body, res.locals.ctx);
        res.json(result);
    }));

    return router;
}

type ExpressQueryParam = string | Query | (string | Query)[];

function queryToNum(q?: ExpressQueryParam, fieldName?: string): number | undefined {
    switch (typeof q) {
        case 'number': return q;
        case 'string': return Number.parseFloat(q);
        case 'undefined': return undefined;
        default:
            throw new BadRequestError({ message: `Query parameter: ${fieldName} has invalid type: ${typeof q}, expected (number, string).` });
    }
}

function queryToString(q?: ExpressQueryParam, fieldName?: string): string | undefined {
    switch (typeof q) {
        case 'string': return q;
        case 'undefined': return undefined;
        default:
            throw new BadRequestError({ message: `Query parameter: ${fieldName} has invalid type: ${typeof q}, expected (string).` });
    }
}

function queryToBool(q?: ExpressQueryParam, fieldName?: string): boolean | undefined {
    switch (typeof q) {
        case 'string': return q === "true"
        case 'undefined': return undefined;
        default:
            throw new BadRequestError({ message: `Query parameter: ${fieldName} has invalid type: ${typeof q}, expected (string).` });
    }
}
