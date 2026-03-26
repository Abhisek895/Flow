
let activeSession = null;
let timerInterval = null;
let lastActivityTime = 0; // ms
let recentEvents = [];
let baseMilestones = [10, 25, 50, 100, 250, 500, 1000];
let activeMilestones = [];
let userStats = { average: 0, highest: 0, totalSessions: 0 };
let reachedMilestones = new Set();
let hasShownAverageWarning = false;
let hasShownHighWarning = false;

document.addEventListener('DOMContentLoaded', async () => {
    await initApp('counter');
    if (!currentUser) return;

    await loadOrCreateSession();
    startTimer();
    renderUI();

    document.getElementById('btn-increment').addEventListener('click', handleIncrement);
    document.getElementById('btn-reset').addEventListener('click', handleReset);

    // Listen for keyboard space/enter to increment
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            handleIncrement();
        }
    });
});

async function loadOrCreateSession() {
    if (currentUser.activeSessionId) {
        activeSession = await db.sessions.get(currentUser.activeSessionId);
    }

    // Calculate User Stats for Gamification (Psychological Hooks)
    const allSessions = await db.sessions.getByUser(currentUser.id);
    const completedSessions = allSessions.filter(s => s.status === 'completed' && s.totalIncrements > 0);

    if (completedSessions.length > 0) {
        userStats.totalSessions = completedSessions.length;
        userStats.highest = Math.max(...completedSessions.map(s => s.totalIncrements));
        const sum = completedSessions.reduce((acc, s) => acc + s.totalIncrements, 0);
        userStats.average = Math.floor(sum / completedSessions.length);
    } else {
        userStats.average = 20; // Default goal for new users
        userStats.highest = 50;
    }

    // Build active milestones based on average and highest
    activeMilestones = [...baseMilestones];
    if (userStats.average > 5 && !activeMilestones.includes(userStats.average)) {
        activeMilestones.push(userStats.average);
    }
    if (userStats.highest > 10 && !activeMilestones.includes(userStats.highest)) {
        activeMilestones.push(userStats.highest);
    }
    activeMilestones.sort((a, b) => a - b);

    if (!activeSession) {
        await createNewSession();
    } else {
        // Load recent events for active session
        const allEvents = await db.sessionEvents.getBySession(activeSession.id);
        recentEvents = allEvents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

        // Load milestone cache
        const milestonesDb = await db.milestones.getBySession(currentUser.id, activeSession.id);
        milestonesDb.forEach(m => reachedMilestones.add(m.count));
    }

    renderMilestoneChips();
}

function renderMilestoneChips() {
    const chipsWrapper = document.getElementById('milestone-chips');
    if (!chipsWrapper) return;

    chipsWrapper.innerHTML = activeMilestones.map(m => {
        let specialClass = '';
        let icon = '';
        if (m === userStats.average && userStats.totalSessions > 0) {
            specialClass = 'special-avg';
            icon = '🎯 Avg: ';
        } else if (m === userStats.highest && userStats.totalSessions > 0) {
            specialClass = 'special-record';
            icon = '👑 Record: ';
        }
        return `<div class="chip ${specialClass}" data-val="${m}">${icon}${m}</div>`;
    }).join('');
}

async function createNewSession() {
    const nowStr = new Date().toISOString();
    activeSession = {
        id: generateUUID(),
        userId: currentUser.id,
        startedAt: nowStr,
        endedAt: null,
        startCount: 0,
        endCount: 0,
        totalIncrements: 0,
        resetAt: null,
        durationMs: 0,
        status: 'active'
    };

    await db.sessions.add(activeSession);

    currentUser.activeSessionId = activeSession.id;
    await db.users.update(currentUser.id, { activeSessionId: activeSession.id });

    recentEvents = [];
    reachedMilestones = new Set();
    hasShownAverageWarning = false;
    hasShownHighWarning = false;
}

async function handleIncrement() {
    if (!activeSession) return;

    const now = new Date();
    const nowStr = now.toISOString();
    activeSession.endCount += 1;
    activeSession.totalIncrements += 1;
    lastActivityTime = now.getTime();

    // Save Event
    const event = {
        id: generateUUID(),
        userId: currentUser.id,
        sessionId: activeSession.id,
        type: 'increment',
        countAfterEvent: activeSession.endCount,
        createdAt: nowStr
    };

    // Parallel async operations for performance
    const promises = [
        db.sessions.put(activeSession),
        db.sessionEvents.add(event),
        updateDailyStats(1, 0, 0)
    ];

    // Psychological hooks / Addictive gamification
    const count = activeSession.endCount;

    if (userStats.totalSessions > 0) {
        if (!hasShownAverageWarning && userStats.average > 15 && count === Math.floor(userStats.average * 0.8)) {
            showToast(`🔥 Almost there! Only ${userStats.average - count} more to beat your average score!`, 'info');
            hasShownAverageWarning = true;
        }

        if (!hasShownHighWarning && userStats.highest > 30 && count === Math.floor(userStats.highest * 0.95)) {
            showToast(`🏆 INCREDIBLE! You are right behind your All-Time High! Don't stop now!`, 'info');
            hasShownHighWarning = true;
        }
    }

    // Check milestones
    if (activeMilestones.includes(count) && !reachedMilestones.has(count)) {
        reachedMilestones.add(count);
        promises.push(db.milestones.add({
            id: `${currentUser.id}_${activeSession.id}_${count}`,
            userId: currentUser.id,
            sessionId: activeSession.id,
            count: count,
            reachedAt: nowStr,
            timeFromSessionStartMs: activeSession.durationMs
        }));

        // Custom Milestone Messages
        if (count === userStats.average && userStats.totalSessions > 0) {
            showToast(`🎯 TARGET BEATEN! You passed your average of ${count}! Brilliant!`, 'success');
        } else if (count === userStats.highest && userStats.totalSessions > 0) {
            showToast(`👑 NEW ALL-TIME HIGH!!! ${count} counts! You are unstoppable! 🔥`, 'success');
            triggerConfetti(); // Huge visual celebration
        } else {
            showToast(`Milestone Reached: ${count} 🎉 Excellent pacing!`, 'success');
        }

        updateMilestoneUIItem(count, activeSession.durationMs);
    }

    await Promise.all(promises);

    // Update local state for UI
    recentEvents.unshift(event);
    if (recentEvents.length > 5) recentEvents.pop();

    // animateCounter() - disabled for static feel
    renderUI();
}

async function handleReset() {
    if (!activeSession) return;

    showModal('Reset Counter', 'Are you sure you want to end this session and reset the counter to 0? This will save the current session to history.', 'Reset', async () => {
        const nowStr = new Date().toISOString();

        // Close current session
        activeSession.endedAt = nowStr;
        activeSession.resetAt = nowStr;
        activeSession.status = 'completed';
        // durationMs is already being updated in real-time by the timer

        const resetEvent = {
            id: generateUUID(),
            userId: currentUser.id,
            sessionId: activeSession.id,
            type: 'reset',
            countAfterEvent: 0,
            createdAt: nowStr
        };

        await Promise.all([
            db.sessions.put(activeSession),
            db.sessionEvents.add(resetEvent),
            updateDailyStats(0, 1, 1) // +1 session, +1 reset
        ]);

        showToast('Counter reset. Session saved.', 'success');

        // Create new session
        await createNewSession();
        renderUI();

        return true;
    });
}

async function updateDailyStats(countInc, sessionInc, resetInc) {
    const todayStr = getLocalDateString();
    const statId = `${currentUser.id}_${todayStr}`;
    let stat = await db.dailyStats.get(statId);

    if (!stat) {
        stat = {
            id: statId,
            userId: currentUser.id,
            date: todayStr,
            totalCount: 0,
            sessionsCount: 0,
            resetsCount: 0,
            totalDurationMs: 0
        };
    }

    stat.totalCount += countInc;
    stat.sessionsCount += sessionInc;
    stat.resetsCount += resetInc;

    await db.dailyStats.put(stat);
}

function renderUI() {
    if (!activeSession) return;

    // Display
    document.getElementById('counter-display').textContent = activeSession.endCount;

    // Milestones
    const chipsWrapper = document.getElementById('milestone-chips');
    const chips = chipsWrapper.querySelectorAll('.chip');
    chips.forEach(chip => {
        const val = parseInt(chip.getAttribute('data-val'));
        if (reachedMilestones.has(val)) {
            chip.classList.add('reached');
        } else {
            chip.classList.remove('reached');
        }
    });

    // Activity
    const activityWrapper = document.getElementById('mini-activity-list');
    if (recentEvents.length === 0) {
        activityWrapper.innerHTML = '<div class="text-center text-secondary">Start counting to see activity</div>';
    } else {
        activityWrapper.innerHTML = recentEvents.map(ev => `
            <div class="activity-item">
                <span><i class="ph ph-plus-circle text-primary"></i> Counted up</span>
                <span class="text-secondary">${new Date(ev.createdAt).toLocaleTimeString()}</span>
            </div>
        `).join('');
    }
}

function updateMilestoneUIItem(count, durationMs) {
    document.getElementById('latest-milestone-time').textContent = `Reached ${count} in ${formatTimeFromMs(durationMs)}`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    let lastTick = Date.now();
    
    const updateTimer = () => {
        if (!activeSession) return;
        
        const now = Date.now();
        const delta = now - lastTick;
        lastTick = now;

        // "Active" threshold: user clicked in the last 2 seconds
        const isActive = (now - lastActivityTime) < 2000;
        
        if (isActive && lastActivityTime > 0) {
            activeSession.durationMs += delta;
            // Periodically save duration to DB (every 5 seconds roughly)
            if (activeSession.endCount % 5 === 0) {
               db.sessions.put(activeSession);
            }
        }

        const ms = activeSession.durationMs;
        let seconds = Math.floor((ms / 1000) % 60);
        let minutes = Math.floor((ms / (1000 * 60)) % 60);
        let hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

        hours = (hours < 10) ? "0" + hours : hours;
        minutes = (minutes < 10) ? "0" + minutes : minutes;
        seconds = (seconds < 10) ? "0" + seconds : seconds;

        const timerEl = document.getElementById('session-timer');
        if (timerEl) {
            timerEl.innerHTML = `<i class="ph ph-timer"></i> ${hours}h ${minutes}m ${seconds}s`;
        }
    };
    
    updateTimer();
    timerInterval = setInterval(updateTimer, 100); // 100ms for smoother tracking
}

function animateCounter() {
    const el = document.getElementById('counter-display');
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 100);
}

// Gamification: Giant Confetti Celebration
function triggerConfetti() {
    if (typeof confetti !== 'function') return;

    var duration = 3 * 1000;
    var animationEnd = Date.now() + duration;
    var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    var interval = setInterval(function () {
        var timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
            return clearInterval(interval);
        }

        var particleCount = 50 * (timeLeft / duration);
        // Fire from both bottom corners upwards
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);
}
