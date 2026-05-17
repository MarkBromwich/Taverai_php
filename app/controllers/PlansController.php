<?php

class PlansController extends Controller
{
    public function templates(): void
    {
        $plans = $this->model('PlanModel');
        $this->json(['templates' => $plans->templates()]);
    }

    public function index(): void
    {
        $userId = $this->requireUserId();
        $plans = $this->model('PlanModel');
        $this->json(['plans' => $plans->allForUser($userId)]);
    }

    public function suggest(): void
    {
        $userId = $this->requireUserId();
        $body = $this->body();
        $goals = trim((string) ($body['goals'] ?? ''));
        if ($goals === '') {
            $this->json(['error' => 'Describe your goals first.'], 400);
            return;
        }
        if (strlen($goals) > 2000) {
            $this->json(['error' => 'Personal goals are too long.'], 400);
            return;
        }

        $user = $this->model('UserModel')->findWithPreferences($userId);
        $dailyGoal = isset($user['daily_calorie_goal']) && $user['daily_calorie_goal'] !== null ? (int) $user['daily_calorie_goal'] : null;
        $draft = isset($body['draft']) && is_array($body['draft']) ? $body['draft'] : [];
        $fallback = $this->fallbackSuggestion($goals, $dailyGoal, $draft);

        $client = new OpenAIClient();
        if (!$client->isConfigured()) {
            $this->json(['suggestion' => $fallback, 'source' => 'fallback']);
            return;
        }

        $response = $client->chatJson(
            (string) config('openai.coach_model', 'gpt-4.1-mini'),
            'You help users create practical diet macro plans. Return strict JSON only. Do not provide medical diagnosis or extreme calorie advice.',
            implode("\n", [
                'Create a custom diet-plan suggestion from the user goals.',
                'Return keys: name, targetCalories, carbMin, carbMax, proteinMin, proteinMax, fatMin, fatMax, rationale.',
                'Macro values are percentages from 0 to 100. Keep ranges practical and make carbs/protein/fat ranges sensible for scoring.',
                'If currentGoal is provided, use it unless the user clearly asks for a different phase.',
                'Use the draft as the starting point. Change only values that should move based on the user goals.',
                'Keep calories between 1200 and 4500 if you provide a target.',
                'currentGoal: ' . ($dailyGoal ?? 'not set'),
                'draft: ' . json_encode($draft, JSON_UNESCAPED_SLASHES),
                'goals: ' . $goals,
            ])
        );

        $suggestion = is_array($response) ? $this->normalizeSuggestion($response, $fallback) : $fallback;
        $this->json(['suggestion' => $suggestion, 'source' => is_array($response) ? 'ai' : 'fallback']);
    }

    public function store(): void
    {
        $userId = $this->requireUserId();
        $body = $this->body();
        $plans = $this->model('PlanModel');

        $templateSlug = trim((string) ($body['templateSlug'] ?? ''));
        if ($templateSlug !== '') {
            $plan = $plans->createFromTemplateSlug($userId, $templateSlug);
            if ($plan === null) {
                $this->json(['error' => 'Template not found'], 404);
                return;
            }

            $this->backfillPlanScores($userId, $plan);
            $this->json(['plan' => $plan], 201);
            return;
        }

        $name = trim((string) ($body['name'] ?? ''));
        $type = trim((string) ($body['type'] ?? ''));
        $config = $body['config'] ?? null;

        if ($name === '') {
            $this->json(['error' => 'name required'], 400);
            return;
        }
        if (strlen($name) > 191 || strlen($type) > 50) {
            $this->json(['error' => 'Plan details are too long.'], 400);
            return;
        }

        if ($type === '') {
            $this->json(['error' => 'type required'], 400);
            return;
        }

        $plan = $plans->createForUser($userId, $name, $type, $config);

        if ($plan === null) {
            $this->json(['error' => 'Failed to save plan'], 500);
            return;
        }

        $this->backfillPlanScores($userId, $plan);
        $this->json(['plan' => $plan], 201);
    }

    public function destroy(): void
    {
        $userId = $this->requireUserId();
        $id = trim((string) ($_GET['id'] ?? ''));

        if ($id === '') {
            $this->json(['error' => 'id required'], 400);
            return;
        }

        $plans = $this->model('PlanModel');
        if (!$plans->deleteForUser($userId, $id)) {
            $this->json(['error' => 'Not found'], 404);
            return;
        }

        $this->json(['ok' => true]);
    }

    private function normalizeSuggestion(array $raw, array $fallback): array
    {
        $suggestion = [
            'name' => trim((string) ($raw['name'] ?? '')) ?: $fallback['name'],
            'targetCalories' => $this->boundedInt($raw['targetCalories'] ?? null, 1200, 4500, $fallback['targetCalories']),
            'carbMin' => $this->boundedInt($raw['carbMin'] ?? null, 0, 100, $fallback['carbMin']),
            'carbMax' => $this->boundedInt($raw['carbMax'] ?? null, 0, 100, $fallback['carbMax']),
            'proteinMin' => $this->boundedInt($raw['proteinMin'] ?? null, 0, 100, $fallback['proteinMin']),
            'proteinMax' => $this->boundedInt($raw['proteinMax'] ?? null, 0, 100, $fallback['proteinMax']),
            'fatMin' => $this->boundedInt($raw['fatMin'] ?? null, 0, 100, $fallback['fatMin']),
            'fatMax' => $this->boundedInt($raw['fatMax'] ?? null, 0, 100, $fallback['fatMax']),
            'rationale' => trim((string) ($raw['rationale'] ?? '')) ?: $fallback['rationale'],
        ];

        foreach ([['carbMin', 'carbMax'], ['proteinMin', 'proteinMax'], ['fatMin', 'fatMax']] as [$min, $max]) {
            if ($suggestion[$min] > $suggestion[$max]) {
                [$suggestion[$min], $suggestion[$max]] = [$suggestion[$max], $suggestion[$min]];
            }
        }

        return $suggestion;
    }

    private function fallbackSuggestion(string $goals, ?int $dailyGoal, array $draft = []): array
    {
        $lower = strtolower($goals);
        $draftCalories = isset($draft['targetCalories']) && is_numeric($draft['targetCalories']) && (float) $draft['targetCalories'] > 0
            ? (int) round((float) $draft['targetCalories'])
            : null;
        $target = $dailyGoal ?: ($draftCalories ?: 2000);
        $suggestion = [
            'name' => isset($draft['name']) && is_string($draft['name']) && trim($draft['name']) !== '' ? trim($draft['name']) : 'Balanced Custom Plan',
            'targetCalories' => $target,
            'carbMin' => $this->boundedInt($draft['carbMin'] ?? null, 0, 100, 35),
            'carbMax' => $this->boundedInt($draft['carbMax'] ?? null, 0, 100, 45),
            'proteinMin' => $this->boundedInt($draft['proteinMin'] ?? null, 0, 100, 25),
            'proteinMax' => $this->boundedInt($draft['proteinMax'] ?? null, 0, 100, 35),
            'fatMin' => $this->boundedInt($draft['fatMin'] ?? null, 0, 100, 20),
            'fatMax' => $this->boundedInt($draft['fatMax'] ?? null, 0, 100, 30),
            'rationale' => 'A balanced macro range that can be adjusted after a few logged days.',
        ];

        if (str_contains($lower, 'lose') || str_contains($lower, 'weight loss') || str_contains($lower, 'cut')) {
            $suggestion['name'] = 'Lean Loss Builder';
            $suggestion['proteinMin'] = 30;
            $suggestion['proteinMax'] = 40;
            $suggestion['carbMin'] = 25;
            $suggestion['carbMax'] = 35;
            $suggestion['fatMin'] = 20;
            $suggestion['fatMax'] = 30;
            $suggestion['rationale'] = 'Higher protein and moderate carbs can support fullness and muscle retention during a cut.';
        } elseif (str_contains($lower, 'muscle') || str_contains($lower, 'gain') || str_contains($lower, 'bulk')) {
            $suggestion['name'] = 'Muscle Gain Builder';
            $suggestion['carbMin'] = 40;
            $suggestion['carbMax'] = 50;
            $suggestion['proteinMin'] = 25;
            $suggestion['proteinMax'] = 35;
            $suggestion['fatMin'] = 20;
            $suggestion['fatMax'] = 30;
            $suggestion['rationale'] = 'More carbohydrate availability plus steady protein can support training and recovery.';
        }

        return $suggestion;
    }

    private function boundedInt($value, int $min, int $max, int $fallback): int
    {
        if (!is_numeric($value)) {
            return $fallback;
        }

        return max($min, min($max, (int) round((float) $value)));
    }

    private function backfillPlanScores(string $userId, array $plan): void
    {
        $entries = $this->model('EntryModel')->allForUser($userId, 3650);
        if ($entries === []) {
            return;
        }

        $user = $this->model('UserModel')->findWithPreferences($userId);
        $dailyGoal = isset($user['daily_calorie_goal']) && $user['daily_calorie_goal'] !== null
            ? (int) $user['daily_calorie_goal']
            : null;

        $scoreModel = $this->model('EntryScoreModel');
        foreach ($entries as $entry) {
            $scoreModel->syncForEntry($entry['id'], [$plan], $entry, $dailyGoal);
        }
    }
}
