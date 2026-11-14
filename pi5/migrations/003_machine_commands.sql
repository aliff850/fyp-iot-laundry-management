-- Apply to a restored edge_iot copy before the live Pi. MariaDB DDL implicitly commits.
CREATE TABLE IF NOT EXISTS machine_commands (
  command_id VARCHAR(36) PRIMARY KEY,
  gateway_id VARCHAR(36) NOT NULL,
  source_id VARCHAR(100) NOT NULL,
  action VARCHAR(32) NOT NULL,
  arguments_json LONGTEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  reason VARCHAR(120) NULL,
  actor VARCHAR(32) NOT NULL DEFAULT 'local staff',
  issued_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  published_at DATETIME(6) NULL,
  result_at DATETIME(6) NULL,
  INDEX idx_machine_pending (status, expires_at),
  INDEX idx_machine_history (gateway_id, source_id, issued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
