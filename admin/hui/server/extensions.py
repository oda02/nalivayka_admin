from socketio import AsyncServer

# ASGI-compatible Socket.IO server (used with FastAPI)
socketio = AsyncServer(async_mode="asgi", cors_allowed_origins="*")
