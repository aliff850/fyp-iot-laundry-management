-- Additive MariaDB migration for Pi 5 LPG MQ-6 baseline/estimation and FE-04/FE-05 maintenance sessions.
-- Run on Pi 5: mysql -u edge_user -p edge_iot < pi5/migrations/009_lpg_maintenance_and_gas.sql

USE edge_iot;

CREATE TABLE IF NOT EXISTS lpg_node_config (
    gateway_id VARCHAR(36) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    mq6_vcc_v DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    mq6_rl_kohm DECIMAL(7,2) NOT NULL DEFAULT 20.00,
    mq6_divider_ratio DECIMAL(6,3) NOT NULL DEFAULT 1.000,
    mq6_ro_kohm DECIMAL(10,3) NULL,
    mq6_baseline_v DECIMAL(6,3) NULL,
    gas_warn_ppm DECIMAL(9,1) NOT NULL DEFAULT 20.0,
    gas_crit_ppm DECIMAL(9,1) NOT NULL DEFAULT 80.0,
    cylinder_tare_kg DECIMAL(6,2) NULL,
    rated_capacity_kg DECIMAL(6,2) NULL,
    stability_tolerance_kg DECIMAL(5,2) NOT NULL DEFAULT 0.25,
    updated_by VARCHAR(64) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (gateway_id, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lpg_maintenance_sessions (
    session_id VARCHAR(36) NOT NULL PRIMARY KEY,
    gateway_id VARCHAR(36) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    started_by VARCHAR(64) NOT NULL,
    service_note VARCHAR(255) NULL,
    started_at DATETIME(6) NOT NULL,
    completed_at DATETIME(6) NULL,
    completed_by VARCHAR(64) NULL,
    new_tare_kg DECIMAL(6,2) NULL,
    new_capacity_kg DECIMAL(6,2) NULL,
    verified_samples_json LONGTEXT NULL,
    INDEX idx_lpg_maint_node (gateway_id, source_id, status, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
