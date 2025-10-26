import time
from typing import TypedDict

from .config import TIMER_CONFIG


class _TimerEntry(TypedDict):
    start_time: float | None
    remaining_time: float
    running: bool


class TimerStore:
    def __init__(self) -> None:
        self.slave_timers: dict[int, _TimerEntry] = {
            1: {
                "start_time": None,
                "remaining_time": float(TIMER_CONFIG["max_time"]),
                "running": False,
            },
            2: {
                "start_time": None,
                "remaining_time": float(TIMER_CONFIG["max_time"]),
                "running": False,
            },
        }

    def start_for_both(self) -> None:
        current_time = time.time()
        for slave_id in [1, 2]:
            self.slave_timers[slave_id]["start_time"] = current_time
            self.slave_timers[slave_id]["remaining_time"] = float(
                TIMER_CONFIG["max_time"]
            )
            self.slave_timers[slave_id]["running"] = True

    def reset_all(self) -> None:
        for slave_id in [1, 2]:
            self.slave_timers[slave_id]["running"] = False
            self.slave_timers[slave_id]["remaining_time"] = float(
                TIMER_CONFIG["max_time"]
            )

    def add_time(self, slave_id: int, seconds: int) -> bool:
        if slave_id in [1, 2] and self.slave_timers[slave_id]["running"]:
            self.slave_timers[slave_id]["remaining_time"] += seconds
            return True
        return False

    def snapshot(self) -> dict[int, dict[str, int | bool]]:
        timer_state: dict[int, dict[str, int | bool]] = {}
        current_time = time.time()

        for slave_id, timer in self.slave_timers.items():
            start_time = timer["start_time"]
            if timer["running"] and start_time is not None:
                elapsed = current_time - start_time
                remaining_time = max(0.0, timer["remaining_time"] - elapsed)

                timer_state[slave_id] = {
                    "remaining_time": int(remaining_time),
                    "running": True,
                    "max_time": TIMER_CONFIG["max_time"],
                }

                if remaining_time <= 0.0:
                    timer["running"] = False
                    # Persist zero so subsequent snapshots keep 0 when not running
                    timer["remaining_time"] = 0.0
            else:
                timer_state[slave_id] = {
                    "remaining_time": int(timer["remaining_time"]),
                    "running": False,
                    "max_time": TIMER_CONFIG["max_time"],
                }

        return timer_state


timer_store = TimerStore()
