/* ── Chart instance refs for range-tab re-rendering ── */
let monthlyChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initApp('analytics');
    if (!currentUser) return;
    await loadAnalytics();
});

async function loadAnalytics() {
    try {
        const userId        = currentUser.id;
        const allSessions   = await db.sessions.getByUser(userId);
        const allDailyStats = await db.dailyStats.getByUser(userId);

        // 1. Streak
        let streak = 0, d = new Date();
        const todayStat = allDailyStats.find(s => s.date === getLocalDateString(d));
        if (todayStat && todayStat.totalCount > 0) { streak++; d.setDate(d.getDate() - 1); }
        while (true) {
            const s = allDailyStats.find(x => x.date === getLocalDateString(d));
            if (s && s.totalCount > 0) { streak++; d.setDate(d.getDate() - 1); } else break;
        }
        document.getElementById('stat-streak').textContent = `${streak} Days`;

        // 2. Monthly / weekly totals
        let monthlyTotal = 0, last7Total = 0;
        const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
        const sevenAgo  = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7);
        allDailyStats.forEach(s => {
            const dt = new Date(s.date);
            if (dt >= thirtyAgo) monthlyTotal += s.totalCount;
            if (dt >= sevenAgo)  last7Total   += s.totalCount;
        });
        document.getElementById('stat-monthly-total').textContent = monthlyTotal.toLocaleString();
        document.getElementById('stat-weekly-avg').textContent    = Math.round(last7Total / 7) + '/day';

        // 3. Best day
        let best = 0;
        allDailyStats.forEach(s => { if (s.totalCount > best) best = s.totalCount; });
        document.getElementById('stat-best-day').textContent = best.toLocaleString();

        // 4. Avg session length
        let totalMs = 0, done = 0;
        allSessions.forEach(s => {
            if (s.status === 'completed' && s.durationMs > 0) { totalMs += s.durationMs; done++; }
        });
        document.getElementById('stat-avg-duration').textContent = formatTimeFromMs(done > 0 ? totalMs / done : 0);

        // 5. NEW: Peak Hour stat
        const hourCounts = new Array(24).fill(0);
        allSessions.filter(s => s.status === 'completed').forEach(s => {
            const h = new Date(s.startedAt).getHours();
            hourCounts[h] += s.endCount || 0;
        });
        const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
        const peakEl   = document.getElementById('stat-peak-hour');
        if (Math.max(...hourCounts) > 0) {
            const suffix = peakHour < 12 ? 'AM' : 'PM';
            const h12    = peakHour % 12 || 12;
            peakEl.textContent = `${h12} ${suffix}`;
        } else {
            peakEl.textContent = '—';
        }

        // Render charts
        renderMonthlyChart(allDailyStats, 30);
        renderDurationChart(allSessions);
        renderWeekdayChart(allDailyStats);
        renderTopSessions(allSessions);

        // Wire up date-range tabs
        document.querySelectorAll('.anx-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.anx-tab').forEach(b => b.classList.remove('anx-tab--active'));
                btn.classList.add('anx-tab--active');
                renderMonthlyChart(allDailyStats, Number(btn.dataset.days));
            });
        });

    } catch (err) { console.error('Analytics error', err); }
}

/* ── Line Chart (with range support) ───────────────── */
function renderMonthlyChart(allDailyStats, days) {
    const canvas = document.getElementById('monthlyChart');
    if (monthlyChartInstance) { monthlyChartInstance.destroy(); monthlyChartInstance = null; }

    const labels = [], data = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        // On 90D, shorten label
        const label = days <= 30
            ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        labels.push(label);
        const s = allDailyStats.find(x => x.date === getLocalDateString(d));
        data.push(s ? s.totalCount : 0);
    }

    const color = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#3b82f6';
    monthlyChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: color, backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 2, fill: true, tension: 0.35, pointRadius: days > 30 ? 0 : 2, pointHoverRadius: 5 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false }, ticks: { maxTicksLimit: days <= 7 ? 7 : days <= 30 ? 8 : 10 } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

/* ── Pie Chart ─────────────────────────────────────── */
function renderDurationChart(allSessions) {
    const body   = document.getElementById('durationChart').parentElement;
    const canvas = document.getElementById('durationChart');
    let short = 0, med = 0, long = 0;
    allSessions.forEach(s => {
        if (s.status !== 'completed') return;
        const m = s.durationMs / 60000;
        if (m < 5) short++; else if (m < 30) med++; else long++;
    });
    if ((short + med + long) === 0) {
        body.innerHTML = '<div class="anx-empty">Complete a session to see breakdown</div>';
        return;
    }
    new Chart(canvas.getContext('2d'), {
        type: 'pie',
        data: {
            labels: ['< 5 mins', '5–30 mins', '> 30 mins'],
            datasets: [{ data: [short, med, long], backgroundColor: ['#3b82f6','#8b5cf6','#10b981'], borderWidth: 0 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} sessions` } }
            }
        }
    });
}

/* ── NEW: Day of Week Bar Chart ─────────────────────── */
function renderWeekdayChart(allDailyStats) {
    const body   = document.getElementById('weekdayChart').parentElement;
    const canvas = document.getElementById('weekdayChart');
    const days   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const totals = new Array(7).fill(0);

    allDailyStats.forEach(s => {
        const day = new Date(s.date).getDay(); // 0=Sun … 6=Sat
        totals[day] += s.totalCount;
    });

    if (totals.every(v => v === 0)) {
        body.innerHTML = '<div class="anx-empty">Log sessions to see active days</div>';
        return;
    }

    const maxIdx = totals.indexOf(Math.max(...totals));
    const colors = totals.map((_, i) => i === maxIdx ? '#06b6d4' : 'rgba(6,182,212,0.35)');

    new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{ data: totals, backgroundColor: colors, borderRadius: 4, borderSkipped: false }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw} total count` } } }
        }
    });
}

/* ── Top Sessions ──────────────────────────────────── */
function renderTopSessions(allSessions) {
    const container = document.getElementById('top-sessions-list');
    const sorted    = [...allSessions].sort((a, b) => b.endCount - a.endCount).slice(0, 5);
    if (sorted.length === 0 || sorted[0].endCount === 0) {
        container.innerHTML = '<div class="anx-empty">No session data yet</div>';
        return;
    }
    container.innerHTML = sorted.map((s, i) => `
        <div class="anx-ts-row">
            <div class="anx-ts-left">
                <span class="anx-ts-rank">#${i + 1}</span>
                <div class="anx-ts-info">
                    <span class="anx-ts-date">${formatDate(s.startedAt)}</span>
                    <span class="anx-ts-meta">Duration: ${formatTimeFromMs(s.durationMs)}</span>
                </div>
            </div>
            <span class="anx-ts-count">${s.endCount}</span>
        </div>`).join('');
}