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
const webDir = join(root, "frontend-web");
const mobileDir = join(root, "mobile-app", "mobile-app");
const python = join(
  root,
  "backend",
  ".venv-phase2",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const nextBin = join(webDir, "node_modules", "next", "dist", "bin", "next");
const backendEnvPath = join(root, "backend", ".env");

const opts = parseFlutterLauncherArgs(process.argv.slice(2));
if (opts.help) {
  console.log(`Usage: npm run dev:all ["--" options]

Starts FastAPI (backend), Next.js (frontend-web), and the Flutter customer app together.

Options:
  --device=<id>     Flutter target device (default: chrome; e.g. edge, web-server, emulator-5554)
  --web-port=<n>    Fixed Flutter browser port for chrome/edge/web-server (default: 5173)
  --next-port=<n>   Local Next.js port (default: 3000)
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
  [nextBin, "Run npm ci in frontend-web."],
  [backendEnvPath, "Configure the ignored backend/.env."],
  [join(webDir, ".env.local"), "Configure the ignored frontend-web/.env.local."],
  [join(mobileDir, "pubspec.yaml"), "Expected Flutter app under mobile-app/mobile-app."],
]);
assertCommandOnPath(
  "flutter",
  "Flutter SDK was not found on PATH. Install Flutter and verify `flutter --version`.",
);

const cfg = resolveFlutterLaunchConfig(opts, backendEnvPath, true);
const portsToCheck = [opts.apiPort, opts.nextPort];
if (cfg.isWebTarget) portsToCheck.push(opts.webPort);
await assertPortsFree(portsToCheck, "npm run dev:all");

const nextArgs = [nextBin, "dev", "--port", String(opts.nextPort)];

if (opts.dryRun) {
  console.log("Dry run OK:");
  console.log(`  OPERATOR_ORIGINS=${cfg.mergedOrigins}`);
  console.log(`  FastAPI: ${python} ${cfg.fastapiArgs.join(" ")}`);
  console.log(`  Next.js: ${process.execPath} ${nextArgs.join(" ")} (cwd: ${webDir})`);
  console.log(`  Flutter: flutter ${cfg.flutterArgs.join(" ")} (cwd: ${mobileDir})`);
  process.exit(0);
}

const supervisor = createProcessSupervisor(
  "Stopping SpinSense backend, Next.js, and Flutter app...",
);
const flutterHint = cfg.isWebTarget
  ? `Flutter (${opts.device}) at http://localhost:${opts.webPort}`
  : `Flutter (${opts.device})`;

console.log(
  `Starting FastAPI (http://${cfg.apiHost}:${opts.apiPort}), Next.js (http://localhost:${opts.nextPort}), and ${flutterHint}`,
);
console.log(`Passing SPINSENSE_API_URL=${cfg.resolvedApiUrl}`);
console.log("Press Ctrl+C (or 'q' in Flutter) to stop all three services.");

supervisor.start(
  "FastAPI",
  python,
  cfg.fastapiArgs,
  root,
  { ...process.env, OPERATOR_ORIGINS: cfg.mergedOrigins },
  false,
);
supervisor.start("Next.js", process.execPath, nextArgs, webDir);
supervisor.start(
  "Flutter",
  process.platform === "win32" ? "flutter.bat" : "flutter",
  cfg.flutterArgs,
  mobileDir,
  process.env,
  process.platform === "win32",
);
