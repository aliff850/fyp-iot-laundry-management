-- Additive MariaDB migration for general LPG maintenance/inspection sessions
-- Run on Pi 5: mysql -u edge_user -p edge_iot < pi5/migrations/013_lpg_general_maintenance.sql

USE edge_iot;

ALTER TABLE lpg_maintenance_sessions
    ADD COLUMN IF NOT EXISTS session_kind VARCHAR(24) NOT NULL DEFAULT 'tank_swap',
    ADD COLUMN IF NOT EXISTS incident_id VARCHAR(36) NULL;
