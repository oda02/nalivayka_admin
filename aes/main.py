from __future__ import annotations

from fastapi import FastAPI  # type: ignore
from routers.session import router as session_router

app = FastAPI(title="CBC Bitflip Session Demo (AES)")
app.include_router(session_router)


if __name__ == "__main__":
    import uvicorn  # type: ignore

    uvicorn.run(app, host="0.0.0.0", port=8000)
