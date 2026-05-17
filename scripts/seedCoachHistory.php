<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/helpers/functions.php';
load_env_files(dirname(__DIR__));

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
$user = $db->query('SELECT id FROM users ORDER BY created_at DESC LIMIT 1')->fetch();
if (!$user) {
    fwrite(STDERR, "No users found.\n");
    exit(1);
}

$userId = (string) $user['id'];
$plans = (new PlanModel())->allForUser($userId);
if ($plans === []) {
    $plan = (new PlanModel())->createForUser($userId, 'Mediterranean Diet', 'MEDITERRANEAN', [
        'templateSlug' => 'mediterranean',
    ]);
    $plans = $plan ? [$plan] : [];
}

$deleteScores = $db->prepare(
    "DELETE s FROM entry_plan_scores s
     INNER JOIN food_entries e ON e.id = s.entry_id
     WHERE e.user_id = :user_id AND JSON_UNQUOTE(JSON_EXTRACT(e.parsed, '$.source')) = 'coachDemo'"
);
$deleteScores->execute(['user_id' => $userId]);

$deleteEntries = $db->prepare(
    "DELETE FROM food_entries
     WHERE user_id = :user_id AND JSON_UNQUOTE(JSON_EXTRACT(parsed, '$.source')) = 'coachDemo'"
);
$deleteEntries->execute(['user_id' => $userId]);

$samples = [
    ['daysAgo' => 14, 'time' => '08:05:00', 'text' => 'Greek yogurt with berries and walnuts', 'cal' => 410, 'p' => 24, 'c' => 42, 'f' => 16, 'items' => ['yogurt', 'berries', 'walnuts']],
    ['daysAgo' => 14, 'time' => '13:10:00', 'text' => 'Grilled chicken salad with olive oil vinaigrette', 'cal' => 520, 'p' => 42, 'c' => 28, 'f' => 26, 'items' => ['chicken', 'greens', 'olive oil']],
    ['daysAgo' => 13, 'time' => '19:20:00', 'text' => 'Salmon, brown rice, and roasted vegetables', 'cal' => 690, 'p' => 45, 'c' => 62, 'f' => 28, 'items' => ['salmon', 'rice', 'vegetables']],
    ['daysAgo' => 12, 'time' => '12:25:00', 'text' => 'Turkey sandwich with chips', 'cal' => 760, 'p' => 36, 'c' => 88, 'f' => 30, 'items' => ['turkey', 'bread', 'chips']],
    ['daysAgo' => 11, 'time' => '08:30:00', 'text' => 'Oatmeal with banana and peanut butter', 'cal' => 480, 'p' => 15, 'c' => 67, 'f' => 18, 'items' => ['oats', 'banana', 'peanut butter']],
    ['daysAgo' => 11, 'time' => '18:45:00', 'text' => 'Pasta with tomato sauce and side salad', 'cal' => 740, 'p' => 22, 'c' => 110, 'f' => 21, 'items' => ['pasta', 'tomato', 'salad']],
    ['daysAgo' => 10, 'time' => '13:00:00', 'text' => 'Lentil soup with whole grain bread', 'cal' => 560, 'p' => 25, 'c' => 82, 'f' => 12, 'items' => ['lentils', 'bread']],
    ['daysAgo' => 9, 'time' => '20:05:00', 'text' => 'Burger and fries', 'cal' => 980, 'p' => 35, 'c' => 92, 'f' => 52, 'items' => ['burger', 'fries']],
    ['daysAgo' => 8, 'time' => '07:55:00', 'text' => 'Two eggs with avocado toast', 'cal' => 520, 'p' => 22, 'c' => 42, 'f' => 30, 'items' => ['eggs', 'avocado', 'toast']],
    ['daysAgo' => 7, 'time' => '18:30:00', 'text' => 'Chicken quinoa bowl with vegetables', 'cal' => 650, 'p' => 44, 'c' => 66, 'f' => 20, 'items' => ['chicken', 'quinoa', 'vegetables']],
    ['daysAgo' => 6, 'time' => '12:40:00', 'text' => 'Tuna pita with cucumber salad', 'cal' => 510, 'p' => 38, 'c' => 52, 'f' => 15, 'items' => ['tuna', 'pita', 'cucumber']],
    ['daysAgo' => 5, 'time' => '19:00:00', 'text' => 'Vegetable stir fry with tofu and rice', 'cal' => 620, 'p' => 28, 'c' => 84, 'f' => 18, 'items' => ['tofu', 'rice', 'vegetables']],
    ['daysAgo' => 4, 'time' => '08:15:00', 'text' => 'Smoothie with spinach, berries, and protein', 'cal' => 430, 'p' => 32, 'c' => 48, 'f' => 10, 'items' => ['spinach', 'berries', 'protein']],
    ['daysAgo' => 3, 'time' => '18:50:00', 'text' => 'Pizza slices and soda', 'cal' => 890, 'p' => 30, 'c' => 112, 'f' => 34, 'items' => ['pizza', 'soda']],
    ['daysAgo' => 2, 'time' => '13:15:00', 'text' => 'Mediterranean chickpea bowl', 'cal' => 610, 'p' => 23, 'c' => 78, 'f' => 23, 'items' => ['chickpeas', 'greens', 'olive oil']],
    ['daysAgo' => 1, 'time' => '19:10:00', 'text' => 'Grilled shrimp tacos with slaw', 'cal' => 570, 'p' => 36, 'c' => 58, 'f' => 19, 'items' => ['shrimp', 'tortilla', 'slaw']],
];

$entryModel = new EntryModel();
$scoreModel = new EntryScoreModel();
$inserted = 0;

foreach ($samples as $sample) {
    $date = (new DateTimeImmutable('today', new DateTimeZone('UTC')))
        ->modify('-' . (int) $sample['daysAgo'] . ' days')
        ->format('Y-m-d');

    $parsed = [
        'source' => 'coachDemo',
        'calories' => $sample['cal'],
        'macros' => [
            'proteinG' => $sample['p'],
            'carbsG' => $sample['c'],
            'fatG' => $sample['f'],
        ],
        'items' => array_map(static fn(string $name): array => ['name' => $name, 'tags' => [$name]], $sample['items']),
        'notes' => 'Historical demo data for Coach trend work.',
    ];

    $entry = $entryModel->createForUser($userId, [
        'text' => $sample['text'],
        'createdAt' => $date . ' ' . $sample['time'],
        'calories' => $sample['cal'],
        'proteinG' => $sample['p'],
        'carbsG' => $sample['c'],
        'fatG' => $sample['f'],
        'parsed' => $parsed,
    ]);

    if ($entry !== null) {
        $scoreModel->syncForEntry($entry['id'], $plans, $entry, null);
        $inserted++;
    }
}

echo "Seeded {$inserted} Coach demo entries for user {$userId}.\n";
