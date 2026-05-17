<?php

class MenuController extends Controller
{
    public function favorites(): void
    {
        $userId = $this->requireUserId();
        $meals = $this->model('SavedMealModel')->allForUser($userId);
        $this->json(['meals' => $meals]);
    }

    public function saveFavorite(): void
    {
        $userId = $this->requireUserId();
        $body = $this->body();
        $title = trim((string) ($body['title'] ?? ''));
        $recipe = $body['recipe'] ?? null;

        if ($title === '' || !is_array($recipe)) {
            $this->json(['error' => 'Title and recipe are required.'], 400);
            return;
        }
        if (strlen($title) > 191 || strlen((string) ($body['description'] ?? '')) > 2000) {
            $this->json(['error' => 'Saved meal details are too long.'], 400);
            return;
        }

        $meal = $this->model('SavedMealModel')->createForUser($userId, [
            'title' => $title,
            'mealType' => trim((string) ($body['mealType'] ?? '')) ?: null,
            'description' => trim((string) ($body['description'] ?? '')) ?: null,
            'calories' => isset($body['calories']) && is_numeric($body['calories']) ? (float) $body['calories'] : null,
            'recipe' => $recipe,
        ]);

        if ($meal === null) {
            $this->json(['error' => 'Failed to save meal'], 500);
            return;
        }

        $this->json(['meal' => $meal], 201);
    }

    public function deleteFavorite(): void
    {
        $userId = $this->requireUserId();
        $id = trim((string) ($_GET['id'] ?? ''));
        if ($id === '') {
            $this->json(['error' => 'Meal id is required.'], 400);
            return;
        }

        $this->model('SavedMealModel')->deleteForUser($userId, $id);
        $this->json(['ok' => true]);
    }

    public function analyze(): void
    {
        $userId = $this->requireUserId();
        $attempt = $this->model('RateLimitModel')->check('menu-analyze:' . $userId . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 20, 10 * 60 * 1000);
        if (!$attempt['ok']) {
            $this->json(['error' => 'Menu comparison limit reached. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        $body = $this->body();
        $options = [];
        if (isset($body['options']) && is_array($body['options'])) {
            foreach ($body['options'] as $option) {
                $text = trim((string) $option);
                if (strlen($text) > 500) {
                    $this->json(['error' => 'Menu option text is too long.'], 400);
                    return;
                }
                if ($text !== '') {
                    $options[] = $text;
                }
            }
        }
        $options = array_slice($options, 0, 8);
        if ($options === []) {
            $this->json(['error' => 'Provide at least one menu option.'], 400);
            return;
        }

        $context = trim((string) ($body['context'] ?? ''));
        if (strlen($context) > 300) {
            $this->json(['error' => 'Restaurant context is too long.'], 400);
            return;
        }
        $providedNutrition = isset($body['providedNutrition']) && is_array($body['providedNutrition']) ? $body['providedNutrition'] : [];
        $plan = $this->latestPlan($userId);
        $profile = DietScoring::resolveProfile(is_array($plan['config'] ?? null) ? $plan['config'] : null, (string) ($plan['name'] ?? ''));

        $rows = [];
        if ($providedNutrition !== []) {
            foreach ($providedNutrition as $index => $row) {
                $rows[] = [
                    'optionIndex' => $index,
                    'name' => isset($row['name']) && is_string($row['name']) ? $row['name'] : ($options[$index] ?? 'Option'),
                    'calories' => $this->num($row['calories'] ?? null),
                    'proteinG' => $this->num($row['proteinG'] ?? null),
                    'carbsG' => $this->num($row['carbsG'] ?? null),
                    'fatG' => $this->num($row['fatG'] ?? null),
                    'sugarG' => $this->num($row['sugarG'] ?? null),
                    'satFatG' => $this->num($row['satFatG'] ?? null),
                    'fiberG' => $this->num($row['fiberG'] ?? null),
                    'summary' => isset($row['summary']) && is_string($row['summary']) ? $row['summary'] : '',
                ];
            }
        } else {
            $client = new OpenAIClient();
            if ($client->isConfigured()) {
                $prompt = implode("\n", array_filter([
                    'Resolve each menu option against the restaurant context, then estimate nutrition. Return strict JSON with a "results" array.',
                    'Each result should include: optionIndex, inputText, restaurant, name, resolvedName, calories, proteinG, carbsG, fatG, sugarG, satFatG, fiberG, confidence, assumptions, summary.',
                    'If a user writes shorthand like "Number 1", "#2", "number two meal", "meal deal", or "combo", infer the closest common US menu item/combo for that restaurant when reasonably possible.',
                    'If exact combo numbering varies by location or has changed over time, choose the closest broadly recognized item and explain that uncertainty in assumptions.',
                    'For combo meals, include the default/typical sides and drink only when implied by the user text; otherwise estimate the main item.',
                    'Do not invent current prices or promotions. Focus on item identity and nutrition estimates.',
                    $context !== '' ? 'Restaurant/context: ' . $context : 'Restaurant/context: not provided',
                    'Options:',
                    ...array_map(static fn(string $opt, int $i): string => $i . ': ' . $opt, $options, array_keys($options)),
                ]));

                $parsed = $client->chatJson(
                    (string) config('openai.meal_model', 'gpt-4o-mini'),
                    'You are a restaurant menu resolver and nutrition estimation assistant for US restaurants. Return strict JSON only. Be conservative, practical, and clear about assumptions.',
                    $prompt
                );
                $rows = is_array($parsed['results'] ?? null) ? $parsed['results'] : [];
            }
        }

        $results = [];
        foreach ($options as $index => $option) {
            $row = [];
            foreach ($rows as $candidate) {
                if ((int) ($candidate['optionIndex'] ?? -1) === $index) {
                    $row = $candidate;
                    break;
                }
            }

            $nutrition = [
                'calories' => $this->num($row['calories'] ?? null),
                'proteinG' => $this->num($row['proteinG'] ?? null),
                'carbsG' => $this->num($row['carbsG'] ?? null),
                'fatG' => $this->num($row['fatG'] ?? null),
                'sugarG' => $this->num($row['sugarG'] ?? null),
                'satFatG' => $this->num($row['satFatG'] ?? null),
                'fiberG' => $this->num($row['fiberG'] ?? null),
            ];
            $scoreRow = DietScoring::scorePlan([
                'type' => $plan['type'] ?? 'CUSTOM',
                'name' => $plan['name'] ?? 'Plan',
                'config' => ['scoringProfile' => $profile],
            ], $nutrition, null);
            $qualityScore = MealQualityScoring::apply(
                [
                    'type' => $plan['type'] ?? 'CUSTOM',
                    'name' => $plan['name'] ?? 'Plan',
                    'config' => ['scoringProfile' => $profile],
                ],
                array_merge($nutrition, [
                    'text' => $this->resolvedMenuName($row, $option),
                    'parsed' => [
                        'title' => $this->resolvedMenuName($row, $option),
                        'notes' => isset($row['summary']) && is_string($row['summary']) ? $row['summary'] : '',
                    ],
                ]),
                $scoreRow,
                [
                    'restaurant' => isset($row['restaurant']) && is_string($row['restaurant']) ? trim($row['restaurant']) : $context,
                    'inputText' => $option,
                    'resolvedName' => isset($row['resolvedName']) && is_string($row['resolvedName']) ? trim($row['resolvedName']) : '',
                    'summary' => isset($row['summary']) && is_string($row['summary']) ? $row['summary'] : '',
                ]
            );

            $results[] = [
                'optionIndex' => $index,
                'name' => $this->resolvedMenuName($row, $option),
                'inputText' => $option,
                'restaurant' => isset($row['restaurant']) && is_string($row['restaurant']) ? trim($row['restaurant']) : $context,
                'resolvedName' => isset($row['resolvedName']) && is_string($row['resolvedName']) ? trim($row['resolvedName']) : null,
                'calories' => $nutrition['calories'],
                'proteinG' => $nutrition['proteinG'],
                'carbsG' => $nutrition['carbsG'],
                'fatG' => $nutrition['fatG'],
                'sugarG' => $nutrition['sugarG'],
                'satFatG' => $nutrition['satFatG'],
                'fiberG' => $nutrition['fiberG'],
                'confidence' => isset($row['confidence']) && is_numeric($row['confidence']) ? (float) $row['confidence'] : null,
                'assumptions' => $this->cleanStringList($row['assumptions'] ?? []),
                'fitScore' => (int) ($qualityScore['score'] ?? ($scoreRow['score'] ?? 55)),
                'reasons' => $qualityScore['details']['reasons'] ?? ($scoreRow['details']['reasons'] ?? ['Not enough nutrition detail to score accurately.']),
                'summary' => isset($row['summary']) && is_string($row['summary']) ? $row['summary'] : '',
            ];
        }

        usort($results, static fn(array $a, array $b): int => ($b['fitScore'] <=> $a['fitScore']));
        $bestOptionIndex = $results[0]['optionIndex'] ?? null;

        $this->json([
            'plan' => [
                'id' => $plan['id'] ?? null,
                'name' => $plan['name'] ?? 'No active plan',
                'type' => $plan['type'] ?? null,
                'profile' => $profile,
            ],
            'options' => $results,
            'ranked' => $results,
            'bestOptionIndex' => $bestOptionIndex,
        ]);
    }

    private function resolvedMenuName(array $row, string $fallback): string
    {
        foreach (['resolvedName', 'name'] as $key) {
            if (isset($row[$key]) && is_string($row[$key]) && trim($row[$key]) !== '') {
                return trim($row[$key]);
            }
        }

        return $fallback;
    }

    private function cleanStringList($value): array
    {
        if (is_string($value) && trim($value) !== '') {
            return [trim($value)];
        }
        if (!is_array($value)) {
            return [];
        }

        return array_values(array_slice(array_filter(array_map(static fn($item): string => trim((string) $item), $value)), 0, 4));
    }

    public function plan(): void
    {
        $userId = $this->requireUserId();
        $attempt = $this->model('RateLimitModel')->check('menu-plan:' . $userId . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 12, 10 * 60 * 1000);
        if (!$attempt['ok']) {
            $this->json(['error' => 'Meal planner limit reached. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        $body = $this->body();
        $prompt = trim((string) ($body['prompt'] ?? ''));
        $days = max(1, min(7, (int) ($body['days'] ?? 3)));
        $mealTypes = isset($body['mealTypes']) && is_array($body['mealTypes']) ? array_values(array_filter(array_map(static fn($v): string => trim((string) $v), $body['mealTypes']))) : [];

        if ($prompt === '') {
            $this->json(['error' => 'Planner prompt is required.'], 400);
            return;
        }
        if (strlen($prompt) > 2500) {
            $this->json(['error' => 'Planner prompt is too long.'], 400);
            return;
        }
        if ($mealTypes === []) {
            $this->json(['error' => 'Select at least one meal type.'], 400);
            return;
        }

        $plan = $this->latestPlan($userId);
        $user = $this->model('UserModel')->findWithPreferences($userId);
        $goal = isset($user['daily_calorie_goal']) && $user['daily_calorie_goal'] !== null ? (int) $user['daily_calorie_goal'] : null;

        $client = new OpenAIClient();
        $parsed = null;
        if ($client->isConfigured()) {
            $system = 'You are a meal planning assistant. Return strict JSON only. Build printable, recipe-style meal plans. Each meal should include title, description, calories, servings, prepMinutes, cookMinutes, ingredients, and instructions.';
            $userPrompt = implode("\n", [
                'Build a meal plan JSON with keys: planName, summary, days, prepTips.',
                'Make summary a brief 2 to 4 sentence explanation of why these meals fit the selected diet plan and user request.',
                'Each day should have dayLabel and meals.',
                'Each meal should include: mealType, title, description, calories, recipeTitle, servings, prepMinutes, cookMinutes, ingredients, instructions.',
                'Descriptions should briefly explain the nutrition/plan fit. Instructions should be clear enough to cook from.',
                'Diet plan: ' . ($plan['name'] ?? 'No active plan'),
                'Plan type: ' . ($plan['type'] ?? 'unknown'),
                'Daily calorie goal: ' . ($goal ?? 'not set'),
                'Days: ' . $days,
                'Meal types: ' . implode(', ', $mealTypes),
                'User request: ' . $prompt,
            ]);
            $parsed = $client->chatJson((string) config('openai.meal_model', 'gpt-4o-mini'), $system, $userPrompt);
        }

        $normalizedDays = $this->normalizePlannerDays($parsed['days'] ?? null, $days);
        if ($normalizedDays === []) {
            $normalizedDays = $this->fallbackPlannerDays($days, $mealTypes, $prompt, $goal);
        }

        $this->json([
            'planName' => isset($parsed['planName']) && is_string($parsed['planName']) && trim($parsed['planName']) !== '' ? trim($parsed['planName']) : (($plan['name'] ?? 'Custom') . ' Smart Meal Planner'),
            'summary' => isset($parsed['summary']) && is_string($parsed['summary']) && trim($parsed['summary']) !== '' ? trim($parsed['summary']) : 'A practical meal plan built around your selected diet and prompt.',
            'days' => $normalizedDays,
            'groceryList' => $this->deriveGroceryList($normalizedDays),
            'prepTips' => isset($parsed['prepTips']) && is_array($parsed['prepTips']) ? array_values(array_slice(array_filter(array_map(static fn($v): string => trim((string) $v), $parsed['prepTips'])), 0, 8)) : ['Cook once, reuse ingredients across meals, and keep the grocery list tight.'],
        ]);
    }

    public function barcode(): void
    {
        $userId = $this->requireUserId();
        $attempt = $this->model('RateLimitModel')->check('barcode:' . $userId . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 30, 10 * 60 * 1000);
        if (!$attempt['ok']) {
            $this->json(['error' => 'Barcode lookup limit reached. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        $body = $this->body();
        $barcode = trim((string) ($body['barcode'] ?? ''));
        if ($barcode === '') {
            $this->json(['error' => 'Barcode is required'], 400);
            return;
        }
        if (!preg_match('/^[0-9A-Za-z._-]{4,64}$/', $barcode)) {
            $this->json(['error' => 'Barcode format is invalid.'], 400);
            return;
        }

        $url = 'https://world.openfoodfacts.org/api/v2/product/' . rawurlencode($barcode) . '.json';
        $json = @file_get_contents($url);
        if (!is_string($json) || $json === '') {
            $this->json(['error' => 'Product not found for that barcode.'], 404);
            return;
        }

        $data = json_decode($json, true);
        if (!is_array($data) || (int) ($data['status'] ?? 0) !== 1 || !isset($data['product'])) {
            $this->json(['error' => 'Product not found for that barcode.'], 404);
            return;
        }

        $product = $data['product'];
        $nutr = $product['nutriments'] ?? [];

        $this->json([
            'product' => [
                'barcode' => $barcode,
                'name' => trim((string) (($product['product_name'] ?? $product['generic_name'] ?? ('Barcode ' . $barcode)))) ?: ('Barcode ' . $barcode),
                'brand' => isset($product['brands']) ? trim((string) $product['brands']) : null,
                'servingSize' => $product['serving_size'] ?? null,
                'calories' => $this->pickNutriment($nutr, 'energy-kcal_serving', 'energy-kcal_100g'),
                'proteinG' => $this->pickNutriment($nutr, 'proteins_serving', 'proteins_100g'),
                'carbsG' => $this->pickNutriment($nutr, 'carbohydrates_serving', 'carbohydrates_100g'),
                'fatG' => $this->pickNutriment($nutr, 'fat_serving', 'fat_100g'),
                'sugarG' => $this->pickNutriment($nutr, 'sugars_serving', 'sugars_100g'),
                'fiberG' => $this->pickNutriment($nutr, 'fiber_serving', 'fiber_100g'),
                'satFatG' => $this->pickNutriment($nutr, 'saturated-fat_serving', 'saturated-fat_100g'),
            ],
        ]);
    }

    private function latestPlan(string $userId): ?array
    {
        $plans = $this->model('PlanModel')->allForUser($userId);
        return $plans !== [] ? $plans[count($plans) - 1] : null;
    }

    private function num($value): ?float
    {
        return ($value !== null && $value !== '' && is_numeric($value)) ? (float) $value : null;
    }

    private function normalizePlannerDays($daysRaw, int $dayLimit): array
    {
        if (!is_array($daysRaw)) {
            return [];
        }

        $days = [];
        foreach (array_slice($daysRaw, 0, $dayLimit) as $index => $day) {
            if (!is_array($day)) {
                continue;
            }
            $meals = [];
            foreach (($day['meals'] ?? []) as $meal) {
                if (!is_array($meal)) {
                    continue;
                }
                $title = trim((string) ($meal['title'] ?? ''));
                if ($title === '') {
                    continue;
                }
                $meals[] = [
                    'mealType' => trim((string) ($meal['mealType'] ?? 'Meal')) ?: 'Meal',
                    'title' => $title,
                    'description' => trim((string) ($meal['description'] ?? 'Plan-friendly meal.')) ?: 'Plan-friendly meal.',
                    'calories' => $this->num($meal['calories'] ?? null),
                    'recipeTitle' => trim((string) ($meal['recipeTitle'] ?? $title)) ?: $title,
                    'servings' => $this->num($meal['servings'] ?? null),
                    'prepMinutes' => $this->num($meal['prepMinutes'] ?? null),
                    'cookMinutes' => $this->num($meal['cookMinutes'] ?? null),
                    'ingredients' => is_array($meal['ingredients'] ?? null) ? array_values(array_filter(array_map(function ($ingredient) {
                        if (!is_array($ingredient)) {
                            return null;
                        }
                        $item = trim((string) ($ingredient['item'] ?? ''));
                        if ($item === '') {
                            return null;
                        }
                        return [
                            'item' => $item,
                            'amount' => trim((string) ($ingredient['amount'] ?? 'to taste')) ?: 'to taste',
                            'category' => $this->normalizeCategory($ingredient['category'] ?? 'Other'),
                        ];
                    }, $meal['ingredients']))) : [],
                    'instructions' => is_array($meal['instructions'] ?? null) ? array_values(array_filter(array_map(static fn($step): string => trim((string) $step), $meal['instructions']))) : [],
                ];
            }
            $days[] = [
                'dayLabel' => trim((string) ($day['dayLabel'] ?? ('Day ' . ($index + 1)))) ?: ('Day ' . ($index + 1)),
                'meals' => $meals,
            ];
        }

        return $days;
    }

    private function fallbackPlannerDays(int $days, array $mealTypes, string $prompt, ?int $goal): array
    {
        $result = [];
        for ($i = 1; $i <= $days; $i++) {
            $meals = [];
            foreach ($mealTypes as $mealType) {
                $meals[] = [
                    'mealType' => $mealType,
                    'title' => $mealType . ' for ' . $prompt,
                    'description' => 'A simple fallback meal suggestion while the PHP port continues to mature.',
                    'calories' => $goal ? round($goal / max(1, count($mealTypes))) : null,
                    'recipeTitle' => $mealType . ' for ' . $prompt,
                    'servings' => 1,
                    'prepMinutes' => 10,
                    'cookMinutes' => 20,
                    'ingredients' => [
                        ['item' => 'Protein of choice', 'amount' => '1 portion', 'category' => 'Protein'],
                        ['item' => 'Vegetable side', 'amount' => '2 cups', 'category' => 'Produce'],
                        ['item' => 'Whole grain or starch', 'amount' => '1 serving', 'category' => 'Grains & Bakery'],
                    ],
                    'instructions' => [
                        'Prepare the protein with simple seasoning.',
                        'Cook the vegetables until tender-crisp.',
                        'Serve with the starch and adjust portions to your plan.',
                    ],
                ];
            }
            $result[] = ['dayLabel' => 'Day ' . $i, 'meals' => $meals];
        }
        return $result;
    }

    private function deriveGroceryList(array $days): array
    {
        $byCategory = [];
        foreach ($days as $day) {
            foreach (($day['meals'] ?? []) as $meal) {
                foreach (($meal['ingredients'] ?? []) as $ingredient) {
                    $category = $this->normalizeCategory($ingredient['category'] ?? 'Other');
                    $label = trim(((string) ($ingredient['amount'] ?? '')) . ' ' . ((string) ($ingredient['item'] ?? '')));
                    if ($label === '') {
                        continue;
                    }
                    $byCategory[$category] = $byCategory[$category] ?? [];
                    if (!in_array($label, $byCategory[$category], true)) {
                        $byCategory[$category][] = $label;
                    }
                }
            }
        }

        $list = [];
        foreach ($byCategory as $category => $items) {
            $list[] = ['category' => $category, 'items' => array_values($items)];
        }
        return $list;
    }

    private function normalizeCategory($value): string
    {
        $x = strtolower(trim((string) $value));
        if (in_array($x, ['produce', 'vegetables', 'fruit'], true)) return 'Produce';
        if (in_array($x, ['protein', 'meat', 'seafood'], true)) return 'Protein';
        if (in_array($x, ['dairy', 'eggs'], true)) return 'Dairy & Eggs';
        if (in_array($x, ['grains', 'bread', 'pasta'], true)) return 'Grains & Bakery';
        if (in_array($x, ['pantry', 'spices', 'condiments'], true)) return 'Pantry';
        if ($x === 'frozen') return 'Frozen';
        return trim((string) $value) ?: 'Other';
    }

    private function pickNutriment(array $nutriments, string $servingKey, string $hundredKey): ?float
    {
        $serving = $this->num($nutriments[$servingKey] ?? null);
        if ($serving !== null) {
            return $serving;
        }
        return $this->num($nutriments[$hundredKey] ?? null);
    }
}
