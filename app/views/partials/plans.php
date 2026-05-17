<div class="stack">
    <section class="screen-card stack">
        <div>
            <h2>Daily Calorie Goal</h2>
            <p class="inline-note">Set the target that powers the Log gauges and Coach trend views.</p>
        </div>
        <label class="checkbox-row">
            <input id="plans-goal-enabled" type="checkbox">
            <span>Enable goal</span>
        </label>
        <div class="field">
            <label for="plans-goal-range">Calories/day</label>
            <input id="plans-goal-range" type="range" min="1200" max="4500" step="50" value="2000">
            <div class="feed-card-header">
                <span class="inline-note">1200</span>
                <strong id="plans-goal-value">—</strong>
                <span class="inline-note">4500</span>
            </div>
        </div>
        <button class="button button-primary" id="plans-save-goal" type="button">Save goal</button>
        <p class="form-message" id="plans-goal-message" aria-live="polite"></p>
    </section>

    <section class="screen-card stack">
        <div class="section-header">
            <div>
                <h2>Diet Plans</h2>
                <p class="inline-note">Choose a seeded plan or add your own scored macro strategy.</p>
            </div>
        </div>
        <div class="field">
            <label for="template-select">Diet plan</label>
            <select id="template-select" name="templateSlug" disabled>
                <option value="">Loading diet plans...</option>
            </select>
        </div>
        <button class="button button-primary" id="template-add-button" type="button">Add selected diet plan</button>

        <div>
            <h2>Your Current Plan</h2>
            <div class="feed-list" id="plans-list">
                <p class="empty-state">No plans yet.</p>
            </div>
        </div>
        <p class="form-message" id="plan-message" aria-live="polite"></p>
    </section>

    <section class="screen-card stack">
        <div>
            <h2>Custom Diet Plan Builder</h2>
            <p class="inline-note">Build a plan around your own macro strategy, like bulking, cutting, or a high-protein lifting phase.</p>
        </div>

        <form class="stack" id="custom-plan-form">
            <div class="field-row three-up">
                <div class="field">
                    <label for="custom-plan-preset">Preset</label>
                    <select id="custom-plan-preset" name="preset">
                        <option value="muscle-gain">Muscle gain</option>
                        <option value="high-protein-cut">High protein cut</option>
                        <option value="balanced-custom">Balanced custom</option>
                    </select>
                </div>
                <div class="field">
                    <label for="custom-plan-name">Plan name</label>
                    <input id="custom-plan-name" name="name" type="text" value="Muscle Gain Builder" required>
                </div>
                <div class="field">
                    <label for="custom-plan-calories">Target calories</label>
                    <input id="custom-plan-calories" name="targetCalories" type="number" min="0" step="50" value="3000">
                </div>
            </div>
            <div class="field-row three-up">
                <div class="macro-range">
                    <strong>Carbs %</strong>
                    <div class="range-fields">
                        <input id="custom-carb-min" name="carbMin" type="number" min="0" max="100" value="35">
                        <span>to</span>
                        <input id="custom-carb-max" name="carbMax" type="number" min="0" max="100" value="45">
                    </div>
                </div>
                <div class="macro-range">
                    <strong>Protein %</strong>
                    <div class="range-fields">
                        <input id="custom-protein-min" name="proteinMin" type="number" min="0" max="100" value="25">
                        <span>to</span>
                        <input id="custom-protein-max" name="proteinMax" type="number" min="0" max="100" value="35">
                    </div>
                </div>
                <div class="macro-range">
                    <strong>Fat %</strong>
                    <div class="range-fields">
                        <input id="custom-fat-min" name="fatMin" type="number" min="0" max="100" value="20">
                        <span>to</span>
                        <input id="custom-fat-max" name="fatMax" type="number" min="0" max="100" value="30">
                    </div>
                </div>
            </div>
            <div class="ai-plan-helper">
                <div class="field">
                    <label for="custom-plan-goals">Personal goals</label>
                    <textarea id="custom-plan-goals" name="goals" rows="4" placeholder="Example: I want to lose 15 pounds, keep muscle, avoid feeling hungry at night, and eat mostly Mediterranean-style meals."></textarea>
                </div>
                <button class="button button-soft" id="custom-plan-ai-button" type="button">Build with AI</button>
                <p class="inline-note" id="custom-plan-ai-note">AI can suggest a plan name, calories, and macro ranges. Review before adding.</p>
            </div>
            <button class="button button-primary" type="submit">Add custom plan</button>
        </form>
    </section>
</div>
