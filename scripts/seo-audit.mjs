import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { auditWiki, readJson } from "./wiki-quality.mjs";

const root = path.resolve("dist");
async function walk(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async (entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  }))).flat();
}

const files = (await walk(root)).filter((f) => f.endsWith(".html"));
const failures = [];
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
  ];
  if (!noindex) required.push(
    [/<meta name="description" content="[^"]{20,}"/, "meta description"],
    [/<h1(?:\s|>)/, "H1"],
  );
  if (rel === "index.html") continue;
  for (const [pattern, label] of required) if (!pattern.test(html)) failures.push(`${rel}: missing ${label}`);
  if (!noindex && rel.includes(`${path.sep}games${path.sep}`) && !/application\/ld\+json/.test(html)) failures.push(`${rel}: missing structured data`);
}

if (failures.length) {
  console.error(`SEO audit failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`SEO audit passed: ${files.length} HTML pages checked.`);
