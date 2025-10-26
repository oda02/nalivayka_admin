class WheelOfFortune {
    constructor() {
        this.socket = io();
        this.tasks = [];
        this.usedTasks = new Set();
        this.isSpinning = false;
        this.wheel = document.getElementById('wheel');
        this.spinButton = document.getElementById('spinButton');
        this.currentRotation = 0;
        this.COOKIE_NAME = 'wheel_rotation';
        this.currentTask = null;
        this.gameState = "waiting";
        this.slaveSolutions = { 1: false, 2: false };
        this.lastServerIndex = null;
        this.savedRotationApplied = false;
        this.playerNames = { 1: 'Player 1', 2: 'Player 2' };
        this.timerSnapshot = null; // { ts: ms, data }
        this.ticker = null;
        this.timerPoller = null;

        this.init();

        // Persist rotation on page unload
        window.addEventListener('beforeunload', () => this.saveWheelRotation());
    }

    init() {
        this.setupEventListeners();
        this.socketSetup();
        this.loadTasks();
        // also request timers for display
        this.socket.emit('get_timer_state');
        // start local ticking and polling until first snapshot arrives
        if (!this.ticker) {
            this.ticker = setInterval(() => this.renderTick(), 1000);
        }
        if (!this.timerPoller) {
            this.timerPoller = setInterval(() => {
                if (!this.timerSnapshot) this.socket.emit('get_timer_state');
            }, 3000);
        }
    }

    saveWheelRotation() {
        try {
            const angle = Math.round(((this.currentRotation % 360) + 360) % 360);
            document.cookie = `${this.COOKIE_NAME}=${angle}; path=/; max-age=31536000`;
        } catch (e) { /* noop */ }
    }

    loadWheelRotation() {
        try {
            const name = this.COOKIE_NAME + '=';
            const parts = document.cookie.split(';');
            for (let c of parts) {
                c = c.trim();
                if (c.indexOf(name) === 0) {
                    const val = parseInt(c.substring(name.length), 10);
                    return isNaN(val) ? null : val;
                }
            }
        } catch (e) { /* noop */ }
        return null;
    }

    clearWheelRotation() {
        try {
            document.cookie = `${this.COOKIE_NAME}=; path=/; max-age=0`;
        } catch (e) { /* noop */ }
    }

    applySavedRotationIfAny() {
        const saved = this.loadWheelRotation();
        if (saved !== null && this.wheel) {
            this.currentRotation = saved;
            this.wheel.style.transform = `rotate(${this.currentRotation}deg)`;
        }
    }

    setupEventListeners() {
        this.spinButton.addEventListener('click', () => this.spinWheel());
        const resetUsersBtn = document.getElementById('resetUsersButton');
        if (resetUsersBtn) {
            resetUsersBtn.addEventListener('click', () => this.resetUserTasks());
        }
    }

    socketSetup() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            // Join master room for synchronization
            this.socket.emit('join_master_room');
            this.socket.emit('get_current_state');
        });

        this.socket.on('task_selected', (data) => {
            this.handleTaskSelected(data);
        });

        this.socket.on('current_state', (data) => {
            this.updateUI(data);
            // Align wheel to server's current task if provided
            if (data && data.current_task && this.tasks && this.tasks.length) {
                const idx = this.tasks.findIndex(t => t && t.name === data.current_task.name);
                if (idx >= 0) {
                    this.lastServerIndex = idx;
                    if (!this.isSpinning) {
                        this.alignWheelToIndex(idx);
                    }
                }
            }
            if (data && data.player_names) {
                this.playerNames = data.player_names;
                const l1 = document.getElementById('player1NameLabel');
                const l2 = document.getElementById('player2NameLabel');
                if (l1) l1.textContent = this.playerNames[1] || 'Player 1';
                if (l2) l2.textContent = this.playerNames[2] || 'Player 2';
            }
            if (data && Array.isArray(data.used_indices)) {
                this.usedTasks = new Set(data.used_indices);
                this.drawWheel();
                this.applySavedRotationIfAny();
                if (this.lastServerIndex !== null && !this.isSpinning) {
                    this.alignWheelToIndex(this.lastServerIndex);
                }
            }
        });

        // Timer updates for under-wheel timers
        this.socket.on('timer_update', (data) => {
            this.onTimerSnapshot(data);
        });

        this.socket.on('game_state_update', (data) => {
            if (data && Array.isArray(data.used_indices)) {
                this.usedTasks = new Set(data.used_indices);
                this.drawWheel();
                this.applySavedRotationIfAny();
            }
            this.updateGameState(data);
            // ensure fresh timer snapshot
            this.socket.emit('get_timer_state');
        });

        // Listen for wheel spinning events from controls page
        this.socket.on('wheel_spinning', (data) => {
            console.log('Received wheel spin request from controls page');
            if (!this.isSpinning) {
                this.currentTask = data.task;
                this.selectedTaskIndex = data.task_index;
                this.lastServerIndex = data.task_index;
                this.animateWheel();
            }
        });

        // Listen for game reset
        this.socket.on('game_reset', () => {
            console.log('Game reset received');
            this.usedTasks.clear();
            this.drawWheel();
            this.spinButton.disabled = false;
            this.isSpinning = false;
            this.currentRotation = 0;
            this.wheel.style.transform = `rotate(${this.currentRotation}deg)`;
            this.clearWheelRotation();
        });
    }

    resetUserTasks() {
        this.socket.emit('reset_slaves', (resp) => {
            if (!(resp && resp.success)) {
                console.error('Failed to reset user tasks');
            }
        });
    }

    async loadTasks() {
        try {
            const response = await fetch('/api/tasks');
            this.tasks = await response.json();
            this.drawWheel();
            if (!this.savedRotationApplied) {
                this.applySavedRotationIfAny();
                this.savedRotationApplied = true;
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
        }
    }

    drawWheel() {
        // Clear previous wheel
        this.wheel.innerHTML = '';

        if (this.tasks.length === 0) return;

        const centerX = 200;
        const centerY = 200;
        const radius = 180;
        const sliceAngle = (2 * Math.PI) / this.tasks.length;

        this.tasks.forEach((task, index) => {
            const startAngle = index * sliceAngle;
            const endAngle = (index + 1) * sliceAngle;

            // Calculate points for the slice
            const x1 = centerX + radius * Math.cos(startAngle);
            const y1 = centerY + radius * Math.sin(startAngle);
            const x2 = centerX + radius * Math.cos(endAngle);
            const y2 = centerY + radius * Math.sin(endAngle);

            // Create path for the slice
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const isUsed = this.usedTasks.has(index);

            path.setAttribute('d',
                `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`
            );
            path.setAttribute('fill', isUsed ? '#6c757d' : this.getColor(index));
            path.setAttribute('stroke', '#333');
            path.setAttribute('stroke-width', '2');
            path.classList.add('wheel-section');
            path.setAttribute('data-index', index);

            // Add text
            const textAngle = startAngle + sliceAngle / 2;
            const textRadius = radius * 0.7;
            const textX = centerX + textRadius * Math.cos(textAngle);
            const textY = centerY + textRadius * Math.sin(textAngle);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', textX);
            text.setAttribute('y', textY);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', 'white');
            text.setAttribute('font-size', '12');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('transform', `rotate(${textAngle * 180 / Math.PI}, ${textX}, ${textY})`);
            text.textContent = task.name.length > 15 ? task.name.substring(0, 12) + '...' : task.name;

            this.wheel.appendChild(path);
            this.wheel.appendChild(text);
        });

        // Add center circle
        const centerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        centerCircle.setAttribute('cx', centerX);
        centerCircle.setAttribute('cy', centerY);
        centerCircle.setAttribute('r', 20);
        centerCircle.setAttribute('fill', '#333');
        this.wheel.appendChild(centerCircle);

        // Saved rotation is applied once after initial draw in loadTasks()
    }

    getColor(index) {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
            '#FF9F43', '#54A0FF', '#5F27CD', '#00D2D3'
        ];
        return colors[index % colors.length];
    }

    async spinWheel() {
        if (this.isSpinning) return;

        this.isSpinning = true;
        this.spinButton.disabled = true;

        try {
            this.socket.emit('spin_wheel', (response) => {
                if (response && response.success) {
                    this.currentTask = response.task;
                    this.selectedTaskIndex = response.task_index;
                    this.animateWheel();
                } else {
                    this.isSpinning = false;
                    this.spinButton.disabled = false;
                    console.error('Spin failed:', response?.error);
                    alert(response?.error || 'Failed to spin wheel');
                }
            });
        } catch (error) {
            console.error('Error spinning wheel:', error);
            this.isSpinning = false;
            this.spinButton.disabled = false;
        }
    }

    animateWheel() {
        const spinDuration = 4000;
        const startTime = Date.now();

        const startRotation = ((this.currentRotation % 360) + 360) % 360;
        const endRotation = this.getRotationForIndexCenter(this.selectedTaskIndex);

        // Smallest positive delta to end, then add full rotations for visual effect
        let delta = (endRotation - startRotation + 360) % 360;
        const fullRotations = 4;
        delta += fullRotations * 360;

        const animateInitial = () => {
            const currentTime = Date.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / spinDuration, 1);

            const easeOut = (t) => 1 - Math.pow(1 - t, 3);
            const easedProgress = easeOut(progress);

            const rotation = startRotation + (delta * easedProgress);
            this.wheel.style.transform = `rotate(${rotation}deg)`;
            this.currentRotation = rotation % 360;

            if (progress < 1) {
                requestAnimationFrame(animateInitial);
            } else {
                this.finalizeSpin(this.selectedTaskIndex);
            }
        };

        animateInitial();
    }

    getRotationForIndexCenter(index) {
        if (!this.tasks || !this.tasks.length) return 0;
        const segmentAngle = 360 / this.tasks.length;
        const centerAngle = (index + 0.5) * segmentAngle; // wheel content angle
        // rotate wheel so pointer at 270deg points to centerAngle
        return (270 - centerAngle + 360) % 360;
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
        for (const sid of [1, 2]) {
            const t = base[sid];
            if (!t) continue;
            const running = !!t.running;
            const remaining = Math.max(0, (t.remaining_time || 0) - (running ? elapsed : 0));
            computed[sid] = { remaining_time: remaining, running, max_time: t.max_time };
        }
        this.updateUnderWheelTimers(computed);
    }

    calculateLandedSector() {
        const angleAtPointer = (270 - this.currentRotation + 360) % 360;
        const segmentAngle = 360 / this.tasks.length;
        const landedIndex = Math.floor(angleAtPointer / segmentAngle) % this.tasks.length;
        return landedIndex;
    }

    continueToNextFreeTask(startIndex) {
        let nextFreeIndex = (startIndex + 1) % this.tasks.length;
        let steps = 1;

        while (this.usedTasks.has(nextFreeIndex) && steps < this.tasks.length) {
            nextFreeIndex = (nextFreeIndex + 1) % this.tasks.length;
            steps++;
        }

        if (steps >= this.tasks.length) {
            this.finalizeSpin(startIndex);
            return;
        }

        const segmentAngle = 360 / this.tasks.length;
        let additionalDegrees = 0;

        if (nextFreeIndex > startIndex) {
            additionalDegrees = (nextFreeIndex - startIndex) * segmentAngle;
        } else {
            additionalDegrees = (this.tasks.length - startIndex + nextFreeIndex) * segmentAngle;
        }

        additionalDegrees += segmentAngle * 0.5;

        const continueDuration = 1000 + (steps * 200);
        const continueStartTime = Date.now();
        const continueStartRotation = this.currentRotation;

        const animateContinue = () => {
            const currentTime = Date.now();
            const elapsed = currentTime - continueStartTime;
            const progress = Math.min(elapsed / continueDuration, 1);

            const smoothProgress = this.easeOutCubic(progress);
            const rotation = continueStartRotation + (additionalDegrees * smoothProgress);
            this.wheel.style.transform = `rotate(${rotation}deg)`;
            this.currentRotation = rotation % 360;

            if (progress < 1) {
                requestAnimationFrame(animateContinue);
            } else {
                const finalLandedSector = this.calculateLandedSector();

                if (this.usedTasks.has(finalLandedSector)) {
                    this.continueToNextFreeTask(finalLandedSector);
                } else {
                    this.finalizeSpin(finalLandedSector);
                }
            }
        };

        animateContinue();
    }

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    finalizeSpin(finalIndex) {
        this.isSpinning = false;
        this.spinButton.disabled = false;
        this.usedTasks.add(finalIndex);
        this.currentTask = this.tasks[finalIndex];

        this.socket.emit('wheel_stopped', { task_index: finalIndex });

        this.drawWheel();
        this.wheel.style.transform = `rotate(${this.currentRotation}deg)`;
        this.saveWheelRotation();
    }

    updateUI(data) {
        document.getElementById('usedCount').textContent = data.used_count || this.usedTasks.size;
        document.getElementById('totalCount').textContent = data.total_count || this.tasks.length;

        if (data.current_task) {
            const taskInfo = document.getElementById('currentTask');
            document.getElementById('taskName').textContent = data.current_task.name;
            document.getElementById('taskCategory').textContent = data.current_task.category;
            document.getElementById('taskType').textContent = data.current_task.type;
            document.getElementById('taskLink').textContent = data.current_task.link;
            taskInfo.classList.remove('hidden');
        }
    }

    updateUnderWheelTimers(timerData) {
        const t1 = timerData[1];
        const t2 = timerData[2];
        const el1 = document.getElementById('player1Timer');
        const el2 = document.getElementById('player2Timer');
        if (t1 && el1) {
            const s = Math.max(0, t1.remaining_time);
            const m = Math.floor(s / 60);
            const sec = s % 60;
            el1.textContent = `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        }
        if (t2 && el2) {
            const s = Math.max(0, t2.remaining_time);
            const m = Math.floor(s / 60);
            const sec = s % 60;
            el2.textContent = `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        }
    }

    updateGameState(data) {
        this.gameState = data.game_state;
        this.slaveSolutions = data.slave_solutions || { 1: false, 2: false };
        if (data.player_names) this.playerNames = data.player_names;

        document.getElementById('gameState').textContent = this.gameState;

        // Update solution status
        for (const [slaveId, solved] of Object.entries(this.slaveSolutions)) {
            const statusElement = document.getElementById(`slave${slaveId}Status`);
            if (statusElement) {
                const label = this.playerNames[slaveId] || `Player ${slaveId}`;
                if (solved) {
                    statusElement.textContent = `✅ ${label}: Solved`;
                    statusElement.className = 'status-solved';
                } else {
                    statusElement.textContent = `❌ ${label}: Not Solved`;
                    statusElement.className = 'status-pending';
                }
            }
        }

        // Update labels near the wheel if present
        const l1 = document.getElementById('player1NameLabel');
        const l2 = document.getElementById('player2NameLabel');
        if (l1) l1.textContent = this.playerNames[1] || 'Player 1';
        if (l2) l2.textContent = this.playerNames[2] || 'Player 2';

        // Update spin button state
        if (this.gameState === 'active') {
            this.spinButton.disabled = true;
        } else {
            this.spinButton.disabled = false;
        }
    }

    handleTaskSelected(data) {
        console.log('Task selected on master page:', data.task);
        // Normalize payload for updateUI
        const normalized = {
            used_count: data.used_count,
            total_count: data.total_count,
            current_task: data.task,
        };
        this.updateUI(normalized);
        // Align wheel to the server-selected index to avoid drift
        let idx = this.lastServerIndex;
        if ((idx === null || idx < 0) && data && data.task && this.tasks && this.tasks.length) {
            idx = this.tasks.findIndex(t => t && t.name === data.task.name);
        }
        if (!this.isSpinning && idx !== null && idx >= 0) {
            this.alignWheelToIndex(idx);
        }
    }

    alignWheelToIndex(index) {
        if (!this.tasks.length) return;
        const segmentAngle = 360 / this.tasks.length;
        // center of the segment
        const centerAngle = (index + 0.5) * segmentAngle;
        // Rotate so that pointer at 270deg points to centerAngle
        const rotation = (270 - centerAngle + 360) % 360;
        this.currentRotation = rotation;
        if (this.wheel) {
            this.wheel.style.transform = `rotate(${this.currentRotation}deg)`;
        }
        this.saveWheelRotation();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WheelOfFortune();
});