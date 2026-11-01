-- MariaDB Additive Migration for Pi 5 Edge Gateway
-- Run on Pi 5: mysql -u edge_user -p edge_iot < pi5/migrations/001_gateway_onboarding.sql

USE edge_iot;

-- 1. Gateway local state configuration table
CREATE TABLE IF NOT EXISTS gateway_configuration (
    gateway_id VARCHAR(36) NOT NULL PRIMARY KEY,
    organization_id VARCHAR(36) NULL,
    branch_id VARCHAR(36) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'unpaired',
    config_revision INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Approved device registry (synchronized from cloud GET /edge/config)
CREATE TABLE IF NOT EXISTS device_registry (
    source_id VARCHAR(100) NOT NULL PRIMARY KEY,
    cloud_device_id VARCHAR(36) NOT NULL,
    device_type VARCHAR(32) NOT NULL,
    source_kind VARCHAR(32) NOT NULL DEFAULT 'physical',
    label VARCHAR(120) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    capacity_kg DECIMAL(5,2) NULL,
    capabilities LONGTEXT NULL,
    config_revision INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Discovered unknown nodes pending cloud sync
CREATE TABLE IF NOT EXISTS device_discoveries (
    candidate_id VARCHAR(36) NOT NULL PRIMARY KEY,
    source_id VARCHAR(100) NOT NULL,
    proposed_type VARCHAR(32) NULL,
    evidence_quality LONGTEXT NULL,
    is_synced TINYINT DEFAULT 0,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_disc_sync (is_synced),
    INDEX idx_disc_source (source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Additive columns on sensor_telemetry
-- (Safe to run multiple times with IF NOT EXISTS on MariaDB 10.2+)
ALTER TABLE sensor_telemetry
    ADD COLUMN IF NOT EXISTS record_id VARCHAR(36) NULL AFTER id,
    ADD COLUMN IF NOT EXISTS gateway_id VARCHAR(36) NULL AFTER record_id,
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(100) NULL AFTER gateway_id,
    ADD COLUMN IF NOT EXISTS boot_id VARCHAR(64) NULL AFTER source_id,
    ADD COLUMN IF NOT EXISTS sequence BIGINT NULL AFTER boot_id,
    ADD COLUMN IF NOT EXISTS gateway_receipt_at TIMESTAMP NULL AFTER recorded_at,
    ADD COLUMN IF NOT EXISTS cloud_acknowledged_at TIMESTAMP NULL AFTER is_synced,
    ADD COLUMN IF NOT EXISTS quarantine_reason VARCHAR(255) NULL AFTER cloud_acknowledged_at;

ALTER TABLE sensor_telemetry
    ADD INDEX IF NOT EXISTS idx_record_id (record_id),
    ADD INDEX IF NOT EXISTS idx_sync_id (is_synced, id);

-- 5. Preserve legacy unassigned rows as legacy_unattributed (never delete or silently reattribute)
UPDATE sensor_telemetry
SET quarantine_reason = 'legacy_unattributed'
WHERE gateway_id IS NULL AND quarantine_reason IS NULL;

