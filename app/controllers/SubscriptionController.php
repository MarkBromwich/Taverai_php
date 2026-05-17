<?php

class SubscriptionController extends Controller
{
    public function show(): void
    {
        $userId = $this->requireUserId();
        $subscription = $this->model('SubscriptionModel')->currentForUser($userId);
        $this->json([
            'subscription' => $subscription ?: [
                'provider' => 'apple',
                'status' => 'inactive',
                'product_id' => null,
                'expires_at' => null,
            ],
        ]);
    }

    public function appleNotification(): void
    {
        app_log('Apple subscription notification received', [
            'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
            'length' => (int) ($_SERVER['CONTENT_LENGTH'] ?? 0),
        ]);

        $this->json(['ok' => true]);
    }
}
