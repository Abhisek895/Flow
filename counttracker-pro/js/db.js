/**
 * db.js - LocalStorage "Data Structure" wrapper for CountTracker Pro
 * Replaces IndexedDB to act as an in-memory/localStorage mock database.
 */

// Helper functions for reading/writing arrays from localStorage
function getStore(storeName) {
    const data = localStorage.getItem('ct_' + storeName);
    return data ? JSON.parse(data) : [];
}

function setStore(storeName, dataArray) {
    localStorage.setItem('ct_' + storeName, JSON.stringify(dataArray));
}

const db = {
    users: {
        async add(user) {
            const store = getStore('users');
            store.push(user);
            setStore('users', store);
            return user;
        },
        async put(user) {
            const store = getStore('users');
            const idx = store.findIndex(u => u.id === user.id);
            if (idx >= 0) store[idx] = user;
            else store.push(user);
            setStore('users', store);
            return user;
        },
        async get(id) {
            const store = getStore('users');
            return store.find(u => u.id === id);
        },
        async getByUsername(username) {
            const store = getStore('users');
            return store.find(u => u.username === username);
        },
        async getByEmail(email) {
            const store = getStore('users');
            return store.find(u => u.email === email);
        },
        async update(id, updates) {
            const store = getStore('users');
            const idx = store.findIndex(u => u.id === id);
            if (idx < 0) throw new Error('User not found');
            const updatedUser = { ...store[idx], ...updates, updatedAt: new Date().toISOString() };
            store[idx] = updatedUser;
            setStore('users', store);
            return updatedUser;
        },
        async delete(id) {
            const store = getStore('users');
            const filtered = store.filter(u => u.id !== id);
            setStore('users', filtered);
        }
    },

    sessions: {
        async add(session) {
            const store = getStore('sessions');
            store.push(session);
            setStore('sessions', store);
            return session;
        },
        async put(session) {
            const store = getStore('sessions');
            const idx = store.findIndex(s => s.id === session.id);
            if (idx >= 0) store[idx] = session;
            else store.push(session);
            setStore('sessions', store);
            return session;
        },
        async get(id) {
            const store = getStore('sessions');
            return store.find(s => s.id === id);
        },
        async getByUser(userId) {
            const store = getStore('sessions');
            return store.filter(s => s.userId === userId);
        },
        async update(id, updates) {
            const store = getStore('sessions');
            const idx = store.findIndex(s => s.id === id);
            if (idx < 0) throw new Error('Session not found');
            const updatedSession = { ...store[idx], ...updates };
            store[idx] = updatedSession;
            setStore('sessions', store);
            return updatedSession;
        }
    },

    sessionEvents: {
        async add(event) {
            const store = getStore('sessionEvents');
            store.push(event);
            setStore('sessionEvents', store);
            return event;
        },
        async getBySession(sessionId) {
            const store = getStore('sessionEvents');
            return store.filter(e => e.sessionId === sessionId);
        }
    },

    dailyStats: {
        async get(id) {
            const store = getStore('dailyStats');
            return store.find(s => s.id === id);
        },
        async put(stat) {
            const store = getStore('dailyStats');
            const idx = store.findIndex(s => s.id === stat.id);
            if (idx >= 0) store[idx] = stat;
            else store.push(stat);
            setStore('dailyStats', store);
            return stat;
        },
        async getByUser(userId) {
            const store = getStore('dailyStats');
            return store.filter(s => s.userId === userId);
        }
    },

    milestones: {
        async add(milestone) {
            const store = getStore('milestoneCache');
            store.push(milestone);
            setStore('milestoneCache', store);
            return milestone;
        },
        async getBySession(userId, sessionId) {
            const store = getStore('milestoneCache');
            return store.filter(m => m.userId === userId && m.sessionId === sessionId);
        }
    },

    async clearUserData(userId) {
        ['sessions', 'sessionEvents', 'dailyStats', 'milestoneCache'].forEach(storeName => {
            const store = getStore(storeName);
            // Delete anything tied to this user
            const filtered = store.filter(item => item.userId !== userId);
            setStore(storeName, filtered);
        });
    }
};

window.db = db;
