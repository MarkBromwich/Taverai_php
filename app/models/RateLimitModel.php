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
        $resetAt = $now->modify('+' . $windowMs . ' milliseconds');

        $db->beginTransaction();

        try {
            $stmt = $db->prepare('SELECT id, `count`, reset_at FROM rate_limit_buckets WHERE `key` = :key LIMIT 1');
            $stmt->execute(['key' => $key]);
            $existing = $stmt->fetch();

            if (!$existing || strtotime((string) $existing['reset_at']) <= $now->getTimestamp()) {
                if ($existing) {
                    $update = $db->prepare('UPDATE rate_limit_buckets SET `count` = 1, reset_at = :reset_at WHERE id = :id');
                    $update->execute([
                        'reset_at' => $resetAt->format('Y-m-d H:i:s'),
                        'id' => $existing['id'],
                    ]);
                } else {
                    $insert = $db->prepare('INSERT INTO rate_limit_buckets (id, `key`, `count`, reset_at) VALUES (:id, :key, 1, :reset_at)');
                    $insert->execute([
                        'id' => generate_id(),
                        'key' => $key,
                        'reset_at' => $resetAt->format('Y-m-d H:i:s'),
                    ]);
                }

                $db->commit();
                return [
                    'ok' => true,
                    'remaining' => max(0, $limit - 1),
                    'retryAfterMs' => max(0, ($resetAt->getTimestamp() - $now->getTimestamp()) * 1000),
                ];
            }

            $count = (int) $existing['count'];
            $existingReset = new DateTimeImmutable((string) $existing['reset_at'], new DateTimeZone('UTC'));

            if ($count >= $limit) {
                $db->commit();
                return [
                    'ok' => false,
                    'remaining' => 0,
                    'retryAfterMs' => max(0, ($existingReset->getTimestamp() - $now->getTimestamp()) * 1000),
                ];
            }

            $update = $db->prepare('UPDATE rate_limit_buckets SET `count` = `count` + 1 WHERE id = :id');
            $update->execute(['id' => $existing['id']]);
            $db->commit();

            return [
                'ok' => true,
                'remaining' => max(0, $limit - ($count + 1)),
                'retryAfterMs' => max(0, ($existingReset->getTimestamp() - $now->getTimestamp()) * 1000),
            ];
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            return ['ok' => true, 'remaining' => $limit, 'retryAfterMs' => 0];
        }
    }
}
