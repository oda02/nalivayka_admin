from __future__ import annotations

from pydantic import BaseModel, Field, constr

Username = constr(pattern=r"^[A-Za-z0-9]{3,20}$")


class RegisterRequest(BaseModel):
    name: Username = Field(..., description="ASCII alnum, 3-20 chars")


class RegisterResponse(BaseModel):
    ok: bool = True
    msg: str = "registered"
    name: str


class MeResponse(BaseModel):
    ok: bool
    plaintext: str | None = None
    parsed: dict[str, str] | None = None
    hint: str | None = None
    err: str | None = None


class ErrorResponse(BaseModel):
    ok: bool = False
    err: str
