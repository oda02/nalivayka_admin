from __future__ import annotations

from pydantic import BaseModel, StringConstraints  # type: ignore
from typing_extensions import Annotated

Username = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9]{3,50}$")]


class RegisterRequest(BaseModel):
    name: Username


class RegisterResponse(BaseModel):
    ok: bool = True
    msg: str = "registered"
    name: str


class ErrorResponse(BaseModel):
    ok: bool = False
    err: str
