<?php

class PasswordResetModel extends BaseModel
{
    public function createForUser(string $userId, string $tokenHash, string $expiresAt, ?string $ip = null, ?string $userAgent = null): void
    {
        $db = $this->db();
        if ($db === null) {
            return;
        }

        $stmt = $db->prepare(
            'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, ip, user_agent)
             VALUES (:id, :user_id, :token_hash, :expires_at, :ip, :user_agent)'
        );
        $stmt->execute([
            'id' => generate_id(),
            'user_id' => $userId,
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt,
            'ip' => $ip,
            'user_agent' => $userAgent,
        ]);
    }

    public function findValid(string $tokenHash): ?array
    {
        $db = $this->db();
        if ($db === null) {
            return null;
        }

        $stmt = $db->prepare(
            'SELECT * FROM password_reset_tokens
             WHERE token_hash = :token_hash
               AND expires_at > UTC_TIMESTAMP()
               AND used_at IS NULL
             ORDER BY created_at DESC
             LIMIT 1'
        );
        $stmt->execute(['token_hash' => $tokenHash]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function markUsedAndClearUserTokens(string $userId): void
    {
        $db = $this->db();
        if ($db === null) {
            return;
        }

        $stmt = $db->prepare('DELETE FROM password_reset_tokens WHERE user_id = :user_id');
        $stmt->execute(['user_id' => $userId]);
    }
}
