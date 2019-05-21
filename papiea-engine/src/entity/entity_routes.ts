import { Entity_API } from "./entity_api_interface";
import { Router } from "express";
import { UserAuthInfo, asyncHandler } from '../auth/authn';


export function createEntityAPIRouter(entity_api: Entity_API): Router {
    const router = Router();

    const filterEntities = async function (user: UserAuthInfo, kind_name: string, filter: any): Promise<any> {
        const resultSpecs: any[] = await entity_api.filter_entity_spec(user, kind_name, filter);
        
        const resultStatuses: any[] = await entity_api.filter_entity_status(user, kind_name, filter);
        
        const uuidToEntity: { [key: string]: any } = {};

        resultSpecs.forEach(x => {
            uuidToEntity[x[0].uuid] = { metadata: x[0], spec: x[1] };
        });

        resultStatuses.forEach(x => {
            if (uuidToEntity[x[0].uuid] !== undefined)
                uuidToEntity[x[0].uuid].status = x[1];
        });

        return Object.values(uuidToEntity);
    };

    router.get("/:prefix/:version/:kind", asyncHandler(async (req, res) => {
        const filter: any = {};
        if (req.query.spec) {
            filter.spec = JSON.parse(req.query.spec);
        } else {
            filter.spec = {};
        }
        if (req.query.status) {
            filter.status = JSON.parse(req.query.status);
        } else {
            filter.status = {};
        }
        if (req.query.metadata) {
            filter.metadata = JSON.parse(req.query.metadata);
        } else {
            filter.metadata = {};
        }
        res.json(await filterEntities(req.user, req.params.kind, filter));
    }));

    router.get("/:prefix/:version/:kind/:uuid", asyncHandler(async (req, res) => {
        const [metadata, spec] = await entity_api.get_entity_spec(req.user, req.params.kind, req.params.uuid);
        const [_, status] = await entity_api.get_entity_status(req.user, req.params.kind, req.params.uuid);
        res.json({ "metadata": metadata, "spec": spec, "status": status });
    }));

    router.post("/:prefix/:version/:kind/filter", asyncHandler(async (req, res) => {
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

        res.json(await filterEntities(req.user, req.params.kind, filter));
    }));

    router.put("/:prefix/:version/:kind/:uuid", asyncHandler(async (req, res) => {
        const request_metadata = req.body.metadata;
        const [metadata, spec] = await entity_api.update_entity_spec(req.user, req.params.uuid, req.params.prefix, request_metadata.spec_version, req.params.kind, req.params.version, req.body.spec);
        res.json({ "metadata": metadata, "spec": spec });
    }));

    router.post("/:prefix/:version/:kind", asyncHandler(async (req, res) => {
        if (req.params.status) {
            const [metadata, spec] = await entity_api.save_entity(req.user, req.params.prefix, req.params.kind, req.params.version, req.body.spec, req.body.metadata);
            res.json({ "metadata": metadata, "spec": spec });
        } else {
            // Spec only entity
            const [metadata, spec] = await entity_api.save_entity(req.user, req.params.prefix, req.params.kind, req.params.version, req.body.spec, req.body.metadata);
            res.json({ "metadata": metadata, "spec": spec });
        }
    }));

    router.delete("/:prefix/:version/:kind/:uuid", asyncHandler(async (req, res) => {
        await entity_api.delete_entity_spec(req.user, req.params.kind, req.params.uuid);
        res.json("OK")
    }));

    router.post("/:prefix/:version/:kind/:uuid/procedure/:procedure_name", asyncHandler(async (req, res) => {
        const result: any = await entity_api.call_procedure(req.user, req.params.prefix, req.params.kind, req.params.version, req.params.uuid, req.params.procedure_name, req.body.input);
        res.json(result);
    }));

    router.post("/:prefix/:version/:kind/procedure/:procedure_name", asyncHandler(async (req, res) => {
        const result: any = await entity_api.call_kind_procedure(req.user, req.params.prefix, req.params.kind, req.params.version, req.params.procedure_name, req.body.input);
        res.json(result);
    }));

    router.post("/:prefix/:version/procedure/:procedure_name", asyncHandler(async (req, res) => {
        const result: any = await entity_api.call_provider_procedure(req.user, req.params.prefix, req.params.version, req.params.procedure_name, req.body.input);
        res.json(result);
    }));

    return router;
}
