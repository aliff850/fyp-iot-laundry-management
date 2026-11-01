# Pi 5 gateway rollout runbook

This runbook applies the [gateway onboarding blueprint](../docs/GATEWAY_DEVICE_ONBOARDING_PLAN.md) to the existing Pi without discarding committed `edge_iot` rows. The [older setup guide](raspberry_pi_5_edge_gateway_setup_guide.md) describes a previous installation; verify live state before using any value from it. Never paste passwords, tokens, environment-file contents, database dumps, or complete unit files containing credentials into a chat or issue.

**Rollout status, 2026-11-01:** Supabase migration 004 was applied after a local public-schema backup; all six new tables have RLS enabled and no browser-role table grants. A disposable PostgreSQL 17.11 database passed the migration/RLS/constraint check and a database-backed pairing/sync scenario. A fresh Pi dump was restored into `edge_iot_gateway_test_20261101`; the additive migration preserved 5,243 legacy rows and duplicate source samples were rejected. Corrected Pi workers, dashboard and a separate dependency environment are staged under `/home/aliff850/edge_gateway/staging-20261101/`. The live Pi schema, services, broker, and Render revision have not been changed by this rollout.

An isolated ingestion check using the staged worker and the Pi test database committed exactly one canonical row after duplicate delivery, quarantined one legacy sample, and created no legacy device discovery. Its temporary rows and credential file were removed afterward. This check did not involve the live MQTT broker, physical ESP32, or cloud sync.

The Pi staging directory also contains no-secret, branch-specific Mosquitto listener/ACL and systemd override templates under `cutover/`. These are staged files only. The repository dashboard now loads its adjacent `index.html`; the Pi's older `dashboard/templates/index.html` remains untouched and is no longer selected by the staged code.

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

The Pi owner runs the following privileged steps locally **after** the Render API is live, the selected branch is saved/closed, and the updated ESP32 firmware is built on the Windows PC with an ignored `device_config.h`. The physical ESP32 must be available by USB during this maintenance window. Choose and record separate MQTT passwords for `spinsense_ingest`, `lpg-node-01`, and `sim-washer-01` locally. Never put passwords in these commands, Git, chat, or shell history.

```bash
cd /home/aliff850/edge_gateway
sudo systemctl stop edge-ingestion.service edge-sync.service
umask 077
mkdir -p /home/aliff850/edge_backups/gateway-cutover
cp -a ingestion_worker.py sync_worker.py /home/aliff850/edge_backups/gateway-cutover/
cp -a dashboard/dashboard.py dashboard/index.html /home/aliff850/edge_backups/gateway-cutover/
mariadb-dump -u edge_user -p --single-transaction --databases edge_iot > /home/aliff850/edge_backups/gateway-cutover/edge_iot-final.sql
mariadb -u edge_user -p edge_iot < staging-20261101/migrations/001_gateway_onboarding.sql
mariadb -u edge_user -p edge_iot -e "SELECT COUNT(*) AS legacy_rows FROM sensor_telemetry WHERE quarantine_reason='legacy_unattributed';"
```

The final query must show at least the previously recorded legacy rows. Stop here if the backup or migration fails. MariaDB DDL can commit in stages; inspect and reconcile it rather than restoring an older dump over newer records. Copy the staged Python and dashboard files into their current service locations only after the migration check passes:

```bash
cd /home/aliff850/edge_gateway
install -m 0644 staging-20261101/gateway_config.py gateway_config.py
install -m 0644 staging-20261101/ingestion_worker.py ingestion_worker.py
install -m 0644 staging-20261101/sync_worker.py sync_worker.py
install -m 0644 staging-20261101/dashboard/dashboard.py dashboard/dashboard.py
install -m 0644 staging-20261101/dashboard/index.html dashboard/index.html
```

Update `/home/aliff850/edge_gateway/.env` locally with the reviewed values from `.env.example`: the actual HTTPS Render base, Pi AP broker address `10.42.0.1`, a dedicated ingestion MQTT account, protected setup login/hash/CSRF values, and a persistent `SPINSENSE_CREDENTIALS_FILE` path. Keep `.env` at mode `0600`. The dashboard unit currently lacks `EnvironmentFile`; add one in its systemd override. The worker units already read this `.env`.

Create Mosquitto identities interactively with `sudo mosquitto_passwd`, then grant only the branch and source topics needed by each identity. Back up `/etc/mosquitto/conf.d/local.conf` first. The replacement listener must bind `10.42.0.1:1883`, set `allow_anonymous false`, and reference a password file plus ACL file readable by the `mosquitto` service account. The ingestion account needs read access to `branches/<selected-branch-id>/devices/+/telemetry`; the LPG and simulator accounts each need write access only to their own `branches/<selected-branch-id>/devices/<source-id>/telemetry`. Do not give publishers a wildcard branch or source. Ensure `MQTT_BROKER=10.42.0.1` for the ingestion worker: its old `localhost` setting cannot reach an AP-only listener. Verify allowed and denied MQTT clients before treating the broker cutover as complete.

Branch-specific, no-secret `local.conf`, `spinsense.acl`, and three systemd override templates are staged in `/home/aliff850/edge_gateway/staging-20261101/cutover/`. Inspect their selected branch UUID, source IDs, and paths before installation. The Pi owner runs this part locally during the same maintenance window; `mosquitto_passwd` prompts for each password without exposing it in command history:

```bash
cd /home/aliff850/edge_gateway
sudo cp -n /etc/mosquitto/conf.d/local.conf /etc/mosquitto/conf.d/local.conf.pre-spinsense-20261101
sudo mosquitto_passwd -c /etc/mosquitto/spinsense.passwd spinsense_ingest
sudo mosquitto_passwd /etc/mosquitto/spinsense.passwd lpg-node-01
sudo mosquitto_passwd /etc/mosquitto/spinsense.passwd sim-washer-01
sudo chown root:mosquitto /etc/mosquitto/spinsense.passwd
sudo chmod 0640 /etc/mosquitto/spinsense.passwd
sudo install -o root -g mosquitto -m 0640 staging-20261101/cutover/spinsense.acl /etc/mosquitto/spinsense.acl
sudo install -o root -g root -m 0644 staging-20261101/cutover/local.conf /etc/mosquitto/conf.d/local.conf
sudo install -d /etc/systemd/system/edge-ingestion.service.d /etc/systemd/system/edge-sync.service.d /etc/systemd/system/edge-dashboard.service.d
sudo install -m 0644 staging-20261101/cutover/edge-ingestion.override.conf /etc/systemd/system/edge-ingestion.service.d/override.conf
sudo install -m 0644 staging-20261101/cutover/edge-sync.override.conf /etc/systemd/system/edge-sync.service.d/override.conf
sudo install -m 0644 staging-20261101/cutover/edge-dashboard.override.conf /etc/systemd/system/edge-dashboard.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart mosquitto
sudo systemctl start edge-ingestion.service edge-sync.service edge-dashboard.service
```

The ingestion account password must match `MQTT_USERNAME`/`MQTT_PASSWORD` in the protected Pi `.env`; the LPG password must match the ignored firmware `device_config.h`. The simulator uses its own password in its process environment. Stop and restore the saved Mosquitto config/unit files if any service does not start cleanly; do not overwrite MariaDB with the pre-cutover dump after new records exist.

Use systemd overrides to point the three units at `/home/aliff850/edge_gateway/staging-20261101/venv/bin/python`; preserve their current unit files and `Restart=` behavior. For the dashboard override, add `EnvironmentFile=/home/aliff850/edge_gateway/.env`. Restart Mosquitto, then ingestion, sync, and the dashboard. From the Pi, check `sudo ss -ltnup`, `systemctl status`, and `journalctl` without pasting environment values into external logs. The broker must no longer listen on `0.0.0.0`; the dashboard must bind only `10.42.0.1:5000`. Upload the matching ESP32 firmware from the Windows PC via USB. The canonical subscription activates only after owner confirmation of the pairing claim; check local committed samples after that step, before approving the discovered device.

If the checkpoint fails, stop the new services and restore the previous broker/worker/unit configuration. Retain the additive database and all newly committed rows where possible; do **not** restore an older dump over newer committed observations. Use the backup only after reconciling rows written since it was taken.

## Gate 5: pair and verify

Create one closed branch in SpinSense, generate a code on its Hardware setup page, and open the Pi dashboard from a device on the Pi AP. Use **Sign in for gateway setup**, enter the code, compare the Pi and cloud fingerprints, and confirm as owner. Verify `/edge/config` updates the Pi registry after device approval. First publish the LPG node and one simulator: both must appear pending and produce no trusted operational reading until approved. Trace one record ID from local MariaDB to explicit `/edge/sync` acknowledgement and cloud storage. Test duplicate publish, lost response, restart, revocation, 30-minute WAN outage and cross-branch isolation before enabling retention based on `cloud_acknowledged_at`.

For the discovery rehearsal, `machine_simulator.py` publishes an explicitly simulated idle machine sample every five seconds. Run it with a dedicated broker account restricted to its one canonical telemetry topic, plus `SPINSENSE_BRANCH_ID`, `SIMULATOR_SOURCE_ID`, `SIMULATOR_CATEGORY`, `MQTT_BROKER`, `MQTT_PORT`, `MQTT_USERNAME`, and `MQTT_PASSWORD` in its process environment. Stop it after the test. It does not implement cycle controls or settings; those require the later gateway command path and correlated results.

The Hardware setup screen is implemented; machine/LPG operational screens still need protected persistent read APIs and removal of prototype fallback before they can show these observations as live. Keep the branch closed until that separate slice is verified.
