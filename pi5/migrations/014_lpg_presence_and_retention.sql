-- Rehearse on a restored edge_iot copy before applying live. MariaDB DDL implicitly commits.
-- Presence is a mutable current projection + deadband baseline, not an unbounded telemetry-history table.
CREATE TABLE IF NOT EXISTS lpg_presence (
  gateway_id VARCHAR(36) NOT NULL,
  source_id VARCHAR(100) NOT NULL,
  boot_id VARCHAR(64) NOT NULL,
  sequence BIGINT UNSIGNED NOT NULL,
  source_kind VARCHAR(32) NOT NULL DEFAULT 'physical',
  source_time_quality VARCHAR(32) NOT NULL DEFAULT 'unknown',
  recorded_at DATETIME(6) NULL,
  gateway_receipt_at DATETIME(6) NOT NULL,
  data_payload LONGTEXT NOT NULL,
  quality_metadata LONGTEXT NOT NULL,
  recent_samples_json LONGTEXT NULL,
  last_history_saved_at DATETIME(6) NULL,
  last_history_boot_id VARCHAR(64) NULL,
  last_history_payload LONGTEXT NULL,
  last_history_quality LONGTEXT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  PRIMARY KEY (gateway_id, source_id),
  INDEX idx_lpg_presence_seen (gateway_id, gateway_receipt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
