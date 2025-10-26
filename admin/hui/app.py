import uvicorn
from server.app_factory import create_app

app, asgi_app = create_app()

# For uvicorn: target `asgi_app`
if __name__ == "__main__":
    uvicorn.run(asgi_app, host="0.0.0.0", port=5000)
