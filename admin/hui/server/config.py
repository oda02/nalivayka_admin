import json
from pathlib import Path

CONFIG_PATH = "config/tasks.json"
STATIC_FILES_DIR = "static_files"


TIMER_CONFIG = {"max_time": 300, "warning_threshold": 60}

# Basic Auth users (username -> password)
BASIC_USERS = {
    "master": "master123",
    "controls": "controls123",
    "player1": "player1",
    "player2": "player2",
}


def load_tasks(config_path: str) -> list:
    try:
        with open(config_path, "r") as f:
            config = json.load(f)
            return config.get("tasks", [])
    except Exception as e:
        print(f"Error loading config: {e}")
        return []


def safe_filename(filename: str) -> str:
    return Path(filename).name
