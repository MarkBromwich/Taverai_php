<div class="auth-grid">
    <div class="info-panel">
        <h2>Reset access cleanly</h2>
        <p>This keeps the PHP port self-sufficient on shared hosting. On localhost, you’ll also see the generated reset link directly so you can keep moving without mail setup getting in the way.</p>
    </div>

    <form class="stack" id="forgot-form">
        <div class="field">
            <label for="forgot-email">Email</label>
            <input id="forgot-email" name="email" type="email" autocomplete="email" required>
        </div>
        <button class="button button-primary" type="submit">Send reset link</button>
        <p class="form-message" id="forgot-message" aria-live="polite"></p>
        <div class="status-panel is-hidden" id="forgot-reset-link-panel">
            <p class="eyebrow">Local reset link</p>
            <p id="forgot-reset-link-text" class="inline-note"></p>
        </div>
        <p class="inline-note"><a href="<?= e(route_url('login')) ?>">Back to login</a></p>
    </form>
</div>
