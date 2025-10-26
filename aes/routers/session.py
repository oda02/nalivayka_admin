from __future__ import annotations

import os

from core.crypto import dec_session, enc_session, parse_kv_semicolons
from fastapi import APIRouter, Cookie
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from schemas.session import ErrorResponse, RegisterRequest, RegisterResponse

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
async def root():
    return HTMLResponse(
        """
        <h2>CBC Bitflip Session Demo</h2>
        <p>POST <code>/register</code> with JSON <code>{"name": "alice"}</code> to receive a session cookie.</p>
        <p>Name must be 3-20 ASCII letters or digits: <code>^[A-Za-z0-9]{3,20}$</code>.</p>
        <p>Then visit <code>/me</code> to view your session, and try to gain access to <code>/admin</code>.</p>
        """
    )


@router.post(
    "/register",
    response_model=RegisterResponse,
    responses={400: {"model": ErrorResponse}},
)
async def register(payload: RegisterRequest):
    token = enc_session(payload.name)
    resp = JSONResponse(RegisterResponse(name=payload.name).model_dump())
    resp.set_cookie(
        key="session",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=3600,
    )
    return resp


@router.get("/admin", response_class=PlainTextResponse)
async def admin(session: str | None = Cookie(default=None)):
    if not session:
        return PlainTextResponse("no session", status_code=401)
    try:
        pt = dec_session(session)
        kv = parse_kv_semicolons(pt)
        if kv.get("admin") == "true":
            return PlainTextResponse(os.environ.get("FLAG"))
        else:
            return PlainTextResponse("forbidden", status_code=403)
    except Exception:
        return PlainTextResponse("bad session", status_code=400)
