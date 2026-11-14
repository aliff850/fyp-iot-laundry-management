-- Additive gateway scope for the local approved registry and discoveries.
-- Existing unscoped rows remain unattributed. A successful /edge/config refresh
-- assigns current approved devices before the scoped dashboard is deployed.
ALTER TABLE device_registry
    ADD COLUMN IF NOT EXISTS gateway_id VARCHAR(36) NULL AFTER source_id,
    ADD INDEX IF NOT EXISTS idx_registry_gateway_status (gateway_id, status);

ALTER TABLE device_discoveries
    ADD COLUMN IF NOT EXISTS gateway_id VARCHAR(36) NULL AFTER candidate_id,
    DROP INDEX IF EXISTS uq_disc_source,
    ADD UNIQUE INDEX IF NOT EXISTS uq_discovery_gateway_source (gateway_id, source_id),
    ADD INDEX IF NOT EXISTS idx_discovery_gateway_seen (gateway_id, last_seen_at);
