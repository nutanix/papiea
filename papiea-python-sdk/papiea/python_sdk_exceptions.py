import json
import logging
from typing import Any, List, Optional

from aiohttp import ClientResponse

from papiea.core import PapieaError
from papiea.utils import json_loads_attrs


class ApiException(Exception):
    def __init__(self, status: int, reason: str, details: str):
        super().__init__(reason)
        self.status = status
        self.reason = reason
        self.details = details


async def check_response(resp: ClientResponse, logger: logging.Logger):
    if resp.status >= 400:
        await PapieaBaseException.raise_error(resp, logger)


class PapieaBaseException(Exception):
    # Sending in details because connected may be closed by the time
    # Info details are requested
    def __init__(self, message: str, resp: ClientResponse, details: Any):
        super().__init__(message)
        self.resp = resp
        self.details = details

    @staticmethod
    async def raise_error(resp: ClientResponse, logger: logging.Logger):
        details = await resp.text()
        try:
            details = json_loads_attrs(details)
            logger.error(f"Got exception while making request. Status: {resp.status}, Reason: {resp.reason}, Details: {details}")
        except:
            logger.error(f"Got exception while making request. Status: {resp.status}, Reason: {resp.reason}")
            raise ApiException(resp.status, resp.reason, details)
        error = details.get("error")
        logger.info(error)
        if error:
            logger.info("There is error")
            logger.info(error["type"])
            logger.info(EXCEPTION_MAP)
            exception = EXCEPTION_MAP.get(error["type"])
            logger.info(exception)
            if exception:
                logger.info("There is exception")
                raise exception(error["message"], resp, details)
        raise ApiException(resp.status, resp.reason, details)


class ConflictingEntityException(PapieaBaseException):
    pass


class EntityNotFoundException(PapieaBaseException):
    pass


class PermissionDeniedException(PapieaBaseException):
    pass


class ProcedureInvocationException(PapieaBaseException):
    pass


class UnauthorizedException(PapieaBaseException):
    pass


class ValidationException(PapieaBaseException):
    pass


class BadRequestException(PapieaBaseException):
    pass


class PapieaServerException(PapieaBaseException):
    pass


class InvocationError(Exception):
    def __init__(
            self,
            status_code: int,
            message: str,
            errors: List[Any],
            stack: Optional[str] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.errors = errors
        self.stack = stack

    @staticmethod
    def from_error(e: Exception):
        return InvocationError(500, str(e), [e])

    def to_response(self) -> dict:
        return {
            "errors": self.errors,
            "message": self.message,
            "stacktrace": self.stack,
        }


class SecurityApiError(InvocationError):
    @staticmethod
    def from_error(e: Exception, message: str):
        return SecurityApiError(500, message, [e])


EXCEPTION_MAP = {
    PapieaError.ConflictingEntity: ConflictingEntityException,
    PapieaError.EntityNotFound: EntityNotFoundException,
    PapieaError.PermissionDenied: PermissionDeniedException,
    PapieaError.ProcedureInvocation: ProcedureInvocationException,
    PapieaError.Unauthorized: UnauthorizedException,
    PapieaError.Validation: ValidationException,
    PapieaError.BadRequest: BadRequestException,
    PapieaError.ServerError: PapieaServerException
}
