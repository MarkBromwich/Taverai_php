<?php

class RateLimitModel extends BaseModel
{
    public function check(string $key, int $limit, int $windowMs): array
    {
        $db = $this->db();
        if ($db === null) {
            return ['ok' => true, 'remaining' => $limit, 'retryAfterMs' => 0];
        }

        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $nowFormatted = $now->format('Y-m-d H:i:s');
        $resetAtFormatted = $now->modify('+' . $windowMs . ' milliseconds')->format('Y-m-d H:i:s');

        try {
            // Atomic upsert: MySQL takes a row lock for INSERT ... ON DUPLICATE KEY UPDATE,
            // so concurrent first requests for the same key can't both "see no row" and
            // race each other into a duplicate-key exception (which used to fail the
            // limiter open, i.e. let both requests through with no cap at all).
            $upsert = $db->prepare(
                'INSERT INTO rate_limit_buckets (id, `key`, `count`, reset_at)
                 VALUES (:id, :key, 1, :new_reset_at)
                 ON DUPLICATE KEY UPDATE
                     `count` = IF(reset_at <= :now1, 1, `count` + 1),
                     reset_at = IF(reset_at <= :now2, :new_reset_at2, reset_at)'
            );
            $upsert->execute([
                'id' => generate_id(),
                'key' => $key,
                'new_reset_at' => $resetAtFormatted,
                'now1' => $nowFormatted,
                'now2' => $nowFormatted,
                'new_reset_at2' => $resetAtFormatted,
            ]);

            $stmt = $db->prepare('SELECT `count`, reset_at FROM rate_limit_buckets WHERE `key` = :key LIMIT 1');
            $stmt->execute(['key' => $key]);
            $row = $stmt->fetch();

            $count = $row ? (int) $row['count'] : 1;
            $existingReset = new DateTimeImmutable((string) ($row['reset_at'] ?? $resetAtFormatted), new DateTimeZone('UTC'));
            $retryAfterMs = max(0, ($existingReset->getTimestamp() - $now->getTimestamp()) * 1000);

            if ($count > $limit) {
                return ['ok' => false, 'remaining' => 0, 'retryAfterMs' => $retryAfterMs];
            }

            return ['ok' => true, 'remaining' => max(0, $limit - $count), 'retryAfterMs' => $retryAfterMs];
        } catch (Throwable $e) {
            return ['ok' => true, 'remaining' => $limit, 'retryAfterMs' => 0];
        }
    }
}
