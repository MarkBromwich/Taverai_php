CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(191) PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
    ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'apple',
    environment VARCHAR(50) NOT NULL DEFAULT 'sandbox',
    product_id VARCHAR(191) NULL,
    original_transaction_id VARCHAR(191) NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'inactive',
    expires_at DATETIME NULL,
    raw_payload JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_user_subscription_provider (user_id, provider, environment),
    INDEX idx_user_subscriptions_status (status),
    INDEX idx_user_subscriptions_transaction (original_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
