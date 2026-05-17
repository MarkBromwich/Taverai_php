<?php

class AccountController extends Controller
{
    public function show(): void
    {
        $userId = $this->requireUserId();
        $users = $this->model('UserModel');
        $user = $users->findWithPreferences($userId);

        if ($user === null) {
            $this->json(['error' => 'Unauthorized'], 401);
            return;
        }

        $this->json(['user' => $this->normalizeUser($user)]);
    }

    public function update(): void
    {
        $userId = $this->requireUserId();
        $body = $this->body();

        $userData = [];
        $prefData = [];

        if (array_key_exists('firstName', $body)) {
            $userData['firstName'] = trim((string) $body['firstName']) ?: null;
            if ($userData['firstName'] !== null && strlen($userData['firstName']) > 100) {
                $this->json(['error' => 'First name is too long.'], 400);
                return;
            }
        }
        if (array_key_exists('lastName', $body)) {
            $userData['lastName'] = trim((string) $body['lastName']) ?: null;
            if ($userData['lastName'] !== null && strlen($userData['lastName']) > 100) {
                $this->json(['error' => 'Last name is too long.'], 400);
                return;
            }
        }
        if (array_key_exists('username', $body)) {
            $email = strtolower(trim((string) $body['username']));
            if ($email !== '' && !str_contains($email, '@')) {
                $this->json(['error' => 'username must be a valid email'], 400);
                return;
            }
            if (strlen($email) > 191) {
                $this->json(['error' => 'Email is too long.'], 400);
                return;
            }
            $userData['username'] = $email ?: null;
        }
        if (array_key_exists('avatarUrl', $body)) {
            $userData['avatarUrl'] = trim((string) $body['avatarUrl']) ?: null;
        }
        if (array_key_exists('dailyCalorieGoal', $body)) {
            $goal = $body['dailyCalorieGoal'];
            if ($goal !== null) {
                $goal = (int) $goal;
                if ($goal < 0 || $goal > 20000) {
                    $this->json(['error' => 'dailyCalorieGoal must be between 0 and 20000 (or null)'], 400);
                    return;
                }
            }
            $userData['dailyCalorieGoal'] = $goal;
        }

        if (array_key_exists('theme', $body)) {
            $theme = trim((string) $body['theme']);
            if (!in_array($theme, ['dark', 'light', 'system'], true)) {
                $this->json(['error' => 'theme must be dark, light, or system'], 400);
                return;
            }
            $prefData['theme'] = $theme;
        }
        if (array_key_exists('units', $body)) {
            $units = trim((string) $body['units']);
            if (!in_array($units, ['metric', 'imperial'], true)) {
                $this->json(['error' => 'units must be metric or imperial'], 400);
                return;
            }
            $prefData['units'] = $units;
        }
        if (array_key_exists('healthAppConnected', $body)) {
            $prefData['healthAppConnected'] = !empty($body['healthAppConnected']) ? 1 : 0;
        }
        if (array_key_exists('healthAppProvider', $body)) {
            $prefData['healthAppProvider'] = trim((string) $body['healthAppProvider']) ?: null;
        }

        $users = $this->model('UserModel');
        $user = $users->updateUserAndPreferences($userId, $userData, $prefData);

        if ($user === null) {
            $this->json(['error' => 'Failed to update account'], 500);
            return;
        }

        if (array_key_exists('dailyCalorieGoal', $userData)) {
            $this->recalculateEntryScores($userId, $user);
        }

        $this->json(['user' => $this->normalizeUser($user)]);
    }

    public function summary(): void
    {
        $userId = $this->requireUserId();
        $summary = $this->model('UserModel')->countsForSummary($userId);
        $this->json(['summary' => $summary]);
    }

    public function export(): void
    {
        $userId = $this->requireUserId();
        $bundle = $this->model('UserModel')->exportBundle($userId);
        $slug = $this->exportSlug($bundle['user']['username'] ?? null);

        http_response_code(200);
        header('Content-Type: application/json; charset=UTF-8');
        header('Content-Disposition: attachment; filename="taverai-export-' . $slug . '-' . gmdate('Ymd-His') . '.json"');
        echo json_encode(array_merge([
            'exportedAt' => gmdate('c'),
        ], $bundle), JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    }

    public function exportFoodLog(): void
    {
        $userId = $this->requireUserId();
        $bundle = $this->model('UserModel')->exportBundle($userId);
        $slug = $this->exportSlug($bundle['user']['username'] ?? null);
        $entries = is_array($bundle['entries'] ?? null) ? $bundle['entries'] : [];

        http_response_code(200);
        header('Content-Type: text/csv; charset=UTF-8');
        header('Content-Disposition: attachment; filename="taverai-food-log-' . $slug . '-' . gmdate('Ymd-His') . '.csv"');

        $out = fopen('php://output', 'w');
        if ($out === false) {
            return;
        }

        fputcsv($out, [
            'date',
            'time',
            'meal',
            'calories',
            'protein_g',
            'carbs_g',
            'fat_g',
            'best_plan',
            'best_score',
            'image_url',
        ]);

        foreach ($entries as $entry) {
            $createdAt = (string) ($entry['createdAt'] ?? ($entry['created_at'] ?? ''));
            $parsed = is_array($entry['parsed'] ?? null) ? $entry['parsed'] : [];
            $best = $this->bestScoreForExport($entry);

            fputcsv($out, [
                substr($createdAt, 0, 10),
                substr($createdAt, 11, 8),
                $entry['text'] ?? '',
                $entry['calories'] ?? ($parsed['calories'] ?? ''),
                $entry['proteinG'] ?? ($parsed['macros']['proteinG'] ?? ($parsed['proteinG'] ?? '')),
                $entry['carbsG'] ?? ($parsed['macros']['carbsG'] ?? ($parsed['carbsG'] ?? '')),
                $entry['fatG'] ?? ($parsed['macros']['fatG'] ?? ($parsed['fatG'] ?? '')),
                $best['plan'] ?? '',
                $best['score'] ?? '',
                $entry['imageUrl'] ?? ($parsed['imageUrl'] ?? ''),
            ]);
        }

        fclose($out);
    }

    public function import(): void
    {
        $userId = $this->requireUserId();

        if (empty($_FILES['file']) || !is_array($_FILES['file'])) {
            $this->json(['error' => 'Export JSON file is required.'], 400);
            return;
        }

        $upload = $_FILES['file'];
        if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $this->json(['error' => 'Import upload failed.'], 400);
            return;
        }

        $tmpPath = (string) ($upload['tmp_name'] ?? '');
        $size = (int) ($upload['size'] ?? 0);
        if ($tmpPath === '' || !is_uploaded_file($tmpPath) || $size <= 0 || $size > 5 * 1024 * 1024) {
            $this->json(['error' => 'Import file must be a JSON export under 5MB.'], 400);
            return;
        }

        $raw = file_get_contents($tmpPath);
        $bundle = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($bundle) || !isset($bundle['user'], $bundle['entries'])) {
            $this->json(['error' => 'This does not look like a Taverai export JSON file.'], 400);
            return;
        }

        $result = $this->model('UserModel')->importBundle($userId, $bundle);
        if (empty($result['ok'])) {
            $this->json(['error' => $result['error'] ?? 'Import failed.'], 500);
            return;
        }

        $user = $this->model('UserModel')->findWithPreferences($userId);
        if ($user !== null) {
            $this->recalculateEntryScores($userId, $user);
        }

        app_log('Account import completed', ['userId' => $userId, 'counts' => $result['counts'] ?? []]);
        $this->json(['ok' => true, 'counts' => $result['counts'] ?? []]);
    }

    public function avatar(): void
    {
        $userId = $this->requireUserId();

        if (empty($_FILES['file']) || !is_array($_FILES['file'])) {
            $this->json(['error' => 'Image is required.'], 400);
            return;
        }

        try {
            $stored = secure_image_upload($_FILES['file'], 'avatar', 4 * 1024 * 1024);
        } catch (Throwable $e) {
            app_log('Avatar upload rejected', ['error' => $e->getMessage(), 'userId' => $userId]);
            $this->json(['error' => $e->getMessage()], 400);
            return;
        }

        $avatarUrl = $stored['url'];
        $saved = $this->model('UserModel')->updateAvatarUrl($userId, $avatarUrl);
        if ($saved === null) {
            $this->json(['error' => 'Failed to update avatar.'], 500);
            return;
        }

        $this->json(['avatarUrl' => $saved]);
    }

    public function destroyAccount(): void
    {
        $userId = $this->requireUserId();
        if (!$this->model('UserModel')->deleteUser($userId)) {
            $this->json(['error' => 'Failed to delete account.'], 500);
            return;
        }

        $_SESSION = [];
        session_destroy();
        $this->json(['ok' => true]);
    }

    private function recalculateEntryScores(string $userId, array $user): void
    {
        $plans = $this->model('PlanModel')->allForUser($userId);
        if ($plans === []) {
            return;
        }

        $entries = $this->model('EntryModel')->allForUser($userId, 3650);
        if ($entries === []) {
            return;
        }

        $dailyGoal = isset($user['daily_calorie_goal']) && $user['daily_calorie_goal'] !== null
            ? (int) $user['daily_calorie_goal']
            : null;

        $scoreModel = $this->model('EntryScoreModel');
        foreach ($entries as $entry) {
            $scoreModel->syncForEntry($entry['id'], $plans, $entry, $dailyGoal);
        }
    }

    private function normalizeUser(array $user): array
    {
        $firstName = $user['first_name'] ?? null;
        $lastName = $user['last_name'] ?? null;
        $displayName = trim(((string) $firstName) . ' ' . ((string) $lastName));

        return [
            'id' => $user['id'],
            'username' => $user['username'],
            'firstName' => $firstName,
            'lastName' => $lastName,
            'displayName' => $displayName !== '' ? $displayName : null,
            'avatarUrl' => $user['avatar_url'] ?? null,
            'paidStatus' => $user['paid_status'] ?? null,
            'billingUrl' => null,
            'dailyCalorieGoal' => $user['daily_calorie_goal'] !== null ? (int) $user['daily_calorie_goal'] : null,
            'theme' => $user['theme'] ?? 'dark',
            'units' => $user['units'] ?? 'metric',
            'healthAppProvider' => $user['health_app_provider'] ?? null,
            'healthAppConnected' => !empty($user['health_app_connected']),
        ];
    }

    private function exportSlug(?string $value): string
    {
        $slug = strtolower((string) preg_replace('/[^a-zA-Z0-9]+/', '-', (string) $value));
        $slug = trim($slug, '-');
        return $slug !== '' ? $slug : 'account';
    }

    private function bestScoreForExport(array $entry): array
    {
        $scores = is_array($entry['scores'] ?? null) ? $entry['scores'] : [];
        if ($scores === []) {
            return ['plan' => null, 'score' => null];
        }

        usort($scores, static fn(array $a, array $b): int => (int) ($b['score'] ?? 0) <=> (int) ($a['score'] ?? 0));
        $best = $scores[0] ?? [];

        return [
            'plan' => $best['plan']['name'] ?? null,
            'score' => $best['score'] ?? null,
        ];
    }
}
