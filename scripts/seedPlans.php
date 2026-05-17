<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/helpers/functions.php';
load_env_files(dirname(__DIR__));

$GLOBALS['app_config'] = require dirname(__DIR__) . '/config/app.php';
$GLOBALS['db_config'] = file_exists(dirname(__DIR__) . '/config/database.php')
    ? require dirname(__DIR__) . '/config/database.php'
    : require dirname(__DIR__) . '/config/database.php.example';

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

$seedPath = dirname(__DIR__) . '/sql/plan_templates_seed.sql';
$sql = file_get_contents($seedPath);
if (!is_string($sql) || trim($sql) === '') {
    fwrite(STDERR, "Plan template seed file is missing or empty.\n");
    exit(1);
}

$db = Database::connect();
foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
    $db->exec($statement);
}

echo "Plan templates seeded.\n";
