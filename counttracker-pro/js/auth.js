

const CURRENT_USER_KEY = 'countTracker_currentUser';

/**
 * Get the currently logged in user
 */
async function getActiveUser() {
    const userId = localStorage.getItem(CURRENT_USER_KEY);
    if (!userId) return null;
    return await db.users.get(userId);
}

/**
 * Register a new user
 */
async function register(username, password) {
    username = username.trim();
    if (!username || !password) throw new Error('Username and password are required.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');

    // Check if user exists
    const existing = await db.users.getByUsername(username);
    if (existing) throw new Error('This username is already taken.');

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    
    const newUser = {
        id: generateUUID(),
        username,
        passwordHash,
        createdAt: now,
        updatedAt: now,
        settings: {
            theme: 'dark' // default
        },
        activeSessionId: null
    };

    await db.users.add(newUser);
    return newUser;
}

/**
 * Log in an existing user
 */
async function login(username, password) {
    username = username.trim();
    const user = await db.users.getByUsername(username);
    if (!user) throw new Error('Invalid username or password.');

    const providedHash = await hashPassword(password);
    if (user.passwordHash !== providedHash) {
        throw new Error('Invalid username or password.');
    }

    localStorage.setItem(CURRENT_USER_KEY, user.id);
    return user;
}

/**
 * Log out
 */
function logout() {
    localStorage.removeItem(CURRENT_USER_KEY);
    window.location.href = '../index.html';
}

/**
 * Check authentication before rendering page.
 * Redirects to login if not authenticated.
 */
async function requireAuth() {
    const user = await getActiveUser();
    if (!user) {
        window.location.href = './login.html';
        return null;
    }
    
    // Apply theme
    applyTheme(user.settings.theme);
    return user;
}

/**
 * Utility to apply theme based on settings
 */
function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}
