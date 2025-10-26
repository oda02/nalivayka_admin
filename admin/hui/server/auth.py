import secrets

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .config import BASIC_USERS


def require_master_display_secret(request: Request) -> None:
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="Deprecated")


def require_master_controls_secret(request: Request) -> None:
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="Deprecated")


def require_slave_secret(request: Request) -> str:
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="Deprecated")


security = HTTPBasic()


def basic_auth(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    username = credentials.username
    password = credentials.password
    expected = BASIC_USERS.get(username)
    if not expected or not secrets.compare_digest(expected, password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication",
            headers={"WWW-Authenticate": "Basic"},
        )
    return username
