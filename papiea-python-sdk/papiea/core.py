import enum
from typing import Any


class AttributeDict(dict):
    __getattr__ = dict.__getitem__
    __setattr__ = dict.__setitem__


Version = str
Secret = str
DataDescription = Any


class ProceduralExecutionStrategy(str):
    HaltIntentful = "Halt_Intentful"


UserInfo = AttributeDict
S2S_Key = AttributeDict
Entity = AttributeDict
EntityReference = AttributeDict
Spec = AttributeDict
EntitySpec = AttributeDict
Metadata = AttributeDict


class Action(str):
    Read = "read"
    Update = "write"
    Create = "create"
    Delete = "delete"
    RegisterProvider = "register_provider"
    UnregisterProvider = "unregister_provider"
    ReadProvider = "read_provider"
    UpdateAuth = "update_auth"
    CreateS2SKey = "create_key"
    ReadS2SKey = "read_key"
    InactivateS2SKey = "inactive_key"
    UpdateStatus = "update_status"


Status = Any
Provider = AttributeDict
Kind = AttributeDict


# TODO: these should be strings
class PapieaError(enum.Enum):
    Validation = "validation_error"
    BadRequest = "bad_request_error"
    ProcedureInvocation = "procedure_invocation_error"
    EntityNotFound = "entity_not_found_error"
    Unauthorized = "unauthorized_error"
    PermissionDenied = "permission_denied_error"
    ConflictingEntity = "conflicting_entity_error"
    ServerError = "server_error"


class IntentfulExecutionStrategy(str):
    Basic = "basic"
    SpecOnly = "spec-only"
    Differ = "differ"


ProviderPower = str
Key = str
ProceduralSignature = AttributeDict
IntentfulSignature = AttributeDict
