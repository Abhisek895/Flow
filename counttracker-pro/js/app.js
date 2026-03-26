// Global app state
let currentUser = null;
window.currentUser = null;

async function initApp(pageId) {
    currentUser = await requireAuth();
    if (!currentUser) return; // Will redirect

    renderLayout(pageId);
    setupInteractions();

    // Initialize notification checks if enabled
    if (currentUser.settings && currentUser.settings.notifications) {
        setupNotificationChecks();
    }
}

function renderLayout(activePage) {
    const layoutContainer = document.getElementById('app-layout');
    if (!layoutContainer) return;

    const navItems = [
        { id: 'dashboard', icon: 'ph-squares-four', label: 'Dashboard', url: 'dashboard.html' },
        { id: 'counter', icon: 'ph-plus-circle', label: 'Counter', url: 'counter.html' },
        { id: 'history', icon: 'ph-clock-counter-clockwise', label: 'History', url: 'history.html' },
        { id: 'analytics', icon: 'ph-chart-bar', label: 'Analytics', url: 'analytics.html' },
        { id: 'manual-adjustment', icon: 'ph-calculator', label: 'Adjust Count', url: 'manual-adjustment.html' },
        { id: 'profile', icon: 'ph-user', label: 'Profile', url: 'profile.html' }
    ];

    const generateNavHtml = (items, isBottomNav = false) => {
        return items.map(item => `
            <a href="${item.url}" class="${isBottomNav ? 'bottom-nav-item' : 'nav-item'} ${item.id === activePage ? 'active' : ''}">
                <i class="ph ${item.icon}"></i>
                <span>${item.label}</span>
            </a>
        `).join('');
    };

    const username = currentUser.username;
    const avatar = generateAvatar(username);

    layoutContainer.innerHTML = `
        <div class="app-container">
            <!-- Sidebar (Desktop) -->
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-header">
                    <div class="sidebar-logo-icon">
                        <i class="ph ph-chart-line-up" style="font-size: 1.75rem;"></i>
                    </div>
                    <div class="sidebar-brand">CountTracker</div>
                </div>
                <nav class="sidebar-nav">
                    ${generateNavHtml(navItems)}
                </nav>
                <div class="sidebar-footer">
                    <div class="user-profile-sm">
                        <div class="avatar">${avatar}</div>
                        <div class="user-info">
                            <span class="user-name">${username}</span>
                            <span class="user-role">Free Plan</span>
                        </div>
                        <button class="btn-icon" id="logout-btn" title="Logout" style="background:none; border:none; color:var(--text-secondary); cursor:pointer;">
                            <i class="ph ph-sign-out"></i>
                        </button>
                    </div>
                </div>
            </aside>

            <!-- Bottom Nav (Mobile) -->
            <nav class="bottom-nav">
                ${generateNavHtml(navItems.slice(0, 4), true)} <!-- Excluding config for space, let's keep profile or add it to a menu -->
                <a href="profile.html" class="bottom-nav-item ${activePage === 'profile' ? 'active' : ''}">
                    <i class="ph ph-user"></i>
                    <span>Profile</span>
                </a>
            </nav>

            <!-- Main Content Area -->
            <main class="main-content">
                <header class="top-header">
                    <h2 class="header-title" id="page-title">${navItems.find(n => n.id === activePage)?.label || 'CountTracker'}</h2>
                    <button class="menu-toggle" id="menu-toggle">
                        <i class="ph ph-list"></i>
                    </button>
                    <div class="header-actions" style="display:flex; gap:1rem; align-items:center;">
                        <button class="btn-icon" id="theme-toggle-header" title="Toggle Theme" style="background:none; border:none; color:var(--text-primary); cursor:pointer; font-size: 1.25rem;">
                            <i class="ph ${currentUser.settings.theme === 'dark' ? 'ph-sun' : 'ph-moon'}"></i>
                        </button>
                    </div>
                </header>
                <div class="page-container" id="page-content">
                    <!-- Page content injected here or already present -->
                </div>
            </main>
        </div>
    `;

    // Move any existing content inside layout to page-content
    const tempContent = document.getElementById('temp-content');
    if (tempContent) {
        document.getElementById('page-content').appendChild(tempContent);
        tempContent.id = ''; // remove ID
        tempContent.style.display = 'block';
    }
}

function setupInteractions() {
    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            logout();
        });
    }

    // Mobile Menu Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    }

    // Theme toggle via UI
    const themeToggleBtn = document.getElementById('theme-toggle-header');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', async () => {
            const isDark = document.documentElement.classList.contains('dark');
            const newTheme = isDark ? 'light' : 'dark';

            // Apply visually
            if (newTheme === 'dark') {
                document.documentElement.classList.add('dark');
                themeToggleBtn.innerHTML = '<i class="ph ph-sun"></i>';
            } else {
                document.documentElement.classList.remove('dark');
                themeToggleBtn.innerHTML = '<i class="ph ph-moon"></i>';
            }

            // Save to DB
            window.db.users.update(currentUser.id, { settings: { ...currentUser.settings, theme: newTheme } });
            currentUser.settings.theme = newTheme;
        });
    }
}

// -------------------------------------------------------------
// Daily Devotional Notifications
// -------------------------------------------------------------
const DEVOTIONAL_QUOTES = [
    "In the silence of devotion, the soul hears what the world can never speak.",
    "Radha is the longing of the soul; Krishna is the fulfillment of that longing.",
    "True devotion begins where ego ends.",
    "The heart that remembers Krishna is never truly empty.",
    "Radha’s love was not of this world; it was the soul dissolving into the Divine.",
    "To love Krishna is to let every breath become prayer.",
    "In bhakti, tears are not weakness; they are proof that the soul has awakened.",
    "Krishna does not always remove the storm, but He gives the heart strength to cross it.",
    "The one who surrenders to the Divine loses fear and finds peace.",
    "Radha teaches that the highest love is the one that asks for nothing, yet gives everything.",
    "When the mind bows before God, the soul rises beyond sorrow.",
    "Devotion is not escape from life; it is the purest way of living it.",
    "The name of Krishna can calm wounds that no human words can heal.",
    "Separation from the Divine is the pain; remembrance of the Divine is the cure.",
    "Radha-Krishna are not only love stories to be admired, but truths to be lived within the heart.",
    "A temple may be built of stone, but true worship is built in the inner being.",
    "When love becomes prayer, and prayer becomes breath, bhakti is born.",
    "Krishna belongs not to the proud mind, but to the surrendered heart.",
    "The soul finds rest only where Divine love is remembered.",
    "Radha’s devotion shows that love reaches its purest form when it becomes worship.",
    "The deepest hunger of the soul is not for the world, but for union with the Divine.",
    "Krishna’s flute is the call that reminds the soul of its forgotten home.",
    "Radha did not merely love Krishna; she lived in Him, breathed in Him, and vanished into Him.",
    "To remember God in joy is beautiful; to remember Him in pain is sacred.",
    "Devotion is the fire that burns desire and leaves only purity behind.",
    "The closer the heart moves toward Krishna, the less the world is able to shake it.",
    "Bhakti is not spoken loudly; it grows silently, like light before dawn.",
    "In Divine love, even longing becomes holy.",
    "The soul that chants with sincerity carries a peace the world cannot steal.",
    "Radha-Krishna teach that the holiest love is the one that transforms the self.",
    "The soul bows where the heart finds Krishna.",
    "Radha is love; Krishna is the eternal beloved.",
    "Bhakti is the soul remembering its source.",
    "Where surrender begins, grace enters.",
    "Krishna’s name is shelter for the restless heart.",
    "Love becomes holy when it seeks the Divine.",
    "The purest tears are shed in remembrance of God.",
    "In Radha, love became worship.",
    "In Krishna, worship became bliss.",
    "The path of devotion is the path back home."
];

const NOTIFY_TIMES = [
    { h: 6, m: 0 },   // Morning 6:00 AM
    { h: 13, m: 0 },  // Afternoon 1:00 PM
    { h: 17, m: 30 }, // Evening 5:30 PM
    { h: 20, m: 0 }   // Night 8:00 PM
];

let notificationInterval = null;

function setupNotificationChecks() {
    if (!("Notification" in window)) return;

    // Request permission if not already granted but settings say enabled
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    // Check every minute
    if (notificationInterval) clearInterval(notificationInterval);
    notificationInterval = setInterval(checkAndSendNotification, 60000);
    // Also check immediately
    checkAndSendNotification();
}

function stopNotificationChecks() {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
    }
}

function checkAndSendNotification() {
    if (Notification.permission !== "granted") return;
    if (!currentUser || !currentUser.settings || !currentUser.settings.notifications) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const isNotifyTime = NOTIFY_TIMES.some(t => t.h === currentHour && t.m === currentMinute);

    if (isNotifyTime) {
        const timeStamp = `${currentHour}:${currentMinute}`;
        const lastNotifiedTime = localStorage.getItem('lastNotifiedTime');

        if (lastNotifiedTime !== timeStamp) {
            // Pick a random quote
            const randomQuote = DEVOTIONAL_QUOTES[Math.floor(Math.random() * DEVOTIONAL_QUOTES.length)];

            new Notification("Devotional Reminder ✨", {
                body: randomQuote,
                icon: 'https://cdn-icons-png.flaticon.com/512/3592/3592868.png',
                badge: 'https://cdn-icons-png.flaticon.com/512/3592/3592868.png',
                image: 'https://images.unsplash.com/photo-1604105828469-d65e2b0c39f0?auto=format&fit=crop&w=800&q=80',
                requireInteraction: true
            });

            // Play Peacock Sound
            try {
                const peacockAudio = new Audio('https://upload.wikimedia.org/wikipedia/commons/4/44/Peacock.ogg');
                peacockAudio.volume = 1.0;
                peacockAudio.play().catch(e => console.warn('Browser blocked auto-play of peacock audio:', e));
            } catch (e) { }

            localStorage.setItem('lastNotifiedTime', timeStamp);
        }
    }
}
