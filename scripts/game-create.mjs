import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { readJson } from "./wiki-quality.mjs";

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run game:create -- <game-slug>");
const games = (await readJson(path.resolve("data/games.json"))).games;
const game = games.find((item) => item.slug === input);
if (!game) throw new Error(`Game not found in data/games.json: ${input}`);
const dir = path.resolve("data/wiki");
const file = path.join(dir, `${game.slug}.json`);
await mkdir(dir, { recursive: true });
try { await access(file); throw new Error(`Wiki file already exists: ${file}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
const template = {
  slug: game.slug,
  title: game.titleEn,
  publishStatus: "draft",
  updatedAt: new Date().toISOString(),
  content: { en: {
    summary: "",
    faq: [
      { question: `When does ${game.titleEn} release?`, answer: "" },
      { question: `What platforms is ${game.titleEn} available on?`, answer: "" }
    ],
    guideSections: [],
    sources: []
  } }
};
await writeFile(file, JSON.stringify(template, null, 2) + "\n");
console.log(`Created draft: ${path.relative(process.cwd(), file)}`);
