<?php

class AdminController extends Controller
{
    public function summary(): void
    {
        $this->requireAdmin();

        $db = Database::connect();
        $this->json([
            'totals' => [
                'users' => $this->count($db, 'users'),
                'admins' => $this->countWhere($db, 'users', 'role = :role', ['role' => 'admin']),
                'entries' => $this->count($db, 'food_entries'),
                'plans' => $this->count($db, 'user_plans'),
                'savedMeals' => $this->count($db, 'saved_meals'),
                'subscriptions' => $this->count($db, 'user_subscriptions'),
                'activeSubscriptions' => $this->countWhere($db, 'user_subscriptions', 'status = :status', ['status' => 'active']),
            ],
            'activity' => [
                'entriesToday' => $this->countWhere($db, 'food_entries', 'DATE(created_at) = UTC_DATE()'),
                'entries7Days' => $this->countWhere($db, 'food_entries', 'created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)'),
                'newUsers7Days' => $this->countWhere($db, 'users', 'created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)'),
                'avgPlanAlignment' => $this->scalar($db, 'SELECT ROUND(AVG(score)) FROM entry_plan_scores'),
            ],
            'recentUsers' => $this->recentUsers($db),
            'recentErrors' => array_slice($this->readLogs(['error', 'failed', 'rejected', 'exception', 'OpenAI'], 10), 0, 5),
            'system' => [
                'openaiConfigured' => (new OpenAIClient())->isConfigured(),
                'uploadDirectoryWritable' => is_writable((string) config('uploads.dir')),
                'appLogWritable' => is_writable(dirname(APPROOT) . '/storage/logs') || is_writable(dirname(APPROOT) . '/storage'),
                'phpVersion' => PHP_VERSION,
            ],
        ]);
    }

    public function logs(): void
    {
        $this->requireAdmin();
        $term = trim((string) ($_GET['term'] ?? ''));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 40)));
        $terms = $term !== '' ? [$term] : [];
        if (strtolower($term) === 'error') {
            $terms = ['error', 'failed', 'rejected', 'exception', 'OpenAI'];
        }

        $this->json([
            'logs' => $this->readLogs($terms, $limit),
        ]);
    }

    public function users(): void
    {
        $this->requireAdmin();
        $db = Database::connect();
        $q = trim((string) ($_GET['q'] ?? ''));
        if (strlen($q) > 120) {
            $this->json(['error' => 'Search is too long.'], 400);
            return;
        }

        $params = [];
        $where = '';
        if ($q !== '') {
            $where = 'WHERE username LIKE :q OR first_name LIKE :q OR last_name LIKE :q';
            $params['q'] = '%' . $q . '%';
        }

        $stmt = $db->prepare(
            'SELECT
                u.id,
                u.first_name,
                u.last_name,
                u.username,
                u.role,
                u.created_at,
                u.daily_calorie_goal,
                u.paid_status,
                COUNT(DISTINCT e.id) AS entry_count,
                COUNT(DISTINCT p.id) AS plan_count,
                COUNT(DISTINCT sm.id) AS saved_meal_count
             FROM users u
             LEFT JOIN food_entries e ON e.user_id = u.id
             LEFT JOIN user_plans p ON p.user_id = u.id
             LEFT JOIN saved_meals sm ON sm.user_id = u.id
             ' . $where . '
             GROUP BY u.id, u.first_name, u.last_name, u.username, u.role, u.created_at, u.daily_calorie_goal, u.paid_status
             ORDER BY u.created_at DESC
             LIMIT 25'
        );
        $stmt->execute($params);

        $this->json([
            'users' => array_map([$this, 'normalizeUserRow'], $stmt->fetchAll() ?: []),
        ]);
    }

    public function updateUser(): void
    {
        $this->requireAdmin();
        $adminId = current_user_id();
        $body = $this->body();
        $userId = trim((string) ($body['id'] ?? ''));
        if ($userId === '') {
            $this->json(['error' => 'User id is required.'], 400);
            return;
        }

        $fields = [];
        $params = ['id' => $userId];

        if (array_key_exists('role', $body)) {
            $role = trim((string) $body['role']);
            if (!in_array($role, ['user', 'admin'], true)) {
                $this->json(['error' => 'Role must be user or admin.'], 400);
                return;
            }
            if ($userId === $adminId && $role !== 'admin') {
                $this->json(['error' => 'You cannot demote your own admin account.'], 400);
                return;
            }
            $fields[] = 'role = :role';
            $params['role'] = $role;
        }

        if (array_key_exists('paidStatus', $body)) {
            $paidStatus = trim((string) $body['paidStatus']);
            if (!in_array($paidStatus, ['Free', 'Paid', 'Trial', 'Comped'], true)) {
                $this->json(['error' => 'Paid status is invalid.'], 400);
                return;
            }
            $fields[] = 'paid_status = :paid_status';
            $params['paid_status'] = $paidStatus;
        }

        if (array_key_exists('dailyCalorieGoal', $body)) {
            $goal = $body['dailyCalorieGoal'];
            $goal = $goal === null || $goal === '' ? null : (int) $goal;
            if ($goal !== null && ($goal < 0 || $goal > 20000)) {
                $this->json(['error' => 'Daily calorie goal is out of range.'], 400);
                return;
            }
            $fields[] = 'daily_calorie_goal = :daily_calorie_goal';
            $params['daily_calorie_goal'] = $goal;
        }

        if ($fields === []) {
            $this->json(['error' => 'No editable fields provided.'], 400);
            return;
        }

        $db = Database::connect();
        $stmt = $db->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id');
        $stmt->execute($params);
        app_log('Admin updated user', ['adminId' => $adminId, 'userId' => $userId, 'fields' => array_keys($body)]);
        $this->json(['ok' => true]);
    }

    public function deleteUser(): void
    {
        $this->requireAdmin();
        $adminId = current_user_id();
        $userId = trim((string) ($_GET['id'] ?? ''));
        if ($userId === '') {
            $this->json(['error' => 'User id is required.'], 400);
            return;
        }
        if ($userId === $adminId) {
            $this->json(['error' => 'You cannot delete your own admin account.'], 400);
            return;
        }

        if (!$this->model('UserModel')->deleteUser($userId)) {
            $this->json(['error' => 'User could not be deleted.'], 500);
            return;
        }

        app_log('Admin deleted user', ['adminId' => $adminId, 'userId' => $userId]);
        $this->json(['ok' => true]);
    }

    public function resetLink(): void
    {
        $this->requireAdmin();
        $body = $this->body();
        $userId = trim((string) ($body['id'] ?? ''));
        if ($userId === '') {
            $this->json(['error' => 'User id is required.'], 400);
            return;
        }

        $db = Database::connect();
        $stmt = $db->prepare('SELECT id, username FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $userId]);
        $user = $stmt->fetch();
        if (!$user) {
            $this->json(['error' => 'User not found.'], 404);
            return;
        }

        $rawToken = bin2hex(random_bytes(32));
        $this->model('PasswordResetModel')->createForUser(
            $userId,
            hash('sha256', $rawToken),
            gmdate('Y-m-d H:i:s', time() + 3600),
            $_SERVER['REMOTE_ADDR'] ?? null,
            'admin-generated'
        );

        app_log('Admin generated password reset link', ['adminId' => current_user_id(), 'userId' => $userId]);
        $this->json([
            'ok' => true,
            'email' => $user['username'] ?? '',
            'resetLink' => route_url('reset') . '&token=' . rawurlencode($rawToken),
        ]);
    }

    public function updateSubscription(): void
    {
        $this->requireAdmin();
        $body = $this->body();
        $userId = trim((string) ($body['userId'] ?? ''));
        $status = trim((string) ($body['status'] ?? ''));
        if ($userId === '' || !in_array($status, ['active', 'inactive', 'trialing', 'expired', 'comped'], true)) {
            $this->json(['error' => 'Valid user and subscription status are required.'], 400);
            return;
        }

        $expiresAt = trim((string) ($body['expiresAt'] ?? ''));
        if ($expiresAt !== '') {
            $time = strtotime($expiresAt);
            if ($time === false) {
                $this->json(['error' => 'Expiration date is invalid.'], 400);
                return;
            }
            $expiresAt = gmdate('Y-m-d H:i:s', $time);
        } else {
            $expiresAt = null;
        }

        $productId = trim((string) ($body['productId'] ?? '')) ?: null;
        $subscription = $this->model('SubscriptionModel')->upsertManual($userId, $status, $productId, $expiresAt);
        if ($subscription === null) {
            $this->json(['error' => 'Subscription could not be updated.'], 500);
            return;
        }

        $paidStatus = in_array($status, ['active', 'trialing', 'comped'], true) ? 'Paid' : 'Free';
        Database::connect()
            ->prepare('UPDATE users SET paid_status = :paid_status WHERE id = :id')
            ->execute(['paid_status' => $paidStatus, 'id' => $userId]);

        app_log('Admin updated subscription', ['adminId' => current_user_id(), 'userId' => $userId, 'status' => $status]);
        $this->json(['ok' => true, 'subscription' => $subscription]);
    }

    public function mealAudit(): void
    {
        $this->requireAdmin();
        $db = Database::connect();
        $stmt = $db->query(
            'SELECT e.id, e.user_id, e.text, e.created_at, e.calories, e.protein_g, e.carbs_g, e.fat_g, e.parsed,
                    u.username, u.first_name, u.last_name
             FROM food_entries e
             INNER JOIN users u ON u.id = e.user_id
             ORDER BY e.created_at DESC
             LIMIT 150'
        );

        $rows = [];
        foreach (($stmt->fetchAll() ?: []) as $row) {
            $parsed = $this->decodeJson($row['parsed'] ?? null);
            $imageUrl = is_array($parsed) && isset($parsed['imageUrl']) && is_string($parsed['imageUrl']) ? $parsed['imageUrl'] : null;
            $missingNutrition = $row['calories'] === null && $row['protein_g'] === null && $row['carbs_g'] === null && $row['fat_g'] === null;
            if ($imageUrl === null && !$missingNutrition) {
                continue;
            }

            $rows[] = [
                'id' => $row['id'],
                'text' => $row['text'],
                'createdAt' => $row['created_at'],
                'user' => $this->displayName($row),
                'email' => $row['username'] ?? '',
                'imageUrl' => $imageUrl,
                'source' => is_array($parsed) ? ($parsed['source'] ?? null) : null,
                'missingNutrition' => $missingNutrition,
                'calories' => $row['calories'] !== null ? (float) $row['calories'] : null,
                'proteinG' => $row['protein_g'] !== null ? (float) $row['protein_g'] : null,
                'carbsG' => $row['carbs_g'] !== null ? (float) $row['carbs_g'] : null,
                'fatG' => $row['fat_g'] !== null ? (float) $row['fat_g'] : null,
            ];
        }

        $this->json(['meals' => array_slice($rows, 0, 30)]);
    }

    public function deleteMeal(): void
    {
        $this->requireAdmin();
        $entryId = trim((string) ($_GET['id'] ?? ''));
        if ($entryId === '') {
            $this->json(['error' => 'Meal id is required.'], 400);
            return;
        }

        $db = Database::connect();
        $stmt = $db->prepare('SELECT user_id, parsed FROM food_entries WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $entryId]);
        $entry = $stmt->fetch();
        if (!$entry) {
            $this->json(['error' => 'Meal not found.'], 404);
            return;
        }

        $parsed = $this->decodeJson($entry['parsed'] ?? null);
        $imageUrl = is_array($parsed) && isset($parsed['imageUrl']) && is_string($parsed['imageUrl']) ? $parsed['imageUrl'] : null;
        $delete = $db->prepare('DELETE FROM food_entries WHERE id = :id');
        $delete->execute(['id' => $entryId]);

        if ($imageUrl !== null) {
            $this->deletePublicUpload($imageUrl);
        }

        app_log('Admin deleted meal entry', ['adminId' => current_user_id(), 'entryId' => $entryId, 'userId' => $entry['user_id'] ?? null]);
        $this->json(['ok' => true]);
    }

    private function count(PDO $db, string $table): int
    {
        return (int) $db->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
    }

    private function countWhere(PDO $db, string $table, string $where, array $params = []): int
    {
        $stmt = $db->prepare('SELECT COUNT(*) FROM ' . $table . ' WHERE ' . $where);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    private function scalar(PDO $db, string $sql)
    {
        $value = $db->query($sql)->fetchColumn();
        return $value === false ? null : $value;
    }

    private function recentUsers(PDO $db): array
    {
        $stmt = $db->query(
            'SELECT
                u.id,
                u.first_name,
                u.last_name,
                u.username,
                u.role,
                u.paid_status,
                u.created_at,
                COUNT(DISTINCT e.id) AS entry_count,
                COUNT(DISTINCT p.id) AS plan_count,
                COUNT(DISTINCT sm.id) AS saved_meal_count
             FROM users u
             LEFT JOIN food_entries e ON e.user_id = u.id
             LEFT JOIN user_plans p ON p.user_id = u.id
             LEFT JOIN saved_meals sm ON sm.user_id = u.id
             GROUP BY u.id, u.first_name, u.last_name, u.username, u.role, u.paid_status, u.created_at
             ORDER BY u.created_at DESC
             LIMIT 10'
        );

        $rows = $stmt->fetchAll() ?: [];
        return array_map(static function (array $row): array {
            $name = trim((string) (($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')));
            return [
                'id' => $row['id'],
                'name' => $name !== '' ? $name : 'Unnamed user',
                'email' => $row['username'] ?? '',
                'role' => $row['role'] ?? 'user',
                'paidStatus' => $row['paid_status'] ?? null,
                'createdAt' => $row['created_at'] ?? null,
                'entryCount' => (int) ($row['entry_count'] ?? 0),
                'planCount' => (int) ($row['plan_count'] ?? 0),
                'savedMealCount' => (int) ($row['saved_meal_count'] ?? 0),
            ];
        }, $rows);
    }

    private function readLogs(array $terms, int $limit): array
    {
        $path = dirname(APPROOT) . '/storage/logs/app.log';
        if (!is_file($path) || !is_readable($path)) {
            return [];
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            return [];
        }

        $matches = [];
        foreach (array_reverse($lines) as $line) {
            $decoded = json_decode($line, true);
            $entry = is_array($decoded) ? $decoded : ['time' => null, 'message' => $line, 'context' => []];
            $haystack = strtolower(json_encode($entry, JSON_UNESCAPED_SLASHES) ?: '');
            $include = $terms === [];
            foreach ($terms as $term) {
                if ($term !== '' && str_contains($haystack, strtolower($term))) {
                    $include = true;
                    break;
                }
            }
            if (!$include) {
                continue;
            }

            $matches[] = [
                'time' => $entry['time'] ?? null,
                'message' => $entry['message'] ?? '',
                'context' => $entry['context'] ?? [],
            ];
            if (count($matches) >= $limit) {
                break;
            }
        }

        return $matches;
    }

    private function normalizeUserRow(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $this->displayName($row),
            'email' => $row['username'] ?? '',
            'role' => $row['role'] ?? 'user',
            'paidStatus' => $row['paid_status'] ?? null,
            'dailyCalorieGoal' => $row['daily_calorie_goal'] !== null ? (int) $row['daily_calorie_goal'] : null,
            'createdAt' => $row['created_at'] ?? null,
            'entryCount' => (int) ($row['entry_count'] ?? 0),
            'planCount' => (int) ($row['plan_count'] ?? 0),
            'savedMealCount' => (int) ($row['saved_meal_count'] ?? 0),
        ];
    }

    private function displayName(array $row): string
    {
        $name = trim((string) (($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')));
        return $name !== '' ? $name : 'Unnamed user';
    }

    private function decodeJson($value): ?array
    {
        if (!is_string($value) || $value === '') {
            return null;
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function deletePublicUpload(string $url): void
    {
        $path = parse_url($url, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            return;
        }

        $publicBase = trim((string) config('uploads.public_base', '/uploads'), '/');
        $needle = '/' . $publicBase . '/';
        $pos = strpos($path, $needle);
        if ($pos === false) {
            return;
        }

        $filename = basename(substr($path, $pos + strlen($needle)));
        if ($filename === '' || !preg_match('/^[A-Za-z0-9_.-]+$/', $filename)) {
            return;
        }

        $file = rtrim((string) config('uploads.dir'), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $filename;
        if (is_file($file)) {
            @unlink($file);
        }
    }
}
