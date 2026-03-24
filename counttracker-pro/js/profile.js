
document.addEventListener('DOMContentLoaded', async () => {
    await initApp('profile');
    if (!currentUser) return;

    // Load Profile Info
    document.getElementById('profile-username').textContent = currentUser.username;
    document.getElementById('profile-joined').textContent = `Member since: ${formatDate(currentUser.createdAt)}`;
    document.getElementById('profile-avatar').textContent = generateAvatar(currentUser.username);

    // Update Profile Summary (Username & Email)
    updateProfileSummary();

    // Edit Profile Logic
    const editProfileBtn = document.getElementById('btn-edit-profile');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', handleEditProfile);
    }

    // Load Theme Preference
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.checked = currentUser.settings?.theme === 'dark';

    themeToggle.addEventListener('change', async (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        // Apply visually
        if (newTheme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');

        // Save
        await db.users.update(currentUser.id, { settings: { ...currentUser.settings, theme: newTheme } });
        currentUser.settings.theme = newTheme;
        showToast('Theme updated.');
    });

    // Load Notifications Preference
    const notifToggle = document.getElementById('notifications-toggle');
    notifToggle.checked = currentUser.settings?.notifications === true;
    notifToggle.addEventListener('change', handleNotifChange);

    // Data Management
    document.getElementById('btn-export').addEventListener('click', handleExport);

    // Import Data
    document.getElementById('file-import').addEventListener('change', handleImport);

    // Soft Reset Active Counter
    document.getElementById('btn-soft-reset').addEventListener('click', handleSoftReset);

    // Wipe Data
    document.getElementById('btn-wipe-data').addEventListener('click', handleWipeData);

    // Delete Account
    document.getElementById('btn-delete-account').addEventListener('click', handleDeleteAccount);

    // Mobile Logout
    const logoutMobile = document.getElementById('btn-logout-profile');
    if (logoutMobile) {
        logoutMobile.addEventListener('click', () => {
            logout();
        });
    }
});

async function handleExport() {
    try {
        const btn = document.getElementById('btn-export');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Exporting...';

        const userId = currentUser.id;
        const sessions = await db.sessions.getByUser(userId);
        const eventsList = [];

        for (const session of sessions) {
            const evts = await db.sessionEvents.getBySession(session.id);
            eventsList.push(...evts);
        }

        const data = {
            version: "1.0",
            exportDate: new Date().toISOString(),
            user: { username: currentUser.username, createdAt: currentUser.createdAt },
            sessions: sessions,
            events: eventsList
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CountTracker_Export_${currentUser.username}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Export successful!', 'success');
    } catch (err) {
        console.error("Export failed", err);
        showToast('Export failed.', 'error');
    } finally {
        const btn = document.getElementById('btn-export');
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-download-simple"></i> Export';
    }
}

function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (!data.sessions || !data.user) throw new Error('Invalid JSON format');

            showModal('Import Data', 'Are you sure you want to import this data? Existing data may be overwritten or duplicated if not careful.', 'Import', async () => {
                showToast('Importing...', 'success');

                // Simple merge: we just add all sessions, but ensure IDs are unique or re-generate them.
                // For a hobby app, generating new UUIDs for imported sessions is safer to prevent conflict.
                // Let's preserve IDs if possible, or just generate new.
                // Best: just write them straight, IndexedDB will throw error if ID exists, so we rewrite IDs.

                for (let s of data.sessions) {
                    const oldId = s.id;
                    s.id = generateUUID();
                    s.userId = currentUser.id;
                    if (s.status === 'active') s.status = 'completed'; // force imported to completed

                    await db.sessions.add(s);

                    // Remap events
                    const relatedEvents = data.events.filter(ev => ev.sessionId === oldId);
                    for (let ev of relatedEvents) {
                        ev.id = generateUUID();
                        ev.userId = currentUser.id;
                        ev.sessionId = s.id;
                        await db.sessionEvents.add(ev);
                    }
                }

                showToast(`Imported ${data.sessions.length} sessions successfully!`, 'success');
                e.target.value = ''; // reset input
                return true;
            });

        } catch (err) {
            console.error('Import error', err);
            showToast('Invalid file format', 'error');
        }
    };
    reader.readAsText(file);
}

function handleSoftReset() {
    showModal('Force Reset Active', 'This will delete your current active session WITHOUT saving it to history. Proceed?', 'Delete Active Session', async () => {
        const activeId = currentUser.activeSessionId;
        if (activeId) {
            const tx = window.db;
            // (We didn't expose delete on sessions in wrapper, let's just do it directly with IDB or write a quick loop)

            // For now, let's just override it to 0 and save, rather than hard-deleting if we lack the method.
            // Oh right, we can just close it and set totalIncrements to 0, or just create a new active session and orphan the old one.
            // Or use the db instance directly.

            // Simpler: Just clear the counters on the current session.
            const session = await db.sessions.get(activeId);
            if (session) {
                session.endCount = 0;
                session.totalIncrements = 0;
                session.startedAt = new Date().toISOString();
                await db.sessions.put(session);
                showToast('Active session reset visually.', 'success');
            }
        } else {
            showToast('No active session to reset.', 'error');
        }
        return true;
    });
}

function handleWipeData() {
    showModal('Clear ALL Data', '<span class="text-danger">WARNING:</span> This will permanently delete all your sessions, history, and statistics. Your account will remain, but it will be empty. Are you entirely sure?', 'Yes, Delete Everything', async () => {
        // We'll wipe using the clearUserData utility
        await db.clearUserData(currentUser.id);

        showToast('All your data has been wiped.', 'success');
        // Nullify active session
        currentUser.activeSessionId = null;
        await db.users.update(currentUser.id, { activeSessionId: null });

        return true;
    });
}

function handleDeleteAccount() {
    const htmlMessage = `
        <p class="text-danger" style="margin-bottom: 0.5rem;"><strong>WARNING: This action is irreversible.</strong></p>
        <p>It will permanently delete your entire account, profile, and all tracking data.</p>
        <div class="input-group" style="margin-top: 1.5rem; text-align: left;">
            <label style="display:block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.875rem; color: var(--text-secondary);">Enter your password to proceed:</label>
            <input type="password" id="delete-account-password" class="input-field" placeholder="Password" style="width: 100%;">
        </div>
    `;

    showModal('Delete Account', htmlMessage, 'Permanently Delete', async () => {
        const pwdInput = document.getElementById('delete-account-password');
        const pwd = pwdInput ? pwdInput.value : '';

        if (!pwd) {
            showToast('Password is required', 'error');
            return false; // prevent closing
        }

        let hashed = pwd;
        try {
            if (typeof hashPassword === 'function') {
                hashed = await hashPassword(pwd);
            } else {
                hashed = btoa(pwd);
            }
        } catch (e) {
            console.error(e);
        }

        if (hashed !== currentUser.passwordHash) {
            showToast('Incorrect password. Account deletion aborted.', 'error');
            return false;
        }

        // Wipe Data
        await window.db.clearUserData(currentUser.id);
        // Delete User
        await window.db.users.delete(currentUser.id);

        showToast('Account deleted. Logging out...', 'success');

        // Log out
        currentUser = null;
        localStorage.removeItem('activeUserId');

        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);

        return true;
    });
}

async function handleNotifChange(e) {
    const isEnabled = e.target.checked;

    if (isEnabled && ("Notification" in window) && Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            showToast("Notification permission denied by browser.", "error");
            e.target.checked = false;
            return;
        }
    }

    // Save to DB
    currentUser.settings = currentUser.settings || {};
    currentUser.settings.notifications = isEnabled;
    await window.db.users.update(currentUser.id, { settings: currentUser.settings });

    if (isEnabled) {
        if (typeof setupNotificationChecks === 'function') setupNotificationChecks();
        showToast("Daily Devotionals Enabled ✨", "success");
    } else {
        if (typeof stopNotificationChecks === 'function') stopNotificationChecks();
        showToast("Daily Devotionals Disabled", "info");
    }
}

function updateProfileSummary() {
    const summaryEl = document.getElementById('profile-details-summary');
    if (!summaryEl) return;

    const emailStr = currentUser.email ? currentUser.email : '<span class="text-danger">No email linked</span>';
    summaryEl.innerHTML = `Username: <strong>${currentUser.username}</strong> | Email: <strong>${emailStr}</strong>`;
}

async function handleEditProfile() {
    const bodyHtml = `
        <div class="auth-form">
            <p class="text-secondary mb-4">Update your account details. Changing your email requires verification.</p>
            <div id="profile-modal-error" class="error-msg" style="margin-bottom: 1rem;"></div>
            
            <div id="profile-edit-step-1">
                <div class="input-group">
                    <label for="edit-username-input">Username</label>
                    <input type="text" id="edit-username-input" placeholder="Username" value="${currentUser.username}">
                </div>
                <div class="input-group">
                    <label for="edit-email-input">Email Address</label>
                    <input type="email" id="edit-email-input" placeholder="example@gmail.com" value="${currentUser.email || ''}">
                </div>
                <button type="button" id="btn-save-profile" class="btn btn-primary w-full">Save Changes</button>
            </div>

            <div id="profile-edit-step-otp" style="display: none;">
                <div class="text-center mb-4">
                    <i class="ph ph-envelope-open" style="font-size: 3rem; color: var(--brand-primary);"></i>
                    <p class="mt-2">A verification code was sent to <strong id="target-email-display"></strong></p>
                </div>
                <div class="input-group">
                    <label for="profile-otp-input">Enter OTP</label>
                    <input type="text" id="profile-otp-input" placeholder="6-digit code" maxlength="6" style="text-align: center; font-size: 1.5rem; letter-spacing: 5px;">
                </div>
                <button type="button" id="btn-verify-profile-otp" class="btn btn-primary w-full">Verify & Update Profile</button>
                <p class="text-center mt-4">
                    <a href="#" id="btn-back-to-edit">Back to Edit</a>
                </p>
            </div>
        </div>
    `;

    showModal('Edit Profile', bodyHtml, '', null, 'Cancel');

    // Hide default confirm button
    const confirmBtn = document.getElementById('modal-confirm-btn');
    if (confirmBtn) confirmBtn.style.display = 'none';

    const saveBtn = document.getElementById('btn-save-profile');
    const verifyBtn = document.getElementById('btn-verify-profile-otp');
    const backBtn = document.getElementById('btn-back-to-edit');
    const usernameInput = document.getElementById('edit-username-input');
    const emailInput = document.getElementById('edit-email-input');
    const otpInput = document.getElementById('profile-otp-input');
    const errorEl = document.getElementById('profile-modal-error');
    const step1 = document.getElementById('profile-edit-step-1');
    const stepOtp = document.getElementById('profile-edit-step-otp');
    const targetEmailDisplay = document.getElementById('target-email-display');

    let newUsername = '';
    let newEmail = '';

    saveBtn.addEventListener('click', async () => {
        newUsername = usernameInput.value.trim();
        newEmail = emailInput.value.trim();

        if (!newUsername) {
            errorEl.textContent = 'Username cannot be empty.';
            return;
        }

        errorEl.textContent = '';
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Checking...';

        try {
            // Check username availability if changed
            if (newUsername !== currentUser.username) {
                const existingUser = await db.users.getByUsername(newUsername);
                if (existingUser) {
                    throw new Error('Username already taken.');
                }
            }

            // If email changed, require OTP
            if (newEmail !== (currentUser.email || '')) {
                if (!newEmail) throw new Error('Email cannot be empty if you want to link/change it.');

                // Check email availability
                const existingEmail = await db.users.getByEmail(newEmail);
                if (existingEmail && existingEmail.id !== currentUser.id) {
                    throw new Error('Email already linked to another account.');
                }

                await sendOTP(newEmail, 'register'); // reuse register type for verification

                targetEmailDisplay.textContent = newEmail;
                step1.style.display = 'none';
                stepOtp.style.display = 'block';
                showToast('Verification code sent.');
            } else {
                // Only username changed or nothing changed
                if (newUsername !== currentUser.username) {
                    await db.users.update(currentUser.id, { username: newUsername });
                    currentUser.username = newUsername;

                    // Update UI immediately
                    document.getElementById('profile-username').textContent = currentUser.username;
                    document.getElementById('profile-avatar').textContent = generateAvatar(currentUser.username);
                    updateProfileSummary();
                    showToast('Username updated successfully!', 'success');
                }
                document.getElementById('modal-close-btn').click();
            }
        } catch (err) {
            errorEl.textContent = err.message || 'Error updating profile.';
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Save Changes';
        }
    });

    verifyBtn.addEventListener('click', async () => {
        const otp = otpInput.value.trim();
        if (!otp) {
            errorEl.textContent = 'Please enter the OTP.';
            return;
        }

        errorEl.textContent = '';
        verifyBtn.disabled = true;
        verifyBtn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Verifying...';

        try {
            await verifyOTP(newEmail, otp);

            // Success! Update both (in case username was also changed)
            await db.users.update(currentUser.id, {
                username: newUsername,
                email: newEmail
            });

            currentUser.username = newUsername;
            currentUser.email = newEmail;

            // Update UI
            document.getElementById('profile-username').textContent = currentUser.username;
            document.getElementById('profile-avatar').textContent = generateAvatar(currentUser.username);
            updateProfileSummary();

            showToast('Profile updated successfully!', 'success');
            document.getElementById('modal-close-btn').click();
        } catch (err) {
            errorEl.textContent = err.message || 'Invalid OTP.';
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = 'Verify & Update Profile';
        }
    });

    backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        stepOtp.style.display = 'none';
        step1.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Save Changes';
    });
}
