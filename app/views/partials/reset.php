<div class="auth-grid">
    <div class="info-panel">
        <h2>Set a new password</h2>
        <p>Use the reset token from the email or the local development link, choose a new password, and the PHP login flow will pick it up immediately.</p>
    </div>

    <form class="stack" id="reset-form">
        <div class="field">
            <label for="reset-token">Reset token</label>
            <input id="reset-token" name="token" type="text" autocomplete="off" required>
        </div>
        <div class="field">
            <label for="reset-password">New password</label>
            <input id="reset-password" name="password" type="password" autocomplete="new-password" minlength="8" required>
        </div>
        <button class="button button-primary" type="submit">Save new password</button>
        <p class="form-message" id="reset-message" aria-live="polite"></p>
        <p class="inline-note"><a href="<?= e(route_url('login')) ?>">Back to login</a></p>
    </form>
</div>
