from __future__ import annotations

from cookie.routers.session import router as session_router
from fastapi import FastAPI  # type: ignore

app = FastAPI(title="Cookie")
app.include_router(session_router)


if __name__ == "__main__":
    import uvicorn  # type: ignore

    uvicorn.run(app, host="0.0.0.0", port=8000)
