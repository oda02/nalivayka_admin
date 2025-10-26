import asyncio

from socketio import AsyncNamespace

from .extensions import socketio
from .task_manager import task_manager
from .timer import timer_store


async def broadcast_game_state() -> None:
    await socketio.emit(
        "game_state_update",
        {
            "game_state": task_manager.game_state,
            "current_task": task_manager.current_task,
            "slave_solutions": task_manager.slave_solutions,
            "player_names": task_manager.player_names,
            "used_indices": list(task_manager.used_tasks),
        },
    )


async def broadcast_timer_state() -> dict:
    timer_state = timer_store.snapshot()
    await socketio.emit("timer_update", timer_state)
    return timer_state


class _TimerBroadcaster(AsyncNamespace):
    async def on_connect(self, sid, environ):
        print(f"Client connected: {sid}")
        await socketio.emit(
            "game_state_update",
            {
                "game_state": task_manager.game_state,
                "current_task": task_manager.current_task,
                "slave_solutions": task_manager.slave_solutions,
                "used_indices": list(task_manager.used_tasks),
                "player_names": task_manager.player_names,
            },
            to=sid,
        )
        await broadcast_timer_state()

    async def on_disconnect(self, sid):
        print(f"Client disconnected: {sid}")

    async def on_spin_wheel(self, sid):
        print("Spinning wheel...")

        try:
            selected_task, task_index = task_manager.spin_wheel()
            if selected_task:
                await socketio.emit(
                    "wheel_spinning",
                    {"task": selected_task, "task_index": task_index},
                    room="master_clients",
                )
                return {
                    "success": True,
                    "task": selected_task,
                    "task_index": task_index,
                }
            else:
                return {"success": False, "error": "No tasks available"}
        except Exception as e:
            print(f"Error in spin_wheel: {e}")
            return {"success": False, "error": str(e)}

    async def on_join_master_room(self, sid):
        await socketio.enter_room(sid, "master_clients")
        print(f"Master client joined room: {sid}")

    async def on_wheel_stopped(self, sid, data):
        task_index = data.get("task_index")
        print(f"Wheel stopped on task index: {task_index}")

        if task_index is not None and task_index < len(task_manager.tasks):
            task_manager.used_tasks.add(task_index)
            task_manager.current_task = task_manager.tasks[task_index]
            task_manager.game_state = "active"
            task_manager.slave_solutions = {1: False, 2: False}

            timer_store.start_for_both()

            print(f"Task marked as used: {task_manager.current_task['name']}")
            print(
                f"Used tasks count: {len(task_manager.used_tasks)}/{len(task_manager.tasks)}"
            )
            print("Timers started for both slaves")

            await broadcast_game_state()
            await broadcast_timer_state()

            await socketio.emit(
                "task_selected",
                {
                    "task": task_manager.current_task,
                    "used_count": len(task_manager.used_tasks),
                    "total_count": len(task_manager.tasks),
                    "used_indices": list(task_manager.used_tasks),
                },
            )
            print(
                f"Task selected event sent to players: {task_manager.current_task['name']}"
            )
        else:
            print(f"Invalid task index: {task_index}")

    async def on_get_current_state(self, sid):
        await socketio.emit(
            "current_state",
            {
                "current_task": task_manager.current_task,
                "used_count": len(task_manager.used_tasks),
                "total_count": len(task_manager.tasks),
                "game_state": task_manager.game_state,
                "slave_solutions": task_manager.slave_solutions,
                "player_names": task_manager.player_names,
            },
            to=sid,
        )

    async def on_add_time_to_slave(self, sid, data):
        slave_id = data.get("slave_id")
        seconds = data.get("seconds", 30)

        if timer_store.add_time(slave_id, seconds):
            remaining = timer_store.slave_timers[slave_id]["remaining_time"]
            print(
                f"Added {seconds} seconds to slave {slave_id}. Remaining: {remaining}s"
            )
            await broadcast_timer_state()
            return {"success": True}
        else:
            return {"success": False, "error": "Invalid slave ID or timer not running"}

    async def on_verify_secret(self, sid, data):
        # Only allow submissions when game is active
        if task_manager.game_state != "active":
            return {"success": False, "error": "Game is not active"}

        submitted_secret = data.get("secret")
        slave_id = data.get("slave_id")

        print(f"Secret verification attempt from slave {slave_id}")

        if (
            task_manager.current_task
            and task_manager.current_task.get("secret") == submitted_secret
        ):
            task_manager.slave_solutions[slave_id] = True
            print(f"Slave {slave_id} solved the task!")

            await broadcast_game_state()

            if all(task_manager.slave_solutions.values()):
                print("Both players solved the task! Stopping timers.")
                for sid_itr in [1, 2]:
                    timer_store.slave_timers[sid_itr]["running"] = False
                await broadcast_timer_state()
                task_manager.game_state = "completed"
                await broadcast_game_state()

            return {"success": True, "message": "Correct secret!"}
        else:
            return {"success": False, "error": "Incorrect secret"}

    async def on_reset_game(self, sid):
        print("Resetting game...")
        task_manager.reset_game()
        timer_store.reset_all()

        await broadcast_game_state()
        await broadcast_timer_state()

        await socketio.emit("game_reset")
        return {"success": True}

    async def on_reset_slaves(self, sid):
        print("Resetting slaves to waiting state...")
        task_manager.slave_solutions = {1: False, 2: False}
        task_manager.game_state = "active"

        await broadcast_game_state()
        await socketio.emit("slaves_reset")
        return {"success": True}

    async def on_get_timer_state(self, sid):
        state = await broadcast_timer_state()
        # If both timers are not running and zero, ensure game is completed
        if all(not t["running"] and t["remaining_time"] == 0 for t in state.values()):
            if task_manager.game_state == "active":
                task_manager.game_state = "completed"
                await broadcast_game_state()

    async def on_stop_game(self, sid):
        for sid_itr in [1, 2]:
            timer_store.slave_timers[sid_itr]["running"] = False

        task_manager.game_state = "completed"
        await broadcast_timer_state()
        await broadcast_game_state()
        return {"success": True}

    async def on_cancel_round(self, sid):
        # Cancel the current round without marking task as used
        if task_manager.current_task is not None:
            try:
                idx = task_manager.tasks.index(task_manager.current_task)
                if idx in task_manager.used_tasks:
                    task_manager.used_tasks.discard(idx)
            except ValueError:
                pass
        task_manager.current_task = None
        task_manager.game_state = "waiting"
        task_manager.slave_solutions = {1: False, 2: False}
        timer_store.reset_all()
        await broadcast_timer_state()
        await broadcast_game_state()
        await socketio.emit("round_canceled")
        return {"success": True}


def register_socket_handlers(app) -> None:
    namespace = _TimerBroadcaster("/")
    socketio.register_namespace(namespace)

    async def _loop():
        while True:
            await asyncio.sleep(1)
            if any(t["running"] for t in timer_store.slave_timers.values()):
                await broadcast_timer_state()

    socketio.start_background_task(_loop)
