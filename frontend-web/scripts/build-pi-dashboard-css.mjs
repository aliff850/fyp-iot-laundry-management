import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const input = path.resolve(projectRoot, "../pi-dashboard.css");
const output = path.resolve(projectRoot, "../../pi5/dashboard/static/dashboard.css");
const source = await readFile(input, "utf8");
const compiled = await postcss([tailwindcss()]).process(source, { from: input, to: output });
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, compiled.css, "utf8");
process.stdout.write(`Built ${path.relative(path.resolve(projectRoot, "../.."), output)}\n`);
