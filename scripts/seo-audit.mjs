import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { auditWiki, readJson } from "./wiki-quality.mjs";
import { UI } from "../src/i18n/ui.js";
import { LOCALES } from "../src/i18n/locales.js";
import { SITE } from "../src/config/site.js";

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
const gamesData = await readJson(path.resolve("data/games.json"));
for (const game of gamesData.games || []) {
  if (!game.cover?.startsWith("/")) continue;
  try {
    await readFile(path.resolve("public", game.cover.replace(/^\//, "")));
  } catch {
    failures.push(`game ${game.slug}: local cover not found (${game.cover})`);
  }
}
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
    const slug = path.basename(file, ".json");
    for (const error of auditWiki(wiki, slug)) failures.push(`${path.relative(process.cwd(), file)}: ${error}`);
  }
}
for (const file of files) {
  const html = await readFile(file, "utf8");
  const rel = path.relative(root, file);
  const noindex = /<meta name="robots" content="noindex/.test(html);
  const required = [
    [/<title>[^<]{8,}<\/title>/, "title"],
    [/<link rel="canonical" href="https:\/\//, "absolute canonical"],
  ];
  if (!noindex) required.push(
    [/<meta name="description" content="[^"]{20,}"/, "meta description"],
    [/<h1(?:\s|>)/, "H1"],
    [new RegExp(`<meta name="google-adsense-account" content="${ADSENSE_ID}"`), "AdSense account meta"],
    [new RegExp(`adsbygoogle\\.js\\?client=${ADSENSE_ID}`), "AdSense loader"],
  );
  if (rel === "index.html") {
    for (const [pattern, label] of required.slice(2)) if (!pattern.test(html)) failures.push(`${rel}: missing ${label}`);
    continue;
  }
  for (const [pattern, label] of required) if (!pattern.test(html)) failures.push(`${rel}: missing ${label}`);
  if (!noindex && rel.includes(`${path.sep}games${path.sep}`) && !/application\/ld\+json/.test(html)) failures.push(`${rel}: missing structured data`);
}

const robots = await readFile(path.join(root, "robots.txt"), "utf8");
const expectedSitemap = `${SITE.url}/sitemap-index.xml`;
if (!robots.includes(`Sitemap: ${expectedSitemap}`)) failures.push(`robots.txt: expected sitemap ${expectedSitemap}`);
if (robots.includes("moonlightpeakswiki.com")) failures.push("robots.txt: legacy Moonlight Peaks domain remains");

function outputFileForUrl(url) {
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") return path.join(root, "index.html");
  const relative = pathname.replace(/^\//, "");
  return path.extname(relative) ? path.join(root, relative) : path.join(root, relative, "index.html");
}

const htmlCache = new Map();
async function outputExists(url) {
  const file = outputFileForUrl(url);
  try {
    const value = await readFile(file, "utf8");
    htmlCache.set(file, value);
    return true;
  } catch {
    return false;
  }
}

const sitemapFiles = (await walk(root)).filter((file) => /sitemap.*\.xml$/.test(path.basename(file)));
const sitemapUrls = [];
for (const file of sitemapFiles) {
  const xml = await readFile(file, "utf8");
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.push(match[1].replaceAll("&amp;", "&"));
}
for (const value of sitemapUrls) {
  const url = new URL(value);
  if (url.origin !== new URL(SITE.url).origin || url.pathname.endsWith(".xml")) continue;
  const file = outputFileForUrl(url);
  if (!(await outputExists(url))) {
    failures.push(`sitemap: missing output for ${url.pathname}`);
    continue;
  }
  const html = htmlCache.get(file) || "";
  if (/<meta name="robots" content="noindex/.test(html)) failures.push(`sitemap: noindex URL included (${url.pathname})`);
}

const brokenLinks = new Set();
const siteOrigin = new URL(SITE.url).origin;
for (const file of files) {
  const html = await readFile(file, "utf8");
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) continue;
    const url = new URL(href, SITE.url);
    if (url.origin !== siteOrigin) continue;
    if (!(await outputExists(url))) brokenLinks.add(`${path.relative(root, file)} -> ${url.pathname}`);
  }
}
for (const link of brokenLinks) failures.push(`broken internal link: ${link}`);

const adsTxt = (await readFile(path.join(root, "ads.txt"), "utf8")).trim();
if (adsTxt !== ADS_TXT_LINE) failures.push("ads.txt: publisher record is missing or incorrect");

if (failures.length) {
  console.error(`SEO audit failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`SEO audit passed: ${files.length} HTML pages checked.`);
