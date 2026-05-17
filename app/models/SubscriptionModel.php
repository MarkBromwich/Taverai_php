<?php

class SubscriptionModel extends BaseModel
{
    public function currentForUser(string $userId): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        try {
            $stmt = $db->prepare(
                'SELECT * FROM user_subscriptions
                 WHERE user_id = :user_id
                 ORDER BY updated_at DESC
                 LIMIT 1'
            );
            $stmt->execute(['user_id' => $userId]);
            $row = $stmt->fetch();
        } catch (Throwable $e) {
            return null;
        }

        return $row ?: null;
    }

    public function upsertManual(string $userId, string $status, ?string $productId, ?string $expiresAt, string $environment = 'manual'): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $id = generate_id();
        $stmt = $db->prepare(
            'INSERT INTO user_subscriptions (id, user_id, provider, environment, product_id, status, expires_at, raw_payload)
             VALUES (:id, :user_id, :provider, :environment, :product_id, :status, :expires_at, :raw_payload)
             ON DUPLICATE KEY UPDATE
                product_id = VALUES(product_id),
                status = VALUES(status),
                expires_at = VALUES(expires_at),
                raw_payload = VALUES(raw_payload),
                updated_at = CURRENT_TIMESTAMP'
        );
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
            'provider' => 'apple',
            'environment' => $environment,
            'product_id' => $productId,
            'status' => $status,
            'expires_at' => $expiresAt,
            'raw_payload' => json_encode(['source' => 'admin_manual'], JSON_UNESCAPED_SLASHES),
        ]);

        return $this->currentForUser($userId);
    }
}
