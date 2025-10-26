class MasterControls {
    constructor() {
        this.socket = io();
        this.gameState = "waiting";
        this.slaveSolutions = { 1: false, 2: false };
        this.currentTask = null;
        this.timerSnapshot = null; // { ts: ms, data: {1:{remaining_time, running, max_time}, 2:{...}} }
        this.ticker = null;
        this.timerPoller = null;

        this.init();
        // Start local ticking regardless; will render when first snapshot arrives
        if (!this.ticker) {
            this.ticker = setInterval(() => this.renderTick(), 1000);
        }
        // Poll for snapshot until received
        if (!this.timerPoller) {
            this.timerPoller = setInterval(() => {
                if (!this.timerSnapshot) {
                    this.socket.emit('get_timer_state');
                }
            }, 3000);
        }
    }

    init() {
        this.setupEventListeners();
        this.socketSetup();
    }

    setupEventListeners() {
        document.getElementById('resetButton').addEventListener('click', () => this.resetGame());
        document.getElementById('spinButton').addEventListener('click', () => this.spinWheel());
        document.getElementById('resetSlavesButton').addEventListener('click', () => this.resetSlaves());
        const stopBtn = document.getElementById('stopGameButton');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopGame());
        }
        const cancelBtn = document.getElementById('cancelRoundButton');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.cancelRound());
        }

        // Timer buttons
        document.querySelectorAll('.add-time-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const slaveId = parseInt(e.target.dataset.slave);
                const seconds = parseInt(e.target.dataset.seconds);
                this.addTimeToSlave(slaveId, seconds);
            });
        });
    }

    socketSetup() {
        this.socket.on('connect', () => {
            console.log('Controls connected to server');
            // Join master room for synchronization
            this.socket.emit('join_master_room');
            this.socket.emit('get_current_state');
            this.socket.emit('get_timer_state');
        });

        this.socket.on('timer_update', (data) => {
            this.onTimerSnapshot(data);
        });

        this.socket.on('game_state_update', (data) => {
            this.updateGameState(data);
            // ensure we have a fresh timer snapshot when state changes
            this.socket.emit('get_timer_state');
        });

        this.socket.on('current_state', (data) => {
            this.updateUI(data);
        });

        // Listen for game reset
        this.socket.on('game_reset', () => {
            console.log('Game reset received on controls page');
            this.updateGameState({
                game_state: 'waiting',
                current_task: null,
                slave_solutions: { 1: false, 2: false }
            });
        });
    }

    onTimerSnapshot(data) {
        this.timerSnapshot = { ts: Date.now(), data };
        if (this.timerPoller) {
            clearInterval(this.timerPoller);
            this.timerPoller = null;
        }
        if (!this.ticker) {
            this.ticker = setInterval(() => this.renderTick(), 1000);
        }
        this.renderTick();
    }

    renderTick() {
        if (!this.timerSnapshot) return;
        const now = Date.now();
        const elapsed = Math.floor((now - this.timerSnapshot.ts) / 1000);
        const base = this.timerSnapshot.data;
        const computed = {};
        for (const [slaveId, timer] of Object.entries(base)) {
            const running = !!timer.running;
            const remaining = Math.max(0, (timer.remaining_time || 0) - (running ? elapsed : 0));
            computed[slaveId] = { remaining_time: remaining, running, max_time: timer.max_time };
        }
        this.updateTimers(computed);
    }

    spinWheel() {
        // Disable spin button immediately to prevent multiple clicks
        const spinButton = document.getElementById('spinButton');
        spinButton.disabled = true;
        spinButton.textContent = 'Spinning...';

        this.socket.emit('spin_wheel', (response) => {
            if (response && response.success) {
                console.log('Wheel spinning started from controls page');
                // The wheel page will handle the actual animation
                // We'll re-enable the button when the game state updates
            } else {
                console.error('Spin failed:', response?.error);
                alert(response?.error || 'Failed to spin wheel');
                spinButton.disabled = false;
                spinButton.textContent = 'Spin Wheel';
            }
        });
    }

    stopGame() {
        this.socket.emit('stop_game', (response) => {
            if (response && response.success) {
                console.log('Game stopped');
            } else {
                console.error('Failed to stop game:', response?.error);
            }
        });
    }

    resetGame() {
        this.socket.emit('reset_game', (response) => {
            if (response && response.success) {
                console.log('Game reset successfully');
            } else {
                console.error('Failed to reset game');
            }
        });
    }

    resetSlaves() {
        this.socket.emit('reset_slaves', (response) => {
            if (response && response.success) {
                console.log('Slaves reset successfully');
                alert('Slaves have been reset to waiting state');
            } else {
                console.error('Failed to reset slaves');
            }
        });
    }

    cancelRound() {
        this.socket.emit('cancel_round', (response) => {
            if (response && response.success) {
                console.log('Round canceled');
            } else {
                console.error('Failed to cancel round');
            }
        });
    }

    addTimeToSlave(slaveId, seconds) {
        this.socket.emit('add_time_to_slave', {
            slave_id: slaveId,
            seconds: seconds
        }, (response) => {
            if (response && response.success) {
                console.log(`Added ${seconds} seconds to slave ${slaveId}`);
            } else {
                console.error('Failed to add time:', response?.error);
            }
        });
    }

    updateTimers(timerData) {
        for (const [slaveId, timer] of Object.entries(timerData)) {
            const displayElement = document.getElementById(`slave${slaveId}Display`);
            if (displayElement) {
                const remainingSeconds = timer.remaining_time;
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = remainingSeconds % 60;
                displayElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

                // Visual feedback based on remaining time
                displayElement.classList.remove('warning', 'critical');
                if (remainingSeconds <= 60) {
                    displayElement.classList.add('critical');
                } else if (remainingSeconds <= 120) {
                    displayElement.classList.add('warning');
                }

                // Change color if timer is running
                if (timer.running) {
                    displayElement.style.color = '#28a745';
                } else {
                    displayElement.style.color = '#6c757d';
                }
            }
        }
    }

    updateGameState(data) {
        this.gameState = data.game_state;
        this.slaveSolutions = data.slave_solutions || { 1: false, 2: false };
        this.currentTask = data.current_task;

        document.getElementById('gameState').textContent = this.gameState;

        // Update solution status
        for (const [slaveId, solved] of Object.entries(this.slaveSolutions)) {
            const statusElement = document.getElementById(`slave${slaveId}Status`);
            if (statusElement) {
                if (solved) {
                    statusElement.textContent = '✅ Solved';
                    statusElement.className = 'status-solved';
                } else {
                    statusElement.textContent = '❌ Not Solved';
                    statusElement.className = 'status-pending';
                }
            }
        }

        // Update current task display
        const taskInfo = document.getElementById('currentTask');
        if (this.currentTask) {
            document.getElementById('taskName').textContent = this.currentTask.name;
            document.getElementById('taskCategory').textContent = this.currentTask.category;
            taskInfo.classList.remove('hidden');
        } else {
            taskInfo.classList.add('hidden');
        }

        // Update spin button state
        const spinButton = document.getElementById('spinButton');
        if (this.gameState === 'active') {
            spinButton.disabled = true;
            spinButton.textContent = 'Game Active';
        } else {
            spinButton.disabled = false;
            spinButton.textContent = 'Spin Wheel';
        }
    }

    updateUI(data) {
        this.currentTask = data.current_task;
        this.updateGameState({
            game_state: data.game_state,
            current_task: data.current_task,
            slave_solutions: data.slave_solutions
        });
    }
}


document.addEventListener('DOMContentLoaded', () => {
    new MasterControls();
});