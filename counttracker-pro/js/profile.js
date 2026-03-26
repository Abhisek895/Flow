
document.addEventListener('DOMContentLoaded', async () => {
    await initApp('profile');
    if (!currentUser) return;

    // Load Profile Info
    document.getElementById('profile-username').textContent = currentUser.username;
    document.getElementById('profile-joined').textContent = `Member since: ${formatDate(currentUser.createdAt)}`;
    document.getElementById('profile-avatar').textContent = generateAvatar(currentUser.username);

    // Update Profile Summary (Username & Email)
    updateProfileSummary();

    // Settings Modal Logic
    const settingsBtn = document.getElementById('btn-open-settings');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', handleSettings);
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

async function handleSettings() {
    const bodyHtml = `
        <div class="settings-modal-wrapper">
            <!-- Tabs Navigation -->
            <div class="tabs-header">
                <button class="tab-btn active" data-tab="profile">Profile</button>
                <button class="tab-btn" data-tab="security">Security</button>
            </div>

            <!-- Profile Tab Content -->
            <div class="tab-content active" id="tab-profile">
                <div class="auth-form" style="padding: 0;">
                    <div id="profile-edit-step-1">
                        <div class="input-group">
                            <label>Username</label>
                            <input type="text" id="set-username" value="${currentUser.username}">
                        </div>
                        <div class="input-group">
                            <label>Email (View Only)</label>
                            <input type="text" value="${currentUser.email || 'None'}" disabled style="opacity: 0.6;">
                            <small style="color: var(--text-secondary);">Change email in the Security tab.</small>
                        </div>
                        <button id="btn-update-username" class="btn btn-primary w-full">Update Username</button>
                    </div>
                </div>
            </div>

            <!-- Security Tab Content -->
            <div class="tab-content" id="tab-security">
                <!-- Reset Password Section -->
                <div class="security-action-card">
                    <div class="security-info">
                        <h5>Reset Password</h5>
                        <p>Receive a code via email to update your credentials.</p>
                    </div>
                    <button class="btn btn-secondary btn-sm" id="btn-init-pwd-reset">Reset</button>
                </div>

                <!-- Change Email Section -->
                <div class="security-action-card">
                    <div class="security-info">
                        <h5>${currentUser.email ? 'Change Email' : 'Link Email'}</h5>
                        <p>${currentUser.email ? 'Update your linked email address. Requires dual verification.' : 'Connect an email to your account for recovery and security.'}</p>
                    </div>
                    <button class="btn btn-secondary btn-sm" id="btn-init-email-change">${currentUser.email ? 'Change' : 'Link'}</button>
                </div>

                <!-- Security Flows Container (Dynamic) -->
                <div id="security-flow-container" style="display:none; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
                    <div id="security-flow-content"></div>
                </div>
            </div>
        </div>
    `;

    showModal('Account Settings', bodyHtml, '', null, 'Close');
    
    // Hide confirm button
    const confirmBtn = document.getElementById('modal-confirm-btn');
    if (confirmBtn) confirmBtn.style.display = 'none';

    // Tab Switching Logic
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // --- Profile Logic ---
    const updateUsernameBtn = document.getElementById('btn-update-username');
    updateUsernameBtn.addEventListener('click', async () => {
        const newUsername = document.getElementById('set-username').value.trim();
        if (!newUsername || newUsername === currentUser.username) return;

        updateUsernameBtn.disabled = true;
        updateUsernameBtn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Updating...';

        try {
            const existing = await db.users.getByUsername(newUsername);
            if (existing) throw new Error('Username already taken.');

            await db.users.update(currentUser.id, { username: newUsername });
            currentUser.username = newUsername;
            document.getElementById('profile-username').textContent = currentUser.username;
            document.getElementById('profile-avatar').textContent = generateAvatar(newUsername);
            updateProfileSummary();
            showToast('Username updated!');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            updateUsernameBtn.disabled = false;
            updateUsernameBtn.innerHTML = 'Update Username';
        }
    });

    // --- Security Logic: Reset Password ---
    document.getElementById('btn-init-pwd-reset').addEventListener('click', () => {
        startPasswordResetFlow();
    });

    // --- Security Logic: Change Email ---
    document.getElementById('btn-init-email-change').addEventListener('click', () => {
        startEmailChangeFlow();
    });
}

/**
 * PASSWORD RESET FLOW
 */
async function startPasswordResetFlow() {
    if (!currentUser.email) {
        showToast('Please link an email to your profile first.', 'error');
        return;
    }

    const flowContainer = document.getElementById('security-flow-container');
    const flowContent = document.getElementById('security-flow-content');
    
    flowContainer.style.display = 'block';
    flowContent.innerHTML = `
        <div class="auth-form" style="padding:0;">
            <p class="mb-4">We'll send a code to <strong>${currentUser.email}</strong> to verify it's you.</p>
            <div class="input-group">
                <label>Verification Code</label>
                <input type="text" id="pwd-reset-otp" placeholder="6-digit OTP" maxlength="6" style="text-align:center; font-size: 1.25rem;">
            </div>
            <div id="pwd-new-fields" style="display:none;">
                <div class="input-group">
                    <label>New Password</label>
                    <input type="password" id="new-password-val" placeholder="Min 6 characters">
                </div>
            </div>
            <button id="btn-pwd-reset-action" class="btn btn-primary w-full">Send Code</button>
            <button id="btn-cancel-flow" class="btn btn-link w-full mt-2">Cancel</button>
        </div>
    `;

    const actionBtn = document.getElementById('btn-pwd-reset-action');
    let step = 'send'; // 'send' -> 'verify' -> 'update'

    actionBtn.addEventListener('click', async () => {
        try {
            if (step === 'send') {
                actionBtn.disabled = true;
                actionBtn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Sending...';
                await sendOTP(currentUser.email, 'reset');
                showToast('OTP code sent!');
                step = 'verify';
                actionBtn.disabled = false;
                actionBtn.innerHTML = 'Verify Code';
            } else if (step === 'verify') {
                const otp = document.getElementById('pwd-reset-otp').value.trim();
                actionBtn.disabled = true;
                await verifyOTP(currentUser.email, otp);
                showToast('Verified! Enter your new password.');
                document.getElementById('pwd-new-fields').style.display = 'block';
                document.getElementById('pwd-reset-otp').disabled = true; // lock otp
                step = 'update';
                actionBtn.disabled = false;
                actionBtn.innerHTML = 'Update Password';
            } else if (step === 'update') {
                const newPwd = document.getElementById('new-password-val').value;
                if (newPwd.length < 6) throw new Error('Password too short.');

                actionBtn.disabled = true;
                const hashed = await hashPassword(newPwd);
                await db.users.update(currentUser.id, { passwordHash: hashed });
                currentUser.passwordHash = hashed;
                showToast('Password updated successfully!', 'success');
                flowContainer.style.display = 'none';
            }
        } catch (err) {
            showToast(err.message, 'error');
            actionBtn.disabled = false;
        }
    });

    document.getElementById('btn-cancel-flow').addEventListener('click', () => {
        flowContainer.style.display = 'none';
    });
}

/**
 * EMAIL CHANGE FLOW
 */
async function startEmailChangeFlow() {
    const flowContainer = document.getElementById('security-flow-container');
    const flowContent = document.getElementById('security-flow-content');
    
    flowContainer.style.display = 'block';
    flowContent.innerHTML = `
        <div class="auth-form" style="padding:0;">
            <div id="email-change-step-1">
                <p class="mb-4 text-secondary">${currentUser.email ? 'To change your email, we need to verify both your current and new address.' : 'Enter the email address you would like to link to your account.'}</p>
                <div class="input-group">
                    <label>New Email Address</label>
                    <input type="email" id="new-email-val" placeholder="new-email@example.com">
                </div>
                <button id="btn-email-next" class="btn btn-primary w-full">${currentUser.email ? 'Verify Addresses' : 'Send Verification Code'}</button>
            </div>

            <div id="email-change-step-otp" style="display:none;">
                <p class="mb-4">Enter the code${currentUser.email ? 's' : ''} sent to ${currentUser.email ? 'both emails' : 'your email'}.</p>
                ${currentUser.email ? `
                <div class="input-group">
                    <label>OTP sent to <br><small>${currentUser.email}</small></label>
                    <input type="text" id="otp-old" placeholder="Old Email Code" maxlength="6">
                </div>
                ` : ''}
                <div class="input-group">
                    <label>OTP sent to <br><small id="new-email-display"></small></label>
                    <input type="text" id="otp-new" placeholder="Verification Code" maxlength="6">
                </div>
                <button id="btn-email-verify-final" class="btn btn-primary w-full">${currentUser.email ? 'Confirm Change' : 'Link Email'}</button>
            </div>
            
            <button id="btn-cancel-flow" class="btn btn-link w-full mt-2">Cancel</button>
        </div>
    `;

    const nextBtn = document.getElementById('btn-email-next');
    const finalBtn = document.getElementById('btn-email-verify-final');
    let newEmail = '';

    nextBtn.addEventListener('click', async () => {
        newEmail = document.getElementById('new-email-val').value.trim().toLowerCase();
        if (!newEmail || newEmail === currentUser.email) return;

        nextBtn.disabled = true;
        nextBtn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Sending Codes...';

        try {
            // Check availability
            const existing = await db.users.getByEmail(newEmail);
            if (existing) throw new Error('Email already in use.');

            // Send to both if old email exists
            if (currentUser.email) {
                await sendOTP(currentUser.email, 'reset'); // reuse code
            }
            await sendOTP(newEmail, 'register');

            document.getElementById('new-email-display').textContent = newEmail;
            document.getElementById('email-change-step-1').style.display = 'none';
            document.getElementById('email-change-step-otp').style.display = 'block';
            showToast('Verification codes sent to both emails!');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            nextBtn.disabled = false;
            nextBtn.innerHTML = currentUser.email ? 'Verify Addresses' : 'Send Verification Code';
        }
    });

    finalBtn.addEventListener('click', async () => {
        const otpOldEl = document.getElementById('otp-old');
        const otpNewEl = document.getElementById('otp-new');
        
        const otpOld = otpOldEl ? otpOldEl.value.trim() : '';
        const otpNew = otpNewEl ? otpNewEl.value.trim() : '';

        if (currentUser.email && !otpOld) return showToast('Old email OTP required.', 'error');
        if (!otpNew) return showToast('New email OTP required.', 'error');

        finalBtn.disabled = true;
        try {
            // Verify both
            if (currentUser.email) {
                await verifyOTP(currentUser.email, otpOld);
            }
            await verifyOTP(newEmail, otpNew);

            // Update
            await db.users.update(currentUser.id, { email: newEmail });
            currentUser.email = newEmail;
            updateProfileSummary();
            showToast('Email updated successfully!', 'success');
            flowContainer.style.display = 'none';
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            finalBtn.disabled = false;
        }
    });

    document.getElementById('btn-cancel-flow').addEventListener('click', () => {
        flowContainer.style.display = 'none';
    });
}
