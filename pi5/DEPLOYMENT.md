# Pi 5 gateway rollout runbook

This runbook applies the [gateway onboarding blueprint](../docs/GATEWAY_DEVICE_ONBOARDING_PLAN.md) to the existing Pi without discarding committed `edge_iot` rows. The [older setup guide](raspberry_pi_5_edge_gateway_setup_guide.md) describes a previous installation; verify live state before using any value from it. Never paste passwords, tokens, environment-file contents, database dumps, or complete unit files containing credentials into a chat or issue.

**Rollout status, 2026-11-01:** Supabase migration 004 was applied after a local public-schema backup; all six new tables have RLS enabled and no browser-role table grants. A disposable PostgreSQL 17.11 database passed the migration/RLS/constraint check and a database-backed pairing/sync scenario. A fresh Pi dump was restored into `edge_iot_gateway_test_20261101`; the additive migration preserved 5,243 legacy rows and duplicate source samples were rejected. Corrected Pi workers, dashboard and a separate dependency environment are staged under `/home/aliff850/edge_gateway/staging-20261101/`. The live Pi schema, services, broker, and Render revision have not been changed by this rollout.

The Pi owner checked `sudo crontab -l` and reported no deletion job for `edge_iot.sensor_telemetry`. Recheck system-wide timers and cron directories during the maintenance window before enabling any future retention.

**Read-only preflight recorded 2026-11-01:** Pi `pi5laundry` has MariaDB client 11.8.6, Mosquitto 2.0.21, `wlan0` AP at `10.42.0.1/24`, `wlan1` uplink at `192.168.0.12/24`, and about 20 GB free. MariaDB, Mosquitto, ingestion and sync units are active; `edge-dashboard.service` is inactive/disabled. Mosquitto currently listens on `0.0.0.0:1883` with `allow_anonymous true`. The existing `sensor_telemetry` has its legacy five columns and 5,243 rows marked synced at inspection time; the session time zone reports `SYSTEM`. These sync flags are not proof of committed cloud acknowledgements. The worker units use `/home/aliff850/edge_gateway/venv/bin/python`; that environment has Flask, Paho, PyMySQL and Requests but not Waitress. The existing `.env` was tightened from mode `664` to `600`; its old variable names still need cutover review. The Pi reached the current Render status endpoint over HTTPS after a wake-up delay. A restricted 1.1 MB MariaDB dump was saved under `/home/aliff850/edge_backups/`; a separate fresh dump was restored and migration-tested in the isolated test database.

## Gate 1: read-only preflight on the Pi

Run these **on the Pi** and record non-secret results. The Pi's LAN address and service names may differ from the guide.

```bash
hostname -I
nmcli device status
ip -4 addr
ip route
sudo ss -ltnup
sudo systemctl status mariadb mosquitto edge-ingestion.service edge-sync.service --no-pager
systemctl list-unit-files '*dashboard*'
sudo crontab -l
df -h
mariadb -u edge_user -p edge_iot -e "SELECT @@version, @@session.time_zone, @@system_time_zone; SHOW CREATE TABLE sensor_telemetry\G; SELECT is_synced, COUNT(*) FROM sensor_telemetry GROUP BY is_synced;"
```

Inspect `systemctl cat` for the two worker units and the actual dashboard unit **locally**; do not share their `Environment=` or `EnvironmentFile=` values. Check Mosquitto's installed version, listener files, firewall, and whether the Pi access point is reachable from a phone while `wlan1` provides HTTPS internet access. Confirm the deployed worker and ESP32 revisions. Stop if the live schema or paths do not match the migration.

## Gate 2: backups and isolated validation

Suspend any installed pruning job that deletes `sensor_telemetry` by `recorded_at`. Take a restricted `mariadb-dump --single-transaction` backup of `edge_iot`, restore it into a separate test database, and run `migrations/001_gateway_onboarding.sql` there first. Check row counts, legacy attribution, indexes, time-zone conversion and disk usage. MariaDB DDL has implicit commits; a database transaction is not a migration rollback. Keep the original backup until the new path and restore procedure are proven.

Migration 004's schema and browser grants were checked in isolated PostgreSQL and then in Supabase. Database-backed authorization, conflict-safe sync, replay, and cross-branch checks remain before deploying the matching Render revision. Do not replay already applied migrations.

## Gate 3: prepare the cutover

- Install `requirements.txt` into a dedicated Pi Python environment used by the three services. The dashboard entry point now serves with Waitress. Keep the original environment and unit files for rollback.
- Put the variables named in `.env.example` in a root/service-user-readable-only environment file outside the checkout. The cloud base must be HTTPS. Put the gateway credential file under a persistent directory such as `/var/lib/spinsense`, owned by the gateway service user and mode `0600`. A corrupt credential file is a recovery incident; do not delete it to generate a replacement.
- Generate a separate local setup password hash with Werkzeug, and a random CSRF secret. The local setup login uses HTTP Basic authentication over the trusted Pi access point; its password is visible to an attacker on an untrusted HTTP LAN. Configure an AP-only dashboard listener and firewall rule for port 5000. Use reviewed HTTPS before exposing it beyond this trusted prototype network.
- Configure Mosquitto for an authenticated listener bound to the verified Pi AP address, not every interface. Create a unique password-file identity and topic ACL for the ingestion subscriber, LPG node and each simulator. Give each publisher write access only to its own `branches/<branch-uuid>/devices/<source-id>/telemetry` topic. Set `MQTT_BROKER` in the worker to that listener address. Do not reuse database or gateway secrets as MQTT passwords. Test allowed and denied clients before disabling the old broker path. Check the installed Mosquitto version before choosing `password_file`/`acl_file` or the newer plugin syntax. [Mosquitto configuration](https://mosquitto.org/man/mosquitto-conf-5.html).
- Copy `../firmware/esp32-lpg-monitor/include/device_config.example.h` to its ignored `device_config.h`, fill the Pi AP, branch UUID, source ID and per-device MQTT values locally, compile, and upload only during the planned cutover. The firmware now publishes a stable topic/client ID, a boot ID and sequence, raw MQ-6 ADC, and `null` for invalid DHT readings. The build alone does not verify measured sensor quality.

## Gate 4: short maintenance window

Stop the current ingestion and sync units and take a final backup before changing the live schema. Apply the already tested additive MariaDB migration; verify old rows remain and are marked `legacy_unattributed`. Install the reviewed Pi files, protected environment, systemd updates and broker configuration. Restart MariaDB, access point, Mosquitto, ingestion, sync and dashboard in dependency order. Confirm `ss` shows broker/dashboard listening only where intended, anonymous MQTT is rejected, and a permitted sample commits to MariaDB. During a temporary WAN disconnect, local ingestion must continue while cloud acknowledgement pauses.

If the checkpoint fails, stop the new services and restore the previous broker/worker/unit configuration. Retain the additive database and all newly committed rows where possible; do **not** restore an older dump over newer committed observations. Use the backup only after reconciling rows written since it was taken.

## Gate 5: pair and verify

Create one closed branch in SpinSense, generate a code on its Hardware setup page, and open the Pi dashboard from a device on the Pi AP. Use **Sign in for gateway setup**, enter the code, compare the Pi and cloud fingerprints, and confirm as owner. Verify `/edge/config` updates the Pi registry after device approval. First publish the LPG node and one simulator: both must appear pending and produce no trusted operational reading until approved. Trace one record ID from local MariaDB to explicit `/edge/sync` acknowledgement and cloud storage. Test duplicate publish, lost response, restart, revocation, 30-minute WAN outage and cross-branch isolation before enabling retention based on `cloud_acknowledged_at`.

For the discovery rehearsal, `machine_simulator.py` publishes an explicitly simulated idle machine sample every five seconds. Run it with a dedicated broker account restricted to its one canonical telemetry topic, plus `SPINSENSE_BRANCH_ID`, `SIMULATOR_SOURCE_ID`, `SIMULATOR_CATEGORY`, `MQTT_BROKER`, `MQTT_PORT`, `MQTT_USERNAME`, and `MQTT_PASSWORD` in its process environment. Stop it after the test. It does not implement cycle controls or settings; those require the later gateway command path and correlated results.

The Hardware setup screen is implemented; machine/LPG operational screens still need protected persistent read APIs and removal of prototype fallback before they can show these observations as live. Keep the branch closed until that separate slice is verified.
