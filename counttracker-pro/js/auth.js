

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
async function register(username, email, password) {
    username = username.trim();
    email = email.trim().toLowerCase();
    if (!username || !email || !password) throw new Error('Username, email, and password are required.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');

    // Check if user exists
    const existingUsername = await db.users.getByUsername(username);
    if (existingUsername) throw new Error('This username is already taken.');

    const existingEmail = await db.users.getByEmail(email);
    if (existingEmail) throw new Error('This email is already registered.');

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    
    const newUser = {
        id: generateUUID(),
        username,
        email,
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

// SMTP OTP Functions
const API_BASE = 'http://localhost:3000/api';

async function sendOTP(email, type = 'register') {
    const response = await fetch(`${API_BASE}/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || 'Failed to send OTP.');
    return data;
}

async function verifyOTP(email, otp) {
    const response = await fetch(`${API_BASE}/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || 'Invalid OTP.');
    return data;
}

async function resetPassword(email, newPassword) {
    const user = await db.users.getByEmail(email);
    if (!user) throw new Error('User not found.');

    const passwordHash = await hashPassword(newPassword);
    await db.users.update(user.id, { passwordHash });
    return true;
}
