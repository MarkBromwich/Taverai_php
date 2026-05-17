<?php

class UserModel extends BaseModel
{
    public function findByEmail(string $email): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $stmt = $db->prepare('SELECT * FROM users WHERE username = :email LIMIT 1');
        $stmt->execute(['email' => strtolower(trim($email))]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function findWithPreferences(string $userId): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $stmt = $db->prepare(
            'SELECT u.*, p.theme, p.units, p.health_app_connected, p.health_app_provider
             FROM users u
             LEFT JOIN user_preferences p ON p.user_id = u.id
             WHERE u.id = :id
             LIMIT 1'
        );
        $stmt->execute(['id' => $userId]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function create(array $data): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $id = generate_id();
        $stmt = $db->prepare(
            'INSERT INTO users (id, first_name, last_name, username, password_hash)
             VALUES (:id, :first_name, :last_name, :username, :password_hash)'
        );
        $stmt->execute([
            'id' => $id,
            'first_name' => $data['firstName'] ?: null,
            'last_name' => $data['lastName'] ?: null,
            'username' => strtolower(trim((string) $data['username'])),
            'password_hash' => $data['passwordHash'],
        ]);

        $this->ensurePreferences($id);

        return $this->findWithPreferences($id);
    }

    public function ensurePreferences(string $userId): void
    {
        $db = $this->db();
        if ($db === null) {
            return;
        }

        $stmt = $db->prepare('SELECT id FROM user_preferences WHERE user_id = :user_id LIMIT 1');
        $stmt->execute(['user_id' => $userId]);

        if ($stmt->fetch()) {
            return;
        }

        $insert = $db->prepare(
            'INSERT INTO user_preferences (id, user_id, theme, units, health_app_connected)
             VALUES (:id, :user_id, :theme, :units, 0)'
        );
        $insert->execute([
            'id' => generate_id(),
            'user_id' => $userId,
            'theme' => 'dark',
            'units' => 'metric',
        ]);
    }

    public function updateUserAndPreferences(string $userId, array $userData, array $prefData): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        if ($userData) {
            $fields = [];
            $params = ['id' => $userId];

            $map = [
                'firstName' => 'first_name',
                'lastName' => 'last_name',
                'username' => 'username',
                'avatarUrl' => 'avatar_url',
                'dailyCalorieGoal' => 'daily_calorie_goal',
            ];

            foreach ($userData as $key => $value) {
                if (!isset($map[$key])) {
                    continue;
                }
                $column = $map[$key];
                $fields[] = "{$column} = :{$key}";
                $params[$key] = $value;
            }

            if ($fields) {
                $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id';
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
            }
        }

        if ($prefData) {
            $this->ensurePreferences($userId);

            $fields = [];
            $params = ['user_id' => $userId];

            $map = [
                'theme' => 'theme',
                'units' => 'units',
                'healthAppConnected' => 'health_app_connected',
                'healthAppProvider' => 'health_app_provider',
            ];

            foreach ($prefData as $key => $value) {
                if (!isset($map[$key])) {
                    continue;
                }
                $column = $map[$key];
                $fields[] = "{$column} = :{$key}";
                $params[$key] = $value;
            }

            if ($fields) {
                $sql = 'UPDATE user_preferences SET ' . implode(', ', $fields) . ' WHERE user_id = :user_id';
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
            }
        }

        return $this->findWithPreferences($userId);
    }

    public function countsForSummary(string $userId): array
    {
        $db = $this->db();
        if ($db === null) {
            return [
                'entryCount' => 0,
                'planCount' => 0,
                'savedMealCount' => 0,
                'loggedDays' => 0,
                'allTimeCalories' => 0,
                'activePlanName' => null,
                'avgPlanAlignment' => null,
            ];
        }

        $entryStmt = $db->prepare('SELECT COUNT(*) FROM food_entries WHERE user_id = :user_id');
        $planStmt = $db->prepare('SELECT COUNT(*) FROM user_plans WHERE user_id = :user_id');
        $savedStmt = $db->prepare('SELECT COUNT(*) FROM saved_meals WHERE user_id = :user_id');
        $entryStatsStmt = $db->prepare(
            'SELECT COUNT(DISTINCT DATE(created_at)) AS logged_days, COALESCE(SUM(calories), 0) AS calories
             FROM food_entries
             WHERE user_id = :user_id'
        );
        $primaryPlanStmt = $db->prepare(
            'SELECT id, name
             FROM user_plans
             WHERE user_id = :user_id
             ORDER BY created_at ASC
             LIMIT 1'
        );

        $entryStmt->execute(['user_id' => $userId]);
        $planStmt->execute(['user_id' => $userId]);
        $savedStmt->execute(['user_id' => $userId]);
        $entryStatsStmt->execute(['user_id' => $userId]);
        $primaryPlanStmt->execute(['user_id' => $userId]);

        $entryStats = $entryStatsStmt->fetch() ?: [];
        $primaryPlan = $primaryPlanStmt->fetch() ?: null;
        $avgPlanAlignment = null;

        if ($primaryPlan && !empty($primaryPlan['id'])) {
            $alignmentStmt = $db->prepare(
                'SELECT AVG(s.score)
                 FROM entry_plan_scores s
                 INNER JOIN food_entries e ON e.id = s.entry_id
                 WHERE e.user_id = :user_id AND s.plan_id = :plan_id'
            );
            $alignmentStmt->execute([
                'user_id' => $userId,
                'plan_id' => $primaryPlan['id'],
            ]);
            $avg = $alignmentStmt->fetchColumn();
            $avgPlanAlignment = $avg !== false && $avg !== null ? (int) round((float) $avg) : null;
        }

        return [
            'entryCount' => (int) $entryStmt->fetchColumn(),
            'planCount' => (int) $planStmt->fetchColumn(),
            'savedMealCount' => (int) $savedStmt->fetchColumn(),
            'loggedDays' => (int) ($entryStats['logged_days'] ?? 0),
            'allTimeCalories' => (int) round((float) ($entryStats['calories'] ?? 0)),
            'activePlanName' => $primaryPlan['name'] ?? null,
            'avgPlanAlignment' => $avgPlanAlignment,
        ];
    }

    public function exportBundle(string $userId): array
    {
        $db = $this->db();
        if ($db === null) {
            return [];
        }

        $userStmt = $db->prepare('SELECT id, username, first_name, last_name, avatar_url, paid_status, daily_calorie_goal, created_at FROM users WHERE id = :id LIMIT 1');
        $prefStmt = $db->prepare('SELECT theme, units, health_app_connected, health_app_provider, created_at, updated_at FROM user_preferences WHERE user_id = :user_id LIMIT 1');
        $plansStmt = $db->prepare('SELECT id, name, type, config, created_at FROM user_plans WHERE user_id = :user_id ORDER BY created_at ASC');
        $entriesStmt = $db->prepare('SELECT id, text, created_at, calories, protein_g, carbs_g, fat_g, parsed FROM food_entries WHERE user_id = :user_id ORDER BY created_at ASC');
        $savedStmt = $db->prepare('SELECT id, title, meal_type, description, calories, recipe, created_at FROM saved_meals WHERE user_id = :user_id ORDER BY created_at DESC');

        $userStmt->execute(['id' => $userId]);
        $prefStmt->execute(['user_id' => $userId]);
        $plansStmt->execute(['user_id' => $userId]);
        $entriesStmt->execute(['user_id' => $userId]);
        $savedStmt->execute(['user_id' => $userId]);

        $user = $userStmt->fetch() ?: null;
        $preferences = $prefStmt->fetch() ?: null;
        $plans = $plansStmt->fetchAll() ?: [];
        $entries = $entriesStmt->fetchAll() ?: [];
        $hydratedEntries = (new EntryModel())->hydrateExportRows($entries);
        $savedMeals = $savedStmt->fetchAll() ?: [];

        return [
            'user' => $user,
            'preferences' => $preferences,
            'plans' => array_map([$this, 'normalizeJsonColumns'], $plans),
            'entries' => $hydratedEntries,
            'savedMeals' => array_map([$this, 'normalizeJsonColumns'], $savedMeals),
        ];
    }

    public function importBundle(string $userId, array $bundle): array
    {
        $db = $this->db();
        if ($db === null) {
            return ['ok' => false, 'error' => 'Database unavailable.'];
        }

        $plans = is_array($bundle['plans'] ?? null) ? array_slice($bundle['plans'], 0, 100) : [];
        $entries = is_array($bundle['entries'] ?? null) ? array_slice($bundle['entries'], 0, 5000) : [];
        $savedMeals = is_array($bundle['savedMeals'] ?? null) ? array_slice($bundle['savedMeals'], 0, 500) : [];
        $preferences = is_array($bundle['preferences'] ?? null) ? $bundle['preferences'] : [];
        $user = is_array($bundle['user'] ?? null) ? $bundle['user'] : [];

        $db->beginTransaction();
        try {
            $db->prepare('DELETE FROM food_entries WHERE user_id = :user_id')->execute(['user_id' => $userId]);
            $db->prepare('DELETE FROM saved_meals WHERE user_id = :user_id')->execute(['user_id' => $userId]);
            $db->prepare('DELETE FROM user_plans WHERE user_id = :user_id')->execute(['user_id' => $userId]);

            $this->importProfile($db, $userId, $user);
            $this->importPreferences($db, $userId, $preferences);
            $this->importPlans($db, $userId, $plans);
            $this->importEntries($db, $userId, $entries);
            $this->importSavedMeals($db, $userId, $savedMeals);

            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            app_log('Account import failed', ['error' => $e->getMessage(), 'userId' => $userId]);
            return ['ok' => false, 'error' => 'Import failed.'];
        }

        return [
            'ok' => true,
            'counts' => [
                'plans' => count($plans),
                'entries' => count($entries),
                'savedMeals' => count($savedMeals),
            ],
        ];
    }

    public function updateAvatarUrl(string $userId, string $avatarUrl): ?string
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $stmt = $db->prepare('UPDATE users SET avatar_url = :avatar_url WHERE id = :id');
        $stmt->execute([
            'avatar_url' => $avatarUrl,
            'id' => $userId,
        ]);

        return $avatarUrl;
    }

    public function updatePasswordHash(string $userId, string $passwordHash): bool
    {
        $db = $this->db();
        if ($db === null) {
            return false;
        }

        $stmt = $db->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
        $stmt->execute([
            'password_hash' => $passwordHash,
            'id' => $userId,
        ]);

        return $stmt->rowCount() > 0;
    }

    public function deleteUser(string $userId): bool
    {
        $db = $this->db();
        if ($db === null) {
            return false;
        }

        $stmt = $db->prepare('DELETE FROM users WHERE id = :id');
        $stmt->execute(['id' => $userId]);
        return $stmt->rowCount() > 0;
    }

    private function normalizeJsonColumns(array $row): array
    {
        foreach (['config', 'parsed', 'recipe'] as $column) {
            if (isset($row[$column]) && is_string($row[$column]) && $row[$column] !== '') {
                $decoded = json_decode($row[$column], true);
                $row[$column] = is_array($decoded) ? $decoded : $row[$column];
            }
        }

        return $row;
    }

    private function importProfile(PDO $db, string $userId, array $user): void
    {
        $dailyGoal = $user['daily_calorie_goal'] ?? $user['dailyCalorieGoal'] ?? null;
        $dailyGoal = is_numeric($dailyGoal) ? max(0, min(20000, (int) $dailyGoal)) : null;

        $stmt = $db->prepare(
            'UPDATE users
             SET first_name = :first_name,
                 last_name = :last_name,
                 avatar_url = :avatar_url,
                 daily_calorie_goal = :daily_calorie_goal
             WHERE id = :id'
        );
        $stmt->execute([
            'id' => $userId,
            'first_name' => $this->nullableShortString($user['first_name'] ?? $user['firstName'] ?? null, 100),
            'last_name' => $this->nullableShortString($user['last_name'] ?? $user['lastName'] ?? null, 100),
            'avatar_url' => $this->nullableShortString($user['avatar_url'] ?? $user['avatarUrl'] ?? null, 255),
            'daily_calorie_goal' => $dailyGoal,
        ]);
    }

    private function importPreferences(PDO $db, string $userId, array $preferences): void
    {
        $this->ensurePreferences($userId);
        $theme = in_array(($preferences['theme'] ?? ''), ['dark', 'light', 'system'], true) ? $preferences['theme'] : 'dark';
        $units = in_array(($preferences['units'] ?? ''), ['metric', 'imperial'], true) ? $preferences['units'] : 'metric';

        $stmt = $db->prepare(
            'UPDATE user_preferences
             SET theme = :theme,
                 units = :units,
                 health_app_connected = :health_app_connected,
                 health_app_provider = :health_app_provider
             WHERE user_id = :user_id'
        );
        $stmt->execute([
            'user_id' => $userId,
            'theme' => $theme,
            'units' => $units,
            'health_app_connected' => !empty($preferences['health_app_connected']) || !empty($preferences['healthAppConnected']) ? 1 : 0,
            'health_app_provider' => $this->nullableShortString($preferences['health_app_provider'] ?? $preferences['healthAppProvider'] ?? null, 100),
        ]);
    }

    private function importPlans(PDO $db, string $userId, array $plans): void
    {
        $stmt = $db->prepare(
            'INSERT INTO user_plans (id, user_id, name, type, config, created_at)
             VALUES (:id, :user_id, :name, :type, :config, :created_at)'
        );

        foreach ($plans as $plan) {
            if (!is_array($plan)) {
                continue;
            }
            $name = $this->nullableShortString($plan['name'] ?? null, 191);
            if ($name === null) {
                continue;
            }
            $stmt->execute([
                'id' => $this->importId($plan['id'] ?? null),
                'user_id' => $userId,
                'name' => $name,
                'type' => $this->nullableShortString($plan['type'] ?? 'CUSTOM', 50) ?? 'CUSTOM',
                'config' => $this->jsonOrNull($plan['config'] ?? null),
                'created_at' => $this->dateOrNow($plan['createdAt'] ?? $plan['created_at'] ?? null),
            ]);
        }
    }

    private function importEntries(PDO $db, string $userId, array $entries): void
    {
        $stmt = $db->prepare(
            'INSERT INTO food_entries (id, user_id, text, created_at, calories, protein_g, carbs_g, fat_g, parsed)
             VALUES (:id, :user_id, :text, :created_at, :calories, :protein_g, :carbs_g, :fat_g, :parsed)'
        );

        foreach ($entries as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $text = $this->nullableShortString($entry['text'] ?? null, 2000);
            if ($text === null) {
                continue;
            }
            $stmt->execute([
                'id' => $this->importId($entry['id'] ?? null),
                'user_id' => $userId,
                'text' => $text,
                'created_at' => $this->dateOrNow($entry['createdAt'] ?? $entry['created_at'] ?? null),
                'calories' => $this->numOrNull($entry['calories'] ?? null),
                'protein_g' => $this->numOrNull($entry['proteinG'] ?? $entry['protein_g'] ?? null),
                'carbs_g' => $this->numOrNull($entry['carbsG'] ?? $entry['carbs_g'] ?? null),
                'fat_g' => $this->numOrNull($entry['fatG'] ?? $entry['fat_g'] ?? null),
                'parsed' => $this->jsonOrNull($entry['parsed'] ?? null),
            ]);
        }
    }

    private function importSavedMeals(PDO $db, string $userId, array $savedMeals): void
    {
        $stmt = $db->prepare(
            'INSERT INTO saved_meals (id, user_id, title, meal_type, description, calories, recipe, created_at)
             VALUES (:id, :user_id, :title, :meal_type, :description, :calories, :recipe, :created_at)'
        );

        foreach ($savedMeals as $meal) {
            if (!is_array($meal)) {
                continue;
            }
            $title = $this->nullableShortString($meal['title'] ?? null, 191);
            if ($title === null) {
                continue;
            }
            $stmt->execute([
                'id' => $this->importId($meal['id'] ?? null),
                'user_id' => $userId,
                'title' => $title,
                'meal_type' => $this->nullableShortString($meal['mealType'] ?? $meal['meal_type'] ?? null, 100),
                'description' => $this->nullableShortString($meal['description'] ?? null, 2000),
                'calories' => $this->numOrNull($meal['calories'] ?? null),
                'recipe' => $this->jsonOrNull($meal['recipe'] ?? []) ?? '[]',
                'created_at' => $this->dateOrNow($meal['createdAt'] ?? $meal['created_at'] ?? null),
            ]);
        }
    }

    private function importId($value): string
    {
        $id = is_string($value) ? trim($value) : '';
        return preg_match('/^[A-Za-z0-9_-]{8,64}$/', $id) ? $id : generate_id();
    }

    private function nullableShortString($value, int $max): ?string
    {
        $text = trim((string) $value);
        if ($text === '') {
            return null;
        }
        return substr($text, 0, $max);
    }

    private function numOrNull($value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }

    private function jsonOrNull($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded) ? $decoded : $value;
        }
        $json = json_encode($value, JSON_UNESCAPED_SLASHES);
        return is_string($json) ? $json : null;
    }

    private function dateOrNow($value): string
    {
        $time = is_string($value) ? strtotime($value) : false;
        return $time === false ? now_utc() : gmdate('Y-m-d H:i:s', $time);
    }
}
