<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/helpers/functions.php';
load_env_files(dirname(__DIR__));

$appConfig = require dirname(__DIR__) . '/config/app.php';
$dbConfigPath = dirname(__DIR__) . '/config/database.php';
$dbConfig = file_exists($dbConfigPath)
    ? require $dbConfigPath
    : require dirname(__DIR__) . '/config/database.php.example';

$GLOBALS['app_config'] = $appConfig;
$GLOBALS['db_config'] = $dbConfig;

spl_autoload_register(function ($class) {
    $baseDir = dirname(__DIR__) . '/app/';
    foreach ([
        $baseDir . 'core/' . $class . '.php',
        $baseDir . 'models/' . $class . '.php',
    ] as $path) {
        if (file_exists($path)) {
            require_once $path;
            return;
        }
    }
});

$email = strtolower(trim((string) ($argv[1] ?? '')));
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Usage: php scripts/makeAdmin.php user@example.com\n");
    exit(1);
}

$db = Database::connect();
$stmt = $db->prepare('UPDATE users SET role = :role WHERE username = :email');
$stmt->execute([
    'role' => 'admin',
    'email' => $email,
]);

if ($stmt->rowCount() < 1) {
    fwrite(STDERR, "No user found for {$email}\n");
    exit(1);
}

echo "{$email} is now an admin.\n";
