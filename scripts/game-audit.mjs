import path from "node:path";
import { auditWiki, readJson } from "./wiki-quality.mjs";

const slug = process.argv[2];
if (!slug) throw new Error("Usage: npm run game:audit -- <game-slug>");
const file = path.resolve(`data/wiki/${slug}.json`);
const errors = auditWiki(await readJson(file));
if (errors.length) {
  console.error(`Wiki audit failed: ${slug}`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`Wiki audit passed: ${slug}`);
