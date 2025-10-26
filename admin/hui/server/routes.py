import os

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from starlette.responses import FileResponse

from .auth import basic_auth
from .config import STATIC_FILES_DIR, safe_filename
from .extensions import socketio
from .task_manager import task_manager

templates = Jinja2Templates(directory="templates")


def register_routes(app: FastAPI) -> None:
    @app.get("/")
    def index():
        return HTMLResponse("Wheel of Fortune")

    @app.get("/master", response_class=HTMLResponse)
    def master(request: Request, user: str = Depends(basic_auth)):
        return templates.TemplateResponse("master.html", {"request": request})

    @app.get("/master_controls", response_class=HTMLResponse)
    def master_controls(request: Request, user: str = Depends(basic_auth)):
        return templates.TemplateResponse("master_controls.html", {"request": request})

    @app.get("/player/{player_id}", response_class=HTMLResponse)
    def player(
        player_id: int,
        request: Request,
        user: str = Depends(basic_auth),
    ):
        # map basic users player1/player2 -> ids 1/2
        if user == "player1":
            authed_id = 1
        elif user == "player2":
            authed_id = 2
        else:
            raise HTTPException(status_code=401, detail="Unauthorized")
        if authed_id != player_id:
            raise HTTPException(status_code=401, detail="Player ID mismatch")
        return templates.TemplateResponse(
            "player.html", {"request": request, "player_id": player_id}
        )

    @app.get("/api/tasks")
    def get_tasks():
        return JSONResponse(task_manager.tasks)

    @app.get("/api/current-task")
    def get_current_task():
        return JSONResponse(task_manager.current_task or {})

    @app.get("/api/game-state")
    def get_game_state():
        return JSONResponse(
            {
                "game_state": task_manager.game_state,
                "current_task": task_manager.current_task,
                "slave_solutions": task_manager.slave_solutions,
                "player_names": task_manager.player_names,
                "used_indices": list(task_manager.used_tasks),
            }
        )

    @app.post("/api/player-names")
    async def update_player_names(request: Request, user: str = Depends(basic_auth)):
        body = await request.json()
        names = body or {}
        allowed_ids: list[int]
        if user == "player1":
            allowed_ids = [1]
        elif user == "player2":
            allowed_ids = [2]
        else:
            allowed_ids = [1, 2]

        for sid in allowed_ids:
            key = str(sid)
            if key in names and isinstance(names[key], str):
                task_manager.player_names[sid] = names[key].strip()[:50] or (
                    f"Player {sid}"
                )

        # broadcast updated names
        await socketio.emit(
            "game_state_update",
            {
                "game_state": task_manager.game_state,
                "current_task": task_manager.current_task,
                "slave_solutions": task_manager.slave_solutions,
                "player_names": task_manager.player_names,
            },
        )
        return JSONResponse({"player_names": task_manager.player_names})

    @app.get("/download/{filename}")
    def download_file(filename: str):
        filename_only = safe_filename(filename)
        file_path = os.path.join(STATIC_FILES_DIR, filename_only)

        if (
            task_manager.current_task
            and task_manager.current_task.get("type") == "Static"
            and task_manager.current_task.get("link") == filename
        ):
            if os.path.exists(file_path):
                return FileResponse(file_path, filename=filename_only)
            else:
                raise HTTPException(status_code=404, detail="File not found")
        else:
            raise HTTPException(status_code=403, detail="Access denied")
