import json
from typing import Any, List, Optional, Tuple
from deprecated import deprecated
from aiohttp import ClientSession
from multidict import CIMultiDict

from .client import EntityCRUD
from .core import Action, Entity, EntityReference, Metadata, Secret, Status, Version


class ProceduralCtx(object):
    def __init__(
        self,
        provider,
        provider_prefix: str,
        provider_version: str,
        headers: CIMultiDict,
    ):
        self.provider_url = provider.provider_url
        self.base_url = provider.entity_url
        self.provider_prefix = provider_prefix
        self.provider_version = provider_version
        self.provider_api = provider.provider_api
        self.provider = provider
        self.headers = headers

    def url_for(self, entity: Entity) -> str:
        return self.base_url + "/" + self.provider_prefix + "/" + self.provider_version \
            + "/" + entity.metadata.kind + "/" + entity.metadata.uuid

    def entity_client_for_user(self, entity_reference: EntityReference) -> EntityCRUD:
        return EntityCRUD(
            self.provider.papiea_url,
            self.provider_prefix,
            self.provider_version,
            entity_reference.kind,
            self.get_invoking_token(),
            self.provider.logger,
        )

    async def check_permission(
        self,
        entity_action: List[Tuple[Action, EntityReference]],
        user_token: Optional[str] = None,
        provider_prefix: Optional[str] = None,
        provider_version: Optional[Version] = None,
    ) -> bool:
        if provider_prefix is None:
            provider_prefix = self.provider_prefix
        if provider_version is None:
            provider_version = self.provider_version
        headers = {
            "Content-Type": "application/json",
        }
        if user_token is not None:
            headers["Authorization"] = f"Bearer {user_token}"
        else:
            headers["Authorization"] = self.headers["Authorization"]
        return await self.try_check(
            provider_prefix, provider_version, entity_action, headers
        )

    async def try_check(
        self,
        provider_prefix: str,
        provider_version: Version,
        entity_action: List[Tuple[Action, EntityReference]],
        headers: dict = {},
    ) -> bool:
        try:
            data_binary = json.dumps(entity_action).encode("utf-8")
            async with ClientSession() as session:
                async with session.post(
                    f"{ self.base_url }/{ provider_prefix }/{ provider_version }/check_permission",
                    data=data_binary,
                    headers=headers,
                ) as resp:
                    res = await resp.text()
            res = json.loads(res)
            return res["success"] == "Ok"
        except Exception as e:
            return False

    async def update_status(
        self, entity_metadata: Metadata, status: Status
    ) -> Any:
        url = f"{self.provider.get_prefix()}/{self.provider.get_version()}"
        return await self.provider_api.patch(
            f"{url}/update_status",
            {"metadata": entity_metadata, "status": status},
        )

    @deprecated(version='0.11.0', reason="This function will be removed soon. Use update_status instead.")
    async def replace_status(
        self, entity_metadata: Metadata, status: Status
    ) -> Any:
        '''
        Function which calls post on the update_status endpoint
        which internally calls the mongo update function with upsert
        flag set to true.

        This functions inserts a new document if no matching document
        is found for the query.
        '''
        url = f"{self.provider.get_prefix()}/{self.provider.get_version()}"
        return await self.provider_api.post(
            f"{url}/update_status",
            {"metadata": entity_metadata, "status": status},
        )

    def update_progress(self, message: str, done_percent: int) -> bool:
        raise Exception("Unimplemented")

    def get_provider_security_api(self):
        return self.provider.provider_security_api

    def get_user_security_api(self, user_s2skey: Secret):
        return self.provider.new_security_api(user_s2skey)

    def get_headers(self) -> CIMultiDict:
        return self.headers

    def get_invoking_token(self) -> str:
        if "authorization" in self.headers:
            parts = self.headers["authorization"].split(" ")
            if parts[0] == "Bearer":
                return parts[1]
        raise Exception("Request has invalid user authorization info")

class IntentfulCtx(ProceduralCtx):
    pass
