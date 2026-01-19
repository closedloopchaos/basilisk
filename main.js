const CONFIG = {
    MAP_SIZE: 1000,
    REFRESH_RATE: 100,
};

class TacticalStore {
    constructor() {
        this.storeKey = 'POLAR_OPS_DATA';
        this.listeners = [];
        this.state = this.loadState();

        // Listen for storage events (other tabs)
        window.addEventListener('storage', (e) => {
            if (e.key === this.storeKey) {
                this.state = JSON.parse(e.newValue);
                this.notify();
            }
        });
    }

    loadState() {
        const raw = localStorage.getItem(this.storeKey);
        if (raw) {
            try {
                const state = JSON.parse(raw);
                // Validation: Ensure newer properties exist
                if (state.squads && Array.isArray(state.squads) && state.units) {
                    return state;
                }
            } catch (e) {
                console.error('State load failed, resetting:', e);
            }
        }
        return {
            tasks: [],
            units: [
                { id: 'SC-01', type: 'CORVETTE', x: 200, y: 300, callsign: 'POLAR-1', squad: 'ALPHA', status: 'ACTIVE' },
                { id: 'SF-12', type: 'FIGHTER-WG', x: 450, y: 150, callsign: 'RAPTOR-SQ', squad: 'BRAVO', status: 'ACTIVE' },
                { id: 'SD-05', type: 'DESTROYER', x: 800, y: 700, callsign: 'TITAN', squad: 'ALPHA', status: 'ACTIVE' }
            ],
            squads: [
                { id: 'ALPHA', color: '#00f2ff' },
                { id: 'BRAVO', color: '#ffb400' }
            ],
            stagedMoves: [], // { unitId, x, y }
            currentRole: 'COMMANDER'
        };
    }

    addSquad(id, color) {
        if (this.state.squads.find(s => s.id === id)) return;
        this.state.squads.push({ id, color });
        this.saveState();
    }

    setUnitSquad(unitId, squad) {
        const unit = this.state.units.find(u => u.id === unitId);
        if (unit) {
            unit.squad = squad;
            this.saveState();
        }
    }

    updateStagedMove(unitId, x, y, append = false) {
        let existing = this.state.stagedMoves.find(m => m.unitId === unitId);
        let waypoints = [];

        if (append && existing) {
            waypoints = existing.waypoints ? [...existing.waypoints] : [{ x: existing.x, y: existing.y }];
            waypoints.push({ x, y });
        } else {
            waypoints = [{ x, y }];
        }

        this.state.stagedMoves = this.state.stagedMoves.filter(m => m.unitId !== unitId);
        this.state.stagedMoves.push({ unitId, x, y, waypoints });
        this.saveState();
    }

    clearStagedMove(unitId) {
        this.state.stagedMoves = this.state.stagedMoves.filter(m => m.unitId !== unitId);
        this.saveState();
    }

    clearAllStagedMoves() {
        this.state.stagedMoves = [];
        this.saveState();
    }

    updateUnitPosition(unitId, x, y) {
        const unit = this.state.units.find(u => u.id === unitId);
        if (unit) {
            unit.x = x;
            unit.y = y;
            this.saveState();
        }
    }

    updateUnitDetails(unitId, name, type, callsign) {
        const unit = this.state.units.find(u => u.id === unitId);
        if (unit) {
            unit.name = name;
            unit.type = type;
            unit.callsign = callsign;
            this.saveState();
        }
    }

    updateUnitStatus(unitId, status) {
        const unit = this.state.units.find(u => u.id === unitId);
        if (unit) {
            unit.status = status;
            this.saveState();
        }
    }

    deleteUnit(unitId) {
        this.state.units = this.state.units.filter(u => u.id !== unitId);
        this.state.stagedMoves = this.state.stagedMoves.filter(m => m.unitId !== unitId);
        this.state.tasks = this.state.tasks.filter(t => !t.payload || t.payload.unitId !== unitId);
        this.saveState();
    }

    addUnit(unitData) {
        // Ensure defaults
        if (!unitData.status) unitData.status = 'ACTIVE';
        if (!unitData.name) unitData.name = unitData.id;

        this.state.units.push(unitData);
        this.saveState();
    }

    saveState() {
        localStorage.setItem(this.storeKey, JSON.stringify(this.state));
        this.notify();
    }

    addTask(title, priority, squadId, type = 'DIRECTIVE', payload = null) {
        const task = {
            id: `TASK-${Date.now()}`,
            title,
            priority, // 'HIGH', 'MEDIUM', 'LOW'
            status: 'PENDING', // 'PENDING', 'ACKNOWLEDGED', 'COMPLETE'
            squadId,
            type, // 'DIRECTIVE' or 'REQUEST'
            payload, // Optional data (e.g., coordinates for move requests)
            timestamp: Date.now(),
            notification: true // Show notification until acknowledged
        };
        this.state.tasks.push(task);
        this.saveState();
        return task;
    }

    addMoveRequest(unit, x, y) {
        // Consolidate: Remove any existing pending move requests for this unit
        this.state.tasks = this.state.tasks.filter(t =>
            !(t.type === 'REQUEST' && t.status === 'PENDING' && t.payload && t.payload.unitId === unit.id)
        );

        return this.addTask(
            `REQUEST: MOVE ${unit.callsign} TO ${x.toFixed(0)}, ${y.toFixed(0)}`,
            'MEDIUM',
            'COMMAND',
            'REQUEST',
            { unitId: unit.id, x, y }
        );
    }

    updateTaskStatus(taskId, status) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = status;
            if (status === 'ACKNOWLEDGED') {
                task.notification = false;
            }
            this.saveState();
        }
    }

    deleteTask(taskId) {
        this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
        this.saveState();
    }

    setSquadColor(squadId, color) {
        const squad = this.state.squads.find(s => s.id === squadId);
        if (squad) {
            squad.color = color;
            this.saveState();
        }
    }

    getTasksForSquad(squadId) {
        return this.state.tasks.filter(t => t.squadId === squadId);
    }

    subscribe(callback) {
        this.listeners.push(callback);
        // Initial callback
        callback(this.state);
    }

    notify() {
        this.listeners.forEach(cb => cb(this.state));
    }
}

class Unit {
    constructor(id, type, x, y, callsign, squad = 'ALPHA') {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.callsign = callsign;
        this.squad = squad;
        this.selected = false;
        this.targetX = null;
        this.targetY = null;
        this.path = [];
        this.status = 'ACTIVE';
        this.speed = 0.5 + Math.random() * 0.5;
    }

    setTarget(x, y) {
        this.path = [];
        this.targetX = x;
        this.targetY = y;
        this.status = 'MOVING';
    }

    setPath(path) {
        // Clone path to avoid reference issues
        this.path = path.map(p => ({ ...p }));
        if (this.path.length > 0) {
            const next = this.path.shift();
            this.targetX = next.x;
            this.targetY = next.y;
            this.status = 'MOVING';
        }
    }

    update() {
        if (this.targetX !== null && this.targetY !== null) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 2) {
                this.x = this.targetX;
                this.y = this.targetY;

                if (this.path.length > 0) {
                    const next = this.path.shift();
                    this.targetX = next.x;
                    this.targetY = next.y;
                } else {
                    this.targetX = null;
                    this.targetY = null;
                    this.status = 'POSITIONED';
                }
            } else {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            }
        }
    }
}

class TacticalMap {
    constructor() {
        this.store = new TacticalStore();
        this.svg = document.getElementById('tactical-map');
        this.unitsLayer = document.getElementById('units-layer');
        this.pathsLayer = document.getElementById('paths-layer');
        this.bgLayer = document.getElementById('map-background-layer');
        this.terrainLayer = document.getElementById('terrain-layer');
        this.units = [];
        this.selectedUnit = null;
        this.highlightedRequest = null; // {unitId, x, y} for hover visualization
        this.currentRole = 'COMMANDER';
        this.currentTaskTab = 'ACTIVE';
        this.currentUnitTab = 'ACTIVE';
        this.currentSquadColor = '#00f2ff';
        this.displayOptions = { grid: true, labels: true, paths: true, strobe: true };

        this.init();
    }

    init() {
        // Use units from store if they exist
        const unitData = this.store.state.units || [
            { id: 'SC-01', type: 'CORVETTE', x: 200, y: 300, callsign: 'POLAR-1', squad: 'ALPHA' },
            { id: 'SF-12', type: 'FIGHTER-WG', x: 450, y: 150, callsign: 'RAPTOR-SQ', squad: 'BRAVO' },
            { id: 'SD-05', type: 'DESTROYER', x: 800, y: 700, callsign: 'TITAN', squad: 'ALPHA' }
        ];

        unitData.forEach(d => {
            this.units.push(new Unit(d.id, d.type, d.x, d.y, d.callsign, d.squad));
        });

        this.setupEventListeners();
        this.initTerrain();

        // Subscribe to store updates
        this.store.subscribe((state) => {
            this.handleStateUpdate(state);
        });

        this.startLoop();
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        this.setupPanelControls();

        // Initial Login Check
        this.checkLogin();
    }

    checkLogin() {
        const overlay = document.getElementById('login-overlay');
        const identity = document.getElementById('user-identity');

        // For now, always require login on reload to ensure proper role selection
        overlay.style.display = 'flex';
        identity.style.display = 'none';

        // Hide main interface interactions until logged in? 
        // The overlay covers it, so that's fine.
    }

    login(role) {
        this.setRole(role);
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('user-identity').style.display = 'flex';
        this.logIntel(`[SYSTEM] AUTHENTICATED: ${role}`, 'success');
    }

    logout() {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('user-identity').style.display = 'none';
        this.hideSquadSelection(); // Reset squad selection state
        this.logIntel('[SYSTEM] USER LOGGED OUT', 'warning');
    }

    showSquadSelection() {
        const panel = document.getElementById('squad-select-panel');
        const list = document.getElementById('login-squad-list');
        panel.style.display = 'block';
        list.innerHTML = this.store.state.squads.map(s =>
            `<button class="action-btn" onclick="window.TacticalApp.login('SQUAD-${s.id}')" style="border-color:${s.color}; color:${s.color}">${s.id}</button>`
        ).join('');
    }

    hideSquadSelection() {
        document.getElementById('squad-select-panel').style.display = 'none';
    }

    requestCommanderAuth() {
        document.querySelector('.login-grid').style.display = 'none';
        document.getElementById('commander-auth-panel').style.display = 'block';
        document.getElementById('commander-password').value = '';
        document.getElementById('commander-password').focus();
        document.getElementById('auth-error').style.display = 'none';
    }

    submitCommanderAuth() {
        const pass = document.getElementById('commander-password').value;
        if (pass === 'commander') {
            this.login('COMMANDER');
            // Reset UI state for next logout
            this.cancelAuth();
        } else {
            const error = document.getElementById('auth-error');
            error.style.display = 'block';
            error.classList.add('notification'); // Pulse effect
            setTimeout(() => error.classList.remove('notification'), 500);
            this.logIntel('[SECURITY] FAILED COMMANDER AUTH ATTEMPT', 'danger');
        }
    }

    cancelAuth() {
        document.querySelector('.login-grid').style.display = 'grid';
        document.getElementById('commander-auth-panel').style.display = 'none';
        document.getElementById('auth-error').style.display = 'none';
    }

    setTaskTab(tab) {
        this.currentTaskTab = tab;
        document.querySelectorAll('#tasks-tabs .subtab').forEach(b => b.classList.remove('active'));
        if (tab === 'ACTIVE') {
            const btn = document.getElementById('tab-active');
            if (btn) btn.classList.add('active');
        } else {
            const btn = document.getElementById('tab-history');
            if (btn) btn.classList.add('active');
        }
        this.renderTasks();
    }

    setUnitTab(tab) {
        this.currentUnitTab = tab;
        document.querySelectorAll('#unit-tabs .subtab').forEach(b => b.classList.remove('active'));
        if (tab === 'ACTIVE') {
            const btn = document.getElementById('utab-active');
            if (btn) btn.classList.add('active');
        } else {
            const btn = document.getElementById('utab-losses');
            if (btn) btn.classList.add('active');
        }
        this.updateUnitList();
    }

    handleStateUpdate(state) {
        // Update squad colors if we are in that squad view
        if (this.currentRole !== 'COMMANDER') {
            const squadId = this.currentRole.replace('SQUAD-', '');
            const squad = state.squads.find(s => s.id === squadId);
            if (squad) {
                this.currentSquadColor = squad.color;
                document.documentElement.style.setProperty('--accent-cyan', squad.color);
                document.documentElement.style.setProperty('--glow-cyan', `0 0 10px ${squad.color}4d`);
            }
        } else {
            // Reset Commander Color
            document.documentElement.style.setProperty('--accent-cyan', '#00f2ff');
            this.currentSquadColor = '#00f2ff';
        }

        // Sync unit properties (like squad) from store
        if (state.units) {
            // Sync unit properties and add new units
            state.units.forEach(su => {
                const mapUnit = this.units.find(u => u.id === su.id);
                if (mapUnit) {
                    mapUnit.squad = su.squad;
                    mapUnit.callsign = su.callsign;
                    mapUnit.type = su.type;
                    mapUnit.name = su.name || su.id;
                    mapUnit.status = su.status;
                } else {
                    const u = new Unit(su.id, su.type, su.x, su.y, su.callsign, su.squad);
                    u.name = su.name;
                    u.status = su.status;
                    this.units.push(u);
                }
            });

            // Remove units that are no longer in state
            this.units = this.units.filter(u => {
                const exists = state.units.some(su => su.id === u.id);
                if (!exists && this.selectedUnit && this.selectedUnit.id === u.id) {
                    this.selectUnit(null);
                }
                return exists;
            });
        }

        // Refresh dynamic UI elements
        this.refreshSelectors(state);

        // Render tasks
        this.renderTasks();

        // Ensure all UI elements (like allocation buttons) refresh
        this.updateUI();
        this.render();
    }

    refreshSelectors(state) {
        // Update User Identity Display
        const rankDisplay = document.getElementById('current-user-rank');
        if (rankDisplay) {
            let displayRole = this.currentRole;
            if (this.currentRole.startsWith('SQUAD-')) {
                displayRole = `${this.currentRole.replace('-', ' ')} LEADER`;
            } else if (this.currentRole === 'OBSERVER') {
                displayRole = 'TACTICAL OBSERVER';
            }

            rankDisplay.textContent = displayRole;
            rankDisplay.style.color = this.currentRole === 'COMMANDER' ? 'var(--accent-cyan)' :
                this.currentRole.includes('SQUAD') ? this.currentSquadColor :
                    'var(--text-dim)';
        }

        // Update Task Squad Selector
        const taskSquad = document.getElementById('task-squad');
        if (taskSquad) {
            const currentVal = taskSquad.value;
            taskSquad.innerHTML = '';
            state.squads.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `SQUAD ${s.id}`;
                taskSquad.appendChild(opt);
            });
            if (currentVal && Array.from(taskSquad.options).some(o => o.value === currentVal)) {
                taskSquad.value = currentVal;
            }
        }
    }

    reassignUnitSquad(unitId, newSquad) {
        this.store.setUnitSquad(unitId, newSquad);
        this.logIntel(`[CMD] ASSET ${unitId} REASSIGNED TO ${newSquad}`, 'warning');
        this.updateUI();
    }

    setRole(role) {
        this.currentRole = role;
        document.body.setAttribute('data-role', role);

        // Trigger state update to refresh colors/UI
        this.handleStateUpdate(this.store.state);
        this.logIntel(`[SYSTEM] TERMINAL RE-CONFIGURED FOR ${role}`, 'warning');
        this.updateUI();
    }

    handleGlobalSearch(query) {
        if (!query) return;
        query = query.toUpperCase();

        const unit = this.units.find(u =>
            u.id.includes(query) ||
            u.callsign.includes(query) ||
            (u.name && u.name.toUpperCase().includes(query))
        );

        if (unit) {
            this.selectUnit(unit.id);
            this.logIntel(`[SEARCH] ASSET LOCATED: ${unit.callsign}`, 'success');
            document.getElementById('global-search').blur();
        } else {
            this.logIntel(`[SEARCH] SIGNAL TRACE FAILED: "${query}"`, 'danger');
        }
    }

    toggleUserMenu(event) {
        if (event) event.stopPropagation();
        const menu = document.getElementById('user-dropdown');
        const btn = document.getElementById('user-menu-btn');
        if (menu) menu.classList.toggle('visible');
        if (btn) btn.classList.toggle('active');
    }

    togglePanel(header) {
        const panel = header.closest('.panel');
        if (panel) {
            panel.classList.toggle('collapsed');
        }
    }

    openSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'flex';
        // Hide Dropdown
        const menu = document.getElementById('user-dropdown');
        if (menu) menu.classList.remove('visible');
    }

    closeSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'none';
        this.updateUI();
    }

    updateSetting(key, value) {
        this.displayOptions[key] = value;
        this.logIntel(`[CONFIG] SETTING UPDATE: ${key.toUpperCase()} = ${value ? 'ON' : 'OFF'}`, 'info');

        // Immediate Effect Logic
        if (key === 'grid') {
            if (this.bgLayer) this.bgLayer.style.opacity = value ? '1' : '0.05';
            if (this.terrainLayer) this.terrainLayer.style.opacity = value ? '1' : '0';
        }
        if (key === 'labels') {
            // Will be handled in next render cycle or apply immediately
            const labels = document.querySelectorAll('.unit-label');
            labels.forEach(l => l.style.display = value ? 'block' : 'none');
        }

        this.render();
    }

    renderTasks() {
        this.clearHighlight();
        const tasksContainer = document.getElementById('tasks-container');
        if (!tasksContainer) return;
        tasksContainer.innerHTML = '';

        let items = [];

        // 1. Directives & Requests
        if (this.currentRole === 'COMMANDER') {
            items = this.store.state.tasks.map(t => ({ ...t, kind: 'TASK' }));
        } else if (this.currentRole.startsWith('SQUAD-')) {
            const squadId = this.currentRole.replace('SQUAD-', '');
            items = this.store.getTasksForSquad(squadId).map(t => ({ ...t, kind: 'TASK' }));
        }

        // 2. Staged Moves (Virtual Tasks)
        if (this.currentRole !== 'OBSERVER') {
            let staged = this.store.state.stagedMoves;
            // Filter
            if (this.currentRole.startsWith('SQUAD-')) {
                const squadId = this.currentRole.replace('SQUAD-', '');
                staged = staged.filter(m => {
                    const u = this.units.find(u => u.id === m.unitId);
                    return u && u.squad === squadId;
                });
            }
            // Map to items
            staged.forEach(m => {
                // Check if this move is already covered by a Request Task
                const hasPendingRequest = this.store.state.tasks.some(t =>
                    t.type === 'REQUEST' &&
                    t.status === 'PENDING' &&
                    t.payload &&
                    t.payload.unitId === m.unitId
                );

                // If Commander sees the Request, hide the Staged duplicate
                if (hasPendingRequest && this.currentRole === 'COMMANDER') return;

                const unit = this.units.find(u => u.id === m.unitId);
                if (unit) {
                    items.push({
                        id: `STAGED-${m.unitId}`,
                        title: `PLANNED: ${unit.callsign} -> [${m.x.toFixed(0)}, ${m.y.toFixed(0)}]`,
                        priority: null,
                        status: 'STAGED',
                        kind: 'STAGED',
                        squadId: unit.squad,
                        payload: { unitId: unit.id, x: m.x, y: m.y }, // for highlight
                        timestamp: Date.now()
                    });
                }
            });
        }



        // Filter by Tab
        if (this.currentTaskTab === 'HISTORY') {
            items = items.filter(t => t.status === 'COMPLETE');
        } else {
            items = items.filter(t => t.status !== 'COMPLETE');
        }

        if (items.length === 0) {
            tasksContainer.innerHTML = `<div class="empty-state">NO ${this.currentTaskTab} ITEMS</div>`;
            return;
        }

        items.forEach(task => {
            const card = document.createElement('div');
            const priorityClass = task.priority ? `priority-${task.priority.toLowerCase()}` : 'priority-none';
            card.className = `task-card ${priorityClass} status-${task.status.toLowerCase()}`;
            if (task.notification) card.classList.add('notification');

            // Visual Differentiation
            if (task.kind === 'STAGED') {
                card.style.borderRight = '4px solid var(--accent-amber)';
            } else if (task.type === 'REQUEST') {
                card.style.borderRight = '4px solid #d946ef';
            } else {
                card.style.borderRight = '4px solid var(--accent-cyan)';
            }

            if (task.payload) {
                card.onmouseenter = () => this.setHighlight({
                    ...task.payload,
                    type: task.kind === 'STAGED' ? 'STAGED' : 'REQUEST'
                });
                card.onmouseleave = () => this.clearHighlight();
                card.style.cursor = 'help';
            }

            const priorityBadge = task.priority ? `<span class="priority-badge">${task.priority}</span>` : '';
            const statusBadge = `<span class="status-badge">${task.status}</span>`;

            let actions = '';
            if (task.kind === 'STAGED') {
                actions = `<button class="task-btn danger" onclick="window.TacticalApp.clearUnitStagedMove('${task.payload.unitId}')">CLEAR</button>`;
                if (this.currentRole === 'COMMANDER') {
                    actions = `
                        <button class="task-btn complete" onclick="window.TacticalApp.executeUnitMove('${task.payload.unitId}')">EXECUTE</button>
                        ${actions}
                     `;
                }
            } else {
                if (this.currentRole !== 'COMMANDER') {
                    if (task.status === 'PENDING') {
                        actions = `<button class="task-btn" onclick="acknowledgeTask('${task.id}')">ACKNOWLEDGE</button>`;
                    } else if (task.status === 'ACKNOWLEDGED') {
                        actions = `<button class="task-btn complete" onclick="completeTask('${task.id}')">COMPLETE</button>`;
                    }
                } else {
                    if (task.type === 'REQUEST') {
                        actions = `
                            <button class="task-btn complete" onclick="window.TacticalApp.approveRequest('${task.id}')">APPROVE</button>
                            <button class="task-btn danger" onclick="window.TacticalApp.denyRequest('${task.id}')">DENY</button>
                         `;
                    } else {
                        actions = `<button class="task-btn danger" onclick="deleteTask('${task.id}')">DELETE</button>`;
                    }
                }
            }

            card.innerHTML = `
                <div class="task-header">
                    ${priorityBadge}
                    ${statusBadge}
                    <span class="task-squad">[${task.squadId}]</span>
                </div>
                <div class="task-title">${task.title}</div>
                <div class="task-actions">${actions}</div>
            `;
            tasksContainer.appendChild(card);
        });
    }

    approveRequest(taskId) {
        const task = this.store.state.tasks.find(t => t.id === taskId);
        if (task && task.payload) {
            const { unitId, x, y } = task.payload;

            // Execute the move
            const unit = this.units.find(u => u.id === unitId);
            if (unit) {
                unit.setTarget(x, y);
                this.logIntel(`[CMD] REQUEST APPROVED: ${unit.callsign} EN ROUTE`, 'info');

                // Delete the request task automatically
                this.store.deleteTask(taskId);
                this.store.clearStagedMove(unitId);
                this.render();
            }
        }
    }

    denyRequest(taskId) {
        this.store.deleteTask(taskId);
        this.logIntel(`[CMD] REQUEST DENIED`, 'danger');
        this.clearHighlight();
    }

    setHighlight(payload) {
        this.highlightedRequest = payload;
        this.render();
    }

    clearHighlight() {
        this.highlightedRequest = null;
        this.render();
    }

    initTerrain() {
        this.terrainLayer.innerHTML = '';
        this.terrain = [
            { x: 300, y: 400, r: 80, type: 'ANOMALY', label: 'VOID ZONE' },
            { x: 700, y: 200, r: 120, type: 'DEBRIS', label: 'FIELDS-04' },
            { x: 500, y: 800, r: 60, type: 'STATION', label: 'OUTPOST-9' }
        ];

        this.terrain.forEach(t => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', t.x);
            circle.setAttribute('cy', t.y);
            circle.setAttribute('r', t.r);
            circle.setAttribute('class', `terrain-feature ${t.type.toLowerCase()}`);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', t.x);
            text.setAttribute('y', t.y + t.r + 15);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'terrain-label');
            text.textContent = t.label;

            this.terrainLayer.appendChild(circle);
            this.terrainLayer.appendChild(text);
        });
    }

    generateTopography() {
        this.bgLayer.innerHTML = '';
        const centers = [
            { x: 200, y: 200 }, { x: 800, y: 300 }, { x: 500, y: 600 }
        ];

        centers.forEach(center => {
            for (let i = 1; i <= 5; i++) {
                const r = i * 40;
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                let d = `M ${center.x + r} ${center.y}`;
                for (let a = 0; a <= 360; a += 10) {
                    const angle = (a * Math.PI) / 180;
                    const noise = Math.sin(a * 0.1) * 5 + Math.cos(a * 0.2) * 5;
                    const x = center.x + (r + noise) * Math.cos(angle);
                    const y = center.y + (r + noise) * Math.sin(angle);
                    d += ` L ${x} ${y}`;
                }
                path.setAttribute('d', d);
                path.setAttribute('class', 'topo-line');
                this.bgLayer.appendChild(path);
            }
        });
        this.logIntel('[SYSTEM] TOPOGRAPHICAL DATA GENERATED', 'info');
    }

    setupEventListeners() {
        // User Menu Close Logic
        window.addEventListener('click', () => {
            const menu = document.getElementById('user-dropdown');
            const btn = document.getElementById('user-menu-btn');
            if (menu && menu.classList.contains('visible')) {
                menu.classList.remove('visible');
                if (btn) btn.classList.remove('active');
            }
        });

        this.svg.addEventListener('mousemove', (e) => {
            const pt = this.getSVGCoords(e);
            document.getElementById('mouse-coords').textContent = `${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}`;
        });

        // Multi-method selection and staging logic
        this.svg.addEventListener('click', (e) => {
            const pt = this.getSVGCoords(e);

            // Priority 1: Check DOM for unit marker
            let foundUnitId = null;
            const marker = e.target.closest('.unit-marker');
            if (marker) {
                foundUnitId = marker.dataset.id;
            }

            // Priority 2: Proximity Check (Radius 30 for easier clicking)
            if (!foundUnitId) {
                const searchRadius = 30;
                let closestDist = searchRadius;
                for (let u of this.units) {
                    const d = Math.sqrt((u.x - pt.x) ** 2 + (u.y - pt.y) ** 2);
                    if (d < closestDist) {
                        foundUnitId = u.id;
                        closestDist = d;
                    }
                }
            }

            if (foundUnitId) {
                // If we clicked a unit (even if already selected), just ensure it's selected
                this.selectUnit(foundUnitId);
                this.logIntel(`[SYSTEM] ASSET SELECTED: ${this.selectedUnit.callsign}`, 'info');
            } else if (this.selectedUnit) {
                // Observer Restriction: Cannot stage moves
                if (this.currentRole === 'OBSERVER') return;

                // Destroyed Restriction: Cannot stage moves
                if (this.selectedUnit.status === 'DESTROYED') {
                    this.logIntel(`[DENIED] UNIT ${this.selectedUnit.callsign} IS DESTROYED`, 'danger');
                    return;
                }

                // Prevent staging if unit is already moving
                if (this.selectedUnit.status === 'MOVING') {
                    this.logIntel(`[DENIED] UNIT ${this.selectedUnit.callsign} IS CURRENTLY IN TRANSIT`, 'danger');
                    return;
                }

                // We clicked the map while a unit was selected -> Stage move
                this.store.updateStagedMove(this.selectedUnit.id, pt.x, pt.y, e.shiftKey);
                this.logIntel(`[STAGED] ${this.selectedUnit.callsign} ${e.shiftKey ? 'WAYPOINT ADDED' : 'READY FOR DEPLOYMENT'}`, 'warning');
                this.render();
                this.updateUI(); // Refresh detail pane to show "Execute" button
            }
        });

        // Right-click to clear selection
        this.svg.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.selectUnit(null);
            this.logIntel('[SYSTEM] SELECTION CLEARED', 'info');
        });



        document.getElementById('add-unit').addEventListener('click', () => {
            const id = `UN-${Math.floor(Math.random() * 1000)}`;
            const callsign = `POLAR-${this.units.length + 1}`;

            this.store.addUnit({
                id,
                type: 'SCOUT',
                x: 50,
                y: 50,
                callsign,
                squad: 'BRAVO',
                status: 'ACTIVE',
                name: id
            });
            this.logIntel(`[SYSTEM] NEW ASSET DEPLOYED: ${callsign}`, 'info');
        });

        document.getElementById('gen-topo').addEventListener('click', () => {
            this.generateTopography();
        });

        document.getElementById('load-map').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.bgLayer.innerHTML = '';
                    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                    img.setAttribute('href', event.target.result);
                    img.setAttribute('width', '1000');
                    img.setAttribute('height', '1000');
                    img.setAttribute('class', 'map-background-image');
                    this.bgLayer.appendChild(img);
                    this.logIntel('[SYSTEM] BATTLE MAP OVERLAY LOADED', 'info');
                };
                reader.readAsDataURL(file);
            }
        });

        // Execute staged orders button
        const executeBtn = document.getElementById('execute-orders');
        if (executeBtn) {
            executeBtn.addEventListener('click', () => {
                this.executeStagedMoves();
            });
        }

        // Clear staged orders button
        const clearBtn = document.getElementById('clear-orders');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.store.clearAllStagedMoves();
                this.logIntel('[SYSTEM] STAGED ORDERS CLEARED', 'danger');
                this.render();
            });
        }

        // Sidebar collapsible panels
        this.setupPanelControls();
    }

    executeStagedMoves() {
        if (this.store.state.stagedMoves.length === 0) {
            this.logIntel('[WARNING] NO ORDERS TO EXECUTE', 'warning');
            return;
        }

        let count = 0;
        this.store.state.stagedMoves.forEach(move => {
            const unit = this.units.find(u => u.id === move.unitId);
            if (unit) {
                unit.setTarget(move.x, move.y);
                count++;
            }
        });

        this.logIntel(`[EXECUTE] ${count} ORDER(S) CONFIRMED - MOVING ASSETS`, 'info');
        this.store.clearAllStagedMoves();
        this.render();
    }

    setupPanelControls() {
        const headers = document.querySelectorAll('.panel-header');
        headers.forEach(header => {
            const panel = header.closest('.panel');
            const panelId = panel.id || header.textContent.trim().replace(/\s+/g, '-');

            // Fix: ensure the click listener is only added once
            if (header.dataset.hasListener) return;

            // Load saved state
            const isCollapsed = localStorage.getItem(`PANEL_COLLAPSED_${panelId}`) === 'true';
            if (isCollapsed) {
                panel.classList.add('collapsed');
            }

            header.addEventListener('click', () => {
                panel.classList.toggle('collapsed');
                localStorage.setItem(`PANEL_COLLAPSED_${panelId}`, panel.classList.contains('collapsed'));
            });

            header.dataset.hasListener = 'true';
        });
    }

    getSVGCoords(e) {
        const pt = this.svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        return pt.matrixTransform(this.svg.getScreenCTM().inverse());
    }

    selectUnit(id) {
        this.units.forEach(u => u.selected = (u.id === id));
        this.selectedUnit = this.units.find(u => u.id === id) || null;
        this.updateUnitList();
        this.updateDetailPane();
    }

    updateUI() {
        this.updateUnitList();
        this.updateDetailPane();
    }

    updateUnitList() {
        const unitList = document.getElementById('unit-list');
        if (!unitList) return;

        // We only rebuild the list when selection changes or a unit is added/removed
        // For simplicity we rebuild here but we call it less often
        unitList.innerHTML = '';
        // Filter units by squad if not Commander or Observer
        let displayUnits = this.units;
        if (this.currentRole !== 'COMMANDER' && this.currentRole !== 'OBSERVER') {
            const squadId = this.currentRole.replace('SQUAD-', '');
            displayUnits = this.units.filter(u => u.squad === squadId);
        }

        // Tab Filter
        if (this.currentUnitTab === 'LOSSES') {
            displayUnits = displayUnits.filter(u => u.status === 'DESTROYED');
        } else {
            displayUnits = displayUnits.filter(u => u.status !== 'DESTROYED');
        }

        displayUnits.forEach(u => {
            const div = document.createElement('div');
            div.className = `unit-list-item ${u.selected ? 'selected' : ''}`;
            const staged = this.store.state.stagedMoves.find(m => m.unitId === u.id);
            const squad = this.store.state.squads.find(s => s.id === u.squad);
            const sqColor = squad ? squad.color : 'var(--accent-cyan)';

            div.style.borderLeft = `3px solid ${sqColor}`;
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <span class="unit-id" style="color: ${sqColor}">${u.name || u.id}</span>
                    <span class="unit-status" style="position: static; font-size: 0.7em; pointer-events: none; color: ${u.status === 'MOVING' ? 'var(--accent-cyan)' : 'var(--text-dim)'}">
                        ${staged ? 'STAGED' : u.status}
                    </span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color:${sqColor}; font-size: 0.85em; opacity: 0.9;">${u.callsign}</span>
                    <span style="font-size:0.7em; opacity:0.7;">${u.type}</span>
                </div>
                <div style="font-size:0.6em; opacity:0.5; margin-top:2px;">[${u.squad}]</div>
            `;

            div.onclick = (e) => {
                e.stopPropagation();
                this.selectUnit(u.id);
            };
            unitList.appendChild(div);
        });
    }

    setStagedSpeed(unitId, speed) {
        const move = this.store.state.stagedMoves.find(m => m.unitId === unitId);
        if (move) {
            move.speed = speed;
            this.store.saveState();
            this.updateDetailPane();
        }
    }

    updateDetailPane() {
        const detailPane = document.getElementById('unit-detail');
        if (!detailPane) return;

        if (this.selectedUnit) {
            const staged = this.store.state.stagedMoves.find(m => m.unitId === this.selectedUnit.id);
            const pendingReq = this.store.state.tasks.find(t => t.type === 'REQUEST' && t.status === 'PENDING' && t.payload && t.payload.unitId === this.selectedUnit.id);
            const isObserver = this.currentRole === 'OBSERVER';
            const canEdit = this.currentRole === 'COMMANDER';

            const nameVal = this.selectedUnit.name || this.selectedUnit.id;

            detailPane.classList.remove('empty');
            detailPane.innerHTML = `
                <div class="detail-grid">
                    <div class="detail-row" style="align-items: center">
                        <span class="label">NAME:</span>
                        ${!canEdit ?
                    `<span class="value">${nameVal}</span>` :
                    `<input class="tactical-input" style="width: 120px; padding: 2px 5px; font-size: 0.75rem; text-align: right;" value="${nameVal}" onchange="window.TacticalApp.submitUnitProperty('${this.selectedUnit.id}', 'name', this.value)">`
                }
                    </div>
                    <div class="detail-row" style="align-items: center">
                        <span class="label">TYPE:</span>
                        ${!canEdit ?
                    `<span class="value">${this.selectedUnit.type}</span>` :
                    `<input class="tactical-input" style="width: 120px; padding: 2px 5px; font-size: 0.75rem; text-align: right;" value="${this.selectedUnit.type}" onchange="window.TacticalApp.submitUnitProperty('${this.selectedUnit.id}', 'type', this.value)">`
                }
                    </div>
                     <div class="detail-row" style="align-items: center">
                        <span class="label">SIG:</span>
                        ${!canEdit ?
                    `<span class="value">${this.selectedUnit.callsign}</span>` :
                    `<input class="tactical-input" style="width: 120px; padding: 2px 5px; font-size: 0.75rem; text-align: right;" value="${this.selectedUnit.callsign}" onchange="window.TacticalApp.submitUnitProperty('${this.selectedUnit.id}', 'callsign', this.value)">`
                }
                    </div>
                    <div class="detail-row"><span class="label">SQD:</span> <span class="value" style="color:var(--accent-cyan)">${this.selectedUnit.squad}</span></div>
                    <div class="detail-row"><span class="label">POS:</span> <span class="value">${this.selectedUnit.x.toFixed(0)}, ${this.selectedUnit.y.toFixed(0)}</span></div>
                    <div class="detail-row"><span class="label">STS:</span> <span class="value">${this.selectedUnit.status}</span></div>
                </div>
                ${staged ? `
                    <div class="staged-info" style="margin-top: 1rem; padding: 0.5rem; border: 1px dashed var(--accent-amber); background: rgba(255,180,0,0.05)">
                        <div class="label" style="color:var(--accent-amber)">STAGED MOVE DETECTED</div>
                        <div class="value" style="font-size: 0.8rem">TO: ${staged.x.toFixed(0)}, ${staged.y.toFixed(0)}</div>
                        
                        <div class="detail-row" style="margin-top:0.5rem; justify-content:center; opacity: 0.7; border-top: 1px dashed var(--accent-amber); padding-top: 0.5rem;">
                            <span class="label" style="font-size:0.6rem; text-align:center;">SHIFT+CLICK MAP TO ADD WAYPOINTS</span>
                        </div>
                        ${this.currentRole === 'COMMANDER' ? `
                        <div class="detail-row" style="align-items:center; margin-top:0.5rem;">
                           <span class="label">SPEED:</span>
                           <select class="tactical-input" style="width: 100px; font-size: 0.7rem; background:rgba(0,0,0,0.3); color:var(--text-main); border:1px solid var(--border-color);" onchange="window.TacticalApp.setStagedSpeed('${this.selectedUnit.id}', this.value)">
                               <option value="SLOW" ${staged.speed === 'SLOW' ? 'selected' : ''}>SLOW</option>
                               <option value="NORMAL" ${!staged.speed || staged.speed === 'NORMAL' ? 'selected' : ''}>NORMAL</option>
                               <option value="FAST" ${staged.speed === 'FAST' ? 'selected' : ''}>FAST</option>
                           </select>
                        </div>
                        ` : ''}
                        ${isObserver ?
                        `<div class="value" style="color:var(--text-dim); margin-top:0.5rem; font-size: 0.6rem; text-align:center;">[READ ONLY ACCESS]</div>` :
                        this.selectedUnit.status === 'DESTROYED' ?
                            `<div class="value" style="color:var(--accent-red); margin-top:0.5rem; font-size: 0.6rem; text-align:center;">[UNIT DESTROYED]</div>` :
                            pendingReq ?
                                `<button class="action-btn" disabled style="margin-top: 0.5rem; font-size: 0.6rem; padding: 0.3rem; border-color:var(--accent-amber); color:var(--accent-amber); opacity:0.7; cursor:default;">REQUEST PENDING</button>` :
                                `
                            ${this.currentRole === 'COMMANDER' ?
                                    `<div class="value" style="color:var(--accent-cyan); margin-top:0.5rem; font-size: 0.6rem; text-align:center; letter-spacing:1px;">[ORDER STAGED]</div>` :
                                    `<button class="action-btn" style="margin-top: 0.5rem; font-size: 0.6rem; padding: 0.3rem" onclick="window.TacticalApp.requestUnitMove('${this.selectedUnit.id}')">REQUEST TRANSFER</button>`
                                }
                            <button class="action-btn danger" style="margin-top: 0.5rem; font-size: 0.6rem; padding: 0.3rem" onclick="window.TacticalApp.clearUnitStagedMove('${this.selectedUnit.id}')">CLEAR</button>
                            `
                    }
                    </div>
                ` : ''}
                ${this.currentRole === 'COMMANDER' ? `
                    <div class="allocation-panel" style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                        <span class="label">ALLOCATE TO SQUAD:</span>
                        <div class="button-group" style="margin-top: 0.5rem; flex-wrap: wrap;">
                            ${this.store.state.squads.map(s => {
                        const isActive = s.id === this.selectedUnit.squad;
                        const baseStyle = `border-color:${s.color}; color:${s.color};`;
                        const activeStyle = isActive ? `background:${s.color}33; box-shadow: 0 0 10px ${s.color}66;` : '';
                        return `<button class="action-btn secondary" style="padding: 0.3rem; margin-bottom: 5px; flex: 0 0 45%; ${baseStyle} ${activeStyle}" onclick="window.TacticalApp.reassignUnitSquad('${this.selectedUnit.id}', '${s.id}')">${s.id}</button>`;
                    }).join('')}
                        </div>
                    </div>
                    <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem; display: flex; gap: 5px;">
                        ${this.selectedUnit.status === 'DESTROYED' ?
                        `<button class="action-btn" style="flex:1; border-color:var(--accent-cyan); color:var(--accent-cyan);" onclick="window.TacticalApp.setUnitStatus('${this.selectedUnit.id}', 'ACTIVE')">MARK ACTIVE</button>` :
                        `<button class="action-btn danger" style="flex:1" onclick="window.TacticalApp.setUnitStatus('${this.selectedUnit.id}', 'DESTROYED')">MARK DESTROYED</button>`
                    }
                        <button class="action-btn danger" style="flex:1" onclick="window.TacticalApp.deleteUnit('${this.selectedUnit.id}')">DELETE</button>
                    </div>
                ` : ''}
            `;
        } else {
            detailPane.classList.add('empty');
            detailPane.textContent = 'SELECT A UNIT TO VIEW TELEMETRY';
        }
    }

    submitSquadRequests() {
        if (!this.currentRole.startsWith('SQUAD-')) return;
        const squadId = this.currentRole.replace('SQUAD-', '');

        const squadUnits = this.units.filter(u => u.squad === squadId);
        const stagedMoves = this.store.state.stagedMoves.filter(m => squadUnits.some(u => u.id === m.unitId));

        if (stagedMoves.length === 0) {
            this.logIntel('[SYSTEM] NO PLANNED MOVES TO SUBMIT', 'warning');
            return;
        }

        let submitted = 0;
        stagedMoves.forEach(m => {
            const unit = squadUnits.find(u => u.id === m.unitId);
            if (unit) {
                this.store.addMoveRequest(unit, m.x, m.y);
                this.store.clearStagedMove(m.unitId);
                submitted++;
            }
        });

        this.logIntel(`[OPS] SUBMITTED ${submitted} MOVEMENT REQUEST(S)`, 'success');
        this.render();
        this.updateUI();
    }

    clearSquadOrders() {
        if (!this.currentRole.startsWith('SQUAD-')) return;
        const squadId = this.currentRole.replace('SQUAD-', '');

        const squadUnits = this.units.filter(u => u.squad === squadId);

        let count = 0;
        squadUnits.forEach(u => {
            const hasMove = this.store.state.stagedMoves.some(m => m.unitId === u.id);
            if (hasMove) {
                this.store.clearStagedMove(u.id);
                count++;
            }
        });

        if (count > 0) {
            this.logIntel(`[OPS] CLEARED ${count} PLANNED MOVE(S)`, 'info');
            this.render();
            this.updateUI();
        }
    }

    submitUnitProperty(unitId, prop, value) {
        const unit = this.units.find(u => u.id === unitId);
        if (!unit) return;

        let name = unit.name || unit.id;
        let type = unit.type;
        let callsign = unit.callsign;

        if (prop === 'name') name = value;
        if (prop === 'type') type = value;
        if (prop === 'callsign') callsign = value;

        this.store.updateUnitDetails(unitId, name, type, callsign);
        this.logIntel(`[ADMIN] UNIT DETAILS UPDATED: ${prop.toUpperCase()}`, 'warning');
    }

    setUnitStatus(unitId, status) {
        this.store.updateUnitStatus(unitId, status);
        this.logIntel(`[ADMIN] UNIT STATUS UPDATED: ${status}`, 'danger');
    }

    deleteUnit(unitId) {
        if (confirm('CONFIRM DELETION OF ASSET?')) {
            this.store.deleteUnit(unitId);
            this.logIntel(`[ADMIN] ASSET DELETED: ${unitId}`, 'danger');
        }
    }

    executeUnitMove(unitId) {
        const stagedMove = this.store.state.stagedMoves.find(m => m.unitId === unitId);
        if (stagedMove) {
            const unit = this.units.find(u => u.id === unitId);
            if (unit) {
                // Apply Speed
                if (stagedMove.speed === 'SLOW') unit.speed = 0.3;
                else if (stagedMove.speed === 'FAST') unit.speed = 2.0;
                else unit.speed = 0.8; // Default normal

                if (stagedMove.waypoints && stagedMove.waypoints.length > 0) {
                    unit.setPath(stagedMove.waypoints);
                } else {
                    unit.setTarget(stagedMove.x, stagedMove.y);
                }
                this.store.clearStagedMove(unitId);
                this.logIntel(`[EXECUTE] ${unit.callsign} MOVING TO STAGED COORDS`, 'info');
                this.render();
                this.updateUI();
            }
        }
    }

    clearUnitStagedMove(unitId) {
        this.store.clearStagedMove(unitId);
        this.logIntel(`[CMD] STAGED MOVE CLEARED FOR ${unitId}`, 'info');
        this.render();
        this.updateUI();
    }

    requestUnitMove(unitId) {
        const stagedMove = this.store.state.stagedMoves.find(m => m.unitId === unitId);
        if (stagedMove) {
            const unit = this.units.find(u => u.id === unitId);
            if (unit) {
                if (unit.status === 'DESTROYED') return;
                // Submit request to store
                this.store.addMoveRequest(unit, stagedMove.x, stagedMove.y);

                this.logIntel(`[REQUEST] TRANSFER REQUEST SENT FOR ${unit.callsign}`, 'warning');
                // Persistence: We don't clear the staged move here anymore as per user request
                this.render();
                this.updateUI();
            }
        }
    }

    submitRename(unitId, newName) {
        if (newName && newName.trim().length > 0) {
            this.store.renameUnit(unitId, newName.trim());
            this.logIntel(`[CMD] ASSET ${unitId} READESIGNATED: ${newName.toUpperCase().trim()}`, 'info');
            this.updateUI();
        }
    }

    render() {
        this.unitsLayer.innerHTML = '';
        this.pathsLayer.innerHTML = '';

        let displayUnits = this.units;
        if (this.currentRole !== 'COMMANDER' && this.currentRole !== 'OBSERVER') {
            const squadId = this.currentRole.replace('SQUAD-', '');
            displayUnits = this.units.filter(u => u.squad === squadId);
        }

        displayUnits.forEach(u => {
            if (u.targetX !== null && this.displayOptions.paths) {
                let d = `M ${u.x} ${u.y} L ${u.targetX} ${u.targetY}`;
                if (u.path && u.path.length > 0) {
                    u.path.forEach(p => d += ` L ${p.x} ${p.y}`);
                }
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', d);
                path.setAttribute('class', 'movement-path');
                path.setAttribute('marker-end', 'url(#arrowhead)');
                this.pathsLayer.appendChild(path);
            }

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', `unit-marker ${u.selected ? 'selected' : ''}`);
            g.setAttribute('data-id', u.id);
            g.setAttribute('transform', `translate(${u.x}, ${u.y})`);

            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            const size = 10;
            // Squad color override
            const squad = this.store.state.squads.find(s => s.id === u.squad);
            if (squad) {
                poly.style.stroke = squad.color;
            }

            if (u.type === 'FIGHTER-WG') {
                poly.setAttribute('points', `0, -${size} ${size / 1.2}, ${size / 1.2} -${size / 1.2}, ${size / 1.2}`);
            } else {
                poly.setAttribute('points', `0,-${size} ${size},0 0,${size} -${size},0`);
            }
            poly.setAttribute('class', 'unit-icon');

            if (u.selected) {
                const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                ring.setAttribute('r', size + 8);
                ring.setAttribute('fill', 'none');
                ring.setAttribute('stroke', 'var(--accent-amber)');
                ring.setAttribute('stroke-width', '1');
                ring.setAttribute('stroke-dasharray', '2 4');
                g.appendChild(ring);
            }

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', size + 5);
            text.setAttribute('y', 5);
            text.setAttribute('class', 'unit-label');
            text.textContent = u.callsign;
            if (!this.displayOptions.labels) {
                text.style.display = 'none';
            }

            // Render logic for Destroyed vs Active
            if (u.status === 'DESTROYED') {
                const xGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                xGroup.setAttribute('stroke', '#ff3333');
                xGroup.setAttribute('stroke-width', '2');

                const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line1.setAttribute('x1', -size); line1.setAttribute('y1', -size);
                line1.setAttribute('x2', size); line1.setAttribute('y2', size);

                const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line2.setAttribute('x1', size); line2.setAttribute('y1', -size);
                line2.setAttribute('x2', -size); line2.setAttribute('y2', size);

                xGroup.appendChild(line1);
                xGroup.appendChild(line2);
                g.appendChild(xGroup);
            } else {
                g.appendChild(poly);
            }
            if (this.currentRole === 'COMMANDER' && u.status !== 'DESTROYED') {
                const squadText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                squadText.setAttribute('x', size + 5);
                squadText.setAttribute('y', -8);
                squadText.setAttribute('class', 'unit-label');
                squadText.setAttribute('style', `font-size: 0.5rem; fill: ${squad ? squad.color : '#fff'}; opacity: 0.8; letter-spacing: 0px;`);
                squadText.textContent = `[${u.squad}]`;
                g.appendChild(squadText);
            }
            g.appendChild(text);
            this.unitsLayer.appendChild(g);
        });

        // Render staged moves from store
        this.store.state.stagedMoves.forEach(move => {
            const unit = displayUnits.find(u => u.id === move.unitId);
            if (unit && this.displayOptions.paths) {
                let d = `M ${unit.x} ${unit.y}`;
                let points = move.waypoints ? move.waypoints : [{ x: move.x, y: move.y }];

                points.forEach(p => d += ` L ${p.x} ${p.y}`);

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', d);
                path.setAttribute('class', 'staged-path');
                path.setAttribute('marker-end', 'url(#staged-arrowhead)');
                this.pathsLayer.appendChild(path);

                points.forEach(p => {
                    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    marker.setAttribute('cx', p.x);
                    marker.setAttribute('cy', p.y);
                    marker.setAttribute('r', '6');
                    marker.setAttribute('class', 'staged-marker');
                    this.pathsLayer.appendChild(marker);
                });
            }
        });

        // Render highlighted request
        if (this.highlightedRequest) {
            const unit = this.units.find(u => u.id === this.highlightedRequest.unitId);
            if (unit) {
                const isStaged = this.highlightedRequest.type === 'STAGED';
                const pathClass = isStaged ? 'staged-path' : 'request-path';
                const markerClass = isStaged ? 'staged-marker' : 'request-marker';
                const markerHead = isStaged ? 'url(#staged-arrowhead)' : 'url(#request-arrowhead)';

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', `M ${unit.x} ${unit.y} L ${this.highlightedRequest.x} ${this.highlightedRequest.y}`);
                path.setAttribute('class', pathClass);
                path.setAttribute('marker-end', markerHead);
                this.pathsLayer.appendChild(path);

                const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                marker.setAttribute('cx', this.highlightedRequest.x);
                marker.setAttribute('cy', this.highlightedRequest.y);
                marker.setAttribute('r', '6');
                marker.setAttribute('class', markerClass);
                this.pathsLayer.appendChild(marker);
            }
        }
    }

    startLoop() {
        const loop = () => {
            this.units.forEach(u => u.update());
            this.render();
            // Only update the detail pane text in real-time, don't rebuild the innerHTML every frame unless moving
            if (this.selectedUnit && this.selectedUnit.status === 'MOVING') {
                this.updateDetailPane();
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    logIntel(msg, type = 'info') {
        const feed = document.getElementById('intel-feed');
        if (!feed) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        const now = new Date().toISOString().split('T')[1].split('.')[0];
        entry.textContent = `[${now}] ${msg}`;
        feed.prepend(entry);
    }

    updateClock() {
        const clock = document.getElementById('clock');
        if (!clock) return;
        const now = new Date();
        clock.textContent = now.getUTCHours().toString().padStart(2, '0') + ':' +
            now.getUTCMinutes().toString().padStart(2, '0') + ':' +
            now.getUTCSeconds().toString().padStart(2, '0') + ' UTC';
    }
}

// Make globally accessible for UI buttons
window.TacticalApp = null;

window.addEventListener('load', () => {
    window.TacticalApp = new TacticalMap();
});
