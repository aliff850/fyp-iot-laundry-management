import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";

export function assertFilesExist(checks) {
  for (const [file, setup] of checks) {
    if (!existsSync(file)) {
      console.error(`Missing ${file}. ${setup}`);
      process.exit(1);
    }
  }
}

export function assertCommandOnPath(command, helpMessage) {
  const probe = spawnSync(
    process.platform === "win32" ? "where.exe" : "which",
    [command],
    { stdio: "ignore", windowsHide: true },
  );
  if (probe.status !== 0) {
    console.error(helpMessage);
    process.exit(1);
  }
}

export function portIsFree(port, host) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", error => {
      if (error.code === "EADDRINUSE") resolve(false);
      else if (error.code === "EADDRNOTAVAIL" && host === "::1") resolve(true);
      else reject(error);
    });
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

export async function assertPortsFree(ports, scriptLabel) {
  for (const port of ports) {
    const free = await Promise.all([
      portIsFree(port, "127.0.0.1"),
      portIsFree(port, "::1"),
    ]);
    if (free.includes(false)) {
      console.error(
        `Port ${port} is already in use. Stop the existing service before running ${scriptLabel}.`,
      );
      process.exit(1);
    }
  }
}

export function readMergedCorsOrigins(backendEnvPath, extraOrigins = []) {
  let raw = process.env.OPERATOR_ORIGINS || "";
  if (!raw && existsSync(backendEnvPath)) {
    const envContent = readFileSync(backendEnvPath, "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (trimmed.startsWith("OPERATOR_ORIGINS=")) {
        raw = trimmed
          .slice("OPERATOR_ORIGINS=".length)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        break;
      }
    }
  }
  if (!raw) {
    raw = "http://localhost:3000";
  }

  const originSet = new Set(
    raw
      .split(",")
      .map(s => s.trim())
      .filter(Boolean),
  );
  for (const origin of extraOrigins) {
    if (origin) originSet.add(origin);
  }
  return [...originSet].join(",");
}

export function parseFlutterLauncherArgs(argv, defaults = {}) {
  const opts = {
    device: process.env.FLUTTER_DEVICE || "chrome",
    webPort: defaults.webPort ?? 5173,
    apiPort: defaults.apiPort ?? 8000,
    nextPort: defaults.nextPort ?? 3000,
    host: null,
    apiUrl: null,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg.startsWith("--device=")) {
      opts.device = arg.slice("--device=".length).trim();
    } else if (arg === "--device" && argv[i + 1]) {
      opts.device = argv[++i].trim();
    } else if (arg.startsWith("--web-port=")) {
      opts.webPort = Number.parseInt(arg.slice("--web-port=".length), 10);
    } else if (arg === "--web-port" && argv[i + 1]) {
      opts.webPort = Number.parseInt(argv[++i], 10);
    } else if (arg.startsWith("--api-port=")) {
      opts.apiPort = Number.parseInt(arg.slice("--api-port=".length), 10);
    } else if (arg === "--api-port" && argv[i + 1]) {
      opts.apiPort = Number.parseInt(argv[++i], 10);
    } else if (arg.startsWith("--next-port=")) {
      opts.nextPort = Number.parseInt(arg.slice("--next-port=".length), 10);
    } else if (arg === "--next-port" && argv[i + 1]) {
      opts.nextPort = Number.parseInt(argv[++i], 10);
    } else if (arg.startsWith("--host=")) {
      opts.host = arg.slice("--host=".length).trim();
    } else if (arg === "--host" && argv[i + 1]) {
      opts.host = argv[++i].trim();
    } else if (arg.startsWith("--api-url=")) {
      opts.apiUrl = arg.slice("--api-url=".length).trim();
    } else if (arg === "--api-url" && argv[i + 1]) {
      opts.apiUrl = argv[++i].trim();
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  for (const [label, port] of [
    ["--api-port", opts.apiPort],
    ["--web-port", opts.webPort],
    ["--next-port", opts.nextPort],
  ]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`Invalid ${label}: ${port}`);
      process.exit(1);
    }
  }
  if (!opts.device) {
    console.error("--device cannot be empty.");
    process.exit(1);
  }
  return opts;
}

export function createProcessSupervisor(stopMessage) {
  const children = [];
  let stopping = false;

  function stopChild(child) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Already stopped. */
      }
    }
  }

  function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    console.log(`\n${stopMessage}`);
    for (const child of [...children].reverse()) {
      stopChild(child);
    }
    process.exitCode = code;
  }

  function start(name, executable, args, cwd, env = process.env, shell = false) {
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
      shell,
      detached: process.platform !== "win32",
    });
    children.push(child);
    child.on("error", error => {
      console.error(`${name} could not start: ${error.message}`);
      shutdown(1);
    });
    child.on("exit", (code, signal) => {
      if (!stopping) {
        console.error(`${name} exited (${signal ?? code}).`);
        shutdown(code || 0);
      }
    });
  }

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  process.on("exit", () => {
    for (const child of [...children].reverse()) {
      stopChild(child);
    }
  });

  return { start, shutdown };
}

export function resolveFlutterLaunchConfig(opts, backendEnvPath, includeNextOrigin = false) {
  const isWebTarget = ["chrome", "edge", "web-server"].includes(opts.device.toLowerCase());
  const isEmulator = opts.device.toLowerCase().startsWith("emulator-");

  const resolvedApiUrl = opts.apiUrl
    ? opts.apiUrl.replace(/\/+$/, "")
    : isEmulator
      ? `http://10.0.2.2:${opts.apiPort}`
      : `http://127.0.0.1:${opts.apiPort}`;

  const apiHost = opts.host || (isEmulator ? "0.0.0.0" : "127.0.0.1");

  const extraOrigins = [];
  if (includeNextOrigin) {
    extraOrigins.push(`http://localhost:${opts.nextPort}`, `http://127.0.0.1:${opts.nextPort}`);
  }
  if (isWebTarget) {
    extraOrigins.push(`http://localhost:${opts.webPort}`, `http://127.0.0.1:${opts.webPort}`);
  }

  return {
    isWebTarget,
    resolvedApiUrl,
    apiHost,
    mergedOrigins: readMergedCorsOrigins(backendEnvPath, extraOrigins),
    fastapiArgs: [
      "-m",
      "uvicorn",
      "main:app",
      "--app-dir",
      "backend",
      "--reload",
      "--host",
      apiHost,
      "--port",
      String(opts.apiPort),
    ],
    flutterArgs: [
      "run",
      "-d",
      opts.device,
      ...(isWebTarget ? [`--web-port=${opts.webPort}`] : []),
      `--dart-define=SPINSENSE_API_URL=${resolvedApiUrl}`,
    ],
  };
}
