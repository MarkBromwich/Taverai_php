<?php

class Controller
{
    public function view(string $view, array $data = []): void
    {
        View::render($view, $data);
    }

    protected function model(string $model)
    {
        if (!class_exists($model)) {
            throw new Exception("Model {$model} not found.");
        }

        return new $model();
    }

    protected function json(array $payload, int $status = 200, array $headers = []): void
    {
        response_json($payload, $status, $headers);
    }

    protected function body(): array
    {
        return request_json();
    }

    protected function requireUserId(): string
    {
        $userId = current_user_id();

        if ($userId === null) {
            $this->json(['error' => 'Unauthorized'], 401);
            exit;
        }

        return $userId;
    }

    protected function requireAdmin(): void
    {
        $userId = $this->requireUserId();
        $user = $this->model('UserModel')->findWithPreferences($userId);
        if (($user['role'] ?? 'user') !== 'admin') {
            $this->json(['error' => 'Forbidden'], 403);
            exit;
        }
    }
}
