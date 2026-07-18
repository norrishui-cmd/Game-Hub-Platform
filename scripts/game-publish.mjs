import { writeFile } from "node:fs/promises";
import path from "node:path";
import { auditWiki, readJson } from "./wiki-quality.mjs";

const slug = process.argv[2];
if (!slug) throw new Error("Usage: npm run game:publish -- <game-slug>");
const file = path.resolve(`data/wiki/${slug}.json`);
const wiki = await readJson(file);
const errors = auditWiki(wiki);
if (errors.length) {
  console.error("Publish blocked by quality gate:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
wiki.publishStatus = "published";
wiki.updatedAt = new Date().toISOString();
await writeFile(file, JSON.stringify(wiki, null, 2) + "\n");
console.log(`Published: ${slug}`);
