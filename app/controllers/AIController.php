<?php

class AIController extends Controller
{
    public function parseText(): void
    {
        $userId = $this->requireUserId();
        $attempt = $this->model('RateLimitModel')->check('ai-parse:' . $userId . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 30, 10 * 60 * 1000);
        if (!$attempt['ok']) {
            $this->json(['error' => 'Nutrition parsing limit reached. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        $body = $this->body();
        $text = trim((string) ($body['text'] ?? ''));
        if ($text === '') {
            $this->json(['error' => 'Text is required.'], 400);
            return;
        }
        if (strlen($text) > 2000) {
            $this->json(['error' => 'Text is too long.'], 400);
            return;
        }

        $parsed = $this->parseNutritionFromText($text);
        if ($parsed === null) {
            $parsed = NutritionEstimator::fromText($text);
        }

        if ($parsed === null) {
            $this->json(['error' => 'Text parse unavailable. Add calories/macros manually for this meal.'], 503);
            return;
        }

        $this->json(['result' => $parsed]);
    }

    public function scanMealImage(): void
    {
        $userId = $this->requireUserId();
        $attempt = $this->model('RateLimitModel')->check('ai-scan:' . $userId . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 12, 10 * 60 * 1000);
        if (!$attempt['ok']) {
            $this->json(['error' => 'Meal scan limit reached. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        if (empty($_FILES['image']) || !is_array($_FILES['image'])) {
            $this->json(['error' => 'Meal image is required.'], 400);
            return;
        }

        try {
            $upload = $_FILES['image'];
            if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                throw new RuntimeException('Image upload failed.');
            }
            $tmpPath = (string) ($upload['tmp_name'] ?? '');
            $size = (int) ($upload['size'] ?? 0);
            if ($tmpPath === '' || !is_uploaded_file($tmpPath) || $size <= 0 || $size > 6 * 1024 * 1024) {
                throw new RuntimeException('Meal image must be under 6MB.');
            }
            $info = @getimagesize($tmpPath);
            $mime = is_array($info) ? (string) ($info['mime'] ?? '') : '';
            if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
                throw new RuntimeException('Unsupported image type.');
            }
        } catch (Throwable $e) {
            app_log('Meal scan upload rejected', ['error' => $e->getMessage()]);
            $this->json(['error' => $e->getMessage()], 400);
            return;
        }

        $raw = @file_get_contents($tmpPath);
        if (!is_string($raw) || $raw === '') {
            $this->json(['error' => 'Failed to read uploaded image.'], 500);
            return;
        }

        $client = new OpenAIClient();
        if (!$client->isConfigured()) {
            $this->json(['error' => 'Meal scan unavailable.'], 503);
            return;
        }

        $result = $client->responseJsonWithImage(
            (string) config('openai.meal_model', 'gpt-4o-mini'),
            'You are a nutrition estimation AI. Return only valid JSON with realistic meal estimates from the image. Be conservative and practical.',
            'Analyze this meal image and return JSON with keys: title, calories, proteinG, carbsG, fatG, sugarG, fiberG, satFatG, confidence, notes, items.',
            $mime,
            base64_encode($raw),
            700
        );

        if ($result === null) {
            $this->json(['error' => 'Meal scan failed.'], 503);
            return;
        }

        $this->json(['result' => $this->normalizeNutritionResult($result)]);
    }

    private function parseNutritionFromText(string $text): ?array
    {
        $client = new OpenAIClient();
        if (!$client->isConfigured()) {
            return null;
        }

        $result = $client->chatJson(
            (string) config('openai.meal_model', 'gpt-4o-mini'),
            'You are a nutrition estimation AI. Return only valid JSON with realistic calorie and macro estimates for the full food text. Be conservative and reasonable.',
            'Analyze this food text and return JSON with keys: title, calories, proteinG, carbsG, fatG, sugarG, fiberG, satFatG, confidence, notes, items. Food text: "' . $text . '"'
        );

        return $result ? $this->normalizeNutritionResult($result) : null;
    }

    private function normalizeNutritionResult(array $response): array
    {
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
        ];
    }

    private function numberOrNull($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return is_numeric($value) ? (float) $value : null;
    }
}
