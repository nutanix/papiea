import os
import asyncio
import inflect
import logging
import pytest

from typing import Optional
from yaml import Loader as YamlLoader
from yaml import load as load_yaml

from papiea.client import EntityCRUD
from papiea.core import Action, ProcedureDescription, S2SKey, Spec, ConstructorProcedureDescription, ConstructorResult, \
    AttributeDict, CreateS2SKeyRequest
from papiea.python_sdk import ProviderSdk

SERVER_PORT = int(os.environ.get("SERVER_PORT", "3000"))
ADMIN_KEY = os.environ.get("PAPIEA_ADMIN_S2S_KEY", "")
PAPIEA_URL = "http://localhost:3000"

SERVER_CONFIG_HOST = "localhost"
SERVER_CONFIG_PORT = 9005
PROVIDER_VERSION = "0.1.0"
PROVIDER_ADMIN_S2S_KEY = "Sa8xaic9"

inflect_engine = inflect.engine()
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s.%(msecs)03d %(levelname)s %(module)s - %(funcName)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

'''
provider_api_admin
provider_api
entity_api
'''


def load_yaml_from_file(filename):
    with open(filename) as f:
        return load_yaml(f, Loader=YamlLoader)


async def create_user_s2s_key(sdk: ProviderSdk):
    admin_security_api = sdk.provider_security_api

    the_key = CreateS2SKeyRequest(
        name="location provider some.user s2s key",
        user_info={"owner": "nitesh", "tenant": "ada14b27-c147-4aca-9b9f-7762f1f48426"},
    )

    new_s2s_key = await admin_security_api.create_key(the_key)
    user_security_api = sdk.new_security_api(new_s2s_key.key)
    await user_security_api.user_info()
    return new_s2s_key.key


class TestBasic:
    @pytest.mark.asyncio
    async def test_pluralize_words(self):
        assert inflect_engine.plural_noun("test") == "tests"
        assert inflect_engine.plural_noun("provider") == "providers"
        # use of done callback??

    location_yaml = load_yaml_from_file("./test_data/location_kind_test_data.yml")
    location_array_yaml = load_yaml_from_file("./test_data/location_kind_test_data_array.yml")

    @pytest.mark.asyncio
    async def test_yaml_spec_only_and_properties(self):
        location_field = self.location_yaml["Location"]
        assert location_field["x-papiea-entity"] == "spec-only"
        props = location_field["properties"]
        assert props is not None
        for prop in props:
            assert props[prop] is not None

    @pytest.mark.asyncio
    async def test_empty_kind_yaml(self):
        async with ProviderSdk.create_provider(PAPIEA_URL, ADMIN_KEY, SERVER_CONFIG_HOST, SERVER_CONFIG_PORT) as sdk:
            with pytest.raises(Exception) as excinfo:
                sdk.new_kind({})
            assert str(excinfo.value) == "Wrong kind description specified"

    @pytest.mark.asyncio
    async def test_valid_kind_yaml(self):
        async with ProviderSdk.create_provider(PAPIEA_URL, ADMIN_KEY, SERVER_CONFIG_HOST, SERVER_CONFIG_PORT) as sdk:
            location_manager = sdk.new_kind(self.location_yaml)
            assert location_manager.kind.name == "Location"

    @pytest.mark.asyncio
    async def test_provider_missing_version(self):
        async with ProviderSdk.create_provider(PAPIEA_URL, ADMIN_KEY, SERVER_CONFIG_HOST, SERVER_CONFIG_PORT) as sdk:
            with pytest.raises(Exception) as excinfo:
                sdk.prefix("test_provider")
                sdk.new_kind(self.location_yaml)
                await sdk.register()
                await sdk.server.close()
            assert str(excinfo.value) == "Malformed provider description. Missing: version"

    @pytest.mark.asyncio
    async def test_provider_missing_kind(self):
        async with ProviderSdk.create_provider(PAPIEA_URL, ADMIN_KEY, SERVER_CONFIG_HOST, SERVER_CONFIG_PORT) as sdk:
            with pytest.raises(Exception) as excinfo:
                sdk.prefix("test_provider")
                sdk.version(PROVIDER_VERSION)
                await sdk.register()
                await sdk.server.close()
            assert str(excinfo.value) == "Malformed provider description. Missing: kind"

    @pytest.mark.asyncio
    async def test_provider_missing_prefix(self):
        async with ProviderSdk.create_provider(PAPIEA_URL, ADMIN_KEY, SERVER_CONFIG_HOST, SERVER_CONFIG_PORT) as sdk:
            with pytest.raises(Exception) as excinfo:
                sdk.version(PROVIDER_VERSION)
                sdk.new_kind(self.location_yaml)
                await sdk.register()
                await sdk.server.close()
            assert str(excinfo.value) == "Malformed provider description. Missing: prefix"

    @pytest.mark.asyncio
    async def test_provider_on_create_should_change_request_format_when_set(self):
        async with ProviderSdk.create_provider(PAPIEA_URL, ADMIN_KEY, SERVER_CONFIG_HOST, SERVER_CONFIG_PORT) as sdk:
            try:
                sdk.version(PROVIDER_VERSION)
                sdk.prefix("location_provider_on_create")

                async def on_create_handler(ctx, handler_input) -> ConstructorResult:
                    spec = AttributeDict(x=handler_input["x"], y=handler_input["y"])
                    return ConstructorResult(spec=spec, status=spec)

                location = sdk.new_kind(self.location_yaml)
                location.on_create(ConstructorProcedureDescription(input_schema={
                    "Location": {
                        "properties": {
                            "x": {
                                "type": "number"
                            },
                            "y": {
                                "type": "number"
                            }
                        }
                    }
                }), on_create_handler)

                await sdk.register()

                user_s2s_key = await create_user_s2s_key(sdk)

                async with EntityCRUD(
                        PAPIEA_URL, "location_provider_on_create", "0.1.0", "Location", user_s2s_key
                ) as entity_client:

                    entity = await entity_client.create(
                        {"spec": Spec(x=10, y=11)}
                    )
                    updated_entity = await entity_client.get(entity.metadata)

                    assert updated_entity.metadata.spec_version == 1
                    assert updated_entity.status.x == 10

            except Exception as ex:
                print(str(ex))
            finally:
                await sdk.server.close()

    @pytest.mark.asyncio
    async def test_provider_on_create_should_change_request_format_when_not_set(self):
        async with ProviderSdk.create_provider(PAPIEA_URL, ADMIN_KEY, SERVER_CONFIG_HOST, SERVER_CONFIG_PORT) as sdk:
            try:
                sdk.version(PROVIDER_VERSION)
                sdk.prefix("location_provider_on_create_2")

                location = sdk.new_kind(self.location_yaml)

                await sdk.register()

                user_s2s_key = await create_user_s2s_key(sdk)

                async with EntityCRUD(
                        PAPIEA_URL, "location_provider_on_create_2", "0.1.0", "Location", user_s2s_key
                ) as entity_client:

                    entity = await entity_client.create(
                        {"spec": Spec(x=10, y=11)}
                    )
                    updated_entity = await entity_client.get(entity.metadata)

                    assert updated_entity.metadata.spec_version == 1
                    assert updated_entity.status.x == 10

            except Exception as ex:
                print(str(ex))
            finally:
                await sdk.server.close()

    @pytest.mark.asyncio
    async def test_provider_entity_modify(self):
        async with ProviderSdk.create_provider(PAPIEA_URL, ADMIN_KEY, SERVER_CONFIG_HOST, SERVER_CONFIG_PORT) as sdk:
            try:
                sdk.version(PROVIDER_VERSION)
                sdk.prefix("location_provider")

                location = sdk.new_kind(self.location_yaml)
                procedure_description = ProcedureDescription(
                    input_schema=load_yaml_from_file('./test_data/procedure_move_input.yml'),
                    output_schema=load_yaml_from_file('./test_data/procedure_move_output.yml')
                )

                async def movex_handler(ctx, entity, input):
                    entity.spec.x += input
                    allowed = await ctx.check_permission([(Action.Update, entity.metadata)])
                    if not allowed:
                        raise Exception("Permission denied")
                    async with ctx.entity_client_for_user(entity.metadata) as entity_client:
                        await entity_client.update(entity.metadata, entity.spec)
                    return entity.spec.x

                location.entity_procedure(
                    "moveX",
                    procedure_description,
                    movex_handler
                )
                await sdk.register()

                user_s2s_key = await create_user_s2s_key(sdk)
                async with EntityCRUD(
                        PAPIEA_URL, "location_provider", "0.1.0", "Location", user_s2s_key
                ) as entity_client:

                    entity = await entity_client.create(
                        {"spec": Spec(x=10, y=11)}
                    )
                    await entity_client.invoke_procedure("moveX", entity.metadata, 5)
                    updated_entity = await entity_client.get(entity.metadata)

                    assert updated_entity.metadata.spec_version == 2
                    assert updated_entity.spec.x == 15
            except Exception as e:
                print(str(e))
            finally:
                await sdk.server.close()
