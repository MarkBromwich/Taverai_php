<div class="auth-grid auth-card screen-card">
    <div class="auth-brand">
        <span class="brand-mark" aria-hidden="true"><img src="<?= e(base_url('taverai-logo-four.png')) ?>" alt=""></span>
        <strong>Taverai</strong>
        <span>Welcome back</span>
    </div>

    <form class="stack" id="login-form">
        <p class="form-message" id="login-message" aria-live="polite"></p>
        <div class="field">
            <label for="login-email">Email</label>
            <input id="login-email" name="username" type="email" autocomplete="email" required>
        </div>
        <div class="field">
            <label for="login-password">Password</label>
            <input id="login-password" name="password" type="password" autocomplete="current-password" required>
        </div>
        <button class="button button-primary" type="submit">Sign in</button>
        <p class="inline-note"><a href="<?= e(route_url('forgot')) ?>">Forgot your password?</a></p>
        <p class="inline-note">Need an account? <a href="<?= e(route_url('signup')) ?>">Create one</a></p>
    </form>
</div>
