-- Rehearse on a restored edge_iot copy. MariaDB DDL implicitly commits.
CREATE TABLE IF NOT EXISTS machine_cycles (
  cycle_id VARCHAR(36) NOT NULL,
  gateway_id VARCHAR(36) NOT NULL,
  source_id VARCHAR(100) NOT NULL,
  program_id VARCHAR(32) NOT NULL,
  price_myr DECIMAL(9,2) NOT NULL,
  target_seconds INT UNSIGNED NOT NULL,
  running_seconds INT UNSIGNED NOT NULL,
  outcome VARCHAR(16) NOT NULL,
  started_at DATETIME(6) NOT NULL,
  finished_at DATETIME(6) NOT NULL,
  received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (gateway_id, cycle_id),
  INDEX idx_machine_cycles_series (gateway_id, source_id, finished_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
