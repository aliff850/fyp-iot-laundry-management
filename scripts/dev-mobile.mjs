import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCommandOnPath,
  assertFilesExist,
  assertPortsFree,
  createProcessSupervisor,
  parseFlutterLauncherArgs,
  resolveFlutterLaunchConfig,
} from "./dev-common.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mobileDir = join(root, "mobile-app", "mobile-app");
const python = join(
  root,
  "backend",
  ".venv-phase2",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const backendEnvPath = join(root, "backend", ".env");

const opts = parseFlutterLauncherArgs(process.argv.slice(2));
if (opts.help) {
  console.log(`Usage: npm run dev:mobile ["--" options]

Starts FastAPI (backend/.venv-phase2) and the Flutter customer app together.

Options:
  --device=<id>     Flutter target device (default: chrome; e.g. edge, web-server, emulator-5554)
  --web-port=<n>    Fixed browser port when running on chrome/edge/web-server (default: 5173)
  --api-port=<n>    Local FastAPI port (default: 8000)
  --host=<ip>       FastAPI bind host (default: 127.0.0.1, or 0.0.0.0 with --device=emulator-*)
  --api-url=<url>   Override SPINSENSE_API_URL passed to Flutter
  --dry-run         Validate prerequisites/ports and print the resolved launch commands
  --help            Show this help message
`);
  process.exit(0);
}

assertFilesExist([
  [python, "Create backend/.venv-phase2 and install backend/requirements.txt."],
  [backendEnvPath, "Configure the ignored backend/.env."],
  [join(mobileDir, "pubspec.yaml"), "Expected Flutter app under mobile-app/mobile-app."],
]);
assertCommandOnPath(
  "flutter",
  "Flutter SDK was not found on PATH. Install Flutter and verify `flutter --version`.",
);

const cfg = resolveFlutterLaunchConfig(opts, backendEnvPath, false);
await assertPortsFree(
  cfg.isWebTarget ? [opts.apiPort, opts.webPort] : [opts.apiPort],
  "npm run dev:mobile",
);

if (opts.dryRun) {
  console.log("Dry run OK:");
  console.log(`  OPERATOR_ORIGINS=${cfg.mergedOrigins}`);
  console.log(`  FastAPI: ${python} ${cfg.fastapiArgs.join(" ")}`);
  console.log(`  Flutter: flutter ${cfg.flutterArgs.join(" ")} (cwd: ${mobileDir})`);
  process.exit(0);
}

const supervisor = createProcessSupervisor("Stopping SpinSense backend and Flutter app...");
const webHint = cfg.isWebTarget
  ? ` and Flutter (${opts.device}) at http://localhost:${opts.webPort}`
  : ` and Flutter (${opts.device})`;

console.log(`Starting FastAPI at http://${cfg.apiHost}:${opts.apiPort}${webHint}`);
console.log(`Passing SPINSENSE_API_URL=${cfg.resolvedApiUrl}`);
console.log("Press Ctrl+C (or 'q' in Flutter) to stop both services.");

supervisor.start(
  "FastAPI",
  python,
  cfg.fastapiArgs,
  root,
  { ...process.env, OPERATOR_ORIGINS: cfg.mergedOrigins },
  false,
);
supervisor.start(
  "Flutter",
  process.platform === "win32" ? "flutter.bat" : "flutter",
  cfg.flutterArgs,
  mobileDir,
  process.env,
  process.platform === "win32",
);
