import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { auditWiki, readJson } from "./wiki-quality.mjs";
import { UI } from "../src/i18n/ui.js";
import { LOCALES } from "../src/i18n/locales.js";

const root = path.resolve("dist");
const ADSENSE_ID = "ca-pub-9505220977121599";
const ADS_TXT_LINE = "google.com, pub-9505220977121599, DIRECT, f08c47fec0942fa0";
async function walk(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async (entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  }))).flat();
}

const files = (await walk(root)).filter((f) => f.endsWith(".html"));
const failures = [];
const referenceKeys = Object.keys(UI.en).sort();
for (const locale of LOCALES) {
  const missing = referenceKeys.filter((key) => !(key in (UI[locale] || {})));
  const extra = Object.keys(UI[locale] || {}).filter((key) => !referenceKeys.includes(key));
  if (missing.length) failures.push(`UI ${locale}: missing keys ${missing.join(", ")}`);
  if (extra.length) failures.push(`UI ${locale}: unexpected keys ${extra.join(", ")}`);
}
const wikiDir = path.resolve("data/wiki");
for (const file of await walk(wikiDir)) {
  if (!file.endsWith(".json")) continue;
  const wiki = await readJson(file);
  if (wiki.publishStatus === "published") {
    for (const error of auditWiki(wiki)) failures.push(`${path.relative(process.cwd(), file)}: ${error}`);
  }
}
for (const file of files) {
  const html = await readFile(file, "utf8");
  const rel = path.relative(root, file);
  const noindex = /<meta name="robots" content="noindex/.test(html);
  const required = [
    [/<title>[^<]{8,}<\/title>/, "title"],
    [/<link rel="canonical" href="https:\/\//, "absolute canonical"],
    [new RegExp(`<meta name="google-adsense-account" content="${ADSENSE_ID}"`), "AdSense account meta"],
    [new RegExp(`adsbygoogle\\.js\\?client=${ADSENSE_ID}`), "AdSense loader"],
  ];
  if (!noindex) required.push(
    [/<meta name="description" content="[^"]{20,}"/, "meta description"],
    [/<h1(?:\s|>)/, "H1"],
  );
  if (rel === "index.html") {
    for (const [pattern, label] of required.slice(2)) if (!pattern.test(html)) failures.push(`${rel}: missing ${label}`);
    continue;
  }
  for (const [pattern, label] of required) if (!pattern.test(html)) failures.push(`${rel}: missing ${label}`);
  if (!noindex && rel.includes(`${path.sep}games${path.sep}`) && !/application\/ld\+json/.test(html)) failures.push(`${rel}: missing structured data`);
}
const adsTxt = (await readFile(path.join(root, "ads.txt"), "utf8")).trim();
if (adsTxt !== ADS_TXT_LINE) failures.push("ads.txt: publisher record is missing or incorrect");

if (failures.length) {
  console.error(`SEO audit failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`SEO audit passed: ${files.length} HTML pages checked.`);
