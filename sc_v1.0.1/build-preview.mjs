import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve(process.argv[2] || ".");
const assets = {};
for (const [file, mime] of [
  ["index.html", "text/html; charset=utf-8"],
  ["app.js", "text/javascript; charset=utf-8"],
  ["browser-data.js", "text/javascript; charset=utf-8"],
  ["style.css", "text/css; charset=utf-8"]
]) {
  const path = `/calendar_all/${file}`;
  assets[path] = { mime, text: await readFile(resolve(source, `calendar_all/${file}`), "utf8") };
}

const worker = await readFile(resolve(source, "sc_v1.0.1/worker.mjs"), "utf8");
await mkdir("dist/server", { recursive: true });
await writeFile("dist/server/index.js", `${worker}\nexport default createWorker(${JSON.stringify(assets)});\n`);
