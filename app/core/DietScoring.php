<?php

class DietScoring
{
    private const DEFAULT_PROFILE = [
        'slug' => 'mediterranean',
        'label' => 'Mediterranean',
        'carbs' => ['min' => 0.42, 'max' => 0.65],
        'fat' => ['min' => 0.20, 'max' => 0.40],
        'protein' => ['min' => 0.10, 'max' => 0.35],
        'penaltyDivisor' => 0.30,
    ];

    private const PROFILES = [
        'mediterranean' => ['slug' => 'mediterranean', 'label' => 'Mediterranean', 'carbs' => ['min' => 0.42, 'max' => 0.65], 'fat' => ['min' => 0.20, 'max' => 0.40], 'protein' => ['min' => 0.10, 'max' => 0.35], 'penaltyDivisor' => 0.30],
        'dash' => ['slug' => 'dash', 'label' => 'DASH', 'carbs' => ['min' => 0.45, 'max' => 0.60], 'fat' => ['min' => 0.20, 'max' => 0.32], 'protein' => ['min' => 0.15, 'max' => 0.30], 'penaltyDivisor' => 0.28],
        'mind' => ['slug' => 'mind', 'label' => 'MIND', 'carbs' => ['min' => 0.42, 'max' => 0.58], 'fat' => ['min' => 0.25, 'max' => 0.40], 'protein' => ['min' => 0.15, 'max' => 0.30], 'penaltyDivisor' => 0.29],
        'pescatarian' => ['slug' => 'pescatarian', 'label' => 'Pescatarian', 'carbs' => ['min' => 0.40, 'max' => 0.55], 'fat' => ['min' => 0.25, 'max' => 0.40], 'protein' => ['min' => 0.18, 'max' => 0.35], 'penaltyDivisor' => 0.27],
        'plant-forward' => ['slug' => 'plant-forward', 'label' => 'Plant-Forward', 'carbs' => ['min' => 0.45, 'max' => 0.65], 'fat' => ['min' => 0.20, 'max' => 0.35], 'protein' => ['min' => 0.12, 'max' => 0.28], 'penaltyDivisor' => 0.30],
        'vegetarian' => ['slug' => 'vegetarian', 'label' => 'Vegetarian', 'carbs' => ['min' => 0.45, 'max' => 0.65], 'fat' => ['min' => 0.20, 'max' => 0.35], 'protein' => ['min' => 0.12, 'max' => 0.28], 'penaltyDivisor' => 0.30],
        'vegan' => ['slug' => 'vegan', 'label' => 'Vegan', 'carbs' => ['min' => 0.50, 'max' => 0.68], 'fat' => ['min' => 0.18, 'max' => 0.32], 'protein' => ['min' => 0.12, 'max' => 0.25], 'penaltyDivisor' => 0.31],
        'flexitarian' => ['slug' => 'flexitarian', 'label' => 'Flexitarian', 'carbs' => ['min' => 0.42, 'max' => 0.62], 'fat' => ['min' => 0.22, 'max' => 0.37], 'protein' => ['min' => 0.15, 'max' => 0.30], 'penaltyDivisor' => 0.30],
        'anti-inflammatory' => ['slug' => 'anti-inflammatory', 'label' => 'Anti-inflammatory', 'carbs' => ['min' => 0.40, 'max' => 0.55], 'fat' => ['min' => 0.25, 'max' => 0.40], 'protein' => ['min' => 0.18, 'max' => 0.32], 'penaltyDivisor' => 0.28],
        'low-gi' => ['slug' => 'low-gi', 'label' => 'Low-GI', 'carbs' => ['min' => 0.35, 'max' => 0.50], 'fat' => ['min' => 0.25, 'max' => 0.40], 'protein' => ['min' => 0.18, 'max' => 0.35], 'penaltyDivisor' => 0.27],
        'high-fiber' => ['slug' => 'high-fiber', 'label' => 'High-Fiber', 'carbs' => ['min' => 0.45, 'max' => 0.65], 'fat' => ['min' => 0.20, 'max' => 0.35], 'protein' => ['min' => 0.12, 'max' => 0.30], 'penaltyDivisor' => 0.30],
        'volumetrics' => ['slug' => 'volumetrics', 'label' => 'Volumetrics', 'carbs' => ['min' => 0.45, 'max' => 0.62], 'fat' => ['min' => 0.18, 'max' => 0.30], 'protein' => ['min' => 0.15, 'max' => 0.30], 'penaltyDivisor' => 0.27],
        'high-protein' => ['slug' => 'high-protein', 'label' => 'High-Protein', 'carbs' => ['min' => 0.20, 'max' => 0.40], 'fat' => ['min' => 0.20, 'max' => 0.35], 'protein' => ['min' => 0.28, 'max' => 0.45], 'penaltyDivisor' => 0.25],
        'keto' => ['slug' => 'keto', 'label' => 'Keto', 'carbs' => ['min' => 0.02, 'max' => 0.10], 'fat' => ['min' => 0.60, 'max' => 0.75], 'protein' => ['min' => 0.18, 'max' => 0.32], 'penaltyDivisor' => 0.22],
        'paleo' => ['slug' => 'paleo', 'label' => 'Paleo', 'carbs' => ['min' => 0.20, 'max' => 0.35], 'fat' => ['min' => 0.30, 'max' => 0.45], 'protein' => ['min' => 0.25, 'max' => 0.40], 'penaltyDivisor' => 0.25],
        'whole30' => ['slug' => 'whole30', 'label' => 'Whole30', 'carbs' => ['min' => 0.25, 'max' => 0.40], 'fat' => ['min' => 0.30, 'max' => 0.45], 'protein' => ['min' => 0.22, 'max' => 0.38], 'penaltyDivisor' => 0.25],
        'intermittent-fasting' => ['slug' => 'intermittent-fasting', 'label' => 'Intermittent Fasting', 'carbs' => ['min' => 0.35, 'max' => 0.55], 'fat' => ['min' => 0.22, 'max' => 0.38], 'protein' => ['min' => 0.18, 'max' => 0.32], 'penaltyDivisor' => 0.30],
        'gluten-free' => ['slug' => 'gluten-free', 'label' => 'Gluten-Free', 'carbs' => ['min' => 0.40, 'max' => 0.60], 'fat' => ['min' => 0.22, 'max' => 0.36], 'protein' => ['min' => 0.15, 'max' => 0.32], 'penaltyDivisor' => 0.30],
        'low-fodmap' => ['slug' => 'low-fodmap', 'label' => 'Low-FODMAP', 'carbs' => ['min' => 0.35, 'max' => 0.50], 'fat' => ['min' => 0.25, 'max' => 0.38], 'protein' => ['min' => 0.18, 'max' => 0.35], 'penaltyDivisor' => 0.28],
    ];

    public static function scorePlan(array $plan, array $entry, ?int $dailyCalorieGoal = null): ?array
    {
        $type = strtoupper((string) ($plan['type'] ?? ''));

        if ($type === 'CALORIE') {
            return self::scoreCaloriePlan($plan, $entry, $dailyCalorieGoal);
        }

        return self::scoreMacroProfile($plan, $entry);
    }

    private static function scoreCaloriePlan(array $plan, array $entry, ?int $dailyCalorieGoal): ?array
    {
        $calories = self::number($entry['calories'] ?? null);
        if ($calories === null && isset($entry['parsed']['calories'])) {
            $calories = self::number($entry['parsed']['calories']);
        }
        if ($calories === null) {
            return null;
        }

        $config = is_array($plan['config'] ?? null) ? $plan['config'] : [];
        $target = self::number($config['targetCalories'] ?? null);
        if ($target === null && $dailyCalorieGoal !== null && $dailyCalorieGoal > 0) {
            $target = (float) $dailyCalorieGoal;
        }
        if ($target === null || $target <= 0) {
            return null;
        }

        $pct = max(0.0, min(2.0, $calories / $target));
        $score = (int) round(100 * max(0.0, min(1.0, 1 - max(0.0, $pct - 1))));

        return [
            'score' => $score,
            'details' => [
                'reasons' => $calories > $target ? ['Calories above target'] : [],
                'breakdown' => [
                    'targetCalories' => (int) round($target),
                    'entryCalories' => (int) round($calories),
                ],
            ],
        ];
    }

    private static function scoreMacroProfile(array $plan, array $entry): ?array
    {
        $proteinG = self::number($entry['proteinG'] ?? null);
        $carbsG = self::number($entry['carbsG'] ?? null);
        $fatG = self::number($entry['fatG'] ?? null);

        if ($proteinG === null || $carbsG === null || $fatG === null) {
            if (isset($entry['parsed']['macros']) && is_array($entry['parsed']['macros'])) {
                $proteinG = $proteinG ?? self::number($entry['parsed']['macros']['proteinG'] ?? null);
                $carbsG = $carbsG ?? self::number($entry['parsed']['macros']['carbsG'] ?? null);
                $fatG = $fatG ?? self::number($entry['parsed']['macros']['fatG'] ?? null);
            }
        }

        if ($proteinG === null || $carbsG === null || $fatG === null) {
            return null;
        }

        $pct = self::macroPercents($proteinG, $carbsG, $fatG);
        if ($pct === null) {
            return null;
        }

        $profile = self::resolveProfile(is_array($plan['config'] ?? null) ? $plan['config'] : null, (string) ($plan['name'] ?? ''));
        $sCarb = self::scoreWithinRange($pct['carbs'], $profile['carbs']['min'], $profile['carbs']['max'], $profile['penaltyDivisor']);
        $sFat = self::scoreWithinRange($pct['fat'], $profile['fat']['min'], $profile['fat']['max'], $profile['penaltyDivisor']);
        $sProtein = self::scoreWithinRange($pct['protein'], $profile['protein']['min'], $profile['protein']['max'], $profile['penaltyDivisor']);
        $score = (int) round(($sCarb + $sFat + $sProtein) / 3);

        $reasons = [];
        if ($pct['carbs'] < $profile['carbs']['min']) $reasons[] = 'Carbs below target range';
        if ($pct['carbs'] > $profile['carbs']['max']) $reasons[] = 'Carbs above target range';
        if ($pct['fat'] < $profile['fat']['min']) $reasons[] = 'Fat below target range';
        if ($pct['fat'] > $profile['fat']['max']) $reasons[] = 'Fat above target range';
        if ($pct['protein'] < $profile['protein']['min']) $reasons[] = 'Protein below target range';
        if ($pct['protein'] > $profile['protein']['max']) $reasons[] = 'Protein above target range';

        return [
            'score' => $score,
            'details' => [
                'reasons' => $reasons,
                'breakdown' => [
                    'profile' => $profile['slug'],
                    'macroPct' => [
                        'carbs' => (int) round($pct['carbs'] * 100),
                        'fat' => (int) round($pct['fat'] * 100),
                        'protein' => (int) round($pct['protein'] * 100),
                    ],
                    'targetsPct' => [
                        'carbs' => ['min' => (int) round($profile['carbs']['min'] * 100), 'max' => (int) round($profile['carbs']['max'] * 100)],
                        'fat' => ['min' => (int) round($profile['fat']['min'] * 100), 'max' => (int) round($profile['fat']['max'] * 100)],
                        'protein' => ['min' => (int) round($profile['protein']['min'] * 100), 'max' => (int) round($profile['protein']['max'] * 100)],
                    ],
                ],
            ],
        ];
    }

    public static function resolveProfile(?array $config, string $planName = ''): array
    {
        $saved = $config['scoringProfile'] ?? null;
        if (is_array($saved)
            && isset($saved['carbs']['min'], $saved['carbs']['max'], $saved['fat']['min'], $saved['fat']['max'], $saved['protein']['min'], $saved['protein']['max'], $saved['penaltyDivisor'])) {
            return [
                'slug' => (string) ($saved['slug'] ?? ($config['templateSlug'] ?? 'custom')),
                'label' => (string) ($saved['label'] ?? ($planName !== '' ? $planName : 'Custom')),
                'carbs' => ['min' => (float) $saved['carbs']['min'], 'max' => (float) $saved['carbs']['max']],
                'fat' => ['min' => (float) $saved['fat']['min'], 'max' => (float) $saved['fat']['max']],
                'protein' => ['min' => (float) $saved['protein']['min'], 'max' => (float) $saved['protein']['max']],
                'penaltyDivisor' => (float) $saved['penaltyDivisor'],
            ];
        }

        if (is_array($config) && isset($config['templateSlug']) && is_string($config['templateSlug'])) {
            return self::profileBySlug($config['templateSlug']);
        }

        return $planName !== '' ? self::profileBySlug($planName) : self::DEFAULT_PROFILE;
    }

    private static function profileBySlug(string $slug): array
    {
        $key = self::slugify($slug);
        return self::PROFILES[$key] ?? self::DEFAULT_PROFILE;
    }

    private static function slugify(string $input): string
    {
        $value = strtolower(trim($input));
        $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?: '';
        return trim($value, '-');
    }

    private static function macroPercents(float $proteinG, float $carbsG, float $fatG): ?array
    {
        $proteinCalories = $proteinG * 4;
        $carbCalories = $carbsG * 4;
        $fatCalories = $fatG * 9;
        $total = $proteinCalories + $carbCalories + $fatCalories;
        if ($total <= 0 || !is_finite($total)) {
            return null;
        }

        return [
            'protein' => $proteinCalories / $total,
            'carbs' => $carbCalories / $total,
            'fat' => $fatCalories / $total,
        ];
    }

    private static function scoreWithinRange(float $pct, float $min, float $max, float $penaltyDivisor): int
    {
        if ($pct >= $min && $pct <= $max) {
            return 100;
        }

        $dist = $pct < $min ? ($min - $pct) : ($pct - $max);
        $divisor = $penaltyDivisor > 0 ? $penaltyDivisor : 0.30;
        return (int) round(100 * (1 - max(0.0, min(1.0, $dist / $divisor))));
    }

    private static function number($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        return is_numeric($value) ? (float) $value : null;
    }
}
