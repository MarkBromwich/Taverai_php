<?php

class MealPhotoController extends Controller
{
    public function store(): void
    {
        $userId = $this->requireUserId();
        $attempt = $this->model('RateLimitModel')->check('meal-photo:' . $userId . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 20, 10 * 60 * 1000);
        if (!$attempt['ok']) {
            $this->json(['error' => 'Meal photo upload limit reached. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        if (empty($_FILES['file']) || !is_array($_FILES['file'])) {
            $this->json(['error' => 'Meal image is required.'], 400);
            return;
        }

        $upload = $_FILES['file'];
        $originalName = (string) ($upload['name'] ?? 'upload');
        try {
            $stored = secure_image_upload($upload, 'meal', 6 * 1024 * 1024);
        } catch (Throwable $e) {
            app_log('Meal photo upload rejected', ['error' => $e->getMessage(), 'userId' => $userId]);
            $this->json(['error' => $e->getMessage()], 400);
            return;
        }
        $size = (int) $stored['size'];
        $mime = (string) $stored['mime'];

        $ymd = trim((string) ($_POST['date'] ?? ''));
        $createdAt = null;
        if ($ymd !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $ymd)) {
            $createdAt = $ymd . ' ' . $this->requestTime((string) ($_POST['time'] ?? ''));
        }

        $destination = $stored['path'];
        $imageUrl = $stored['url'];
        $analysis = $this->analyzeMealPhoto($destination, $mime);
        if (!is_array($analysis)) {
            $analysis = NutritionEstimator::fromPhotoFallback();
        }
        $calories = isset($analysis['calories']) ? $this->numberOrNull($analysis['calories']) : null;
        $proteinG = isset($analysis['proteinG']) ? $this->numberOrNull($analysis['proteinG']) : null;
        $carbsG = isset($analysis['carbsG']) ? $this->numberOrNull($analysis['carbsG']) : null;
        $fatG = isset($analysis['fatG']) ? $this->numberOrNull($analysis['fatG']) : null;
        $entryText = trim((string) ($analysis['title'] ?? '')) ?: 'Meal photo';

        $parsed = [
            'source' => 'photo',
            'imageUrl' => $imageUrl,
            'mime' => $mime,
            'size' => $size,
            'originalName' => $originalName,
        ];
        if (is_array($analysis)) {
            $parsed = array_merge($parsed, [
                'title' => isset($analysis['title']) && is_string($analysis['title']) ? trim($analysis['title']) : null,
                'confidence' => $this->numberOrNull($analysis['confidence'] ?? null),
                'notes' => isset($analysis['notes']) && is_string($analysis['notes']) ? $analysis['notes'] : null,
                'items' => isset($analysis['items']) && is_array($analysis['items']) ? $analysis['items'] : null,
                'calories' => $calories ?? 0,
                'macros' => [
                    'proteinG' => $proteinG ?? 0,
                    'carbsG' => $carbsG ?? 0,
                    'fatG' => $fatG ?? 0,
                ],
                'nutrition' => [
                    'sugarG' => $this->numberOrNull($analysis['sugarG'] ?? null) ?? 0,
                    'fiberG' => $this->numberOrNull($analysis['fiberG'] ?? null) ?? 0,
                    'satFatG' => $this->numberOrNull($analysis['satFatG'] ?? null) ?? 0,
                ],
            ]);
        }

        $entry = $this->model('EntryModel')->createForUser($userId, [
            'text' => $entryText,
            'createdAt' => $createdAt ?? now_utc(),
            'calories' => $calories,
            'proteinG' => $proteinG,
            'carbsG' => $carbsG,
            'fatG' => $fatG,
            'parsed' => $parsed,
        ]);

        if ($entry === null) {
            $this->json(['error' => 'Failed to save uploaded meal.'], 500);
            return;
        }

        $plans = $this->model('PlanModel')->allForUser($userId);
        if ($plans !== []) {
            $user = $this->model('UserModel')->findWithPreferences($userId);
            $dailyGoal = isset($user['daily_calorie_goal']) && $user['daily_calorie_goal'] !== null ? (int) $user['daily_calorie_goal'] : null;
            $this->model('EntryScoreModel')->syncForEntry($entry['id'], $plans, $entry, $dailyGoal);
            $fresh = $this->model('EntryModel')->findForUser($userId, $entry['id']);
            if ($fresh !== null) {
                $entry = $fresh;
            }
        }

        $this->json([
            'entry' => $entry,
            'imageUrl' => $imageUrl,
        ], 201);
    }

    private function analyzeMealPhoto(string $absolutePath, string $mime): ?array
    {
        $client = new OpenAIClient();
        if (!$client->isConfigured()) {
            return null;
        }

        $raw = @file_get_contents($absolutePath);
        if (!is_string($raw) || $raw === '') {
            return null;
        }

        $prompt = 'Analyze this meal image and return only valid JSON with keys: title, calories, proteinG, carbsG, fatG, sugarG, fiberG, satFatG, confidence, notes, items. Each item should include name, servings, foodGroup, calories, sugarG, addedSugarG, fiberG, satFatG, sodiumMg, tags.';
        return $client->chatJsonWithImage(
            (string) config('openai.meal_model', 'gpt-4o-mini'),
            'You are a nutrition estimation AI. Return only valid JSON with realistic meal estimates from the image. Be conservative and practical.',
            $prompt,
            $mime,
            base64_encode($raw),
            700
        );
    }

    private function numberOrNull($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return is_numeric($value) ? (float) $value : null;
    }

    private function requestTime(string $time): string
    {
        return preg_match('/^\d{2}:\d{2}:\d{2}$/', $time) ? $time : date('H:i:s');
    }
}
