-- Additive MariaDB index for period-windowed environmental analytics queries on sensor_telemetry.
-- Run on Pi 5: mysql -u edge_user -p edge_iot < pi5/migrations/011_sensor_telemetry_recorded_index.sql

USE edge_iot;

CREATE INDEX IF NOT EXISTS idx_sensor_telemetry_gw_src_rec
    ON sensor_telemetry (gateway_id, source_id, recorded_at);
