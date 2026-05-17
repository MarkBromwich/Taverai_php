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

$db = Database::connect();

$schemaPath = dirname(__DIR__) . '/sql/mysql_schema.sql';
if (is_readable($schemaPath)) {
    echo "Applying base schema\n";
    applySqlFile($db, $schemaPath);
}

$db->exec('CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(191) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

$migrationDir = dirname(__DIR__) . '/sql/migrations';
$files = glob($migrationDir . '/*.sql') ?: [];
sort($files);

foreach ($files as $file) {
    $id = basename($file);
    $check = $db->prepare('SELECT id FROM schema_migrations WHERE id = :id LIMIT 1');
    $check->execute(['id' => $id]);
    if ($check->fetch()) {
        echo "Skipping {$id}\n";
        continue;
    }

    echo "Applying {$id}\n";
    try {
        foreach (sqlStatements($file) as $statement) {
            if (preg_match('/^ALTER\s+TABLE\s+users\s+ADD\s+COLUMN\s+role\b/i', $statement)) {
                $columnCheck = $db->prepare('
                    SELECT 1
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = :table
                      AND COLUMN_NAME = :column
                    LIMIT 1
                ');
                $columnCheck->execute(['table' => 'users', 'column' => 'role']);
                if ($columnCheck->fetch()) {
                    continue;
                }
            }

            $db->exec($statement);
        }
        $insert = $db->prepare('INSERT INTO schema_migrations (id) VALUES (:id)');
        $insert->execute(['id' => $id]);
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

echo "Migrations complete.\n";

function applySqlFile(PDO $db, string $file): void
{
    foreach (sqlStatements($file) as $statement) {
        $db->exec($statement);
    }
}

function sqlStatements(string $file): array
{
    $sql = file_get_contents($file);
    if (!is_string($sql) || trim($sql) === '') {
        return [];
    }

    return array_filter(array_map('trim', explode(';', $sql)));
}
