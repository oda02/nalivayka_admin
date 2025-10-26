from __future__ import annotations

from pydantic import BaseModel, Field  # type: ignore


class RegisterRequest(BaseModel):
    name: str = Field(
        ...,
        description="ASCII alnum, 3-20 chars",
        pattern=r"^[A-Za-z0-9]{3,20}$",
    )


class RegisterResponse(BaseModel):
    ok: bool = True
    msg: str = "registered"
    name: str


class ErrorResponse(BaseModel):
    ok: bool = False
    err: str
