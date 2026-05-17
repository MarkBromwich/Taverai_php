<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/helpers/functions.php';

$GLOBALS['app_config'] = require dirname(__DIR__) . '/config/app.php';
$GLOBALS['db_config'] = file_exists(dirname(__DIR__) . '/config/database.php')
    ? require dirname(__DIR__) . '/config/database.php'
    : require dirname(__DIR__) . '/config/database.php.example';

spl_autoload_register(function (string $class): void {
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
$users = $db->query('SELECT id FROM users ORDER BY created_at ASC')->fetchAll() ?: [];
$entryModel = new EntryModel();
$planModel = new PlanModel();
$scoreModel = new EntryScoreModel();
$rescored = 0;

foreach ($users as $user) {
    $userId = (string) $user['id'];
    $plans = $planModel->allForUser($userId);
    if ($plans === []) {
        continue;
    }

    $userStmt = $db->prepare('SELECT daily_calorie_goal FROM users WHERE id = :id LIMIT 1');
    $userStmt->execute(['id' => $userId]);
    $dailyGoal = $userStmt->fetchColumn();
    $dailyGoal = $dailyGoal !== false && $dailyGoal !== null ? (int) $dailyGoal : null;

    $entries = $entryModel->allForUser($userId, 3650);
    foreach ($entries as $entry) {
        $scoreModel->syncForEntry((string) $entry['id'], $plans, $entry, $dailyGoal);
        $rescored++;
    }
}

echo "Rescored {$rescored} entries with meal quality adjustments.\n";
