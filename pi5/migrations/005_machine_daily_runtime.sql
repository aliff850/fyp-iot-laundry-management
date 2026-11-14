-- Rehearse on a restored edge_iot copy before live application.
CREATE TABLE IF NOT EXISTS machine_cycle_daily_runtime (
  gateway_id VARCHAR(36) NOT NULL,
  cycle_id VARCHAR(36) NOT NULL,
  local_date DATE NOT NULL,
  running_seconds INT UNSIGNED NOT NULL,
  PRIMARY KEY (gateway_id, cycle_id, local_date),
  INDEX idx_machine_daily_runtime_date (gateway_id, local_date),
  CONSTRAINT fk_machine_daily_cycle FOREIGN KEY (gateway_id, cycle_id)
    REFERENCES machine_cycles (gateway_id, cycle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
