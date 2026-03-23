
let allSessions = [];

document.addEventListener('DOMContentLoaded', async () => {
    await initApp('history');
    if (!currentUser) return;

    await fetchHistory();
    
    document.getElementById('date-filter').addEventListener('change', renderList);
});

async function fetchHistory() {
    try {
        allSessions = await db.sessions.getByUser(currentUser.id);
        allSessions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
        renderList();
    } catch (err) {
        console.error("Failed to load history", err);
    }
}

function renderList() {
    const filter = document.getElementById('date-filter').value;
    const container = document.getElementById('sessions-list');
    const emptyState = document.getElementById('empty-state');
    
    container.innerHTML = '';
    
    // Filter
    const now = new Date();
    let filtered = allSessions.filter(s => {
        if (filter === 'all') return true;
        const sDate = new Date(s.startedAt);
        const diffDays = (now - sDate) / (1000 * 60 * 60 * 24);
        
        if (filter === 'today') return diffDays < 1;
        if (filter === '7days') return diffDays <= 7;
        if (filter === '30days') return diffDays <= 30;
        return true;
    });

    if (filtered.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';

    filtered.forEach(session => {
        const div = document.createElement('div');
        div.className = 'session-card';
        div.onclick = () => openSessionDetails(session);
        
        const isCompleted = session.status === 'completed';
        
        div.innerHTML = `
            <div class="session-card-left">
                <div class="session-title">
                    Session 
                    <span class="status-badge ${isCompleted ? 'completed' : 'active'}">${isCompleted ? 'Done' : 'Active'}</span>
                </div>
                <div class="session-meta">
                    <span><i class="ph ph-calendar-blank"></i> ${formatDate(session.startedAt)}</span>
                    ${isCompleted ? `<span><i class="ph ph-check-circle"></i> ${formatDate(session.endedAt)}</span>` : ''}
                </div>
            </div>
            <div class="session-card-right">
                <div class="session-count">+${session.totalIncrements}</div>
                <div class="session-duration">${formatTimeFromMs(session.durationMs)}</div>
            </div>
        `;
        
        container.appendChild(div);
    });
}

async function openSessionDetails(session) {
    const milestones = await db.milestones.getBySession(currentUser.id, session.id);
    milestones.sort((a,b) => a.count - b.count);
    
    let milestonesHtml = '';
    if (milestones.length > 0) {
        milestonesHtml = `
            <h4 style="margin-top: 1.5rem; margin-bottom: 0.5rem;">Milestones Reached</h4>
            <div class="milestones-list">
                ${milestones.map(m => `
                    <div class="milestone-item">
                        <span style="font-weight:600;"><i class="ph ph-flag text-primary"></i> Reached ${m.count}</span>
                        <span class="text-secondary">${formatTimeFromMs(m.timeFromSessionStartMs)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        milestonesHtml = '<p class="text-secondary" style="margin-top:1rem;">No milestones reached in this session.</p>';
    }

    const start = formatDate(session.startedAt);
    const end = session.endedAt ? formatDate(session.endedAt) : 'Currently Active';
    
    const html = `
        <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 1rem;">
            <div>
                <div class="text-secondary" style="font-size:0.875rem;">Final Count</div>
                <div style="font-size: 2rem; font-weight:700; color:var(--brand-primary);">${session.endCount}</div>
            </div>
            <div style="text-align:right;">
                <div class="text-secondary" style="font-size:0.875rem;">Total Time</div>
                <div style="font-size: 1.5rem; font-weight:600;">${formatTimeFromMs(session.durationMs)}</div>
            </div>
        </div>
        
        <div style="background:var(--surface-hover); padding:1rem; border-radius:var(--radius-md); font-size:0.875rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                <span class="text-secondary">Started</span>
                <span>${start}</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
                <span class="text-secondary">Ended</span>
                <span>${end}</span>
            </div>
        </div>
        
        ${milestonesHtml}
    `;

    showModal('Session Details', html, 'Close', () => { return true; }, '');
    
    // Hide cancel button in this modal since it's just dismissive
    setTimeout(() => {
        const cancelBtn = document.getElementById('modal-cancel-btn');
        if(cancelBtn) cancelBtn.style.display = 'none';
        const confirmBtn = document.getElementById('modal-confirm-btn');
        if(confirmBtn) confirmBtn.textContent = 'Close';
    }, 20);
}
