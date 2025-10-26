from fastapi import FastAPI
from socketio import ASGIApp
from starlette.staticfiles import StaticFiles

from .extensions import socketio
from .routes import register_routes
from .sockets import register_socket_handlers


def create_app():
    app = FastAPI()

    # Serve static files (css/js)
    app.mount("/static", StaticFiles(directory="static"), name="static")

    # register routes and sockets
    register_routes(app)
    register_socket_handlers(app)

    # Wrap FastAPI with Socket.IO ASGI app
    asgi_app = ASGIApp(socketio, other_asgi_app=app)

    return app, asgi_app
