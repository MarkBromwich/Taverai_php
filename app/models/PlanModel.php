<?php

class PlanModel extends BaseModel
{
    public function allForUser(string $userId): array
    {
        $db = $this->db();
        if ($db === null) {
            return [];
        }

        $stmt = $db->prepare('SELECT * FROM user_plans WHERE user_id = :user_id ORDER BY created_at ASC');
        $stmt->execute(['user_id' => $userId]);
        $rows = $stmt->fetchAll() ?: [];

        return array_map([$this, 'normalizePlan'], $rows);
    }

    public function createForUser(string $userId, string $name, string $type, $config = null): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $id = generate_id();
        $stmt = $db->prepare(
            'INSERT INTO user_plans (id, user_id, name, type, config)
             VALUES (:id, :user_id, :name, :type, :config)'
        );
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
            'name' => $name,
            'type' => $type,
            'config' => $config === null ? null : json_encode($config, JSON_UNESCAPED_SLASHES),
        ]);

        $single = $db->prepare('SELECT * FROM user_plans WHERE id = :id LIMIT 1');
        $single->execute(['id' => $id]);
        $row = $single->fetch();

        return $row ? $this->normalizePlan($row) : null;
    }

    public function createFromTemplateSlug(string $userId, string $slug): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $stmt = $db->prepare('SELECT slug, name, category, config FROM plan_templates WHERE slug = :slug AND is_active = 1 LIMIT 1');
        $stmt->execute(['slug' => $slug]);
        $template = $stmt->fetch();
        if (!$template) {
            return null;
        }

        $type = strtoupper(str_replace('-', '_', (string) $template['slug']));
        $config = [
            'templateSlug' => $template['slug'],
            'templateCategory' => $template['category'] ?? null,
        ];

        $templateConfig = $template['config'] ?? null;
        if (is_string($templateConfig) && $templateConfig !== '') {
            $decoded = json_decode($templateConfig, true);
            if (is_array($decoded)) {
                $config = array_merge($config, $decoded);
            }
        }

        return $this->createForUser($userId, (string) $template['name'], $type, $config);
    }

    public function deleteForUser(string $userId, string $id): bool
    {
        $db = $this->db();
        if ($db === null) {
            return false;
        }

        $stmt = $db->prepare('DELETE FROM user_plans WHERE id = :id AND user_id = :user_id');
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
        ]);

        return $stmt->rowCount() > 0;
    }

    public function templates(): array
    {
        $db = $this->db();
        if ($db === null) {
            return [];
        }

        $stmt = $db->query('SELECT slug, name, category FROM plan_templates WHERE is_active = 1 ORDER BY category ASC, name ASC');
        return $stmt->fetchAll() ?: [];
    }

    private function normalizePlan(array $row): array
    {
        $config = $row['config'] ?? null;
        if (is_string($config) && $config !== '') {
            $decoded = json_decode($config, true);
            $config = is_array($decoded) ? $decoded : null;
        }

        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'type' => $row['type'],
            'config' => $config,
            'createdAt' => $row['created_at'],
        ];
    }
}
