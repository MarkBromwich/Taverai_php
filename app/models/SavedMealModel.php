<?php

class SavedMealModel extends BaseModel
{
    public function allForUser(string $userId, int $limit = 50): array
    {
        $db = $this->db();
        if ($db === null) {
            return [];
        }

        $stmt = $db->prepare('SELECT * FROM saved_meals WHERE user_id = :user_id ORDER BY created_at DESC LIMIT ' . max(1, (int) $limit));
        $stmt->execute(['user_id' => $userId]);
        $rows = $stmt->fetchAll() ?: [];

        return array_map([$this, 'normalizeMeal'], $rows);
    }

    public function createForUser(string $userId, array $data): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $id = generate_id();
        $stmt = $db->prepare(
            'INSERT INTO saved_meals (id, user_id, title, meal_type, description, calories, recipe)
             VALUES (:id, :user_id, :title, :meal_type, :description, :calories, :recipe)'
        );
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
            'title' => $data['title'],
            'meal_type' => $data['mealType'] ?? null,
            'description' => $data['description'] ?? null,
            'calories' => $data['calories'] ?? null,
            'recipe' => json_encode($data['recipe'] ?? [], JSON_UNESCAPED_SLASHES),
        ]);

        $single = $db->prepare('SELECT * FROM saved_meals WHERE id = :id LIMIT 1');
        $single->execute(['id' => $id]);
        $row = $single->fetch();

        return $row ? $this->normalizeMeal($row) : null;
    }

    public function deleteForUser(string $userId, string $id): bool
    {
        $db = $this->db();
        if ($db === null) {
            return false;
        }

        $stmt = $db->prepare('DELETE FROM saved_meals WHERE id = :id AND user_id = :user_id');
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
        ]);

        return $stmt->rowCount() > 0;
    }

    private function normalizeMeal(array $row): array
    {
        $recipe = $row['recipe'] ?? null;
        if (is_string($recipe) && $recipe !== '') {
            $decoded = json_decode($recipe, true);
            $recipe = is_array($decoded) ? $decoded : null;
        }

        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'mealType' => $row['meal_type'] ?? null,
            'description' => $row['description'] ?? null,
            'calories' => $row['calories'] !== null ? (float) $row['calories'] : null,
            'recipe' => $recipe,
            'createdAt' => $row['created_at'],
        ];
    }
}
