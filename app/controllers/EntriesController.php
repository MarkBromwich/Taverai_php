<?php

class EntriesController extends Controller
{
    public function index(): void
    {
        $userId = $this->requireUserId();
        $entriesModel = $this->model('EntryModel');

        $date = trim((string) ($_GET['date'] ?? ''));
        if ($date !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $entries = $entriesModel->allForUserOnDate($userId, $date);
            $this->json(['entries' => $entries]);
            return;
        }

        $horizonDays = max(1, (int) ($_GET['horizonDays'] ?? 30));
        $entries = $entriesModel->allForUser($userId, $horizonDays);
        $this->json(['entries' => $entries]);
    }

    public function summary(): void
    {
        $userId = $this->requireUserId();
        $selectedDate = trim((string) ($_GET['date'] ?? ''));
        if ($selectedDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $selectedDate)) {
            $selectedDate = gmdate('Y-m-d');
        }

        $entries = $this->model('EntryModel')->allForUser($userId, 365);
        $plans = $this->model('PlanModel')->allForUser($userId);
        $primaryPlan = $plans[0] ?? null;
        $user = $this->model('UserModel')->findWithPreferences($userId);
        $dailyGoal = isset($user['daily_calorie_goal']) && $user['daily_calorie_goal'] !== null
            ? (int) $user['daily_calorie_goal']
            : null;
        $calorieTarget = $this->resolveCalorieTarget($primaryPlan, $dailyGoal);

        $days = $this->groupEntriesByDate($entries, $primaryPlan, $calorieTarget);
        $streakDays = $this->computeStreakDays(array_keys($days));
        $selectedDay = $days[$selectedDate] ?? $this->emptyDaySummary($selectedDate);

        $week = $this->collectWindowDays($days, $selectedDate, 7);
        $month = $this->collectWindowDays($days, $selectedDate, 30);

        $this->json([
            'user' => [
                'firstName' => $user['first_name'] ?? null,
                'lastName' => $user['last_name'] ?? null,
                'username' => $user['username'] ?? null,
                'avatarUrl' => $user['avatar_url'] ?? null,
                'dailyCalorieGoal' => $dailyGoal,
            ],
            'plan' => $primaryPlan,
            'calorieTarget' => $calorieTarget,
            'selectedDate' => $selectedDate,
            'streakDays' => $streakDays,
            'selectedDay' => $selectedDay,
            'week' => $this->windowMetrics($week),
            'month' => $this->windowMetrics($month),
            'calendar' => $this->buildCalendar($days, $selectedDate, 28),
        ]);
    }

    public function store(): void
    {
        $userId = $this->requireUserId();
        $rateLimiter = $this->model('RateLimitModel');
        $attempt = $rateLimiter->check('entries-ai:' . $userId . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 30, 10 * 60 * 1000);

        if (!$attempt['ok']) {
            $this->json(['error' => 'Entry analysis limit reached. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        $body = $this->body();

        $text = trim((string) ($body['text'] ?? ''));
        if ($text === '') {
            $this->json(['error' => 'text required'], 400);
            return;
        }
        if (strlen($text) > 2000) {
            $this->json(['error' => 'Meal text is too long.'], 400);
            return;
        }

        $createdAt = null;
        if (!empty($body['date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $body['date'])) {
            $createdAt = $body['date'] . ' ' . $this->requestTime((string) ($body['time'] ?? ''));
        }

        $incomingParsed = isset($body['parsed']) && is_array($body['parsed']) ? $body['parsed'] : null;
        $calories = isset($body['calories']) && $body['calories'] !== '' ? (float) $body['calories'] : null;
        $proteinG = isset($body['proteinG']) && $body['proteinG'] !== '' ? (float) $body['proteinG'] : null;
        $carbsG = isset($body['carbsG']) && $body['carbsG'] !== '' ? (float) $body['carbsG'] : null;
        $fatG = isset($body['fatG']) && $body['fatG'] !== '' ? (float) $body['fatG'] : null;

        $hasNutrition = $calories !== null || $proteinG !== null || $carbsG !== null || $fatG !== null;
        $aiParsed = null;

        if (!$hasNutrition) {
            $aiParsed = $this->parseNutritionFromText($text);
            if (!is_array($aiParsed)) {
                $aiParsed = NutritionEstimator::fromText($text);
            }
            if (is_array($aiParsed)) {
                $calories = isset($aiParsed['calories']) ? (float) $aiParsed['calories'] : null;
                $proteinG = isset($aiParsed['proteinG']) ? (float) $aiParsed['proteinG'] : null;
                $carbsG = isset($aiParsed['carbsG']) ? (float) $aiParsed['carbsG'] : null;
                $fatG = isset($aiParsed['fatG']) ? (float) $aiParsed['fatG'] : null;
                $hasNutrition = $calories !== null || $proteinG !== null || $carbsG !== null || $fatG !== null;
            }
        }

        $parsedPayload = null;
        if ($hasNutrition || $incomingParsed !== null || $aiParsed !== null) {
            $parsedPayload = $incomingParsed ?? [];
            if ($aiParsed !== null) {
                $parsedPayload = array_merge($parsedPayload, $aiParsed);
            }

            $parsedPayload['calories'] = $calories ?? 0;
            $parsedPayload['macros'] = [
                'proteinG' => $proteinG ?? 0,
                'carbsG' => $carbsG ?? 0,
                'fatG' => $fatG ?? 0,
            ];
        }

        $entry = $this->model('EntryModel')->createForUser($userId, [
            'text' => $text,
            'createdAt' => $createdAt ?? now_utc(),
            'calories' => $calories,
            'proteinG' => $proteinG,
            'carbsG' => $carbsG,
            'fatG' => $fatG,
            'parsed' => $parsedPayload,
        ]);

        if ($entry === null) {
            $this->json(['error' => 'Failed to save entry'], 500);
            return;
        }

        $entry = $this->syncScoresForEntry($userId, $entry);
        $this->json(['entry' => $entry], 201);
    }

    public function update(): void
    {
        $userId = $this->requireUserId();
        $body = $this->body();
        $id = trim((string) ($body['id'] ?? ''));
        $text = trim((string) ($body['text'] ?? ''));

        if ($id === '') {
            $this->json(['error' => 'id is required'], 400);
            return;
        }

        if ($text === '') {
            $this->json(['error' => 'text is required'], 400);
            return;
        }
        if (strlen($text) > 2000) {
            $this->json(['error' => 'Meal text is too long.'], 400);
            return;
        }

        $existing = $this->model('EntryModel')->findForUser($userId, $id);
        if ($existing === null) {
            $this->json(['error' => 'Entry not found'], 404);
            return;
        }

        $calories = isset($body['calories']) && $body['calories'] !== '' ? (float) $body['calories'] : null;
        $proteinG = isset($body['proteinG']) && $body['proteinG'] !== '' ? (float) $body['proteinG'] : null;
        $carbsG = isset($body['carbsG']) && $body['carbsG'] !== '' ? (float) $body['carbsG'] : null;
        $fatG = isset($body['fatG']) && $body['fatG'] !== '' ? (float) $body['fatG'] : null;

        $parsed = isset($existing['parsed']) && is_array($existing['parsed']) ? $existing['parsed'] : [];
        $parsed['calories'] = $calories ?? 0;
        $parsed['macros'] = [
            'proteinG' => $proteinG ?? 0,
            'carbsG' => $carbsG ?? 0,
            'fatG' => $fatG ?? 0,
        ];

        $updated = $this->model('EntryModel')->updateForUser($userId, $id, [
            'text' => $text,
            'calories' => $calories,
            'proteinG' => $proteinG,
            'carbsG' => $carbsG,
            'fatG' => $fatG,
            'parsed' => $parsed,
        ]);

        if ($updated === null) {
            $this->json(['error' => 'Failed to update entry'], 500);
            return;
        }

        $updated = $this->syncScoresForEntry($userId, $updated);
        $this->json(['entry' => $updated]);
    }

    public function destroy(): void
    {
        $userId = $this->requireUserId();
        $id = trim((string) ($_GET['id'] ?? ''));

        if ($id === '') {
            $this->json(['error' => 'id required'], 400);
            return;
        }

        if (!$this->model('EntryModel')->deleteForUser($userId, $id)) {
            $this->json(['error' => 'Entry not found'], 404);
            return;
        }

        $this->json(['ok' => true]);
    }

    private function parseNutritionFromText(string $text): ?array
    {
        $client = new OpenAIClient();
        if (!$client->isConfigured()) {
            return null;
        }

        $model = (string) config('openai.meal_model', 'gpt-4o-mini');
        $response = $client->chatJson(
            $model,
            'You are a nutrition estimation AI. Return only valid JSON with realistic calorie and macro estimates for the full food text. Be conservative and reasonable.',
            'Analyze this food text and return JSON with keys: title, calories, proteinG, carbsG, fatG, sugarG, fiberG, satFatG, confidence, notes, items. Food text: "' . $text . '"'
        );

        if (!is_array($response)) {
            return null;
        }

        return [
            'title' => isset($response['title']) && is_string($response['title']) ? trim($response['title']) : null,
            'calories' => $this->numberOrNull($response['calories'] ?? null),
            'proteinG' => $this->numberOrNull($response['proteinG'] ?? null),
            'carbsG' => $this->numberOrNull($response['carbsG'] ?? null),
            'fatG' => $this->numberOrNull($response['fatG'] ?? null),
            'sugarG' => $this->numberOrNull($response['sugarG'] ?? null),
            'fiberG' => $this->numberOrNull($response['fiberG'] ?? null),
            'satFatG' => $this->numberOrNull($response['satFatG'] ?? null),
            'confidence' => $this->numberOrNull($response['confidence'] ?? null),
            'notes' => isset($response['notes']) && is_string($response['notes']) ? $response['notes'] : null,
            'items' => isset($response['items']) && is_array($response['items']) ? $response['items'] : null,
            'source' => 'textAI',
        ];
    }

    private function requestTime(string $time): string
    {
        return preg_match('/^\d{2}:\d{2}:\d{2}$/', $time) ? $time : date('H:i:s');
    }

    private function numberOrNull($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        $num = is_numeric($value) ? (float) $value : null;
        return $num !== null && is_finite($num) ? $num : null;
    }

    private function syncScoresForEntry(string $userId, array $entry): array
    {
        $plans = $this->model('PlanModel')->allForUser($userId);
        if ($plans === []) {
            return $entry;
        }

        $user = $this->model('UserModel')->findWithPreferences($userId);
        $dailyGoal = isset($user['daily_calorie_goal']) && $user['daily_calorie_goal'] !== null
            ? (int) $user['daily_calorie_goal']
            : null;

        $this->model('EntryScoreModel')->syncForEntry($entry['id'], $plans, $entry, $dailyGoal);

        $fresh = $this->model('EntryModel')->findForUser($userId, $entry['id']);
        return $fresh ?? $entry;
    }

    private function groupEntriesByDate(array $entries, ?array $preferredPlan, ?int $dailyGoal): array
    {
        $days = [];
        $preferredPlanId = $preferredPlan['id'] ?? null;

        foreach ($entries as $entry) {
            $date = substr((string) ($entry['createdAt'] ?? ''), 0, 10);
            if ($date === '') {
                continue;
            }

            if (!isset($days[$date])) {
                $days[$date] = $this->emptyDaySummary($date);
            }

            $days[$date]['entriesCount'] += 1;
            $days[$date]['entries'][] = $entry;
            $days[$date]['foods'][] = (string) ($entry['text'] ?? 'Entry');
            $days[$date]['totals']['calories'] += (float) ($entry['calories'] ?? 0);
            $days[$date]['totals']['proteinG'] += (float) ($entry['proteinG'] ?? 0);
            $days[$date]['totals']['carbsG'] += (float) ($entry['carbsG'] ?? 0);
            $days[$date]['totals']['fatG'] += (float) ($entry['fatG'] ?? 0);

            $score = $this->preferredScore($entry, $preferredPlanId);
            if ($score === null && $preferredPlan !== null) {
                $score = MealQualityScoring::apply($preferredPlan, $entry, DietScoring::scorePlan($preferredPlan, $entry, $dailyGoal));
            }
            if ($score !== null) {
                $days[$date]['scoreCount'] += 1;
                $days[$date]['scoreTotal'] += $score['score'];
                $days[$date]['scoreReasons'] = array_merge(
                    $days[$date]['scoreReasons'],
                    $score['details']['reasons'] ?? []
                );
            }
        }

        foreach ($days as $date => $day) {
            $days[$date]['totals']['calories'] = (int) round($day['totals']['calories']);
            $days[$date]['totals']['proteinG'] = round($day['totals']['proteinG'], 1);
            $days[$date]['totals']['carbsG'] = round($day['totals']['carbsG'], 1);
            $days[$date]['totals']['fatG'] = round($day['totals']['fatG'], 1);
            $days[$date]['score'] = $day['scoreCount'] > 0
                ? (int) round($day['scoreTotal'] / $day['scoreCount'])
                : null;
            $days[$date]['reasons'] = array_values(array_slice(array_unique(array_filter($day['scoreReasons'])), 0, 3));
            unset($days[$date]['scoreCount'], $days[$date]['scoreTotal'], $days[$date]['scoreReasons']);
        }

        ksort($days);
        return $days;
    }

    private function preferredScore(array $entry, ?string $preferredPlanId): ?array
    {
        $scores = isset($entry['scores']) && is_array($entry['scores']) ? $entry['scores'] : [];
        if ($scores === []) {
            return null;
        }

        if ($preferredPlanId !== null) {
            foreach ($scores as $score) {
                if (($score['plan']['id'] ?? null) === $preferredPlanId) {
                    return $score;
                }
            }
        }

        usort($scores, static function (array $a, array $b): int {
            return (int) ($b['score'] ?? 0) <=> (int) ($a['score'] ?? 0);
        });

        return $scores[0] ?? null;
    }

    private function emptyDaySummary(string $date): array
    {
        return [
            'date' => $date,
            'entriesCount' => 0,
            'foods' => [],
            'entries' => [],
            'totals' => [
                'calories' => 0,
                'proteinG' => 0,
                'carbsG' => 0,
                'fatG' => 0,
            ],
            'score' => null,
            'reasons' => [],
            'scoreCount' => 0,
            'scoreTotal' => 0,
            'scoreReasons' => [],
        ];
    }

    private function resolveCalorieTarget(?array $plan, ?int $dailyGoal): ?int
    {
        if ($dailyGoal !== null && $dailyGoal > 0) {
            return $dailyGoal;
        }

        $config = is_array($plan['config'] ?? null) ? $plan['config'] : [];
        $target = $config['targetCalories'] ?? null;
        if (is_numeric($target) && (float) $target > 0) {
            return (int) round((float) $target);
        }

        return null;
    }

    private function computeStreakDays(array $dayKeys): int
    {
        if ($dayKeys === []) {
            return 0;
        }

        $set = array_fill_keys($dayKeys, true);
        $streak = 0;
        $cursor = new DateTimeImmutable('now', new DateTimeZone('UTC'));

        while (isset($set[$cursor->format('Y-m-d')])) {
            $streak += 1;
            $cursor = $cursor->modify('-1 day');
        }

        return $streak;
    }

    private function collectWindowDays(array $days, string $anchorDate, int $span): array
    {
        $window = [];
        $anchor = new DateTimeImmutable($anchorDate, new DateTimeZone('UTC'));

        for ($offset = 0; $offset < $span; $offset++) {
            $date = $anchor->modify('-' . $offset . ' day')->format('Y-m-d');
            if (isset($days[$date])) {
                $window[] = $days[$date];
            }
        }

        return $window;
    }

    private function windowMetrics(array $days): array
    {
        $scoreDays = array_values(array_filter($days, static fn(array $day): bool => $day['score'] !== null));
        $scoreTotal = array_reduce($scoreDays, static fn(int $carry, array $day): int => $carry + (int) $day['score'], 0);
        $calorieTotal = array_reduce($days, static fn(int $carry, array $day): int => $carry + (int) $day['totals']['calories'], 0);

        return [
            'loggedDays' => count($days),
            'scoredDays' => count($scoreDays),
            'avgScore' => $scoreDays !== [] ? (int) round($scoreTotal / count($scoreDays)) : null,
            'avgCalories' => $days !== [] ? (int) round($calorieTotal / count($days)) : null,
        ];
    }

    private function buildCalendar(array $days, string $anchorDate, int $span): array
    {
        $anchor = new DateTimeImmutable($anchorDate, new DateTimeZone('UTC'));
        $items = [];

        for ($offset = $span - 1; $offset >= 0; $offset--) {
            $date = $anchor->modify('-' . $offset . ' day')->format('Y-m-d');
            $day = $days[$date] ?? $this->emptyDaySummary($date);
            $items[] = [
                'date' => $date,
                'entriesCount' => $day['entriesCount'],
                'calories' => $day['totals']['calories'],
                'score' => $day['score'],
                'level' => $this->calendarLevel($day),
            ];
        }

        return $items;
    }

    private function calendarLevel(array $day): string
    {
        if (($day['entriesCount'] ?? 0) <= 0) {
            return 'empty';
        }

        $score = $day['score'];
        if ($score === null) {
            return 'logged';
        }

        if ($score >= 85) {
            return 'great';
        }

        if ($score >= 70) {
            return 'good';
        }

        if ($score >= 55) {
            return 'fair';
        }

        return 'off';
    }
}
