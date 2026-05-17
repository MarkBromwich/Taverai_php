<?php

class MealQualityScoring
{
    public static function apply(array $plan, array $entry, ?array $computed, array $context = []): ?array
    {
        if ($computed === null || !isset($computed['score'])) {
            return $computed;
        }

        $score = max(0, min(100, (int) round((float) $computed['score'])));
        $details = isset($computed['details']) && is_array($computed['details']) ? $computed['details'] : [];
        $reasons = isset($details['reasons']) && is_array($details['reasons']) ? array_values($details['reasons']) : [];
        $quality = self::qualityAdjustment($score, $plan, $entry, $context);

        $details['reasons'] = array_values(array_slice(array_unique(array_merge($reasons, $quality['reasons'])), 0, 5));
        $details['quality'] = [
            'baseScore' => $score,
            'adjustedScore' => $quality['score'],
            'adjustments' => $quality['adjustments'],
        ];

        return [
            'score' => $quality['score'],
            'details' => $details,
        ];
    }

    public static function qualityAdjustment(int $baseScore, array $plan, array $entry, array $context = []): array
    {
        $score = max(0, min(100, $baseScore));
        $reasons = [];
        $adjustments = [];
        $profile = DietScoring::resolveProfile(is_array($plan['config'] ?? null) ? $plan['config'] : null, (string) ($plan['name'] ?? ''));
        $haystack = self::haystack($entry, $context);
        $restaurant = strtolower((string) ($context['restaurant'] ?? ''));
        $isMediterranean = str_contains(strtolower((string) ($profile['slug'] ?? '')), 'mediterranean')
            || str_contains(strtolower((string) ($profile['label'] ?? '')), 'mediterranean');
        $isFastFoodChain = (bool) preg_match('/mcdonald|burger king|wendy|taco bell|kfc|popeyes|chick-fil-a|arby|sonic|dairy queen|five guys|shake shack|whataburger|in-n-out|jack in the box|del taco/i', $restaurant . ' ' . $haystack);
        $isCombo = (bool) preg_match('/combo|meal deal|number\s*\d+|#\s*\d+|value meal|with fries|fries|soda|drink/', $haystack);

        self::penalizeCalories($entry, $score, $reasons, $adjustments);
        self::penalizeNumber($entry, ['satFatG', 'sat_fat_g'], 10, 10, 'High saturated fat works against this plan', $score, $reasons, $adjustments);
        self::penalizeNumber($entry, ['sugarG', 'sugar_g'], 35, 12, 'High sugar estimate lowers plan fit', $score, $reasons, $adjustments);
        self::penalizeLowFiber($entry, $score, $reasons, $adjustments);

        if (preg_match('/fries|fried|crispy|nugget|tender|hash brown|chips/', $haystack)) {
            self::applyPenalty($score, $reasons, $adjustments, 14, 'Fried or crispy items reduce plan alignment');
        }

        if (preg_match('/soda|soft drink|shake|mcflurry|sweet tea|lemonade|dessert|candy|cookie|donut|doughnut/', $haystack)) {
            self::applyPenalty($score, $reasons, $adjustments, 10, 'Sugary drink or dessert is not a strong plan match');
        }

        if (preg_match('/burger|bacon|sausage|pepperoni|hot dog|double|big mac|quarter pounder|processed meat/', $haystack)) {
            self::applyPenalty($score, $reasons, $adjustments, 8, 'Red or processed meat lowers diet quality fit');
        }

        if ($isFastFoodChain && $isCombo) {
            self::applyPenalty($score, $reasons, $adjustments, 10, 'Fast-food combo structure is a weaker fit than a whole-food meal');
        }

        if ($isMediterranean) {
            $hasMediterraneanSignals = (bool) preg_match('/salad|vegetable|greens|bean|lentil|chickpea|fish|salmon|tuna|shrimp|olive|whole grain|brown rice|quinoa|fruit|berries|nuts|walnut|almond|yogurt|avocado/', $haystack);
            if (!$hasMediterraneanSignals && ($isFastFoodChain || preg_match('/burger|fries|fried|combo|soda|pizza|hot dog/', $haystack))) {
                self::applyPenalty($score, $reasons, $adjustments, 14, 'Missing core Mediterranean signals like vegetables, legumes, fish, olive oil, nuts, or whole grains');
            }
        }

        if ($isFastFoodChain && $isCombo) {
            self::capScore($score, $reasons, $adjustments, 72, 'Fast-food combo meals cannot score as ideal plan matches');
            if (preg_match('/fries|fried|soda|shake|double|big mac|quarter pounder/', $haystack)) {
                self::capScore($score, $reasons, $adjustments, 62, 'Fried or sugary combo items cap the meal quality score');
            }
        }

        return [
            'score' => max(0, min(100, (int) round($score))),
            'reasons' => array_values(array_slice(array_unique($reasons), 0, 5)),
            'adjustments' => $adjustments,
        ];
    }

    private static function haystack(array $entry, array $context): string
    {
        $parts = [
            $context['restaurant'] ?? '',
            $context['inputText'] ?? '',
            $context['resolvedName'] ?? '',
            $context['summary'] ?? '',
            $entry['text'] ?? '',
            $entry['name'] ?? '',
            $entry['title'] ?? '',
        ];

        $parsed = is_array($entry['parsed'] ?? null) ? $entry['parsed'] : [];
        foreach (['title', 'notes', 'summary', 'source'] as $key) {
            if (isset($parsed[$key]) && is_scalar($parsed[$key])) {
                $parts[] = (string) $parsed[$key];
            }
        }

        $items = $parsed['items'] ?? [];
        if (is_array($items)) {
            foreach ($items as $item) {
                if (is_array($item)) {
                    $parts[] = (string) ($item['name'] ?? '');
                    $parts[] = (string) ($item['foodGroup'] ?? '');
                    foreach (($item['tags'] ?? []) as $tag) {
                        $parts[] = (string) $tag;
                    }
                } elseif (is_scalar($item)) {
                    $parts[] = (string) $item;
                }
            }
        }

        return strtolower(implode(' ', array_filter(array_map(static fn($part): string => trim((string) $part), $parts))));
    }

    private static function penalizeCalories(array $entry, int &$score, array &$reasons, array &$adjustments): void
    {
        $calories = self::number($entry, ['calories']);
        if ($calories === null) {
            return;
        }
        if ($calories >= 1200) {
            self::applyPenalty($score, $reasons, $adjustments, 18, 'Very high calorie estimate for one meal');
        } elseif ($calories >= 900) {
            self::applyPenalty($score, $reasons, $adjustments, 10, 'High calorie estimate for one meal');
        }
    }

    private static function penalizeNumber(array $entry, array $keys, float $threshold, int $penalty, string $reason, int &$score, array &$reasons, array &$adjustments): void
    {
        $value = self::number($entry, $keys);
        if ($value !== null && $value >= $threshold) {
            self::applyPenalty($score, $reasons, $adjustments, $penalty, $reason);
        }
    }

    private static function penalizeLowFiber(array $entry, int &$score, array &$reasons, array &$adjustments): void
    {
        $fiber = self::number($entry, ['fiberG', 'fiber_g']);
        if ($fiber !== null && $fiber > 0 && $fiber < 4) {
            self::applyPenalty($score, $reasons, $adjustments, 6, 'Low fiber for a plan-focused meal');
        }
    }

    private static function number(array $entry, array $keys): ?float
    {
        foreach ($keys as $key) {
            if (isset($entry[$key]) && is_numeric($entry[$key])) {
                return (float) $entry[$key];
            }
            if (isset($entry['parsed'][$key]) && is_numeric($entry['parsed'][$key])) {
                return (float) $entry['parsed'][$key];
            }
            if (isset($entry['parsed']['nutrition'][$key]) && is_numeric($entry['parsed']['nutrition'][$key])) {
                return (float) $entry['parsed']['nutrition'][$key];
            }
        }

        return null;
    }

    private static function applyPenalty(int &$score, array &$reasons, array &$adjustments, int $points, string $reason): void
    {
        $score -= $points;
        $reasons[] = $reason;
        $adjustments[] = ['type' => 'penalty', 'points' => $points, 'reason' => $reason];
    }

    private static function capScore(int &$score, array &$reasons, array &$adjustments, int $cap, string $reason): void
    {
        if ($score <= $cap) {
            return;
        }

        $score = $cap;
        $reasons[] = $reason;
        $adjustments[] = ['type' => 'cap', 'score' => $cap, 'reason' => $reason];
    }
}
