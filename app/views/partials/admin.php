<div class="stack admin-page">
    <section class="screen-card">
        <div class="feed-card-header">
            <div>
                <h2>System Snapshot</h2>
                <p class="inline-note">A quick health check for the local app, database, uploads, and AI connection.</p>
            </div>
            <button class="button button-soft" id="admin-refresh-button" type="button">Refresh</button>
        </div>
        <div class="status-panel admin-status" id="admin-system-status">
            <p class="empty-state">Loading system status...</p>
        </div>
    </section>

    <section class="screen-card stack">
        <h2>Usage Overview</h2>
        <div class="admin-metric-grid" id="admin-totals">
            <p class="empty-state">Loading totals...</p>
        </div>
    </section>

    <section class="screen-card stack">
        <h2>Recent Activity</h2>
        <div class="admin-metric-grid" id="admin-activity">
            <p class="empty-state">Loading activity...</p>
        </div>
    </section>

    <section class="screen-card stack">
        <h2>Recent Users</h2>
        <div class="field">
            <label for="admin-user-search">User lookup</label>
            <input id="admin-user-search" type="search" placeholder="Search name or email">
        </div>
        <div class="admin-table-wrap">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Entries</th>
                        <th>Plans</th>
                        <th>Saved</th>
                        <th>Joined</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="admin-users">
                    <tr><td colspan="7">Loading users...</td></tr>
                </tbody>
            </table>
        </div>
        <div class="status-panel account-reset-link-panel is-hidden" id="admin-reset-link-panel">
            <p class="eyebrow">Admin reset link</p>
            <p id="admin-reset-link-text" class="inline-note"></p>
        </div>
        <p class="form-message" id="admin-message" aria-live="polite"></p>
    </section>

    <section class="screen-card stack">
        <div class="feed-card-header">
            <div>
                <h2>Recent Errors</h2>
                <p class="inline-note">Server-side upload, database, AI, and exception logs.</p>
            </div>
            <button class="button button-soft" id="admin-log-refresh-button" type="button">Refresh logs</button>
        </div>
        <div class="admin-log-list" id="admin-errors">
            <p class="empty-state">Loading errors...</p>
        </div>
    </section>

    <section class="screen-card stack">
        <div class="feed-card-header">
            <div>
                <h2>Meal Audit</h2>
                <p class="inline-note">Uploaded meal photos and entries that still need nutrition data.</p>
            </div>
            <button class="button button-soft" id="admin-audit-refresh-button" type="button">Refresh audit</button>
        </div>
        <div class="admin-audit-list" id="admin-meal-audit">
            <p class="empty-state">Loading meal audit...</p>
        </div>
    </section>
</div>
