<div class="stack">
    <section class="screen-card stack">
        <div class="section-header">
            <div>
                <h2>Diet Trend</h2>
                <p class="inline-note">Weekly view updates as you log meals.</p>
            </div>
            <div class="button-row compact-actions" id="coach-range-controls">
                <button class="button button-soft is-active" type="button" data-coach-range="weekly">Weekly</button>
                <button class="button button-soft" type="button" data-coach-range="monthly">Monthly</button>
                <button class="button button-soft" type="button" data-coach-range="yearly">Yearly</button>
            </div>
        </div>

        <span class="tag" id="coach-streak-tag">Loading streak…</span>

        <div class="trend-grid">
            <div>
                <div class="feed-card-header">
                    <strong>Calories</strong>
                    <strong id="coach-calorie-summary">Loading</strong>
                </div>
                <div class="trend-chart" id="coach-calorie-chart"></div>
                <div class="trend-labels" id="coach-calorie-labels"></div>
            </div>
            <div>
                <div class="feed-card-header">
                    <strong>Plan Alignment</strong>
                    <strong id="coach-score-summary">—/100</strong>
                </div>
                <div class="trend-chart" id="coach-score-chart"></div>
                <div class="trend-labels" id="coach-score-labels"></div>
            </div>
        </div>

        <div class="feed-card-header compact-note">
            <strong>Overall macros</strong>
            <span class="inline-note" id="coach-overall-macros-note">Weekly average · logged days only</span>
        </div>
        <div class="breakdown-grid" id="coach-overall-macros"></div>
        <p class="inline-note is-hidden" id="coach-empty-tip">Tip: Click into <a href="<?= e(route_url('log')) ?>">Log</a> to add entries. The Coach page updates automatically as your history grows.</p>

        <article class="dashboard-card">
            <div class="ai-card-title">
                <strong>Trend insights</strong>
                <span class="debug-pill is-empty" id="coach-trend-source">Checking</span>
            </div>
            <ul class="dashboard-bullets" id="coach-trend-insights">
                <li>Loading your trend summary.</li>
            </ul>
        </article>
    </section>

    <section class="screen-card stack compact-section">
        <div class="section-header">
            <div>
                <h2>Macro Nutrients Breakdown</h2>
                <p class="inline-note">Estimated from calories, macros, and parsed meal items.</p>
            </div>
            <div class="field compact-select">
                <label for="coach-breakdown-days">Show</label>
                <select id="coach-breakdown-days">
                    <option value="1">1 day</option>
                    <option value="3" selected>3 days</option>
                    <option value="5">5 days</option>
                    <option value="10">10 days</option>
                    <option value="14">14 days</option>
                </select>
            </div>
        </div>
        <div class="legend-row compact-legend">
            <span class="legend fruit">Fruit</span>
            <span class="legend veg">Vegetables</span>
            <span class="legend grain">Grains</span>
            <span class="legend sugar">Sugar</span>
            <span class="legend calorie">Calories</span>
            <span class="legend carbs">Carbs</span>
            <span class="legend protein">Protein</span>
            <span class="legend fat">Fat</span>
        </div>
        <article class="dashboard-card macro-ai-card">
            <div class="ai-card-title">
                <strong>Macro Nutrient Coach</strong>
                <span class="debug-pill is-empty" id="coach-macro-source">Checking</span>
            </div>
            <ul class="dashboard-bullets" id="coach-macro-insights">
                <li>Loading macro nutrient context.</li>
            </ul>
        </article>

        <div class="stack" id="coach-breakdown-list">
            <p class="empty-state">Loading food group breakdown.</p>
        </div>
    </section>

    <section class="screen-card stack">
        <div class="section-header">
            <div>
                <h2>Ask Coach</h2>
                <p class="inline-note">Ask for practical guidance based on your recent log.</p>
            </div>
        </div>

        <form class="stack" id="coach-form">
            <div class="field">
                <label for="coach-question">What do you want help with?</label>
                <textarea id="coach-question" name="question" rows="5" placeholder="Example: Looking at the past two weeks, what should I improve first?"></textarea>
            </div>
            <div class="field">
                <label for="coach-horizon">Look back window</label>
                <div class="button-row compact-actions" id="coach-horizon-controls">
                    <button class="button button-soft" type="button" data-coach-horizon="7">7 days</button>
                    <button class="button button-soft" type="button" data-coach-horizon="14">14 days</button>
                    <button class="button button-soft is-active" type="button" data-coach-horizon="30">30 days</button>
                    <button class="button button-soft" type="button" data-coach-horizon="90">90 days</button>
                </div>
                <input id="coach-horizon" name="horizonDays" type="hidden" value="30">
            </div>
            <button class="button button-primary" type="submit">Ask coach</button>
            <p class="form-message" id="coach-message" aria-live="polite"></p>
        </form>
        <article class="status-panel coach-answer is-hidden" id="coach-answer"></article>
    </section>
</div>
