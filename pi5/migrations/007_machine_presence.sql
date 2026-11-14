-- Rehearse on a restored edge_iot copy before applying live. MariaDB DDL implicitly commits.
-- Presence is a mutable current projection, not a telemetry-history table.
CREATE TABLE IF NOT EXISTS machine_presence (
  gateway_id VARCHAR(36) NOT NULL,
  source_id VARCHAR(100) NOT NULL,
  boot_id VARCHAR(64) NOT NULL,
  sequence BIGINT UNSIGNED NOT NULL,
  state_payload LONGTEXT NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  PRIMARY KEY (gateway_id, source_id),
  INDEX idx_machine_presence_seen (gateway_id, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
