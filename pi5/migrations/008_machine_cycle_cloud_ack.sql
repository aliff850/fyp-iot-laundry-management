-- Rehearse on a restored edge_iot copy. MariaDB DDL implicitly commits.
ALTER TABLE machine_cycles
  ADD COLUMN cloud_acknowledged_at DATETIME(6) NULL,
  ADD COLUMN cloud_rejection_reason VARCHAR(120) NULL,
  ADD INDEX idx_machine_cycles_cloud_ack (gateway_id, cloud_acknowledged_at, finished_at);
