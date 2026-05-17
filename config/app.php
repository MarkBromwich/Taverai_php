<?php

define('APP_NAME', 'Taverai');
define('APPROOT', (defined('TAVERAI_ROOT') ? TAVERAI_ROOT : dirname(__DIR__)) . '/app');
define('PUBLICROOT', defined('TAVERAI_PUBLICROOT') ? TAVERAI_PUBLICROOT : dirname(__DIR__) . '/public');
define('BASE_URL', '');

return [
    'site_name' => 'Taverai',
    'tagline' => 'AI-assisted diet tracking on PHP/MySQL',
    'session' => [
        'cookie_name' => 'taveri_session',
        'lifetime' => 60 * 60 * 24 * 30,
    ],
    'security' => [
        'session_secret' => env_required('SESSION_SECRET'),
    ],
    'openai' => [
        'api_key' => env_value('OPENAI_API_KEY', ''),
        'meal_model' => env_value('OPENAI_MEAL_MODEL', 'gpt-4o-mini'),
        'coach_model' => env_value('OPENAI_COACH_MODEL', 'gpt-4.1-mini'),
    ],
    'mail' => [
        'enabled' => env_bool('SMTP_ENABLED', true),
        'host' => env_value('SMTP_HOST', 'smtp.ipower.com'),
        'port' => env_int('SMTP_PORT', 587),
        'encryption' => env_value('SMTP_ENCRYPTION', 'tls'),
        'username' => env_value('SMTP_USERNAME', 'no-reply@taverai.com'),
        'password' => env_value('SMTP_PASSWORD', ''),
        'from_email' => env_value('SMTP_FROM_EMAIL', 'no-reply@taverai.com'),
        'from_name' => env_value('SMTP_FROM_NAME', 'Taverai'),
        'verify_peer' => env_bool('SMTP_VERIFY_PEER', false),
    ],
    'uploads' => [
        'dir' => env_value('UPLOADS_DIR', PUBLICROOT . '/uploads'),
        'public_base' => env_value('UPLOADS_PUBLIC_BASE', '/uploads'),
    ],
    'subscriptions' => [
        'provider' => 'apple',
        'environment' => $_ENV['APPLE_IAP_ENV'] ?? getenv('APPLE_IAP_ENV') ?: 'sandbox',
    ],
];
