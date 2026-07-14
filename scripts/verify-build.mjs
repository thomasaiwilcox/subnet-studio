import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist");
const entries = await readdir(dist);
const expected = ["index.html", "social-preview.png"];
if (entries.length !== expected.length || expected.some((name) => !entries.includes(name))) {
  throw new Error(`Expected exactly ${expected.join(" and ")}, found: ${entries.join(", ")}`);
}
const file = resolve(dist, "index.html");
const html = await readFile(file, "utf8");
const externalRuntimeAsset = html.match(/<(?:script|img|audio|video|source)[^>]+src=["']https?:\/\//gi)
  ?? html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:\/\//gi);
if (externalRuntimeAsset) throw new Error("Production artifact contains external runtime asset requests");
const size = (await stat(file)).size;
const previewSize = (await stat(resolve(dist, "social-preview.png"))).size;
if (previewSize < 10_000) throw new Error("social-preview.png is unexpectedly small");
console.log(`Verified offline artifact: dist/index.html (${size} bytes) + social-preview.png (${previewSize} bytes)`);
