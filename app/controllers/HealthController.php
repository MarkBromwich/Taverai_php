<?php

class HealthController extends Controller
{
    public function show(): void
    {
        $checks = [
            'app' => [
                'ok' => true,
                'message' => 'booted',
            ],
            'database' => $this->databaseCheck(),
            'uploads' => $this->uploadsCheck(),
            'openai' => [
                'ok' => (new OpenAIClient())->isConfigured(),
                'message' => (new OpenAIClient())->isConfigured() ? 'configured' : 'missing api key',
            ],
            'smtp' => $this->smtpCheck(),
        ];

        $ok = !in_array(false, array_column($checks, 'ok'), true);

        $this->json([
            'ok' => $ok,
            'service' => config('site_name', 'Taverai'),
            'time' => gmdate('c'),
            'checks' => $checks,
        ], $ok ? 200 : 503);
    }

    private function databaseCheck(): array
    {
        try {
            Database::connect()->query('SELECT 1');
            return [
                'ok' => true,
                'message' => 'connected',
            ];
        } catch (Throwable $e) {
            app_log('Health check database failed', ['message' => $e->getMessage()]);
            return [
                'ok' => false,
                'message' => 'connection failed',
            ];
        }
    }

    private function uploadsCheck(): array
    {
        $dir = (string) config('uploads.dir', '');
        $exists = $dir !== '' && is_dir($dir);
        $writable = $exists && is_writable($dir);

        return [
            'ok' => $writable,
            'message' => $writable ? 'writable' : ($exists ? 'not writable' : 'missing'),
        ];
    }

    private function smtpCheck(): array
    {
        $enabled = (bool) config('mail.enabled', false);
        $host = trim((string) config('mail.host', ''));
        $username = trim((string) config('mail.username', ''));
        $password = trim((string) config('mail.password', ''));

        if (!$enabled) {
            return [
                'ok' => false,
                'message' => 'disabled',
            ];
        }

        $configured = $host !== '' && $username !== '' && $password !== '';

        return [
            'ok' => $configured,
            'message' => $configured ? 'configured' : 'missing configuration',
        ];
    }
}
