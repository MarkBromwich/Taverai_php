<div class="stack log-shell">
    <section class="log-hello">
        <div class="profile-hero">
            <span class="avatar" id="summary-avatar">M</span>
            <div>
                <h2 id="summary-greeting">Hey there</h2>
                <p class="log-overview-copy" id="summary-hero-copy">Log your first meal and Taverai will start scoring your day.</p>
            </div>
        </div>

        <div class="hello-streak">
            <strong><span id="summary-streak">0 days</span> in a row</strong>
            <span>Consistency beats intensity.</span>
            <span class="is-hidden" id="summary-plan">No plan</span>
            <span class="is-hidden" id="summary-week-score">—</span>
            <span class="is-hidden" id="summary-month-score">—</span>
        </div>
    </section>

    <section class="screen-card date-card">
        <button class="button button-soft" type="button" aria-label="Previous day">‹</button>
        <div class="date-display">
            <strong id="summary-day-label">Today</strong>
            <span id="summary-date-text">—</span>
            <input id="log-date" class="compact-input" type="date">
        </div>
        <button class="button button-soft" type="button" aria-label="Next day">›</button>
    </section>

    <section class="screen-card unlock-card" id="unlock-gauges-card">
        <strong>To unlock the gauges:</strong>
        <ul>
            <li id="unlock-plan-item">Choose a diet plan in <a href="<?= e(route_url('plans')) ?>">Plans</a>.</li>
            <li id="unlock-goal-item">Set your daily calorie goal in <a href="<?= e(route_url('plans')) ?>">Plans</a> or You.</li>
            <li id="unlock-entry-item">Log at least one meal below by text, nutrition, or photo.</li>
        </ul>
    </section>

    <section class="screen-card stack">
        <div class="section-header">
            <div>
                <h2>Calories</h2>
                <p class="inline-note" id="summary-calories-copy">Set a daily calorie goal to unlock target pacing.</p>
            </div>
            <span class="tag" id="summary-calories-tag">0 kcal</span>
        </div>

        <div class="dashboard-grid">
            <article class="dashboard-card macro-card macro-calories">
                <div class="feed-card-header">
                    <h3>Calories today</h3>
                    <strong id="stat-calories">0</strong>
                </div>
                <div class="gauge">
                    <div class="gauge-arc progress-bar" id="summary-calories-bar"></div>
                    <div class="gauge-needle" id="summary-calories-needle"></div>
                    <div class="gauge-baseline"></div>
                </div>
                <p class="dashboard-copy" id="summary-calories-hint">Set a goal and log meals to see calorie pacing.</p>
                <ul class="dashboard-bullets" id="summary-calories-reasons"></ul>
            </article>

            <article class="dashboard-card macro-card macro-score">
                <div class="feed-card-header">
                    <h3>Diet today</h3>
                    <span class="tag" id="summary-compliance-score">—</span>
                </div>
                <div class="gauge">
                    <div class="gauge-arc progress-bar" id="summary-compliance-bar"></div>
                    <div class="gauge-needle" id="summary-compliance-needle"></div>
                    <div class="gauge-baseline"></div>
                </div>
                <p class="dashboard-copy" id="summary-compliance-copy">Once entries are scored, you will see how today lines up with your active plan.</p>
                <ul class="dashboard-bullets" id="summary-compliance-reasons">
                    <li>Log meals with calories and macros to unlock scoring details.</li>
                </ul>
            </article>
        </div>

        <div class="stats-row" id="entry-stats">
            <article class="stat-card"><span>Entries</span><strong id="summary-day-entries">0</strong></article>
            <article class="stat-card macro-card macro-protein">
                <span>Protein</span>
                <strong id="summary-day-protein">0g</strong><strong class="is-hidden" id="stat-protein">0g</strong>
                <div class="mini-progress"><div id="summary-protein-bar"></div></div>
            </article>
            <article class="stat-card macro-card macro-carbs">
                <span>Carbs</span>
                <strong id="summary-day-carbs">0g</strong><strong class="is-hidden" id="stat-carbs">0g</strong>
                <div class="mini-progress"><div id="summary-carbs-bar"></div></div>
            </article>
            <article class="stat-card macro-card macro-fat">
                <span>Fat</span>
                <strong id="summary-day-fat">0g</strong><strong class="is-hidden" id="stat-fat">0g</strong>
                <div class="mini-progress"><div id="summary-fat-bar"></div></div>
            </article>
        </div>

        <div class="dashboard-card">
            <div class="feed-card-header">
                <h3>Macro balance</h3>
                <span class="inline-note" id="macro-balance-total">No macros yet</span>
            </div>
            <div class="macro-balance-bars" id="macro-balance-bars" aria-label="Macro calorie balance">
                <span class="macro-segment macro-protein" id="macro-balance-protein-bar"></span>
                <span class="macro-segment macro-carbs" id="macro-balance-carbs-bar"></span>
                <span class="macro-segment macro-fat" id="macro-balance-fat-bar"></span>
            </div>
            <div class="macro-balance-grid">
                <div class="macro-balance-item macro-protein">
                    <span>Protein</span>
                    <strong id="macro-balance-protein">0g</strong>
                    <em id="macro-balance-protein-pct">0%</em>
                </div>
                <div class="macro-balance-item macro-carbs">
                    <span>Carbs</span>
                    <strong id="macro-balance-carbs">0g</strong>
                    <em id="macro-balance-carbs-pct">0%</em>
                </div>
                <div class="macro-balance-item macro-fat">
                    <span>Fat</span>
                    <strong id="macro-balance-fat">0g</strong>
                    <em id="macro-balance-fat-pct">0%</em>
                </div>
            </div>
            <p class="dashboard-copy" id="macro-balance-copy">Add nutrition to see your macro balance.</p>
        </div>

        <div class="food-today-panel">
            <div class="food-today-header">
                <h3>Food eaten today</h3>
                <span class="inline-note"><span id="food-entry-count">0</span> logged</span>
            </div>
            <div class="food-chip-list is-hidden" id="summary-foods" aria-hidden="true">
                <span class="food-chip is-empty">No foods logged yet.</span>
            </div>
            <div class="feed-list food-entry-list" id="entries-list">
                <p class="empty-state">No entries yet today.</p>
            </div>
        </div>

    </section>

    <section class="screen-card stack">
        <div class="section-header">
            <div>
                <h2>Add food</h2>
                <p class="inline-note">Use quick text for a fast entry, manual nutrition for label numbers, or upload a photo.</p>
            </div>
            <span class="inline-note">Fast</span>
        </div>

        <form class="stack" id="entry-form">
            <div class="field">
                <label for="entry-text">Quick add</label>
                <textarea id="entry-text" name="text" rows="4" placeholder="Example: 2 eggs and toast"></textarea>
            </div>
            <div class="field-row four-up">
                <div class="field">
                    <label for="entry-calories">Calories</label>
                    <input id="entry-calories" name="calories" type="number" min="0" step="1">
                </div>
                <div class="field">
                    <label for="entry-protein">Protein (g)</label>
                    <input id="entry-protein" name="proteinG" type="number" min="0" step="0.1">
                </div>
                <div class="field">
                    <label for="entry-carbs">Carbs (g)</label>
                    <input id="entry-carbs" name="carbsG" type="number" min="0" step="0.1">
                </div>
                <div class="field">
                    <label for="entry-fat">Fat (g)</label>
                    <input id="entry-fat" name="fatG" type="number" min="0" step="0.1">
                </div>
            </div>
            <div class="button-row">
                <button class="button button-soft" id="entry-estimate-button" type="button">Estimate with AI</button>
                <button class="button button-primary" type="submit">Save entry</button>
            </div>
            <p class="form-message" id="entry-message" aria-live="polite"></p>
        </form>

        <form class="stack upload-panel" id="meal-photo-form" enctype="multipart/form-data">
            <div class="field">
                <label for="meal-photo-file">Meal photo</label>
                <input id="meal-photo-file" name="file" type="file" accept="image/*">
            </div>
            <figure class="photo-preview is-hidden" id="meal-photo-preview">
                <img id="meal-photo-preview-image" alt="Selected meal preview">
            </figure>
            <div class="button-row">
                <button class="button button-primary" type="submit">Use photo</button>
                <button class="button button-soft" id="meal-camera-button" type="button">Use camera</button>
            </div>
            <p class="form-message" id="photo-message" aria-live="polite"></p>
        </form>
    </section>
</div>
