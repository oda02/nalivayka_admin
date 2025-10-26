from __future__ import annotations

from fastapi import FastAPI

from back.routers.session import router as session_router

app = FastAPI(title="CBC Bitflip Session Demo")
app.include_router(session_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
