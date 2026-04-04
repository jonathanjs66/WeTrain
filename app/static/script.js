const API_BASE = '/api';
let currentRole = 'admin';
let currentTrainerId = 1;
let trainers = [];

// Check health on load
document.addEventListener('DOMContentLoaded', () => {
    checkHealth();
    loadTrainers();
    loadSessions();
    setInterval(loadTrainers, 5000);
    setInterval(loadSessions, 5000);
    
    // Role toggle listeners
    document.querySelectorAll('input[name="role"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentRole = e.target.value;
            switchRole();
        });
    });
    
    document.getElementById('trainerSelect').addEventListener('change', (e) => {
        currentTrainerId = parseInt(e.target.value);
        loadTrainerSessions();
    });
});

function switchRole() {
    document.getElementById('adminView').classList.toggle('visible', currentRole === 'admin');
    document.getElementById('trainerView').classList.toggle('visible', currentRole === 'trainer');
    
    if (currentRole === 'trainer') {
        loadTrainerSessions();
    }
}

async function checkHealth() {
    try {
        const res = await fetch('/health');
        const data = await res.json();
        const elem = document.getElementById('health');
        if (data.status === 'ok') {
            elem.textContent = '✓ Backend connected';
            elem.classList.add('ok');
        }
    } catch (err) {
        document.getElementById('health').textContent = '✗ Connection failed';
    }
}

async function loadTrainers() {
    try {
        const res = await fetch(`${API_BASE}/trainers/`);
        trainers = await res.json();
        
        // Update trainers list (admin view)
        const list = document.getElementById('trainersList');
        if (trainers.length === 0) {
            list.innerHTML = '<p>No trainers yet</p>';
        } else {
            list.innerHTML = trainers.map(t => `
                <div class="item">
                    <h3>${t.name}</h3>
                    <p>ID: ${t.id}</p>
                </div>
            `).join('');
        }

        // Update trainer dropdown (admin view)
        const select = document.getElementById('sessionTrainer');
        const currentVal = select.value;
        select.innerHTML = '<option value="">Select Trainer</option>' + 
            trainers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        select.value = currentVal;
        
        // Update trainer selector (trainer view)
        const trainerSelect = document.getElementById('trainerSelect');
        trainerSelect.innerHTML = trainers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        if (!trainers.find(t => t.id === currentTrainerId)) {
            currentTrainerId = trainers[0]?.id || 1;
        }
        trainerSelect.value = currentTrainerId;
    } catch (err) {
        console.error('Failed to load trainers:', err);
    }
}

async function loadSessions() {
    try {
        const res = await fetch(`${API_BASE}/sessions/`);
        const sessions = await res.json();
        
        const list = document.getElementById('sessionsList');
        if (sessions.length === 0) {
            list.innerHTML = '<p>No sessions yet</p>';
        } else {
            list.innerHTML = sessions.map(s => {
                const start = new Date(s.starts_at);
                const end = new Date(s.ends_at);
                return `
                    <div class="item">
                        <h3>${s.client_name}</h3>
                        <p>Trainer ID: ${s.trainer_id}</p>
                        <div class="time">${start.toLocaleString()} → ${end.toLocaleString()}</div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Failed to load sessions:', err);
    }
}

async function loadTrainerSessions() {
    try {
        const res = await fetch(`${API_BASE}/sessions/`);
        const allSessions = await res.json();
        
        // Filter sessions for current trainer
        const sessions = allSessions.filter(s => s.trainer_id === currentTrainerId);
        
        const list = document.getElementById('trainerSessions');
        if (sessions.length === 0) {
            list.innerHTML = '<p>No sessions booked for you yet</p>';
        } else {
            list.innerHTML = sessions.map(s => {
                const start = new Date(s.starts_at);
                const end = new Date(s.ends_at);
                return `
                    <div class="item">
                        <h3>${s.client_name}</h3>
                        <div class="time">${start.toLocaleString()} → ${end.toLocaleString()}</div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Failed to load trainer sessions:', err);
    }
}

async function addTrainer() {
    const name = document.getElementById('trainerName').value.trim();
    if (!name) {
        showMessage('Please enter a trainer name', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/trainers/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (!res.ok) {
            const err = await res.json();
            showMessage(err.error || 'Failed to create trainer', 'error');
            return;
        }

        showMessage('Trainer created!', 'success');
        document.getElementById('trainerName').value = '';
        await loadTrainers();
    } catch (err) {
        showMessage('Error: ' + err.message, 'error');
    }
}

async function addSession() {
    const trainerId = document.getElementById('sessionTrainer').value;
    const clientName = document.getElementById('sessionClient').value.trim();
    const start = document.getElementById('sessionStart').value;
    const end = document.getElementById('sessionEnd').value;

    if (!trainerId || !clientName || !start || !end) {
        showMessage('Please fill in all fields', 'error');
        return;
    }

    const startsAt = new Date(start).toISOString();
    const endsAt = new Date(end).toISOString();

    try {
        const res = await fetch(`${API_BASE}/sessions/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trainer_id: parseInt(trainerId),
                client_name: clientName,
                starts_at: startsAt,
                ends_at: endsAt
            })
        });

        const data = await res.json();

        if (!res.ok) {
            showMessage(data.error || 'Failed to create session', 'error');
            return;
        }

        showMessage('Session created!', 'success');
        document.getElementById('sessionClient').value = '';
        document.getElementById('sessionStart').value = '';
        document.getElementById('sessionEnd').value = '';
        await loadSessions();
    } catch (err) {
        showMessage('Error: ' + err.message, 'error');
    }
}

async function bookSession() {
    const clientName = document.getElementById('bookClientName').value.trim();
    const start = document.getElementById('bookStart').value;
    const end = document.getElementById('bookEnd').value;

    if (!clientName || !start || !end) {
        showBookMessage('Please fill in all fields', 'error');
        return;
    }

    const startsAt = new Date(start).toISOString();
    const endsAt = new Date(end).toISOString();

    try {
        const res = await fetch(`${API_BASE}/sessions/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trainer_id: currentTrainerId,
                client_name: clientName,
                starts_at: startsAt,
                ends_at: endsAt
            })
        });

        const data = await res.json();

        if (!res.ok) {
            showBookMessage(data.error || 'Failed to book session', 'error');
            return;
        }

        showBookMessage('Session booked!', 'success');
        document.getElementById('bookClientName').value = '';
        document.getElementById('bookStart').value = '';
        document.getElementById('bookEnd').value = '';
        await loadTrainerSessions();
    } catch (err) {
        showBookMessage('Error: ' + err.message, 'error');
    }
}

function showMessage(text, type) {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.className = `message ${type}`;
    setTimeout(() => {
        msg.className = 'message';
    }, 3000);
}

function showBookMessage(text, type) {
    const msg = document.getElementById('bookMessage');
    msg.textContent = text;
    msg.className = `message ${type}`;
    setTimeout(() => {
        msg.className = 'message';
    }, 3000);
}
