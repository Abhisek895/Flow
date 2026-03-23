
document.addEventListener('DOMContentLoaded', async () => {
    await initApp('analytics');
    if (!currentUser) return;

    await loadAnalytics();
});

async function loadAnalytics() {
    try {
        const userId = currentUser.id;
        
        // Fetch all data
        const allSessions = await db.sessions.getByUser(userId);
        const allDailyStats = await db.dailyStats.getByUser(userId);
        
        // 1. Calculate Streak
        let streak = 0;
        let d = new Date();
        // Check if today has count
        const todayStr = getLocalDateString(d);
        const todayStat = allDailyStats.find(s => s.date === todayStr);
        if (todayStat && todayStat.totalCount > 0) {
            streak++;
            d.setDate(d.getDate() - 1);
        }
        
        while (true) {
            const dateStr = getLocalDateString(d);
            const stat = allDailyStats.find(s => s.date === dateStr);
            if (stat && stat.totalCount > 0) {
                streak++;
                d.setDate(d.getDate() - 1);
            } else {
                break;
            }
        }
        
        document.getElementById('stat-streak').textContent = `${streak} Days`;

        // 2. Weekly & Monthly Averages/Totals
        let monthlyTotal = 0;
        let last7DaysTotal = 0;
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        allDailyStats.forEach(stat => {
            const statDate = new Date(stat.date);
            if (statDate >= thirtyDaysAgo) {
                monthlyTotal += stat.totalCount;
            }
            if (statDate >= sevenDaysAgo) {
                last7DaysTotal += stat.totalCount;
            }
        });
        
        document.getElementById('stat-monthly-total').textContent = monthlyTotal.toLocaleString();
        document.getElementById('stat-weekly-avg').textContent = Math.round(last7DaysTotal / 7) + '/day';
        
        // 3. Best Day
        let bestDay = 0;
        allDailyStats.forEach(stat => {
            if (stat.totalCount > bestDay) bestDay = stat.totalCount;
        });
        document.getElementById('stat-best-day').textContent = bestDay.toLocaleString();

        // 4. Avg Session Length
        let totalDuration = 0;
        let completedSessions = 0;
        allSessions.forEach(s => {
            if (s.status === 'completed' && s.durationMs > 0) {
                totalDuration += s.durationMs;
                completedSessions++;
            }
        });
        const avgDur = completedSessions > 0 ? (totalDuration / completedSessions) : 0;
        document.getElementById('stat-avg-duration').textContent = formatTimeFromMs(avgDur);

        // Render Charts
        renderMonthlyChart(allDailyStats);
        renderDurationChart(allSessions);
        renderTopSessions(allSessions);

    } catch (err) {
        console.error("Failed to load analytics", err);
    }
}

function renderMonthlyChart(allDailyStats) {
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    
    // Generate last 30 days labels
    const labels = [];
    const data = [];
    
    for(let i=29; i>=0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = getLocalDateString(d);
        
        labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        const stat = allDailyStats.find(s => s.date === dateStr);
        data.push(stat ? stat.totalCount : 0);
    }

    const color = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#3b82f6';

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: data,
                borderColor: color,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderDurationChart(allSessions) {
    const ctx = document.getElementById('durationChart').getContext('2d');
    
    let short = 0, med = 0, long = 0;
    
    allSessions.forEach(s => {
        if(s.status !== 'completed') return;
        const mins = s.durationMs / 60000;
        if (mins < 5) short++;
        else if (mins < 30) med++;
        else long++;
    });

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['< 5 mins', '5-30 mins', '> 30 mins'],
            datasets: [{
                data: [short, med, long],
                backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function renderTopSessions(allSessions) {
    const container = document.getElementById('top-sessions-list');
    
    const sorted = [...allSessions].sort((a,b) => b.endCount - a.endCount).slice(0, 4);
    
    if (sorted.length === 0 || sorted[0].endCount === 0) {
        container.innerHTML = '<div class="text-secondary text-center">Not enough data</div>';
        return;
    }

    container.innerHTML = sorted.map((s, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--surface-hover);">
            <div style="display:flex; align-items:center; gap:0.75rem;">
                <div style="font-weight:700; color:var(--text-secondary); width:20px;">#${idx+1}</div>
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:600; font-size:0.875rem;">${formatDate(s.startedAt)}</span>
                    <span class="text-secondary" style="font-size:0.75rem;">Duration: ${formatTimeFromMs(s.durationMs)}</span>
                </div>
            </div>
            <div style="font-weight:700; color:var(--brand-primary); font-size:1.125rem;">
                ${s.endCount}
            </div>
        </div>
    `).join('');
}
