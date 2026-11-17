-- Additive MariaDB migration adjusting default MQ-6 warning/critical PPM alert thresholds
-- for bench lighter/smoke evaluation while keeping thresholds configurable per node.
-- Run on Pi 5: mysql -u edge_user -p edge_iot < pi5/migrations/010_lpg_bench_gas_thresholds.sql

USE edge_iot;

ALTER TABLE lpg_node_config
    ALTER COLUMN gas_warn_ppm SET DEFAULT 20.0,
    ALTER COLUMN gas_crit_ppm SET DEFAULT 80.0;

UPDATE lpg_node_config
SET gas_warn_ppm = 20.0,
    gas_crit_ppm = 80.0
WHERE gas_warn_ppm = 400.0
  AND gas_crit_ppm = 1000.0;
