<?php

class AuthController extends Controller
{
    public function signup(): void
    {
        $rateLimiter = $this->model('RateLimitModel');
        $attempt = $rateLimiter->check('signup:' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 5, 10 * 60 * 1000);

        if (!$attempt['ok']) {
            $this->json(['error' => 'Too many signup attempts. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        $body = $this->body();
        $firstName = trim((string) ($body['firstName'] ?? ''));
        $lastName = trim((string) ($body['lastName'] ?? ''));
        $email = strtolower(trim((string) ($body['username'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        if ($email === '' || !str_contains($email, '@')) {
            $this->json(['error' => 'Please enter a valid email address.'], 400);
            return;
        }

        if (strlen($password) < 8) {
            $this->json(['error' => 'Password must be at least 8 characters.'], 400);
            return;
        }
        if (strlen($email) > 191 || strlen($firstName) > 100 || strlen($lastName) > 100) {
            $this->json(['error' => 'Account details are too long.'], 400);
            return;
        }

        $users = $this->model('UserModel');
        if ($users->findByEmail($email)) {
            $this->json(['error' => 'An account with that email already exists.'], 409);
            return;
        }

        $user = $users->create([
            'firstName' => $firstName,
            'lastName' => $lastName,
            'username' => $email,
            'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
        ]);

        if ($user === null) {
            $this->json(['error' => 'Signup failed'], 500);
            return;
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = $user['id'];
        csrf_token();
        $this->json([
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'firstName' => $user['first_name'] ?? null,
                'lastName' => $user['last_name'] ?? null,
            ],
        ], 200);
    }

    public function login(): void
    {
        $rateLimiter = $this->model('RateLimitModel');
        $attempt = $rateLimiter->check('login:' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 8, 10 * 60 * 1000);

        if (!$attempt['ok']) {
            $this->json(['error' => 'Too many login attempts. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        $body = $this->body();
        $email = strtolower(trim((string) ($body['username'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        if ($email === '' || !str_contains($email, '@')) {
            $this->json(['error' => 'Please enter your email address.'], 400);
            return;
        }

        if ($password === '') {
            $this->json(['error' => 'Please enter your password.'], 400);
            return;
        }

        $users = $this->model('UserModel');
        $user = $users->findByEmail($email);

        if (!$user || !password_verify($password, (string) $user['password_hash'])) {
            $this->json(['error' => 'Invalid email or password.'], 401);
            return;
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = $user['id'];
        csrf_token();
        $this->json([
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'firstName' => $user['first_name'] ?? null,
                'lastName' => $user['last_name'] ?? null,
            ],
        ]);
    }

    public function logout(): void
    {
        $_SESSION = [];
        session_destroy();
        $this->json(['ok' => true]);
    }
}
