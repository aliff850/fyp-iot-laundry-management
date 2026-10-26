# SpinSense local monitor

`index.html` is a self-contained diagnostic screen using the existing local Flask API. CSS and icons are inline, so the interface does not require a CDN or internet access. Opening the file directly shows a server-required notice; live readings require serving it at the same origin as the telemetry API.

The screen uses the Data terminal direction, neutral dark surfaces, SpinSense red selection lines, system fonts, and a cylinder silhouette tied to the reported percentage. Refresh, pause/resume, and pending/quarantined filters work entirely against the current API. All diagnostic fields remain in a horizontally scrollable table on small screens.

The existing `dashboard.py` uses Flask's default `templates/` lookup. If deploying this flat directory, place `index.html` in that template directory or configure Flask's template folder to the directory containing the file. No Flask/MariaDB runtime or physical sensor connection was verified during this design change.

## Data and behavior

See [PRD telemetry requirements](../../docs/PRD.md#62-telemetry-ingestion), especially TI-03/TI-05 and S-15. The UI reports raw observations; it does not infer gas severity, calibrated concentration, physical source, or a live sensor from an HTTP success. Missing source and quality metadata remain explicitly unavailable. Sync counts cover only the latest history window.

Failed refreshes preserve previous readings with a failure notice. A successful empty response clears the old values. Unknown sync flags stay unknown, genuine zero readings display as zero, and device-supplied text is rendered as text.

## Verification record

Before the final visual refinements, `node --test pi5/dashboard/dashboard.test.mjs` passed 8 regression checks covering HTTP failures, empty stores, zero/missing values, old records, window sync counts, retained readings, injected markup, and malformed payloads. The browser inspector recorded zero failures at 1440, 768, and 390px on that intermediate version. Further tests and evaluations were skipped at the user's request; these results do not certify the final refinements or hardware behavior.

Run the dependency-free regression checks from the repository root when desired:

```powershell
node --test pi5/dashboard/dashboard.test.mjs
```
