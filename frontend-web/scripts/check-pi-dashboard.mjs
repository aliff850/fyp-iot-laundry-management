import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = path.join(root, "backend/.venv-phase2/Scripts/python.exe");
const template = page => {
  const code = "import sys; from flask import render_template; from pi5.dashboard.dashboard import app; " +
    "context=app.test_request_context('/'); context.push(); " +
    "print(render_template('index.html', page=sys.argv[1], staff_csrf='test-csrf'))";
  const result = spawnSync(python, ["-c", code, page], {
    cwd: root, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
};
const pages = {
  "/": template("overview"),
  "/machines": template("machines"),
  "/lpg-safety": template("safety"),
};
const loginCode = "from flask import render_template; from pi5.dashboard.dashboard import app; " +
  "context=app.test_request_context('/login'); context.push(); " +
  "print(render_template('login.html', csrf_token='test-csrf', destination='/', error=None))";
const loginResult = spawnSync(python, ["-c", loginCode], {
  cwd: root, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});
if (loginResult.status !== 0) throw new Error(loginResult.stderr);
pages["/login"] = loginResult.stdout;
const demoCode = "from flask import render_template; from pi5.dashboard.dashboard import app; " +
  "context=app.test_request_context('/demo/new'); context.push(); " +
  "print(render_template('demo_new.html', source_id='washer-sim-01', csrf_token='test-csrf', error=None))";
const demoResult = spawnSync(python, ["-c", demoCode], {
  cwd: root, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});
if (demoResult.status !== 0) throw new Error(demoResult.stderr);
pages["/demo/new"] = demoResult.stdout;
const checkoutCode = "from datetime import datetime, timedelta, timezone; from flask import render_template; " +
  "from pi5.dashboard.dashboard import app; context=app.test_request_context('/demo/checkout/' + 'A' * 43); context.push(); " +
  "checkout=dict(source_id='washer-sim-01', program_id='quick', price_myr=4, " +
  "expires_at=datetime.now(timezone.utc), confirmed_at=None, command_status=None); " +
  "print(render_template('demo_checkout.html', checkout=checkout, token='A' * 43, csrf_token='test-csrf', expired=False))";
const checkoutResult = spawnSync(python, ["-c", checkoutCode], {
  cwd: root, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});
if (checkoutResult.status !== 0) throw new Error(checkoutResult.stderr);
pages["/demo/checkout/test"] = checkoutResult.stdout;
const css = await readFile(path.join(root, "pi5/dashboard/static/dashboard.css"), "utf8");
const js = await readFile(path.join(root, "pi5/dashboard/static/dashboard.js"), "utf8");
const chartJs = await readFile(path.join(root, "pi5/dashboard/static/chart.umd.min.js"));
const font = await readFile(path.join(root, "pi5/dashboard/static/fonts/Manrope-variable.ttf"));
const now = new Date().toISOString();
const data = {
  gateway: { status: "active", branch_id: "branch-1" },
  checked_at: now,
  device_counts: { machines: 3, safety_nodes: 2 },
  freshness_counts: { fresh: 1, stale: 0, offline: 4 },
  unknown_devices: 0,
  sync: { pending: 2, synced: 4, quarantined: 1 },
  discoveries: [{ source_id: "new-lpg-03", suggested_type: "lpg_edge_node",
    last_seen_at: now, cloud_delivery: "received" }],
  devices: [{
    type: "washer", label: "Demo Washer", source_id: "washer-sim-01",
    source_kind: "simulated", capacity_kg: 12,
    observation: { state: "IDLE", freshness: "offline", sample_at: "2020-01-01T00:00:00Z",
                   values: { remaining_seconds: 0 } },
  }, { type: "dryer", label: "Demo Dryer", source_id: "dryer-sim-01", source_kind: "simulated",
    capacity_kg: 10, observation: null },
  { type: "washer_dryer", label: "Demo Combo", source_id: "combo-sim-01", source_kind: "simulated",
    capacity_kg: 12, observation: null }],
  safety_nodes: [{
    type: "lpg_edge_node", label: "Physical LPG Node", source_id: "lpg-node-01",
    source_kind: "physical", capacity_kg: null,
    observation: { freshness: "fresh", sample_at: now, source_time_quality: "gateway_receipt_only",
                   sync_state: "pending", values: { lpg_weight_kg: 3.2, gross_weight_kg: 8.2,
                     lpg_percent: 32, mq6_raw_adc: 101, voltage: 0.22, temperature: 27.3, humidity: 61 } },
  }, { type: "lpg_edge_node", label: "Second LPG Node", source_id: "lpg-node-02",
    source_kind: "physical", capacity_kg: null, observation: null }],
};
const statistics = {
  summary: { completed_cycles: 4, running_seconds: 30, estimated_revenue_myr: "20.00",
    stopped: 0, faulted: 0, interrupted: 0 },
  series: [{ timestamp: "2026-11-13", cycles: 4, stopped: 0, running_seconds: 30, revenue_myr: "20.00" }],
  events: [
    { cycle_id: "1", program_id: "quick", outcome: "completed", running_seconds: 6, price_myr: "4.00", local_date: "2026-11-13", finished_at: "2026-11-13T04:00:00Z" },
    { cycle_id: "2", program_id: "quick", outcome: "completed", running_seconds: 6, price_myr: "4.00", local_date: "2026-11-13", finished_at: "2026-11-13T04:00:00Z" },
    { cycle_id: "3", program_id: "standard", outcome: "completed", running_seconds: 9, price_myr: "6.00", local_date: "2026-11-13", finished_at: "2026-11-13T04:00:00Z" },
    { cycle_id: "4", program_id: "standard", outcome: "completed", running_seconds: 9, price_myr: "6.00", local_date: "2026-11-13", finished_at: "2026-11-13T04:00:00Z" },
  ],
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("http://gateway.test/**", route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/static/dashboard.css") {
        return route.fulfill({ status: 200, contentType: "text/css", body: css });
      }
      if (pathname === "/static/dashboard.js") {
        return route.fulfill({ status: 200, contentType: "text/javascript", body: js });
      }
      if (pathname === "/static/chart.umd.min.js") {
        return route.fulfill({ status: 200, contentType: "text/javascript", body: chartJs });
      }
      if (pathname === "/static/fonts/Manrope-variable.ttf") {
        return route.fulfill({ status: 200, contentType: "font/ttf", body: font });
      }
      if (pathname.endsWith("/qr.svg")) {
        return route.fulfill({ status: 200, contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#f2f2f3"/></svg>' });
      }
      if (pathname.startsWith("/api/dashboard/")) {
        if (pathname.endsWith("/statistics")) {
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(statistics) });
        }
        if (pathname === "/api/dashboard/history") {
          return route.fulfill({ status: 200, contentType: "application/json",
            body: JSON.stringify({ records: [{ source_id: "lpg-node-01", sample_at: now,
              sync_state: "synced", quarantine_reason: null }] }) });
        }
        const payload = pathname.endsWith("/machines") ? { ...data, devices: data.devices } :
          pathname.endsWith("/lpg-safety") ? { ...data, devices: data.safety_nodes } : data;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
      }
      return route.fulfill({ status: 200, contentType: "text/html", body: pages[pathname] || pages["/"] });
    });
    const page = await context.newPage();
    const requestedHosts = new Set();
    page.on("request", request => requestedHosts.add(new URL(request.url()).host));
    for (const route of ["/", "/machines", "/lpg-safety", "/login", "/demo/new", "/demo/checkout/test"]) {
      await page.goto(`http://gateway.test${route}`);
      if (!["/login", "/demo/new", "/demo/checkout/test"].includes(route)) await page.locator("#checkedAt").getByText("Local data checked").waitFor();
      if (route === "/") {
        await page.locator("#discoveriesList").getByText("new-lpg-03").waitFor();
        assert.match(await page.locator("#safetySummary").innerText(), /1 fresh.*1 without readings/);
      }
      if (route === "/machines") {
        assert.equal(await page.locator("#machinesContent article").count(), 3);
        const firstCard = page.locator("#machinesContent article").first();
        const topPanels = firstCard.locator(":scope > dl");
        assert.equal(await topPanels.count(), 3);
        assert.match(await topPanels.nth(0).innerText(), /Capacity[\s\S]*Source[\s\S]*Device ID[\s\S]*Status/);
        assert.match(await topPanels.nth(1).innerText(), /Freshness[\s\S]*Last update/);
        const machineType = await firstCard.evaluate(card => ({
          title: getComputedStyle(card.querySelector("h3")).fontSize,
          label: getComputedStyle(card.querySelector(":scope > dl dt")).fontSize,
          value: getComputedStyle(card.querySelector(":scope > dl dd")).fontSize,
        }));
        assert.equal(machineType.title, "16px");
        assert.equal(machineType.label, "14px");
        assert.equal(machineType.value, "16px");
        if (process.argv.includes("--screenshots") && width === 390) {
          await firstCard.screenshot({ path: path.join(root, "pi5/dashboard/.preview-machine-card.png") });
        }
        assert.equal(await firstCard.locator("dialog").isVisible(), false, `${width}px machine dialog is visible before opening`);
        await page.locator("#machinesContent article").first().getByRole("button", { name: "Details & parameters" }).click();
        const modal = page.locator("dialog[open]");
        assert.equal(await modal.isVisible(), true, `${width}px machine dialog did not open`);
        const dialogBounds = await modal.boundingBox();
        for (const name of ["State & Diagnostics", "Programs Catalog", "Parameters", "Statistics & Revenue"]) {
          await modal.getByRole("tab", { name }).click();
          const bounds = await modal.boundingBox();
          assert.equal(Math.round(bounds.width), Math.round(dialogBounds.width));
          assert.equal(Math.round(bounds.height), Math.round(dialogBounds.height));
        }
        await modal.getByRole("tab", { name: "Statistics & Revenue" }).click();
        await modal.locator('[data-chart-kind="chartjs-cycles"]').waitFor();
        assert.match(await modal.innerText(), /RM 20\.00/);
        if (process.argv.includes("--screenshots") && width === 390) {
          await modal.screenshot({ path: path.join(root, "pi5/dashboard/.preview-cycles-chart.png") });
        }
        await modal.getByRole("combobox", { name: "Chart metric" }).selectOption("running");
        await modal.locator('[data-chart-kind="chartjs-running"]').waitFor();
        await modal.getByRole("combobox", { name: "Chart metric" }).selectOption("revenue");
        await modal.locator('[data-chart-kind="chartjs-revenue"]').waitFor();
        if (process.argv.includes("--screenshots") && width === 390) {
          await modal.screenshot({ path: path.join(root, "pi5/dashboard/.preview-revenue-chart.png") });
        }
        const modalOverflow = await modal.evaluate(element => element.scrollWidth - element.clientWidth);
        assert.ok(modalOverflow <= 0, `${width}px machine modal overflowed by ${modalOverflow}px`);
        await modal.getByRole("button", { name: "Close modal" }).click();
        assert.equal(await firstCard.locator("dialog").isVisible(), false, `${width}px machine dialog remains visible after closing`);
      }
      if (route === "/lpg-safety") assert.equal(await page.locator("#safetyContent article").count(), 2);
      assert.ok(!(await page.title()).includes("·"), `${route} title contains a middle dot`);
      const visibleText = await page.locator("body").innerText();
      const dotAt = visibleText.indexOf("·");
      assert.ok(dotAt < 0, `${route} contains a middle dot near ${visibleText.slice(Math.max(0, dotAt - 24), dotAt + 25)}`);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.fonts.check("400 14px Manrope")), true);
      assert.match(await page.locator("body").evaluate(element => getComputedStyle(element).fontFamily), /^Manrope/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const overflowSources = overflow > 0 ? await page.evaluate(() =>
        [...document.querySelectorAll("body *")].filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 5).map(element => `${element.tagName.toLowerCase()} ${element.className?.baseVal || element.className}`)) : [];
      assert.ok(overflow <= 0, `${width}px ${route} overflowed by ${overflow}px: ${overflowSources.join("; ")}`);
      assert.equal(await page.locator("h1").count(), 1);
      for (const control of await page.locator("button, a, input").all()) {
        if (!(await control.isVisible()) || (await control.getAttribute("href")) === "#main") continue;
        const bounds = await control.boundingBox();
        assert.ok(bounds && bounds.height >= 43.5, `${width}px ${route} has a short touch target`);
      }
      if (width < 768 && !["/login", "/demo/new", "/demo/checkout/test"].includes(route)) {
        const button = page.locator("#menuToggle");
        await button.click();
        assert.equal(await button.getAttribute("aria-expanded"), "true");
        assert.equal(await page.locator("#sideNav").isVisible(), true);
      }
      if (process.argv.includes("--screenshots") && width === 390 && (route === "/" || route === "/lpg-safety")) {
        const destination = path.join(root, "pi5/dashboard", `.preview-${route === "/" ? "overview" : "safety"}.png`);
        await page.screenshot({ path: destination, fullPage: true });
        process.stdout.write(`Preview: ${destination}\n`);
      }
    }
    assert.deepEqual([...requestedHosts], ["gateway.test"]);
    await context.close();
  }
  process.stdout.write("Pi dashboard responsive browser checks passed at 320, 390, 768, 1024 and 1440 px.\n");
} finally {
  await browser.close();
}
