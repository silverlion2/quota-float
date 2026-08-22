import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const root = path.resolve("dist");
const limits = {
  entryJavaScript: 430 * 1024,
  totalJavaScript: 600 * 1024,
  totalJavaScriptGzip: 180 * 1024,
  totalCss: 150 * 1024,
};

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(target) : [target];
  }));
  return nested.flat();
}

const files = await filesIn(root);
const assets = await Promise.all(files.filter((file) => /\.(?:js|css)$/.test(file)).map(async (file) => {
  const bytes = await readFile(file);
  return {
    file: path.relative(root, file).replaceAll("\\", "/"),
    bytes: (await stat(file)).size,
    gzip: gzipSync(bytes).length,
  };
}));

const javascript = assets.filter((asset) => asset.file.endsWith(".js"));
const css = assets.filter((asset) => asset.file.endsWith(".css"));
const manifest = JSON.parse(await readFile(path.join(root, ".vite", "manifest.json"), "utf8"));
const entryFile = Object.values(manifest).find((item) => item.isEntry)?.file;
const entry = javascript.find((asset) => asset.file === entryFile);
if (!entry) throw new Error("Could not identify the Vite entry JavaScript asset.");

const totals = {
  entryJavaScript: entry.bytes,
  totalJavaScript: javascript.reduce((sum, asset) => sum + asset.bytes, 0),
  totalJavaScriptGzip: javascript.reduce((sum, asset) => sum + asset.gzip, 0),
  totalCss: css.reduce((sum, asset) => sum + asset.bytes, 0),
};

for (const asset of assets.sort((left, right) => right.bytes - left.bytes)) {
  console.log(`${asset.file.padEnd(52)} ${String(asset.bytes).padStart(8)} B  ${String(asset.gzip).padStart(8)} B gzip`);
}

const failures = Object.entries(limits)
  .filter(([metric, limit]) => totals[metric] > limit)
  .map(([metric, limit]) => `${metric}: ${totals[metric]} B exceeds ${limit} B`);
if (failures.length) {
  throw new Error(`Bundle budget exceeded:\n${failures.join("\n")}`);
}
console.log("Bundle budgets passed", totals);
