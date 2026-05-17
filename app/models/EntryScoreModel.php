<?php

class EntryScoreModel extends BaseModel
{
    public function syncForEntry(string $entryId, array $plans, array $entry, ?int $dailyCalorieGoal = null): void
    {
        $db = $this->db();
        if ($db === null) {
            return;
        }

        foreach ($plans as $plan) {
            if (!isset($plan['id'])) {
                continue;
            }

            $computed = MealQualityScoring::apply($plan, $entry, DietScoring::scorePlan($plan, $entry, $dailyCalorieGoal));
            if ($computed === null || !isset($computed['score'])) {
                $delete = $db->prepare('DELETE FROM entry_plan_scores WHERE entry_id = :entry_id AND plan_id = :plan_id');
                $delete->execute([
                    'entry_id' => $entryId,
                    'plan_id' => $plan['id'],
                ]);
                continue;
            }

            $existing = $db->prepare('SELECT id FROM entry_plan_scores WHERE entry_id = :entry_id AND plan_id = :plan_id LIMIT 1');
            $existing->execute([
                'entry_id' => $entryId,
                'plan_id' => $plan['id'],
            ]);
            $row = $existing->fetch();

            $details = isset($computed['details']) ? json_encode($computed['details'], JSON_UNESCAPED_SLASHES) : null;
            if ($row) {
                $update = $db->prepare('UPDATE entry_plan_scores SET score = :score, details = :details WHERE id = :id');
                $update->execute([
                    'score' => (int) round((float) $computed['score']),
                    'details' => $details,
                    'id' => $row['id'],
                ]);
            } else {
                $insert = $db->prepare('INSERT INTO entry_plan_scores (id, entry_id, plan_id, score, details) VALUES (:id, :entry_id, :plan_id, :score, :details)');
                $insert->execute([
                    'id' => generate_id(),
                    'entry_id' => $entryId,
                    'plan_id' => $plan['id'],
                    'score' => (int) round((float) $computed['score']),
                    'details' => $details,
                ]);
            }
        }
    }

    public function forEntryIds(array $entryIds): array
    {
        $db = $this->db();
        if ($db === null || $entryIds === []) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($entryIds), '?'));
        $stmt = $db->prepare(
            "SELECT s.entry_id, s.score, s.details, p.id AS plan_id, p.name AS plan_name, p.type AS plan_type
             FROM entry_plan_scores s
             INNER JOIN user_plans p ON p.id = s.plan_id
             WHERE s.entry_id IN ($placeholders)
             ORDER BY s.created_at ASC"
        );
        $stmt->execute(array_values($entryIds));
        $rows = $stmt->fetchAll() ?: [];

        $grouped = [];
        foreach ($rows as $row) {
            $details = $row['details'] ?? null;
            if (is_string($details) && $details !== '') {
                $decoded = json_decode($details, true);
                $details = is_array($decoded) ? $decoded : null;
            }

            $grouped[$row['entry_id']][] = [
                'score' => (int) $row['score'],
                'details' => $details,
                'plan' => [
                    'id' => $row['plan_id'],
                    'name' => $row['plan_name'],
                    'type' => $row['plan_type'],
                ],
            ];
        }

        return $grouped;
    }
}
