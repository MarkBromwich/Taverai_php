<?php

class EntryModel extends BaseModel
{
    public function allForUser(string $userId, int $horizonDays = 30): array
    {
        $db = $this->db();
        if ($db === null) {
            return [];
        }

        $cutoff = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
            ->modify('-' . max(1, $horizonDays) . ' days')
            ->format('Y-m-d H:i:s');

        $stmt = $db->prepare(
            'SELECT e.* FROM food_entries e
             WHERE e.user_id = :user_id AND e.created_at >= :cutoff
             ORDER BY e.created_at DESC'
        );
        $stmt->execute([
            'user_id' => $userId,
            'cutoff' => $cutoff,
        ]);

        $rows = $stmt->fetchAll() ?: [];
        return $this->hydrateEntries($rows);
    }

    public function allForUserOnDate(string $userId, string $date): array
    {
        $db = $this->db();
        if ($db === null) {
            return [];
        }

        $stmt = $db->prepare(
            'SELECT e.* FROM food_entries e
             WHERE e.user_id = :user_id AND DATE(e.created_at) = :entry_date
             ORDER BY e.created_at DESC'
        );
        $stmt->execute([
            'user_id' => $userId,
            'entry_date' => $date,
        ]);

        $rows = $stmt->fetchAll() ?: [];
        return $this->hydrateEntries($rows);
    }

    public function createForUser(string $userId, array $data): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $id = generate_id();
        $createdAt = $data['createdAt'] ?? now_utc();
        $stmt = $db->prepare(
            'INSERT INTO food_entries (id, user_id, text, created_at, calories, protein_g, carbs_g, fat_g, parsed)
             VALUES (:id, :user_id, :text, :created_at, :calories, :protein_g, :carbs_g, :fat_g, :parsed)'
        );
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
            'text' => $data['text'],
            'created_at' => $createdAt,
            'calories' => $data['calories'],
            'protein_g' => $data['proteinG'],
            'carbs_g' => $data['carbsG'],
            'fat_g' => $data['fatG'],
            'parsed' => $data['parsed'] === null ? null : json_encode($data['parsed'], JSON_UNESCAPED_SLASHES),
        ]);

        $single = $db->prepare('SELECT * FROM food_entries WHERE id = :id LIMIT 1');
        $single->execute(['id' => $id]);
        $row = $single->fetch();

        return $row ? $this->hydrateEntries([$row])[0] : null;
    }

    public function recentForSummary(string $userId, int $horizonDays = 30): array
    {
        return $this->allForUser($userId, $horizonDays);
    }

    public function hydrateExportRows(array $rows): array
    {
        return $this->hydrateEntries($rows);
    }

    public function findForUser(string $userId, string $id): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $stmt = $db->prepare('SELECT * FROM food_entries WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
        ]);
        $row = $stmt->fetch();

        return $row ? $this->hydrateEntries([$row])[0] : null;
    }

    public function updateForUser(string $userId, string $id, array $data): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $stmt = $db->prepare(
            'UPDATE food_entries
             SET text = :text, calories = :calories, protein_g = :protein_g, carbs_g = :carbs_g, fat_g = :fat_g, parsed = :parsed
             WHERE id = :id AND user_id = :user_id'
        );
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
            'text' => $data['text'],
            'calories' => $data['calories'],
            'protein_g' => $data['proteinG'],
            'carbs_g' => $data['carbsG'],
            'fat_g' => $data['fatG'],
            'parsed' => $data['parsed'] === null ? null : json_encode($data['parsed'], JSON_UNESCAPED_SLASHES),
        ]);

        return $this->findForUser($userId, $id);
    }

    public function deleteForUser(string $userId, string $id): bool
    {
        $db = $this->db();
        if ($db === null) {
            return false;
        }

        $stmt = $db->prepare('DELETE FROM food_entries WHERE id = :id AND user_id = :user_id');
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
        ]);

        return $stmt->rowCount() > 0;
    }

    private function normalizeEntry(array $row): array
    {
        $parsed = $row['parsed'] ?? null;
        if (is_string($parsed) && $parsed !== '') {
            $decoded = json_decode($parsed, true);
            $parsed = is_array($decoded) ? $decoded : null;
        }

        $imageUrl = is_array($parsed ?? null) && isset($parsed['imageUrl']) && is_string($parsed['imageUrl'])
            ? $parsed['imageUrl']
            : null;

        $parsedCalories = is_array($parsed ?? null) ? $this->numberOrNull($parsed['calories'] ?? null) : null;
        $parsedMacros = is_array($parsed['macros'] ?? null) ? $parsed['macros'] : [];

        return [
            'id' => $row['id'],
            'text' => $row['text'],
            'createdAt' => $row['created_at'],
            'calories' => $row['calories'] !== null ? (float) $row['calories'] : $parsedCalories,
            'proteinG' => $row['protein_g'] !== null ? (float) $row['protein_g'] : $this->numberOrNull($parsedMacros['proteinG'] ?? ($parsed['proteinG'] ?? null)),
            'carbsG' => $row['carbs_g'] !== null ? (float) $row['carbs_g'] : $this->numberOrNull($parsedMacros['carbsG'] ?? ($parsed['carbsG'] ?? null)),
            'fatG' => $row['fat_g'] !== null ? (float) $row['fat_g'] : $this->numberOrNull($parsedMacros['fatG'] ?? ($parsed['fatG'] ?? null)),
            'imageUrl' => $imageUrl,
            'parsed' => $parsed,
            'scores' => [],
        ];
    }

    private function numberOrNull($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        $num = is_numeric($value) ? (float) $value : null;
        return $num !== null && is_finite($num) ? $num : null;
    }

    private function hydrateEntries(array $rows): array
    {
        $entries = array_map([$this, 'normalizeEntry'], $rows);
        if ($entries === []) {
            return [];
        }

        $ids = array_map(static fn(array $entry): string => $entry['id'], $entries);
        $scoresByEntry = (new EntryScoreModel())->forEntryIds($ids);

        foreach ($entries as &$entry) {
            $entry['scores'] = $scoresByEntry[$entry['id']] ?? [];
        }
        unset($entry);

        return $entries;
    }
}
