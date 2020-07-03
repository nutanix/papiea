import logging
from types import TracebackType
from typing import Any, Optional, Type, Callable, AsyncGenerator

from .api import ApiInstance
from .core import AttributeDict, Entity, EntityReference, EntitySpec, Metadata, Spec

FilterResults = AttributeDict

BATCH_SIZE = 20

class EntityCRUD(object):
    def __init__(
        self,
        papiea_url: str,
        provider: str,
        version: str,
        kind: str,
        s2skey: Optional[str] = None,
        logger: logging.Logger = logging.getLogger(__name__),
    ):
        headers = {
            "Content-Type": "application/json",
        }
        if s2skey is not None:
            headers["Authorization"] = f"Bearer {s2skey}"
        self.api_instance = ApiInstance(
            f"{papiea_url}/services/{provider}/{version}/{kind}", headers=headers, logger=logger
        )

    async def __aenter__(self) -> "EntityCRUD":
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        await self.api_instance.close()

    async def get(self, entity_reference: EntityReference) -> Entity:
        return await self.api_instance.get(entity_reference.uuid)

    async def create(
        self, spec: Spec, metadata_extension: Optional[Any] = None
    ) -> EntitySpec:
        payload = {"spec": spec}
        if metadata_extension is not None:
            payload["metadata"] = {"extension": metadata_extension}
        return await self.api_instance.post("", payload)

    async def create_with_meta(self, metadata: Metadata, spec: Spec) -> EntitySpec:
        payload = {"metadata": metadata, "spec": spec}
        return await self.api_instance.post("", payload)

    async def update(self, metadata: Metadata, spec: Spec) -> EntitySpec:
        payload = {"metadata": {"spec_version": metadata.spec_version}, "spec": spec}
        return await self.api_instance.put(metadata.uuid, payload)

    async def delete(self, entity_reference: EntityReference) -> None:
        return await self.api_instance.delete(entity_reference.uuid)

    async def filter(self, filter_obj: Any) -> FilterResults:
        res = await self.api_instance.post("filter", filter_obj)
        return res.data

    async def filter_iter(self, filter_obj: Any) -> Callable[[Optional[int], Optional[int]], AsyncGenerator[Any, None]]:
        async def iter_func(batch_size: Optional[int] = None, offset: Optional[int] = None):
            if not batch_size:
                batch_size = BATCH_SIZE
            res = await self.api_instance.post(f"filter?limit={batch_size}&offset={offset or ''}", filter_obj)
            print(f"RESULT: {res}")
            if len(res.data.results) == 0:
                return
            else:
                for entity in res.data.results:
                    yield entity
                offset = offset or 0
                async for val in iter_func(batch_size, offset):
                    yield val
                return
        return iter_func

    async def list_iter(self) -> Callable[[Optional[int], Optional[int]], AsyncGenerator[Any, None]]:
        return await self.filter_iter({})

    async def invoke_procedure(
        self, procedure_name: str, entity_reference: EntityReference, input_: Any
    ) -> Any:
        payload = {"input": input_}
        return await self.api_instance.post(
            f"{entity_reference.uuid}/procedure/{procedure_name}", payload
        )

    async def invoke_kind_procedure(self, procedure_name: str, input_: Any) -> Any:
        payload = {"input": input_}
        return await self.api_instance.post(f"procedure/{procedure_name}", payload)


class ProviderClient(object):
    def __init__(
        self,
        papiea_url: str,
        provider: str,
        version: str,
        s2skey: Optional[str] = None,
        logger: logging.Logger = logging.getLogger(__name__),
    ):
        self.papiea_url = papiea_url
        self.provider = provider
        self.version = version
        self.s2skey = s2skey
        self.logger = logger
        headers = {
            "Content-Type": "application/json",
        }
        if s2skey is not None:
            headers["Authorization"] = f"Bearer {s2skey}"
        self.api_instance = ApiInstance(
            f"{papiea_url}/services/{provider}/{version}", headers=headers, logger=logger
        )

    async def __aenter__(self) -> "ProviderClient":
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        await self.api_instance.close()

    def get_kind(self, kind: str) -> EntityCRUD:
        return EntityCRUD(
            self.papiea_url, self.provider, self.version, kind, self.s2skey, self.logger
        )

    async def invoke_procedure(self, procedure_name: str, input: Any) -> Any:
        payload = {"input": input}
        return await self.api_instance.post(f"procedure/{procedure_name}", payload)
