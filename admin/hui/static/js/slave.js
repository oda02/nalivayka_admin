class SlaveClient {
    constructor() {
        this.socket = io();
        this.currentTask = null;
        this.waitingScreen = document.getElementById('waitingScreen');
        this.taskScreen = document.getElementById('taskScreen');
        this.timerDisplay = document.getElementById('timerDisplay');
        this.secretSection = document.getElementById('secretSection');
        this.secretInput = document.getElementById('secretInput');
        this.submitSecret = document.getElementById('submitSecret');
        this.secretResult = document.getElementById('secretResult');
        this.slaveId = SLAVE_ID; // From template
        this.taskSolved = false;
        this.timerSnapshot = null; // { ts: ms, data: latest server snapshot }
        this.ticker = null;
        this.playerNames = { 1: 'Player 1', 2: 'Player 2' };

        this.init();
        if (!this.ticker) {
            this.ticker = setInterval(() => this.renderTick(), 1000);
        }
    }

    init() {
        this.setupEventListeners();
        this.socketSetup();
        this.loadPersistedState();
    }

    setupEventListeners() {
        this.submitSecret.addEventListener('click', () => this.verifySecret());
        this.secretInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.verifySecret();
            }
        });

        // name edit UI
        const editBtn = document.getElementById('editNameBtn');
        const modal = document.getElementById('editNameModal');
        const input = document.getElementById('playerNameInput');
        const saveBtn = document.getElementById('savePlayerName');
        const cancelBtn = document.getElementById('cancelPlayerName');
        const header = document.getElementById('playerNameHeader');
        if (editBtn && modal && input && saveBtn && cancelBtn && header) {
            editBtn.addEventListener('click', () => {
                modal.classList.remove('hidden');
                input.value = header.textContent || '';
                input.focus();
            });
            cancelBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
            saveBtn.addEventListener('click', () => this.savePlayerName());
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.savePlayerName();
            });
        }
    }

    socketSetup() {
        this.socket.on('connect', () => {
            console.log(`Slave ${this.slaveId} connected to server`);
            this.socket.emit('get_current_state');
            this.socket.emit('get_timer_state');
        });

        this.socket.on('task_selected', (data) => {
            console.log('Slave received task_selected:', data.task);
            this.persistState(data.task, false);
            // Add a short delay for smooth transition
            setTimeout(() => {
                this.handleTaskSelected(data.task);
            }, 1000);
        });

        this.socket.on('current_state', (data) => {
            console.log('Slave received current_state:', data);
            if (data && data.player_names) {
                this.playerNames = data.player_names;
                const header = document.getElementById('playerNameHeader');
                if (header && this.playerNames[this.slaveId]) {
                    header.textContent = this.playerNames[this.slaveId];
                }
            }
            if (data.current_task) {
                this.persistState(data.current_task, data.slave_solutions[this.slaveId] || false);
                this.handleTaskSelected(data.current_task);
            } else {
                this.clearPersistedState();
                this.showWaitingScreen();
            }
        });

        this.socket.on('timer_update', (data) => {
            this.onTimerSnapshot(data);
        });

        this.socket.on('game_state_update', (data) => {
            this.updateGameState(data);
            if (data && data.player_names) this.playerNames = data.player_names;
            const header = document.getElementById('playerNameHeader');
            if (header && this.playerNames[this.slaveId]) header.textContent = this.playerNames[this.slaveId];
            this.socket.emit('get_timer_state');
        });

        // Listen for game reset
        this.socket.on('game_reset', () => {
            console.log('Slave received game reset');
            this.clearPersistedState();
            this.showWaitingScreen();
        });

        // Listen for slaves reset (reset input fields but keep task)
        this.socket.on('slaves_reset', () => {
            console.log('Slave received slaves reset');
            this.taskSolved = false;
            this.resetSecretInput();
            // Keep the current task displayed, just reset the input field
        });
    }

    async savePlayerName() {
        try {
            const input = document.getElementById('playerNameInput');
            const modal = document.getElementById('editNameModal');
            const header = document.getElementById('playerNameHeader');
            const name = (input?.value || '').trim();
            if (!name) return;
            const payload = { [String(this.slaveId)]: name };
            await fetch('/api/player-names', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            modal?.classList.add('hidden');
            if (header) header.textContent = name;
        } catch (e) { console.error(e); }
    }

    onTimerSnapshot(data) {
        this.timerSnapshot = { ts: Date.now(), data };
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
        const timer = base[this.slaveId];
        if (!timer) return;
        const running = !!timer.running;
        const remaining = Math.max(0, (timer.remaining_time || 0) - (running ? elapsed : 0));
        const computed = { [this.slaveId]: { remaining_time: remaining, running, max_time: timer.max_time } };
        this.updateTimer(computed);
    }

    loadPersistedState() {
        const persistedState = localStorage.getItem(`slave_${this.slaveId}_state`);
        if (persistedState) {
            const state = JSON.parse(persistedState);
            console.log('Loaded persisted state:', state);

            if (state.current_task && state.game_state === 'active') {
                this.currentTask = state.current_task;
                this.taskSolved = state.task_solved || false;
                this.handleTaskSelected(state.current_task);

                if (this.taskSolved) {
                    this.disableSecretInput();
                    this.showSecretResult('✅ Task completed! (State restored)', 'secret-success');
                }
            }
        }
    }

    persistState(task, solved) {
        const state = {
            current_task: task,
            game_state: 'active',
            task_solved: solved,
            timestamp: Date.now()
        };
        localStorage.setItem(`slave_${this.slaveId}_state`, JSON.stringify(state));
    }

    clearPersistedState() {
        localStorage.removeItem(`slave_${this.slaveId}_state`);
    }

    showWaitingScreen() {
        this.waitingScreen.classList.add('active');
        this.taskScreen.classList.remove('active');
        this.taskSolved = false;
        this.resetSecretInput();
    }

    showTaskScreen() {
        this.waitingScreen.classList.remove('active');
        this.taskScreen.classList.add('active');
    }

    handleTaskSelected(task) {
        console.log(`Slave ${this.slaveId} handling task:`, task);
        this.currentTask = task;
        this.updateTaskDisplay(task);
        this.showTaskScreen();

        // Show secret section if task has a secret
        if (task.secret) {
            this.secretSection.classList.remove('hidden');
            this.resetSecretInput();
        } else {
            this.secretSection.classList.add('hidden');
        }
    }

    updateTaskDisplay(task) {
        document.getElementById('taskName').textContent = task.name;
        document.getElementById('taskCategory').textContent = task.category;
        document.getElementById('taskType').textContent = task.type;

        // Hide both content types first
        document.getElementById('staticContent').classList.add('hidden');
        document.getElementById('dynamicContent').classList.add('hidden');

        if (task.type === 'Static') {
            this.setupStaticTask(task);
        } else if (task.type === 'Dynamic') {
            this.setupDynamicTask(task);
        }
    }

    setupStaticTask(task) {
        const staticContent = document.getElementById('staticContent');
        const downloadButton = document.getElementById('downloadButton');

        downloadButton.onclick = () => {
            window.location.href = `/download/${encodeURIComponent(task.link)}`;
        };

        staticContent.classList.remove('hidden');
    }

    setupDynamicTask(task) {
        const dynamicContent = document.getElementById('dynamicContent');
        const taskLink = document.getElementById('taskLink');

        taskLink.href = task.link;
        taskLink.textContent = task.link;

        dynamicContent.classList.remove('hidden');
    }

    updateTimer(timerData) {
        const timer = timerData[this.slaveId];

        if (timer) {
            const remainingSeconds = Math.max(0, timer.remaining_time);
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            // Visual feedback based on remaining time
            this.timerDisplay.classList.remove('warning', 'critical');
            if (remainingSeconds <= 60) {
                this.timerDisplay.classList.add('critical');
            } else if (remainingSeconds <= 120) {
                this.timerDisplay.classList.add('warning');
            }

            // Visual feedback when timer is running
            if (timer.running) {
                this.timerDisplay.style.color = '#fff';
                this.timerDisplay.style.textShadow = '0 2px 4px rgba(0,0,0,0.3)';
            } else {
                this.timerDisplay.style.color = '#ccc';
            }

            // Disable secret input if timer reaches zero
            if (remainingSeconds <= 0 && !this.taskSolved) {
                this.disableSecretInput();
                this.showSecretResult('⏰ Time expired! Input disabled', 'secret-error');
            }
        }
    }

    updateGameState(data) {
        // Check if this slave has solved the task
        if (data.slave_solutions && data.slave_solutions[this.slaveId]) {
            this.taskSolved = true;
            this.disableSecretInput();
            this.showSecretResult('✅ Task completed!', 'secret-success');
            this.persistState(this.currentTask, true);
        }

        // If game is reset, go back to waiting
        if (data.game_state === 'waiting') {
            this.showWaitingScreen();
        }
    }

    verifySecret() {
        if (this.taskSolved) {
            return; // Already solved
        }

        const secret = this.secretInput.value.trim();
        if (!secret) {
            this.showSecretResult('Please enter a secret', 'secret-error');
            return;
        }

        this.submitSecret.disabled = true;
        this.submitSecret.textContent = 'Verifying...';

        this.socket.emit('verify_secret', {
            secret: secret,
            slave_id: this.slaveId
        }, (response) => {
            if (response && response.success) {
                this.taskSolved = true;
                this.disableSecretInput();
                this.showSecretResult(response.message || '✅ Correct secret!', 'secret-success');
                this.persistState(this.currentTask, true);
            } else {
                this.showSecretResult(response?.error || '❌ Incorrect secret', 'secret-error');
                this.submitSecret.disabled = false;
                this.submitSecret.textContent = 'Submit';
            }
        });
    }

    disableSecretInput() {
        this.secretInput.disabled = true;
        this.submitSecret.disabled = true;
        this.submitSecret.textContent = 'Submitted';
    }

    resetSecretInput() {
        this.secretInput.value = '';
        this.secretInput.disabled = false;
        this.submitSecret.disabled = false;
        this.submitSecret.textContent = 'Submit';
        this.secretResult.textContent = '';
        this.secretResult.className = 'secret-result';
        // Don't reset taskSolved here - it should persist
    }

    showSecretResult(message, className) {
        this.secretResult.textContent = message;
        this.secretResult.className = `secret-result ${className}`;
    }
}

// Initialize the slave client when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SlaveClient();
});