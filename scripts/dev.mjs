import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const web = join(root, "frontend-web");
const python = join(root, "backend", ".venv-phase2", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const next = join(web, "node_modules", "next", "dist", "bin", "next");

for (const [file, setup] of [
  [python, "Create backend/.venv-phase2 and install backend/requirements.txt."],
  [next, "Run npm ci in frontend-web."],
  [join(root, "backend", ".env"), "Configure the ignored backend/.env."],
  [join(web, ".env.local"), "Configure the ignored frontend-web/.env.local."],
]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file}. ${setup}`);
    process.exit(1);
  }
}

function portIsFree(port, host) {
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

for (const port of [8000, 3000]) {
  const free = await Promise.all([portIsFree(port, "127.0.0.1"), portIsFree(port, "::1")]);
  if (free.includes(false)) {
    console.error(`Port ${port} is already in use. Stop the existing service before running npm run dev.`);
    process.exit(1);
  }
}

const children = [];
let stopping = false;

function stopChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already stopped. */ }
  }
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping SpinSense development servers...");
  for (const child of [...children].reverse()) stopChild(child);
  process.exitCode = code;
}

function start(name, executable, args, cwd) {
  const child = spawn(executable, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
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
      shutdown(code || 1);
    }
  });
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
process.on("exit", () => { for (const child of [...children].reverse()) stopChild(child); });

console.log("Starting FastAPI at http://127.0.0.1:8000 and Next.js at http://localhost:3000");
console.log("Press Ctrl+C to stop both services.");
start("FastAPI", python, ["-m", "uvicorn", "main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", "8000"], root);
start("Next.js", process.execPath, [next, "dev", "--port", "3000"], web);
