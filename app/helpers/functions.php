<?php

function load_env_files(string $root): void
{
    foreach ([$root . '/.env.local', $root . '/.env'] as $envPath) {
        if (!is_readable($envPath)) {
            continue;
        }

        foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }

            [$key, $value] = array_map('trim', explode('=', $line, 2));
            if ($key === '' || getenv($key) !== false) {
                continue;
            }

            $value = trim($value, "\"'");
            $_ENV[$key] = $value;
            putenv($key . '=' . $value);
        }
    }
}

function env_value(string $key, ?string $default = null): ?string
{
    $value = $_ENV[$key] ?? getenv($key);
    if ($value === false || $value === null) {
        return $default;
    }

    return (string) $value;
}

function env_required(string $key): string
{
    $value = env_value($key);
    if ($value === null || $value === '') {
        throw new RuntimeException("Missing required environment variable: {$key}");
    }

    return $value;
}

function env_bool(string $key, bool $default = false): bool
{
    $value = env_value($key);
    if ($value === null || $value === '') {
        return $default;
    }

    return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
}

function env_int(string $key, int $default): int
{
    $value = env_value($key);
    return is_numeric($value) ? (int) $value : $default;
}

function config(?string $key = null, $default = null)
{
    $config = $GLOBALS['app_config'] ?? [];

    if ($key === null) {
        return $config;
    }

    $segments = explode('.', $key);
    $value = $config;

    foreach ($segments as $segment) {
        if (!is_array($value) || !array_key_exists($segment, $value)) {
            return $default;
        }
        $value = $value[$segment];
    }

    return $value;
}

function public_base_url(): string
{
    $base = defined('BASE_URL') ? BASE_URL : '';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '/index.php';

    if ($base === '') {
        $scriptDir = str_replace('\\', '/', dirname($scriptName));
        $base = $scriptDir === '/' || $scriptDir === '.' ? '' : rtrim($scriptDir, '/');
    }

    return $base === '' ? '' : $base;
}

function base_url(string $path = ''): string
{
    $base = public_base_url();
    $trimmedPath = ltrim($path, '/');

    return $trimmedPath === ''
        ? ($base === '' ? '/' : $base . '/')
        : ($base === '' ? '/' . $trimmedPath : $base . '/' . $trimmedPath);
}

function route_url(string $path = ''): string
{
    $base = public_base_url();
    $script = $base === '' ? '/index.php' : $base . '/index.php';
    $trimmedPath = trim($path, '/');

    if ($trimmedPath === '') {
        return $script;
    }

    return $script . '?path=' . str_replace('%2F', '/', rawurlencode($trimmedPath));
}

function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function request_method(): string
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($method === 'POST' && isset($_POST['_method'])) {
        return strtoupper((string) $_POST['_method']);
    }

    if ($method === 'POST' && isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
        return strtoupper((string) $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
    }

    return $method;
}

function request_json(): array
{
    static $data = null;

    if ($data !== null) {
        return $data;
    }

    $raw = file_get_contents('php://input');
    if (is_string($raw) && strlen($raw) > 1024 * 1024) {
        response_json(['error' => 'Request body is too large.'], 413);
        exit;
    }
    $decoded = json_decode($raw ?: '{}', true);
    $data = is_array($decoded) ? $decoded : [];

    return $data;
}

function response_json(array $payload, int $status = 200, array $headers = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');

    foreach ($headers as $name => $value) {
        header($name . ': ' . $value);
    }

    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
}

function app_log(string $message, array $context = []): void
{
    $dir = dirname(__DIR__, 2) . '/storage/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    $line = json_encode([
        'time' => gmdate('c'),
        'message' => $message,
        'context' => $context,
    ], JSON_UNESCAPED_SLASHES);

    if (is_string($line)) {
        @file_put_contents($dir . '/app.log', $line . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function csrf_token(): string
{
    $token = $_SESSION['csrf_token'] ?? null;
    if (!is_string($token) || strlen($token) < 32) {
        $token = bin2hex(random_bytes(32));
        $_SESSION['csrf_token'] = $token;
    }

    return $token;
}

function verify_csrf_token(): bool
{
    $expected = $_SESSION['csrf_token'] ?? '';
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['_csrf'] ?? '');

    return is_string($expected)
        && is_string($provided)
        && $expected !== ''
        && hash_equals($expected, $provided);
}

function is_unsafe_method(string $method): bool
{
    return in_array(strtoupper($method), ['POST', 'PUT', 'PATCH', 'DELETE'], true);
}

function current_route_path(string $uri): string
{
    $path = $_GET['path'] ?? null;
    if (is_string($path) && $path !== '') {
        return $path[0] === '/' ? $path : '/' . $path;
    }

    $path = parse_url($uri, PHP_URL_PATH) ?: '/';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    $scriptDir = $scriptName ? str_replace('\\', '/', dirname($scriptName)) : '';

    if ($scriptName && $scriptName !== '/' && str_starts_with($path, $scriptName)) {
        $path = substr($path, strlen($scriptName)) ?: '/';
    }

    if ($scriptDir && $scriptDir !== '/' && $scriptDir !== '.' && str_starts_with($path, $scriptDir)) {
        $path = substr($path, strlen($scriptDir)) ?: '/';
    }

    return $path[0] === '/' ? $path : '/' . $path;
}

function current_user_id(): ?string
{
    $userId = $_SESSION['user_id'] ?? null;
    return is_string($userId) && $userId !== '' ? $userId : null;
}

function secure_image_upload(array $upload, string $prefix, int $maxBytes): array
{
    if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Image upload failed.');
    }

    $tmpPath = (string) ($upload['tmp_name'] ?? '');
    $size = (int) ($upload['size'] ?? 0);
    if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
        throw new RuntimeException('Invalid uploaded image.');
    }
    if ($size <= 0 || $size > $maxBytes) {
        throw new RuntimeException('Image file is too large.');
    }

    $info = @getimagesize($tmpPath);
    if (!is_array($info) || empty($info['mime'])) {
        throw new RuntimeException('Uploaded file is not a readable image.');
    }

    $mime = (string) $info['mime'];
    $allowed = [
        'image/jpeg' => '.jpg',
        'image/png' => '.png',
        'image/webp' => '.webp',
    ];
    if (!isset($allowed[$mime])) {
        throw new RuntimeException('Unsupported image type.');
    }

    $uploadsDir = config('uploads.dir');
    if (!is_string($uploadsDir) || $uploadsDir === '') {
        throw new RuntimeException('Uploads directory is not configured.');
    }
    if (!is_dir($uploadsDir) && !mkdir($uploadsDir, 0775, true) && !is_dir($uploadsDir)) {
        throw new RuntimeException('Failed to prepare upload storage.');
    }

    $filename = preg_replace('/[^a-z0-9_-]/i', '', $prefix) . '_' . time() . '_' . generate_id(8) . $allowed[$mime];
    $destination = rtrim($uploadsDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $filename;
    if (!move_uploaded_file($tmpPath, $destination)) {
        throw new RuntimeException('Failed to store image.');
    }
    @chmod($destination, 0644);

    return [
        'path' => $destination,
        'filename' => $filename,
        'url' => base_url(trim((string) config('uploads.public_base', '/uploads'), '/') . '/' . $filename),
        'mime' => $mime,
        'size' => $size,
        'width' => (int) ($info[0] ?? 0),
        'height' => (int) ($info[1] ?? 0),
    ];
}

function generate_id(int $bytes = 12): string
{
    return bin2hex(random_bytes($bytes));
}

function now_utc(): string
{
    return gmdate('Y-m-d H:i:s');
}
