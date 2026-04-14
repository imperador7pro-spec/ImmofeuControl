/**
 * Excubya - Dashboard JavaScript
 * Real-time monitoring interface
 */

// ==================== STATE ====================
let ws = null;
let cameras = [];
let alertItems = [];

// ==================== WEBSOCKET ====================

function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws/alerts`);

    ws.onopen = () => {
        document.getElementById('ws-status').className = 'status-badge online';
        document.getElementById('ws-status').textContent = 'Connecte';
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'alert') {
            handleAlert(msg.data);
        }
    };

    ws.onclose = () => {
        document.getElementById('ws-status').className = 'status-badge offline';
        document.getElementById('ws-status').textContent = 'Deconnecte';
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };

    // Heartbeat
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
        }
    }, 30000);
}

// ==================== ALERTS ====================

function handleAlert(data) {
    // Show banner
    const banner = document.getElementById('alert-banner');
    const text = document.getElementById('alert-text');
    text.textContent = `${data.incident_type.toUpperCase()} - ${data.description}`;
    banner.classList.remove('hidden');

    // Play sound
    playAlertSound(data.severity);

    // Add to feed
    addAlertToFeed(data);

    // Refresh stats and incidents
    loadStats();
    loadIncidents();

    // Auto-hide banner after 10s
    setTimeout(() => {
        banner.classList.add('hidden');
    }, 10000);
}

function addAlertToFeed(data) {
    const feed = document.getElementById('alerts-feed');

    // Remove empty state
    const empty = feed.querySelector('.empty-state');
    if (empty) empty.remove();

    const time = new Date(data.timestamp * 1000).toLocaleTimeString('fr-FR');
    const item = document.createElement('div');
    item.className = `alert-item severity-${data.severity}`;
    item.innerHTML = `
        <div class="alert-item-header">
            <span class="alert-item-type">${data.incident_type}</span>
            <span class="alert-item-time">${time}</span>
        </div>
        <div class="alert-item-desc">
            Camera ${data.camera_id} - ${data.description}
            <br>Confiance: ${(data.confidence * 100).toFixed(0)}%
        </div>
    `;

    feed.insertBefore(item, feed.firstChild);
    alertItems.push(data);

    // Keep max 100 items
    while (feed.children.length > 100) {
        feed.removeChild(feed.lastChild);
    }
}

function clearAlerts() {
    const feed = document.getElementById('alerts-feed');
    feed.innerHTML = '<p class="empty-state">En attente d\'alertes...</p>';
    alertItems = [];
}

function dismissAlert() {
    document.getElementById('alert-banner').classList.add('hidden');
}

function playAlertSound(severity) {
    // Create a simple beep sound using Web Audio API
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.frequency.value = severity === 'critical' ? 880 : 660;
        oscillator.type = 'sine';
        gain.gain.value = 0.1;

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);

        if (severity === 'critical') {
            // Double beep for critical
            const osc2 = ctx.createOscillator();
            osc2.connect(gain);
            osc2.frequency.value = 880;
            osc2.type = 'sine';
            osc2.start(ctx.currentTime + 0.4);
            osc2.stop(ctx.currentTime + 0.7);
        }
    } catch (e) {
        // Audio not available
    }
}

// ==================== CAMERAS ====================

async function loadCameras() {
    try {
        const response = await fetch('/api/cameras');
        cameras = await response.json();
        renderCameras();
    } catch (e) {
        console.error('Failed to load cameras:', e);
    }
}

function renderCameras() {
    const grid = document.getElementById('camera-grid');

    if (cameras.length === 0) {
        grid.innerHTML = '<p class="empty-state">Aucune camera configuree. Ajoutez une camera pour commencer.</p>';
        return;
    }

    grid.innerHTML = cameras.map(cam => `
        <div class="camera-card" onclick="viewCamera(${cam.id})">
            <div class="camera-card-preview">
                <img src="/api/cameras/${cam.id}/snapshot" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
                <span class="no-feed" style="display:none">Pas de flux</span>
            </div>
            <div class="camera-card-info">
                <h4>${cam.name}</h4>
                <div class="meta">
                    <span class="camera-status-dot ${cam.status}"></span>
                    <span>${cam.status}</span>
                    ${cam.location_name ? `<span>| ${cam.location_name}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function viewCamera(id) {
    window.open(`/api/cameras/${id}/snapshot`, '_blank');
}

// ==================== ADD CAMERA MODAL ====================

function openAddCameraModal() {
    document.getElementById('add-camera-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('add-camera-modal').classList.add('hidden');
}

async function addCamera(event) {
    event.preventDefault();

    const data = {
        name: document.getElementById('cam-name').value,
        stream_url: document.getElementById('cam-url').value,
        location_name: document.getElementById('cam-location').value || null,
        latitude: parseFloat(document.getElementById('cam-lat').value) || null,
        longitude: parseFloat(document.getElementById('cam-lng').value) || null,
        zone_type: document.getElementById('cam-zone').value,
        detection_enabled: document.getElementById('cam-detection').checked,
    };

    try {
        const response = await fetch('/api/cameras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            closeModal();
            loadCameras();
            loadStats();
        } else {
            const err = await response.json();
            alert('Erreur: ' + (err.detail || 'Impossible d\'ajouter la camera'));
        }
    } catch (e) {
        alert('Erreur de connexion');
    }
}

// ==================== INCIDENTS ====================

async function loadIncidents() {
    try {
        const type = document.getElementById('filter-type').value;
        const severity = document.getElementById('filter-severity').value;

        let url = '/api/incidents?limit=20';
        if (type) url += `&incident_type=${type}`;
        if (severity) url += `&severity=${severity}`;

        const response = await fetch(url);
        const incidents = await response.json();
        renderIncidents(incidents);
    } catch (e) {
        console.error('Failed to load incidents:', e);
    }
}

function renderIncidents(incidents) {
    const tbody = document.getElementById('incidents-tbody');

    if (incidents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Aucun incident enregistre</td></tr>';
        return;
    }

    tbody.innerHTML = incidents.map(inc => {
        const date = new Date(inc.detected_at).toLocaleString('fr-FR');
        const typeLabels = {
            accident: 'Accident', fall: 'Chute', fire: 'Feu',
            smoke: 'Fumee', medical_emergency: 'Urgence med.',
            intrusion: 'Intrusion', crowd_anomaly: 'Anomalie foule'
        };

        return `
            <tr>
                <td>#${inc.id}</td>
                <td>${date}</td>
                <td>Camera ${inc.camera_id}</td>
                <td><span class="type-badge">${typeLabels[inc.incident_type] || inc.incident_type}</span></td>
                <td><span class="severity-badge ${inc.severity}">${inc.severity}</span></td>
                <td>${(inc.confidence * 100).toFixed(0)}%</td>
                <td>${inc.description || '-'}</td>
                <td>
                    ${inc.is_false_alarm ? '<span class="severity-badge low">Fausse alerte</span>' : `
                        <button class="btn btn-sm btn-secondary" onclick="markFalseAlarm(${inc.id})">Fausse alerte</button>
                        ${!inc.resolved_at ? `<button class="btn btn-sm btn-primary" onclick="resolveIncident(${inc.id})">Resoudre</button>` : ''}
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

async function markFalseAlarm(id) {
    await fetch(`/api/incidents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_false_alarm: true }),
    });
    loadIncidents();
}

async function resolveIncident(id) {
    await fetch(`/api/incidents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved_at: new Date().toISOString() }),
    });
    loadIncidents();
}

// ==================== STATS ====================

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();

        document.getElementById('cameras-online').textContent = stats.cameras_online;
        document.getElementById('incidents-today').textContent = stats.incidents_today;
        document.getElementById('alerts-sent').textContent = stats.alerts_sent;
        document.getElementById('frames-analyzed').textContent = formatNumber(stats.frames_analyzed);
    } catch (e) {
        console.error('Failed to load stats:', e);
    }
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    loadCameras();
    loadIncidents();
    loadStats();

    // Auto-refresh
    setInterval(loadStats, 10000);
    setInterval(loadCameras, 30000);
});
