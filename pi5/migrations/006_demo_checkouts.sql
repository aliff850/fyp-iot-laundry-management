-- Rehearse on a restored edge_iot copy. MariaDB DDL implicitly commits.
CREATE TABLE demo_checkouts (
  checkout_id CHAR(36) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  request_id CHAR(36) NULL UNIQUE,
  gateway_id CHAR(36) NOT NULL,
  source_id VARCHAR(100) NOT NULL,
  program_id VARCHAR(32) NOT NULL,
  price_myr DECIMAL(8,2) NOT NULL,
  settings_hash CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  confirmed_at DATETIME(6) NULL,
  command_id CHAR(36) NULL UNIQUE,
  INDEX idx_demo_machine (gateway_id, source_id, created_at),
  INDEX idx_demo_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
