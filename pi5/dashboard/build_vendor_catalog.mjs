// Extract visible field labels only. Screenshot values are never operational defaults.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../../docs/VENDOR_MACHINE_UI_REFERENCE.md"), "utf8");
const section = source.split("## Full parameter catalog")[1]?.split("## SpinSense presentation mapping")[0];
if (!section) throw new Error("Vendor catalog section missing");
const groups = {};
let current;
for (const line of section.split(/\r?\n/)) {
  const heading = /^### ([^(]+) \(/.exec(line);
  if (heading) { current = heading[1].trim(); groups[current] = []; continue; }
  if (!current || !line.startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
  if (!cells[0] || cells[0] === "Vendor label" || /^-+:?$/.test(cells[0])) continue;
  groups[current].push(cells[0]);
  if (current === "Extract" && cells[2]) groups[current].push(cells[2]);
}
if (Object.keys(groups).length !== 11 || Object.values(groups).some(fields => !fields.length)) {
  throw new Error("Incomplete vendor catalog extraction");
}
writeFileSync(resolve(here, "static/vendor-parameters.json"), JSON.stringify(groups, null, 2) + "\n");
