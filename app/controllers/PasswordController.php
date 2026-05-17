<?php

class PasswordController extends Controller
{
    public function requestReset(): void
    {
        $rateLimiter = $this->model('RateLimitModel');
        $attempt = $rateLimiter->check('password-request:' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 8, 10 * 60 * 1000);
        if (!$attempt['ok']) {
            $this->json(['error' => 'Too many reset requests. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        $body = $this->body();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        if ($email === '' || !str_contains($email, '@')) {
            $this->json(['error' => 'Valid email required.'], 400);
            return;
        }

        $user = $this->model('UserModel')->findByEmail($email);
        if ($user) {
            $rawToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $rawToken);
            $expiresAt = gmdate('Y-m-d H:i:s', time() + 3600);

            $this->model('PasswordResetModel')->createForUser(
                $user['id'],
                $tokenHash,
                $expiresAt,
                $_SERVER['REMOTE_ADDR'] ?? null,
                $_SERVER['HTTP_USER_AGENT'] ?? null
            );

            $resetLink = route_url('reset') . '&token=' . rawurlencode($rawToken);
            $this->sendResetEmail($email, $resetLink);

            $payload = ['ok' => true, 'message' => 'If that email exists, a reset link has been sent.'];
            if ($this->isLocal()) {
                $payload['resetLink'] = $resetLink;
            }
            $this->json($payload);
            return;
        }

        $this->json(['ok' => true, 'message' => 'If that email exists, a reset link has been sent.']);
    }

    public function reset(): void
    {
        $rateLimiter = $this->model('RateLimitModel');
        $attempt = $rateLimiter->check('password-reset:' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 10, 10 * 60 * 1000);
        if (!$attempt['ok']) {
            $this->json(['error' => 'Too many reset attempts. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        $body = $this->body();
        $token = trim((string) ($body['token'] ?? ''));
        $password = (string) ($body['password'] ?? '');

        if ($token === '' || strlen($password) < 8) {
            $this->json(['error' => 'Invalid input.'], 400);
            return;
        }

        $tokenHash = hash('sha256', $token);
        $record = $this->model('PasswordResetModel')->findValid($tokenHash);
        if ($record === null) {
            $this->json(['error' => 'Invalid or expired token.'], 400);
            return;
        }

        $userId = (string) $record['user_id'];
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $updated = $this->model('UserModel')->updatePasswordHash($userId, $passwordHash);
        if (!$updated) {
            $this->json(['error' => 'Password reset failed.'], 500);
            return;
        }

        $this->model('PasswordResetModel')->markUsedAndClearUserTokens($userId);
        if (current_user_id() === $userId) {
            $_SESSION = [];
            session_destroy();
        }
        $this->json(['ok' => true]);
    }

    private function sendResetEmail(string $email, string $resetLink): void
    {
        if (!config('mail.enabled', false)) {
            app_log('Password reset email skipped because SMTP is disabled.', ['email' => $email]);
            return;
        }

        $subject = 'Taverai password reset';
        $message = "Use this link to reset your password:\n\n{$resetLink}\n\nIf you did not request this, you can ignore this email.";

        try {
            (new SmtpMailer(config('mail', [])))->send($email, $subject, $message);
        } catch (Throwable $e) {
            app_log('Password reset email failed.', [
                'email' => $email,
                'message' => $e->getMessage(),
            ]);
        }
    }

    private function isLocal(): bool
    {
        $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
        return str_contains($host, 'localhost') || str_contains($host, '127.0.0.1');
    }
}
