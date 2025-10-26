from __future__ import annotations

import os

from cookie.core.crypto import dec_session, enc_session, parse_kv_semicolons
from cookie.schemas.session import RegisterRequest
from fastapi import APIRouter, Cookie, Form, Request
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
)
from fastapi.templating import Jinja2Templates

router = APIRouter()
templates = Jinja2Templates(directory="cookie/templates")


@router.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@router.get("/me", response_class=HTMLResponse)
async def me(request: Request, session: str | None = Cookie(default=None)):
    if not session:
        return templates.TemplateResponse(
            "index.html",
            {"request": request, "error": "You are not logged in."},
        )
    try:
        pt = dec_session(session)
        kv = parse_kv_semicolons(pt)
        return JSONResponse(kv)
    except Exception:
        return templates.TemplateResponse(
            "index.html",
            {"request": request, "error": "Your session is invalid."},
        )


@router.post("/register", response_class=HTMLResponse)
async def register(request: Request, name: str = Form(...)):
    try:
        valid = RegisterRequest(name=name)
    except Exception:
        return templates.TemplateResponse(
            "index.html",
            {"request": request, "error": "Invalid username. Use 3-50 letters/digits."},
            status_code=400,
        )

    token = enc_session(valid.name)
    resp = templates.TemplateResponse(
        "index.html",
        {"request": request, "message": f"Registered as {valid.name}"},
    )
    resp.set_cookie(
        key="session",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=3600,
    )
    return resp


@router.get("/admin")
async def admin(request: Request, session: str | None = Cookie(default=None)):
    if not session:
        return templates.TemplateResponse(
            "forbidden.html", {"request": request}, status_code=401
        )
    try:
        pt = dec_session(session)
        kv = parse_kv_semicolons(pt)
        if kv.get("admin") == "true":
            return PlainTextResponse(os.environ.get("FLAG") or "test_flag")
        else:
            return templates.TemplateResponse(
                "forbidden.html", {"request": request}, status_code=403
            )
    except Exception:
        return templates.TemplateResponse(
            "forbidden.html", {"request": request}, status_code=400
        )


@router.get("/sources")
async def sources():
    path = "cookie/sources/project.zip"
    if os.path.exists(path):
        return FileResponse(path, media_type="application/zip", filename="project.zip")
    return PlainTextResponse("no sources yet", status_code=404)
