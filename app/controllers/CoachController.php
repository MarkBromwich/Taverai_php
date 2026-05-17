<?php

class CoachController extends Controller
{
    public function summary(): void
    {
        $userId = $this->requireUserId();
        $range = (string) ($_GET['range'] ?? 'weekly');
        $days = match ($range) {
            'monthly' => 30,
            'yearly' => 365,
            default => 7,
        };
        $breakdownDays = (int) ($_GET['breakdownDays'] ?? 3);
        if (!in_array($breakdownDays, [1, 3, 5, 10, 14], true)) {
            $breakdownDays = 3;
        }

        $entries = $this->model('EntryModel')->recentForSummary($userId, max($days, $breakdownDays) + 1);
        $user = $this->model('UserModel')->findWithPreferences($userId);
        $goal = isset($user['daily_calorie_goal']) && $user['daily_calorie_goal'] !== null ? (int) $user['daily_calorie_goal'] : null;
        $plans = $this->model('PlanModel')->allForUser($userId);
        $activePlan = $plans[0] ?? null;
        $targets = $this->macroBreakdownTargets($activePlan, $goal);
        $series = $this->dailySeries($entries, $days);
        $breakdown = $this->foodGroupBreakdown($entries, $breakdownDays);
        $scores = array_values(array_filter(array_map(static fn(array $day) => $day['score'], $series), static fn($v) => $v !== null));
        $calorieDays = array_values(array_filter(array_map(static fn(array $day) => $day['calories'], $series), static fn($v) => $v > 0));

        $avgScore = $scores ? (int) round(array_sum($scores) / count($scores)) : null;
        $avgCalories = $calorieDays ? (int) round(array_sum($calorieDays) / count($calorieDays)) : null;
        $trendInsightSource = 'fallback';
        $macroInsightSource = 'fallback';
        $insights = $this->trendInsights($series, $breakdown, $avgScore, $avgCalories, $goal, $range, $trendInsightSource);
        $macroInsights = $this->macroNutrientInsights($breakdown, $targets, $breakdownDays, $macroInsightSource);

        $this->json([
            'range' => $range,
            'breakdownDays' => $breakdownDays,
            'goal' => $goal,
            'series' => $series,
            'averages' => [
                'score' => $avgScore,
                'calories' => $avgCalories,
            ],
            'targets' => $targets,
            'insights' => $insights,
            'macroInsights' => $macroInsights,
            'debug' => [
                'trendInsights' => $trendInsightSource,
                'macroInsights' => $macroInsightSource,
            ],
            'breakdown' => $breakdown,
        ]);
    }

    public function ask(): void
    {
        $userId = $this->requireUserId();
        $body = $this->body();
        $question = trim((string) ($body['question'] ?? ''));
        $horizonDays = max(7, min(90, (int) ($body['horizonDays'] ?? 30)));

        if ($question === '') {
            $this->json(['error' => 'Missing question'], 400);
            return;
        }
        if (strlen($question) > 2000) {
            $this->json(['error' => 'Question is too long.'], 400);
            return;
        }

        $rateLimiter = $this->model('RateLimitModel');
        $attempt = $rateLimiter->check('coach:' . $userId . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'local'), 20, 10 * 60 * 1000);

        if (!$attempt['ok']) {
            $this->json(['error' => 'Coach question limit reached. Try again later.'], 429, [
                'Retry-After' => (string) max(1, ceil($attempt['retryAfterMs'] / 1000)),
            ]);
            return;
        }

        $entries = $this->model('EntryModel')->recentForSummary($userId, $horizonDays);
        $answer = $this->coachAnswer($entries, $question, $horizonDays);
        $this->json(['answer' => $answer]);
    }

    private function dailySeries(array $entries, int $days): array
    {
        $start = (new DateTimeImmutable('today', new DateTimeZone('UTC')))->modify('-' . ($days - 1) . ' days');
        $series = [];
        for ($i = 0; $i < $days; $i++) {
            $date = $start->modify('+' . $i . ' days')->format('Y-m-d');
            $series[$date] = [
                'date' => $date,
                'label' => substr($date, 5),
                'entries' => 0,
                'calories' => 0,
                'proteinG' => 0,
                'carbsG' => 0,
                'fatG' => 0,
                'score' => null,
                '_scoreTotal' => 0,
                '_scoreCount' => 0,
            ];
        }

        foreach ($entries as $entry) {
            $date = substr((string) ($entry['createdAt'] ?? ''), 0, 10);
            if (!isset($series[$date])) {
                continue;
            }

            $series[$date]['entries']++;
            $series[$date]['calories'] += (int) round((float) ($entry['calories'] ?? 0));
            $series[$date]['proteinG'] += (float) ($entry['proteinG'] ?? 0);
            $series[$date]['carbsG'] += (float) ($entry['carbsG'] ?? 0);
            $series[$date]['fatG'] += (float) ($entry['fatG'] ?? 0);

            $score = $this->entryPrimaryScore($entry);
            if ($score !== null) {
                $series[$date]['_scoreTotal'] += $score;
                $series[$date]['_scoreCount']++;
            }
        }

        foreach ($series as &$day) {
            $day['calories'] = (int) round($day['calories']);
            $day['proteinG'] = round($day['proteinG'], 1);
            $day['carbsG'] = round($day['carbsG'], 1);
            $day['fatG'] = round($day['fatG'], 1);
            $day['score'] = $day['_scoreCount'] > 0 ? (int) round($day['_scoreTotal'] / $day['_scoreCount']) : null;
            unset($day['_scoreTotal'], $day['_scoreCount']);
        }
        unset($day);

        return array_values($series);
    }

    private function foodGroupBreakdown(array $entries, int $days): array
    {
        $cutoff = (new DateTimeImmutable('today', new DateTimeZone('UTC')))->modify('-' . ($days - 1) . ' days')->format('Y-m-d');
        $byDay = [];
        foreach ($entries as $entry) {
            $date = substr((string) ($entry['createdAt'] ?? ''), 0, 10);
            if ($date < $cutoff) {
                continue;
            }
            if (!isset($byDay[$date])) {
                $byDay[$date] = [
                    'date' => $date,
                    'entries' => 0,
                    'calories' => 0,
                    'proteinG' => 0,
                    'carbsG' => 0,
                    'fatG' => 0,
                    'fruit' => 0,
                    'vegetables' => 0,
                    'grains' => 0,
                    'sugarG' => 0,
                    'satFatG' => 0,
                    'meals' => [],
                ];
            }
            $byDay[$date]['entries']++;
            $byDay[$date]['calories'] += (float) ($entry['calories'] ?? 0);
            $byDay[$date]['proteinG'] += (float) ($entry['proteinG'] ?? 0);
            $byDay[$date]['carbsG'] += (float) ($entry['carbsG'] ?? 0);
            $byDay[$date]['fatG'] += (float) ($entry['fatG'] ?? 0);
            $byDay[$date]['sugarG'] += $this->parsedNumber($entry, 'sugarG');
            $byDay[$date]['satFatG'] += $this->parsedNumber($entry, 'satFatG');
            $byDay[$date]['meals'][] = (string) ($entry['text'] ?? 'Meal');

            foreach ($this->entryItemTerms($entry) as $term) {
                if (preg_match('/berry|berries|banana|apple|fruit/', $term)) $byDay[$date]['fruit']++;
                if (preg_match('/vegetable|greens|salad|spinach|cucumber|slaw|tomato/', $term)) $byDay[$date]['vegetables']++;
                if (preg_match('/rice|bread|toast|oat|pasta|pita|quinoa|tortilla|grain/', $term)) $byDay[$date]['grains']++;
                if (preg_match('/soda|dessert|sugar/', $term)) $byDay[$date]['sugarG'] += 25;
            }
        }

        krsort($byDay);
        return array_values(array_map(static function (array $day): array {
            foreach (['calories', 'proteinG', 'carbsG', 'fatG', 'sugarG', 'satFatG'] as $key) {
                $day[$key] = (int) round((float) $day[$key]);
            }
            return $day;
        }, $byDay));
    }

    private function macroBreakdownTargets(?array $plan, ?int $dailyCalorieGoal): array
    {
        $hasPlan = is_array($plan);
        $profile = $hasPlan
            ? DietScoring::resolveProfile(is_array($plan['config'] ?? null) ? $plan['config'] : null, (string) ($plan['name'] ?? ''))
            : null;
        $calorieGoal = $dailyCalorieGoal !== null && $dailyCalorieGoal > 0 ? $dailyCalorieGoal : null;

        return [
            'planName' => $hasPlan ? (string) ($plan['name'] ?? $profile['label'] ?? 'Diet plan') : null,
            'calories' => [
                'userSet' => $calorieGoal,
                'planMax' => $calorieGoal,
                'unit' => 'kcal',
            ],
            'carbsG' => [
                'userSet' => null,
                'planMax' => $calorieGoal && $profile ? (int) round(($calorieGoal * (float) $profile['carbs']['max']) / 4) : null,
                'targetPct' => $profile ? (int) round((float) $profile['carbs']['max'] * 100) : null,
                'unit' => 'g',
            ],
            'proteinG' => [
                'userSet' => null,
                'planMax' => $calorieGoal && $profile ? (int) round(($calorieGoal * (float) $profile['protein']['max']) / 4) : null,
                'targetPct' => $profile ? (int) round((float) $profile['protein']['max'] * 100) : null,
                'unit' => 'g',
            ],
            'fatG' => [
                'userSet' => null,
                'planMax' => $calorieGoal && $profile ? (int) round(($calorieGoal * (float) $profile['fat']['max']) / 9) : null,
                'targetPct' => $profile ? (int) round((float) $profile['fat']['max'] * 100) : null,
                'unit' => 'g',
            ],
            'fruit' => ['planMax' => 2, 'unit' => 'serv'],
            'vegetables' => ['planMax' => 3, 'unit' => 'serv'],
            'grains' => ['planMax' => 3, 'unit' => 'serv'],
            'sugarG' => ['planMax' => 50, 'unit' => 'g'],
        ];
    }

    private function macroNutrientInsights(array $breakdown, array $targets, int $days, string &$source): array
    {
        $logged = array_values(array_filter($breakdown, static fn(array $day): bool => (int) ($day['entries'] ?? 0) > 0));
        if ($logged === []) {
            $source = 'empty';
            return ['Log a few meals with calories and macros to unlock macro nutrient context.'];
        }

        $averages = $this->macroAverages($logged);
        $client = new OpenAIClient();
        if ($client->isConfigured()) {
            $payload = [
                'daysShown' => $days,
                'planName' => $targets['planName'] ?? null,
                'targets' => $targets,
                'averages' => $averages,
                'dailyBreakdown' => array_slice($logged, 0, 7),
            ];

            $response = $client->chatJson(
                (string) config('openai.coach_model', 'gpt-4.1-mini'),
                'You write concise macro nutrient coaching for Taverai. Return only JSON with key "insights", an array of 2 to 3 short, specific bullets. Mention calories, carbs, protein, fat, sugar, or produce/grains when useful. Use supportive wording and do not diagnose medical issues.',
                json_encode($payload, JSON_UNESCAPED_SLASHES)
            );

            $insights = $response['insights'] ?? null;
            if (is_array($insights)) {
                $clean = array_values(array_filter(array_map(static fn($item): string => trim((string) $item), $insights)));
                if ($clean !== []) {
                    $source = 'ai';
                    return array_slice($clean, 0, 3);
                }
            }
        }

        $source = 'fallback';
        return $this->localMacroInsights($averages, $targets, count($logged));
    }

    private function macroAverages(array $days): array
    {
        $totals = [
            'calories' => 0,
            'proteinG' => 0,
            'carbsG' => 0,
            'fatG' => 0,
            'sugarG' => 0,
            'fruit' => 0,
            'vegetables' => 0,
            'grains' => 0,
        ];

        foreach ($days as $day) {
            foreach ($totals as $key => $value) {
                $totals[$key] += (float) ($day[$key] ?? 0);
            }
        }

        $count = max(1, count($days));
        foreach ($totals as $key => $value) {
            $totals[$key] = (int) round($value / $count);
        }

        return $totals;
    }

    private function localMacroInsights(array $averages, array $targets, int $loggedDays): array
    {
        $calorieTarget = $targets['calories']['userSet'] ?? null;
        $proteinTarget = $targets['proteinG']['planMax'] ?? null;
        $carbTarget = $targets['carbsG']['planMax'] ?? null;
        $fatTarget = $targets['fatG']['planMax'] ?? null;

        $first = $calorieTarget
            ? "Across {$loggedDays} logged day" . ($loggedDays === 1 ? '' : 's') . ", calories are averaging {$averages['calories']} kcal against your {$calorieTarget} kcal goal."
            : "Across {$loggedDays} logged day" . ($loggedDays === 1 ? '' : 's') . ", calories are averaging {$averages['calories']} kcal.";

        $macroParts = [];
        if ($proteinTarget) $macroParts[] = "protein {$averages['proteinG']}g of {$proteinTarget}g";
        if ($carbTarget) $macroParts[] = "carbs {$averages['carbsG']}g of {$carbTarget}g";
        if ($fatTarget) $macroParts[] = "fat {$averages['fatG']}g of {$fatTarget}g";

        $second = $macroParts !== []
            ? 'Daily macro averages versus plan top ends: ' . implode(', ', $macroParts) . '.'
            : "Daily macro averages are protein {$averages['proteinG']}g, carbs {$averages['carbsG']}g, and fat {$averages['fatG']}g.";

        $third = "Produce and grain pattern: fruit {$averages['fruit']}, vegetables {$averages['vegetables']}, grains {$averages['grains']}, with sugar around {$averages['sugarG']}g per logged day.";

        return [$first, $second, $third];
    }

    private function entryPrimaryScore(array $entry): ?int
    {
        $scores = isset($entry['scores']) && is_array($entry['scores']) ? $entry['scores'] : [];
        if ($scores === []) {
            return null;
        }
        return isset($scores[0]['score']) ? (int) $scores[0]['score'] : null;
    }

    private function parsedNumber(array $entry, string $key): float
    {
        if (isset($entry['parsed'][$key]) && is_numeric($entry['parsed'][$key])) {
            return (float) $entry['parsed'][$key];
        }
        if (isset($entry['parsed']['nutrition'][$key]) && is_numeric($entry['parsed']['nutrition'][$key])) {
            return (float) $entry['parsed']['nutrition'][$key];
        }
        return 0.0;
    }

    private function entryItemTerms(array $entry): array
    {
        $terms = [strtolower((string) ($entry['text'] ?? ''))];
        $items = $entry['parsed']['items'] ?? [];
        if (is_array($items)) {
            foreach ($items as $item) {
                if (is_array($item)) {
                    $terms[] = strtolower((string) ($item['name'] ?? ''));
                    foreach (($item['tags'] ?? []) as $tag) {
                        $terms[] = strtolower((string) $tag);
                    }
                }
            }
        }
        return $terms;
    }

    private function trendInsights(array $series, array $breakdown, ?int $avgScore, ?int $avgCalories, ?int $goal, string $range, string &$source): array
    {
        $loggedDays = count(array_filter($series, static fn(array $day): bool => $day['entries'] > 0));
        if ($loggedDays === 0) {
            $source = 'empty';
            return ['Log a few meals and Coach will summarize your calorie and plan alignment trends here.'];
        }

        $client = new OpenAIClient();
        if ($client->isConfigured()) {
            $payload = [
                'range' => $range,
                'goal' => $goal,
                'averages' => [
                    'planAlignment' => $avgScore,
                    'calories' => $avgCalories,
                ],
                'recentDays' => array_slice($series, -14),
                'macroBreakdown' => array_slice($breakdown, 0, 5),
            ];

            $response = $client->chatJson(
                (string) config('openai.coach_model', 'gpt-4.1-mini'),
                'You write concise nutrition trend insights for Taverai. Return only JSON with key "insights", an array of 2 to 4 short, specific bullets. Mention calories, plan alignment, macro pattern, or consistency when useful. Do not diagnose medical issues.',
                json_encode($payload, JSON_UNESCAPED_SLASHES)
            );

            $insights = $response['insights'] ?? null;
            if (is_array($insights)) {
                $clean = array_values(array_filter(array_map(static fn($item): string => trim((string) $item), $insights)));
                if ($clean !== []) {
                    $source = 'ai';
                    return array_slice($clean, 0, 4);
                }
            }
        }

        $scoreText = $avgScore !== null ? "Average plan alignment is {$avgScore}/100" : 'Plan alignment is still building';
        $calorieText = $avgCalories !== null ? "average logged calories are {$avgCalories} kcal" : 'calorie data is still building';
        $goalText = $goal ? " against a {$goal} kcal goal" : '';
        $latest = end($series);
        $latestText = is_array($latest) && (int) ($latest['entries'] ?? 0) > 0
            ? "Most recent logged day has {$latest['entries']} meal" . ((int) $latest['entries'] === 1 ? '' : 's') . " and {$latest['calories']} kcal."
            : 'The most recent day has not been logged yet.';

        $source = 'fallback';
        return [
            "{$scoreText}; {$calorieText}{$goalText}.",
            $latestText,
            'Keep logging full meals with calories and macros so plan alignment becomes more reliable.',
        ];
    }

    private function coachAnswer(array $entries, string $question, int $horizonDays): string
    {
        $summary = $this->summarize($entries, $horizonDays);
        if (($summary['loggedDays'] ?? 0) === 0) {
            return "Snapshot:\n• No logged meals in the last {$horizonDays} days.\n\nWhat to do next:\n• Log your next meal with a short description.\n• Add one snack today.\n• Come back and ask what to improve first.\n\nOne simple swap:\n• Swap one sugary snack or drink for water and fruit.\n\nEncouragement:\nOne log is enough to get momentum started.";
        }

        $client = new OpenAIClient();
        if ($client->isConfigured()) {
            $input = "QUESTION:\n{$question}\n\nSUMMARY (last {$horizonDays} days):\n" . json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            $answer = $client->responseText(
                (string) config('openai.coach_model', 'gpt-4.1-mini'),
                $this->coachSystemPrompt(),
                $input,
                450
            );
            if (is_string($answer) && trim($answer) !== '') {
                return trim($answer);
            }
        }

        return $this->fallbackAnswer($summary, $question, $horizonDays);
    }

    private function summarize(array $entries, int $horizonDays): array
    {
        $byDay = [];
        $foods = [];
        $calorieValues = [];
        $planMap = [];
        $primaryPlanId = null;

        foreach ($entries as $entry) {
            $createdAt = (string) ($entry['createdAt'] ?? '');
            $dayKey = substr($createdAt, 0, 10);
            if ($dayKey === '') {
                $dayKey = gmdate('Y-m-d');
            }

            if (!isset($byDay[$dayKey])) {
                $byDay[$dayKey] = ['entries' => 0, 'calories' => 0, 'scores' => []];
            }

            $byDay[$dayKey]['entries']++;
            $calories = $this->entryCalories($entry);
            $byDay[$dayKey]['calories'] += $calories;
            if ($calories > 0) {
                $calorieValues[] = $calories;
            }

            $text = trim((string) ($entry['text'] ?? ''));
            if ($text !== '') {
                $foods[$text] = ($foods[$text] ?? 0) + 1;
            }

            foreach (($entry['scores'] ?? []) as $scoreRow) {
                if (!isset($scoreRow['plan']['id'], $scoreRow['score'])) {
                    continue;
                }

                $planId = (string) $scoreRow['plan']['id'];
                if (!isset($planMap[$planId])) {
                    $planMap[$planId] = $scoreRow['plan'];
                }
                if ($primaryPlanId === null) {
                    $primaryPlanId = $planId;
                }

                if ($planId === $primaryPlanId || strtoupper((string) ($scoreRow['plan']['type'] ?? '')) === 'MEDITERRANEAN') {
                    $byDay[$dayKey]['scores'][] = (int) $scoreRow['score'];
                    if (strtoupper((string) ($scoreRow['plan']['type'] ?? '')) === 'MEDITERRANEAN') {
                        $primaryPlanId = $planId;
                    }
                }
            }
        }

        ksort($byDay);
        arsort($foods);

        $dayScores = [];
        foreach ($byDay as $day => $stats) {
            $avgScore = null;
            if (!empty($stats['scores'])) {
                $avgScore = (int) round(array_sum($stats['scores']) / count($stats['scores']));
            }
            $dayScores[] = [
                'key' => $day,
                'score' => $avgScore,
                'cals' => (int) round((float) $stats['calories']),
                'entries' => (int) $stats['entries'],
            ];
        }

        $bestDay = null;
        $worstDay = null;
        foreach ($dayScores as $row) {
            if ($bestDay === null || (($row['score'] ?? -1) > ($bestDay['score'] ?? -1))) {
                $bestDay = $row;
            }
            if ($worstDay === null || (($row['score'] ?? 101) < ($worstDay['score'] ?? 101))) {
                $worstDay = $row;
            }
        }

        $topFoods = [];
        foreach (array_slice(array_keys($foods), 0, 6) as $food) {
            $topFoods[] = ['text' => $food, 'n' => $foods[$food]];
        }

        $scoreValues = array_values(array_filter(array_map(static fn(array $row) => $row['score'], $dayScores), static fn($v) => $v !== null));
        $primaryPlan = $primaryPlanId !== null && isset($planMap[$primaryPlanId]) ? $planMap[$primaryPlanId] : null;

        return [
            'planName' => $primaryPlan['name'] ?? null,
            'planType' => $primaryPlan['type'] ?? null,
            'planId' => $primaryPlan['id'] ?? null,
            'overallAvg' => $scoreValues ? (int) round(array_sum($scoreValues) / count($scoreValues)) : null,
            'bestDay' => $bestDay,
            'worstDay' => $worstDay,
            'foods' => $topFoods,
            'dayScores' => $dayScores,
            'avgCalories' => $calorieValues ? (int) round(array_sum($calorieValues) / count($calorieValues)) : null,
            'loggedDays' => count($dayScores),
            'entryCount' => count($entries),
        ];
    }

    private function entryCalories(array $entry): float
    {
        if (isset($entry['calories']) && is_numeric($entry['calories'])) {
            return (float) $entry['calories'];
        }

        if (isset($entry['parsed']['calories']) && is_numeric($entry['parsed']['calories'])) {
            return (float) $entry['parsed']['calories'];
        }

        return 0.0;
    }

    private function coachSystemPrompt(): string
    {
        return implode("\n", [
            'You are Taverai Coach: supportive, practical, and concise.',
            'Your job is to analyze the user\'s recent nutrition log summary and answer their question.',
            'Output format must be plain text with these sections:',
            '1) Snapshot (2 bullets max)',
            '2) What to do next (3 bullets max, specific and doable)',
            '3) One simple swap (1 bullet)',
            '4) Encouragement (1 short sentence)',
            '',
            'Rules:',
            '- Do not mention being an AI.',
            '- Do not ask more than one follow-up question.',
            '- If the user has no logged days, tell them exactly what to log next and keep it motivating.',
            '- Keep it blended: a little motivational, tactical, and data-aware.',
        ]);
    }

    private function fallbackAnswer(array $summary, string $question, int $horizonDays): string
    {
        $count = (int) ($summary['entryCount'] ?? 0);
        $avgCalories = $summary['avgCalories'] ?? null;
        $calorieText = $avgCalories !== null ? (string) $avgCalories : 'an unknown number of';

        return "Snapshot:\n• You logged {$count} meal entries in the last {$horizonDays} days.\n• Your entries average about {$calorieText} calories when nutrition data is available.\n\nWhat to do next:\n• Keep logging consistently for the next 3 days.\n• Add more detail to each food entry so the coaching can stay specific.\n• Review your highest-calorie meal and identify one small improvement.\n\nOne simple swap:\n• Add a protein or fiber source to one meal that feels least filling.\n\nEncouragement:\nYou're building a usable dataset, and that consistency will make the coaching smarter.\n\nQuestion noted: {$question}";
    }
}
