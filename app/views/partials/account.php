<div class="stack account-page">
    <section class="profile-hero">
        <div class="profile-photo-block">
            <span class="avatar" id="account-avatar-preview">M</span>
            <button class="text-button" id="avatar-upload-button" type="button">Change photo</button>
        </div>
        <div class="profile-copy">
            <div class="profile-title-row">
                <h2 id="account-display-name">Your profile</h2>
                <span class="tag profile-status">Free</span>
            </div>
            <p class="inline-note" id="account-email-label">@you</p>
            <p class="inline-note">Manage your profile, settings, exports, and connection status.</p>
        </div>
    </section>

    <section class="screen-card stack">
        <h2>Overview</h2>
        <div class="status-panel" id="account-summary">
            <p class="empty-state">Loading account details...</p>
        </div>
    </section>

    <section class="screen-card">
        <div class="feed-card-header">
            <div>
                <h2>Account security</h2>
                <h3>Password reset</h3>
                <p class="inline-note">Send yourself a reset link to update your password.</p>
            </div>
            <button class="button button-soft" id="account-reset-link-button" type="button">Send link</button>
        </div>
        <div class="status-panel account-reset-link-panel is-hidden" id="account-reset-link-panel">
            <p class="eyebrow">Reset link</p>
            <p id="account-reset-link-text" class="inline-note"></p>
        </div>
    </section>

    <section class="screen-card">
        <div class="feed-card-header">
            <div>
                <h2>Subscription</h2>
                <h3>Current paid status</h3>
                <p class="inline-note">You are currently on <strong>Free</strong>.</p>
            </div>
            <button class="button button-primary" type="button">Manage</button>
        </div>
    </section>

    <form class="screen-card stack" id="account-form">
        <section class="stack">
            <h2>Personal info</h2>
            <div class="field-row three-up">
                <div class="field">
                    <label for="account-first-name">First name</label>
                    <input id="account-first-name" name="firstName" type="text">
                </div>
                <div class="field">
                    <label for="account-last-name">Last name</label>
                    <input id="account-last-name" name="lastName" type="text">
                </div>
                <div class="field">
                    <label for="account-email">Email</label>
                    <input id="account-email" name="username" type="email">
                </div>
            </div>
        </section>

        <section class="stack">
            <h2>App settings</h2>
            <div class="field-row three-up">
                <div class="field">
                    <label for="account-goal">Daily calorie goal</label>
                    <label class="checkbox-row">
                        <input id="account-goal-enabled" type="checkbox">
                        <span>Enable</span>
                    </label>
                    <input id="account-goal" name="dailyCalorieGoal" type="number" min="0" step="1">
                </div>
                <div class="field">
                    <label for="account-units">Units</label>
                    <select id="account-units" name="units">
                        <option value="metric">Metric</option>
                        <option value="imperial">Imperial</option>
                    </select>
                </div>
                <div class="field">
                    <label for="account-theme">Theme</label>
                    <select id="account-theme" name="theme">
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                        <option value="system">System</option>
                    </select>
                </div>
            </div>
            <input id="account-provider" name="healthAppProvider" type="hidden">
            <input id="account-avatar-file" name="avatarFile" type="file" accept="image/*" class="is-hidden">
            <label class="checkbox-row is-hidden">
                <input id="account-health-connected" name="healthAppConnected" type="checkbox">
                <span>Health app connected</span>
            </label>
            <div class="button-row">
                <button class="button button-primary" type="submit">Save profile</button>
                <button class="button button-primary" type="submit">Save settings</button>
            </div>
            <p class="form-message" id="account-message" aria-live="polite"></p>
        </section>
    </form>

    <section class="screen-card">
        <div class="feed-card-header">
            <div>
                <h2>Connections</h2>
                <h3>Phone health app</h3>
                <p class="inline-note">Mark whether you have linked a health app. This is a simple connection status for now.</p>
            </div>
            <button class="button button-soft" type="button" id="account-connect-health">Connect</button>
        </div>
    </section>

    <section class="screen-card">
        <div class="feed-card-header">
            <div>
                <h2>Data</h2>
                <h3>Export account data</h3>
                <p class="inline-note">Download a full backup as JSON or a spreadsheet-ready food log as CSV.</p>
            </div>
            <div class="button-row export-actions">
                <button class="button button-soft" id="account-export-json-button" type="button">Export JSON</button>
                <button class="button button-soft" id="account-export-csv-button" type="button">Export CSV</button>
                <button class="button button-soft" id="account-import-json-button" type="button">Import JSON</button>
            </div>
        </div>
        <input id="account-import-json-file" type="file" accept="application/json,.json" class="is-hidden">
    </section>

    <section class="screen-card">
        <div class="feed-card-header">
            <div>
                <h2>Local cache</h2>
                <h3>Clear this device</h3>
                <p class="inline-note">Remove saved Log, Coach, and Menu snapshots from this browser. Your server data stays unchanged.</p>
            </div>
            <button class="button button-soft" id="account-clear-cache-button" type="button">Clear local cache</button>
        </div>
    </section>

    <section class="screen-card">
        <div class="feed-card-header">
            <div>
                <h2>Privacy</h2>
                <h3>Delete account data</h3>
                <p class="inline-note">Permanently delete your profile, plans, saved meals, and food history.</p>
            </div>
            <button class="button button-danger" id="account-delete-button" type="button">Delete account</button>
        </div>
    </section>

    <section class="screen-card">
        <div class="feed-card-header">
            <div>
                <h2>Session</h2>
                <h3>Sign out</h3>
                <p class="inline-note">End this session on this device.</p>
            </div>
            <button class="button button-danger" id="logout-button" type="button">Sign out</button>
        </div>
    </section>
</div>
