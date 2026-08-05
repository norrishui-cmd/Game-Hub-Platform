import { readdir } from "node:fs/promises";
import path from "node:path";
import { auditWiki, readJson } from "./wiki-quality.mjs";
import { dataScore } from "../src/lib/games.js";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const spacedLimitIndex = args.indexOf("--limit");
const requestedLimit = Number(limitArg?.split("=")[1] || (spacedLimitIndex >= 0 ? args[spacedLimitIndex + 1] : 20));
const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : 20;
const gamesData = await readJson(path.resolve("data/games.json"));
const wikiBySlug = new Map();
for (const file of await readdir(path.resolve("data/wiki"))) {
  if (!file.endsWith(".json")) continue;
  wikiBySlug.set(file.replace(/\.json$/, ""), await readJson(path.resolve("data/wiki", file)));
}

function priorityScore(game) {
  // 这是编辑排期分，不是用户评分：需求信号来自已有 hype/trending/featured，
  // 商业价值来自 owned 深度站点，资料完备度来自结构化字段数量。
  return Math.round(
    Math.min(40, Math.max(0, Number(game.hype) || 0) * .4)
    + (game.trending ? 15 : 0)
    + (game.featured ? 10 : 0)
    + (game.coverage === "owned" ? 20 : 0)
    + dataScore(game) * 2
  );
}

function compactGap(error) {
  return error
    .replace("English summary must be at least 120 characters", "write 120+ char English summary")
    .replace("at least 2 English guide sections are required", "add 2 substantial guide sections")
    .replace("at least 2 sources are required", "add 2 HTTPS sources")
    .replace("missing English content", "add English content");
}

const backlog = gamesData.games
  .map((game) => {
    const wiki = wikiBySlug.get(game.slug) || { slug: game.slug, publishStatus: "draft", content: {} };
    const gaps = auditWiki(wiki, game.slug).map(compactGap);
    return {
      slug: game.slug,
      title: game.titleEn || game.titleZh || game.slug,
      status: wiki.publishStatus || "draft",
      priority: priorityScore(game),
      hype: Number(game.hype) || 0,
      coverage: game.coverage || "reference",
      qualityGaps: gaps,
      nextAction: gaps[0] || "manual editorial review before publishing",
    };
  })
  .filter((item) => item.status !== "published")
  .sort((a, b) => b.priority - a.priority || b.hype - a.hype || a.title.localeCompare(b.title));

const selected = backlog.slice(0, limit);
if (jsonMode) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), totalDrafts: backlog.length, shown: selected.length, items: selected }, null, 2));
} else {
  console.log(`# GameRadar content backlog\n`);
  console.log(`Draft/review candidates: ${backlog.length}. Showing top ${selected.length}. Priority is an editorial scheduling score, not a game rating.\n`);
  console.log("| # | Game | Status | Priority | Hype | Coverage | Gaps | Next action |");
  console.log("|---:|---|---|---:|---:|---|---:|---|");
  selected.forEach((item, index) => {
    const safe = (value) => String(value).replaceAll("|", "/");
    console.log(`| ${index + 1} | ${safe(item.title)} (\`${safe(item.slug)}\`) | ${safe(item.status)} | ${item.priority} | ${item.hype} | ${safe(item.coverage)} | ${item.qualityGaps.length} | ${safe(item.nextAction)} |`);
  });
  console.log("\nRun with `--json` for automation or `--limit=50` for a longer queue.");
}
