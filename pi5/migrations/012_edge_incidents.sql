-- Edge incident hysteresis state and ordered outbox for durable cloud sync (PRD IM-01, FE-03/07/08, S-05/06/08/09).
-- Run on Pi 5: mysql -u edge_user -p edge_iot < pi5/migrations/012_edge_incidents.sql

USE edge_iot;

CREATE TABLE IF NOT EXISTS edge_condition_states (
    gateway_id VARCHAR(36) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    condition_key VARCHAR(64) NOT NULL,
    active_episode_id VARCHAR(36) NULL,
    active_severity VARCHAR(16) NULL,
    active_fault_code VARCHAR(64) NULL,
    active_fault_name VARCHAR(120) NULL,
    pending_state VARCHAR(32) NULL,
    pending_count INT NOT NULL DEFAULT 0,
    last_sample_identity VARCHAR(160) NULL,
    last_sample_at DATETIME(6) NULL,
    revision INT NOT NULL DEFAULT 0,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (gateway_id, source_id, condition_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS edge_incident_outbox (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    transition_id VARCHAR(36) NOT NULL,
    gateway_id VARCHAR(36) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    episode_id VARCHAR(36) NOT NULL,
    domain VARCHAR(16) NOT NULL,
    condition_key VARCHAR(64) NOT NULL,
    transition_type VARCHAR(16) NOT NULL,
    severity VARCHAR(16) NOT NULL,
    fault_code VARCHAR(64) NULL,
    fault_name VARCHAR(120) NULL,
    summary TEXT NOT NULL,
    rule_version VARCHAR(48) NOT NULL,
    revision INT NOT NULL,
    evidence_json JSON NOT NULL,
    occurred_at DATETIME(6) NOT NULL,
    is_synced TINYINT(1) NOT NULL DEFAULT 0,
    sync_error VARCHAR(255) NULL,
    synced_at DATETIME(6) NULL,
    UNIQUE KEY uq_edge_incident_transition (transition_id),
    INDEX idx_edge_incident_outbox_pending (gateway_id, is_synced, id)
) ENGINE=InnoDB;
