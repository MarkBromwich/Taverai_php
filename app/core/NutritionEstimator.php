<?php

class NutritionEstimator
{
    public static function fromText(string $text): ?array
    {
        $normalized = strtolower($text);
        $items = [];

        self::addFood($items, $normalized, 'egg', ['egg', 'eggs'], 70, 6, 0.6, 5);
        self::addFood($items, $normalized, 'bread', ['bread', 'toast'], 95, 4, 18, 1.2);
        self::addFood($items, $normalized, 'avocado', ['avocado', 'avacado'], 240, 3, 12, 22, 0.5);
        self::addFood($items, $normalized, 'banana', ['banana', 'bananas'], 105, 1.3, 27, 0.4);
        self::addFood($items, $normalized, 'apple', ['apple', 'apples'], 95, 0.5, 25, 0.3);
        self::addFood($items, $normalized, 'chicken breast', ['chicken'], 165, 31, 0, 3.6);
        self::addFood($items, $normalized, 'rice', ['rice'], 205, 4.3, 45, 0.4);
        self::addFood($items, $normalized, 'oatmeal', ['oatmeal', 'oats'], 150, 5, 27, 3);
        self::addFood($items, $normalized, 'yogurt', ['yogurt', 'yoghurt'], 150, 9, 17, 5);

        if ($items === []) {
            return null;
        }

        $totals = array_reduce($items, static function (array $carry, array $item): array {
            $carry['calories'] += $item['calories'];
            $carry['proteinG'] += $item['proteinG'];
            $carry['carbsG'] += $item['carbsG'];
            $carry['fatG'] += $item['fatG'];
            return $carry;
        }, ['calories' => 0, 'proteinG' => 0, 'carbsG' => 0, 'fatG' => 0]);

        return [
            'title' => self::titleFromItems($items),
            'calories' => round($totals['calories']),
            'proteinG' => round($totals['proteinG'], 1),
            'carbsG' => round($totals['carbsG'], 1),
            'fatG' => round($totals['fatG'], 1),
            'confidence' => 0.45,
            'notes' => 'Fallback estimate from common food portions. Review and edit if needed.',
            'items' => $items,
            'source' => 'textFallback',
        ];
    }

    public static function fromPhotoFallback(): array
    {
        return [
            'title' => 'Meal photo estimate',
            'calories' => 500,
            'proteinG' => 25,
            'carbsG' => 55,
            'fatG' => 18,
            'confidence' => 0.2,
            'notes' => 'Provisional estimate because image analysis did not return nutrition. Review and edit if needed.',
            'items' => [],
            'source' => 'photoFallback',
        ];
    }

    private static function addFood(array &$items, string $text, string $name, array $terms, float $calories, float $proteinG, float $carbsG, float $fatG, float $defaultQuantity = 1.0): void
    {
        foreach ($terms as $term) {
            if (!preg_match('/\b' . preg_quote($term, '/') . '\b/', $text)) {
                continue;
            }

            $quantity = self::quantityBefore($text, $term) ?? $defaultQuantity;
            $items[] = [
                'name' => $name,
                'quantity' => $quantity,
                'calories' => round($calories * $quantity),
                'proteinG' => round($proteinG * $quantity, 1),
                'carbsG' => round($carbsG * $quantity, 1),
                'fatG' => round($fatG * $quantity, 1),
                'source' => 'fallback',
            ];
            return;
        }
    }

    private static function quantityBefore(string $text, string $term): ?float
    {
        $wordNumbers = [
            'a' => 1,
            'an' => 1,
            'one' => 1,
            'two' => 2,
            'three' => 3,
            'four' => 4,
            'five' => 5,
            'six' => 6,
            'half' => 0.5,
        ];

        if (preg_match('/\b(\d+(?:\.\d+)?)\s+(?:pieces?\s+of\s+|slices?\s+of\s+)?' . preg_quote($term, '/') . '\b/', $text, $matches)) {
            return (float) $matches[1];
        }

        $words = implode('|', array_map('preg_quote', array_keys($wordNumbers)));
        if (preg_match('/\b(' . $words . ')\s+(?:pieces?\s+of\s+|slices?\s+of\s+)?' . preg_quote($term, '/') . '\b/', $text, $matches)) {
            return (float) $wordNumbers[$matches[1]];
        }

        return null;
    }

    private static function titleFromItems(array $items): string
    {
        $names = array_map(static fn(array $item): string => (string) $item['name'], $items);
        return implode(', ', array_slice($names, 0, 3));
    }
}
