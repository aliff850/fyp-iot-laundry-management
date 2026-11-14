# SpinSense Pi dashboard

The Flask service serves Overview, Machines and LPG & Safety to authenticated local staff on the Pi access point. Installer pairing has separate access control. It reads gateway-scoped MariaDB records; missing or stale data is never shown as an available machine or healthy sensor. The local Tailwind CSS, JavaScript, icons and Manrope font are served from `static/`, so the interface does not require a CDN or internet uplink. See the [deployment runbook](../DEPLOYMENT.md) for the live service and backup procedure.

The washer Programs Catalog can add or edit up to six ESP32-saved programs. The Parameters tab remains a read-only vendor reference. Program edits use the durable Pi command queue and appear saved only after the ESP32 returns a correlated result and publishes updated state. Quick and Standard retain their IDs and historical cycle references. The local staff editor is a demo capability; cloud operators may display and start confirmed programs, while cloud program creation remains deferred.

## Data and behavior

See [PRD telemetry requirements](../../docs/PRD.md#62-telemetry-ingestion), especially TI-03/TI-05 and S-15. The UI reports raw observations; it does not infer gas severity, calibrated concentration, physical source, or a live sensor from an HTTP success. Missing source and quality metadata remain explicitly unavailable. Sync counts cover only the latest history window.

Failed refreshes preserve previous readings with a failure notice. A successful empty response clears the old values. Unknown sync flags stay unknown, genuine zero readings display as zero, and device-supplied text is rendered as text.

## Verification record

The older `dashboard.test.mjs` covers transport and stale-data regressions in the initial inline dashboard, and does not prove the current program editor. Focused Python tests cover simulator and Pi command boundaries. Live ESP32 menu, save, checkout and command-result checks remain necessary.

Run the dependency-free regression checks from the repository root when desired:

```powershell
node --test pi5/dashboard/dashboard.test.mjs
```
