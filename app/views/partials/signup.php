<div class="auth-grid auth-card screen-card">
    <div class="auth-brand">
        <span class="brand-mark" aria-hidden="true"><img src="<?= e(base_url('taverai-logo-four.png')) ?>" alt=""></span>
        <strong>Taverai</strong>
        <span>Create your account</span>
    </div>

    <form class="stack" id="signup-form">
        <p class="form-message" id="signup-message" aria-live="polite"></p>
        <div class="field-row">
            <div class="field">
                <label for="signup-first-name">First name</label>
                <input id="signup-first-name" name="firstName" type="text" autocomplete="given-name">
            </div>
            <div class="field">
                <label for="signup-last-name">Last name</label>
                <input id="signup-last-name" name="lastName" type="text" autocomplete="family-name">
            </div>
        </div>
        <div class="field">
            <label for="signup-email">Email</label>
            <input id="signup-email" name="username" type="email" autocomplete="email" required>
        </div>
        <div class="field-row">
            <div class="field">
                <label for="signup-password">Password</label>
                <input id="signup-password" name="password" type="password" autocomplete="new-password" minlength="8" required>
            </div>
            <div class="field">
                <label for="signup-confirm-password">Confirm password</label>
                <input id="signup-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required>
            </div>
        </div>
        <button class="button button-primary" type="submit">Create account</button>
        <p class="inline-note">Already have an account? <a href="<?= e(route_url('login')) ?>">Log in</a></p>
    </form>
</div>
