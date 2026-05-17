<div class="stack">
    <section class="screen-card stack">
        <div class="section-header">
            <div>
                <h2>Compare Meals</h2>
                <p class="inline-note">Compare meals to see what best fits your active plan.</p>
            </div>
        </div>

        <form class="stack" id="menu-compare-form">
            <div class="compare-mode-toggle">
                <button class="button button-soft is-active" type="button" data-compare-mode="text">Text Compare</button>
                <button class="button button-soft" type="button" data-compare-mode="image">Image Compare</button>
            </div>

            <div class="field context-field">
                <label for="menu-context">Restaurant or menu context (optional)</label>
                <input id="menu-context" name="context" type="text" autocomplete="off" placeholder="Example: Chipotle, Sweetgreen, Starbucks, or local cafe">
            </div>

            <div class="compare-pair" id="compare-text-fields">
                <div class="meal-card">
                    <h3>Meal A</h3>
                    <textarea id="menu-option-a" name="optionA" rows="5" placeholder="Example: Grilled chicken bowl with brown rice, black beans, avocado, salsa, and roasted peppers."></textarea>
                </div>
                <strong class="versus">VS</strong>
                <div class="meal-card">
                    <h3>Meal B</h3>
                    <textarea id="menu-option-b" name="optionB" rows="5" placeholder="Example: Turkey sandwich on whole grain bread with side salad, olive oil dressing, and a small yogurt."></textarea>
                </div>
            </div>

            <div class="compare-upload-grid is-hidden" id="compare-image-fields">
                <div class="compare-upload-card">
                    <label class="upload-tile" for="menu-option-a-image">
                        <img class="upload-preview is-hidden" id="menu-option-a-preview" alt="Meal A preview">
                        <span class="upload-empty" id="menu-option-a-empty">
                            <span class="upload-plus">+</span>
                            <span>Upload meal image A</span>
                        </span>
                    </label>
                    <input id="menu-option-a-image" name="optionAImage" type="file" accept="image/*" class="is-hidden">
                    <p class="inline-note" id="menu-option-a-scan">No scan yet.</p>
                </div>

                <div class="compare-upload-card">
                    <label class="upload-tile" for="menu-option-b-image">
                        <img class="upload-preview is-hidden" id="menu-option-b-preview" alt="Meal B preview">
                        <span class="upload-empty" id="menu-option-b-empty">
                            <span class="upload-plus">+</span>
                            <span>Upload meal image B</span>
                        </span>
                    </label>
                    <input id="menu-option-b-image" name="optionBImage" type="file" accept="image/*" class="is-hidden">
                    <p class="inline-note" id="menu-option-b-scan">No scan yet.</p>
                </div>
            </div>

            <div class="button-row menu-actions">
                <button class="button button-primary" type="submit">Compare</button>
                <button class="button button-soft" type="reset">Clear</button>
            </div>
            <p class="form-message" id="menu-compare-message" aria-live="polite"></p>
        </form>

        <div class="feed-list" id="menu-compare-results">
            <p class="empty-state">Compare two menu options and Taverai will rank them against your current plan.</p>
        </div>
    </section>

    <section class="screen-card stack">
        <div>
            <h2>Smart Meal Planner</h2>
            <p class="inline-note">Tell the planner what you want to eat and it will build meals that fit your active plan.</p>
        </div>

        <form class="stack" id="meal-plan-form">
            <div class="planner-status" id="meal-plan-status">Plan: <strong>Loading</strong> &bull; Goal: <strong>— kcal</strong></div>
            <div class="field">
                <label for="meal-plan-prompt">What should the planner make?</label>
                <textarea id="meal-plan-prompt" name="prompt" rows="6" placeholder="Example: I want three high-protein breakfasts and simple Mediterranean dinners that my kids will eat. Keep prep under 25 minutes and use overlapping ingredients."></textarea>
            </div>
            <div class="field-row">
                <div class="field">
                    <label for="meal-plan-days">Days</label>
                    <select id="meal-plan-days" name="days">
                        <option value="1">1 day</option>
                        <option value="2">2 days</option>
                        <option value="3" selected>3 days</option>
                        <option value="5">5 days</option>
                        <option value="7">7 days</option>
                    </select>
                </div>
                <div class="field">
                    <label for="meal-plan-types">Meals to include</label>
                    <select id="meal-plan-types" name="mealTypes">
                        <option value="Breakfast">Breakfast</option>
                        <option value="Lunch">Lunch</option>
                        <option value="Dinner" selected>Dinner</option>
                        <option value="Snack">Snack</option>
                    </select>
                </div>
            </div>
            <div class="button-row">
                <button class="button button-primary" type="submit">Build Meal Plan</button>
                <button class="button button-soft" type="reset">Clear</button>
            </div>
            <p class="form-message" id="meal-plan-message" aria-live="polite"></p>
        </form>

        <div class="feed-list" id="meal-plan-results">
            <p class="empty-state">Generated meal plans will appear here with favorites you can save.</p>
        </div>
    </section>

    <section class="screen-card stack">
        <div>
            <h2>Saved Meal Archive</h2>
            <p class="inline-note">Open your saved meals, grouped by meal type, with printable recipes.</p>
        </div>
        <div class="button-row">
            <a class="button button-soft" href="<?= e(route_url('favorites')) ?>">View favorite meals</a>
        </div>
        <p class="inline-note" id="saved-meals-summary">Save any planned meal to build your archive.</p>
    </section>

    <section class="screen-card stack">
        <div>
            <h2>Barcode Nutrition</h2>
            <p class="inline-note">Look up a grocery item by barcode to grab quick nutrition details.</p>
        </div>
        <form class="stack" id="barcode-form">
            <div class="field">
                <label for="barcode-value">Barcode</label>
                <input id="barcode-value" name="barcode" type="text" placeholder="Enter a product barcode">
            </div>
            <div class="field">
                <label for="barcode-photo-file">Barcode photo</label>
                <input id="barcode-photo-file" type="file" accept="image/*">
            </div>
            <div class="button-row">
                <button class="button button-soft" id="barcode-upload-button" type="button">Upload picture</button>
                <button class="button button-soft" id="barcode-camera-button" type="button">Take picture</button>
                <button class="button button-primary" type="submit">Look up product</button>
            </div>
            <p class="form-message" id="barcode-message" aria-live="polite"></p>
        </form>
        <div class="feed-list" id="barcode-results">
            <p class="empty-state">Barcode results will appear here.</p>
        </div>
    </section>
</div>
