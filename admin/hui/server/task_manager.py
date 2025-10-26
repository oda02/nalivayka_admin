import random
from typing import Any

from .config import CONFIG_PATH, load_tasks


class TaskManager:
    def __init__(self, config_path: str = CONFIG_PATH):
        self.config_path = config_path
        self.tasks: list[dict[str, Any]] = []
        self.used_tasks: set[int] = set()
        self.current_task: dict[str, Any] | None = None
        self.game_state: str = "waiting"
        self.slave_solutions: dict[int, bool] = {1: False, 2: False}
        self.player_names: dict[int, str] = {1: "Player 1", 2: "Player 2"}
        self.load_config()

    def load_config(self) -> None:
        self.tasks = load_tasks(self.config_path)
        print(f"Loaded {len(self.tasks)} tasks")

    def get_available_tasks(self) -> list[dict[str, Any]]:
        return [task for i, task in enumerate(self.tasks) if i not in self.used_tasks]

    def spin_wheel(self) -> tuple[dict[str, Any] | None, int | None]:
        available_tasks = self.get_available_tasks()
        if not available_tasks:
            self.used_tasks.clear()
            available_tasks = self.tasks
            print("All tasks used, resetting...")

        if available_tasks:
            selected_task = random.choice(available_tasks)
            task_index = self.tasks.index(selected_task)
            print(
                f"Server selected task: {selected_task['name']} (index: {task_index})"
            )
            return selected_task, task_index
        return None, None

    def reset_game(self) -> None:
        self.used_tasks.clear()
        self.current_task = None
        self.game_state = "waiting"
        self.slave_solutions = {1: False, 2: False}
        print("Game reset")


task_manager = TaskManager()
