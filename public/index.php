<?php

declare(strict_types=1);

error_reporting(E_ALL);

$isLocal = isset($_SERVER['HTTP_HOST']) && str_contains((string) $_SERVER['HTTP_HOST'], 'localhost');
ini_set('display_errors', $isLocal ? '1' : '0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');

$configuredRoot = $_ENV['TAVERAI_ROOT'] ?? getenv('TAVERAI_ROOT') ?: null;
$rootCandidates = array_filter([
    is_string($configuredRoot) && $configuredRoot !== '' ? $configuredRoot : null,
    dirname(__DIR__),
    dirname(__DIR__, 2) . '/taverai_app',
    __DIR__,
]);

$projectRoot = null;
foreach ($rootCandidates as $candidate) {
    $candidate = rtrim((string) $candidate, DIRECTORY_SEPARATOR);
    if (
        is_file($candidate . '/app/controllers/AIController.php')
        && is_file($candidate . '/app/helpers/functions.php')
        && is_file($candidate . '/config/routes.php')
    ) {
        $projectRoot = $candidate;
        break;
    }
}

if ($projectRoot === null) {
    http_response_code(500);
    echo 'Taverai app files were not found.';
    exit;
}

define('TAVERAI_ROOT', $projectRoot);
define('TAVERAI_PUBLICROOT', __DIR__);

require_once TAVERAI_ROOT . '/app/helpers/functions.php';
load_env_files(TAVERAI_ROOT);

$appConfig = require TAVERAI_ROOT . '/config/app.php';
$dbConfigPath = TAVERAI_ROOT . '/config/database.php';
$dbConfig = file_exists($dbConfigPath)
    ? require $dbConfigPath
    : require TAVERAI_ROOT . '/config/database.php.example';

$GLOBALS['app_config'] = $appConfig;
$GLOBALS['db_config'] = $dbConfig;

session_name(config('session.cookie_name', 'taveri_session'));
session_set_cookie_params([
    'lifetime' => (int) config('session.lifetime', 60 * 60 * 24 * 30),
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => !$isLocal,
]);
session_start();
csrf_token();

spl_autoload_register(function ($class) {
    $baseDir = TAVERAI_ROOT . '/app/';
    $paths = [
        $baseDir . 'core/' . $class . '.php',
        $baseDir . 'controllers/' . $class . '.php',
        $baseDir . 'models/' . $class . '.php',
    ];

    foreach ($paths as $path) {
        if (file_exists($path)) {
            require_once $path;
            return;
        }
    }
});

try {
    $method = request_method();
    $routePath = current_route_path($_SERVER['REQUEST_URI'] ?? '/');
    $csrfExempt = in_array($routePath, ['/api/subscription/apple/notifications'], true);
    if (!$csrfExempt && str_starts_with($routePath, '/api/') && is_unsafe_method($method) && !verify_csrf_token()) {
        response_json(['error' => 'Invalid security token. Refresh the page and try again.'], 419);
        exit;
    }

    $router = new Router();
    require TAVERAI_ROOT . '/config/routes.php';
    $router->dispatch($method, $_SERVER['REQUEST_URI'] ?? '/');
} catch (Throwable $e) {
    app_log('Unhandled exception', [
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'path' => $_SERVER['REQUEST_URI'] ?? '',
    ]);
    http_response_code(500);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode([
        'error' => 'Server error',
        'message' => $isLocal ? $e->getMessage() : 'An unexpected error occurred.',
    ], JSON_UNESCAPED_SLASHES);
}
