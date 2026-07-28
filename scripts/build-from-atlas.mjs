#!/usr/bin/env node
/**
 * 离线版选题库构建脚本
 * ============================================================================
 * 跟 scripts/fetch-games.mjs 的区别：这个脚本完全不连网、不需要 IGDB_CLIENT_ID /
 * IGDB_CLIENT_SECRET，纯粹读取本地三份数据文件，合并成新的 data/games.json：
 *   - data/game-atlas.json   —— Norris 的 2026-2027 选题库（Excel 导入，目前 100 款）
 *   - data/owned-wikis.json  —— 自有 wiki 直链配置
 *   - data/games.json（旧的）—— 用来保留之前已经手填好、选题库里没有的游戏
 *                              （比如 GTA VI 之外那几款还没进选题库的大作占位卡片），
 *                              以及同一款游戏之前已经填好的 cover / developer / publisher / links，
 *                              这些字段选题库里没有，不该被覆盖成空。
 *
 * 什么时候用这个、什么时候用 fetch-games.mjs：
 *   - 日常自动更新（每天定时 + 真正连 IGDB 抓封面/公司信息）：交给 GitHub Actions 跑
 *     scripts/fetch-games.mjs，不用管这个脚本。
 *   - 改了 data/game-atlas.json 或 data/owned-wikis.json 之后，想立刻在本地/预览环境看到效果，
 *     不想等到明天定时任务跑完：手动跑一次这个脚本就行，不需要任何密钥。
 *
 * 用法：node scripts/build-from-atlas.mjs
 * ============================================================================
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyOwnedWiki, atlasFallback, loadManualCovers, applyManualCovers } from "./fetch-games.mjs";

const DATA_DIR = path.join(process.cwd(), "data");

async function readJson(name, fallback) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, name), "utf-8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const atlas = await readJson("game-atlas.json", { games: [] });
  const ownedWikis = await readJson("owned-wikis.json", []);
  const existing = await readJson("games.json", { games: [] });

  const existingBySlug = new Map(existing.games.map((g) => [g.slug, g]));
  const atlasSlugs = new Set(atlas.games.map((e) => e.slug));

  const bySlug = new Map();

  // 第一步：选题库里的 100 款游戏，逐条转换 + 套用已有的手填数据（如果同一个 slug 之前已经手填过
  // cover/developer/publisher/links，这些选题库里没有的字段要保留下来，不能被空值覆盖）。
  for (const entry of atlas.games) {
    let game = atlasFallback(entry, ownedWikis);
    const prior = existingBySlug.get(entry.slug);
    if (prior) {
      if (prior.cover) game.cover = prior.cover;
      if (prior.coverPosition && prior.coverPosition !== "center") game.coverPosition = prior.coverPosition;
      if (prior.developer) game.developer = prior.developer;
      if (prior.publisher) game.publisher = prior.publisher;
      if (prior.links && Object.keys(prior.links).length) game.links = prior.links;
      if (prior.grad) game.grad = prior.grad;
    }
    // owned-wikis 优先级最高，最后再套一次确保 wikiUrl/titleZh/banner 没被上面的 prior 合并步骤带偏。
    game = applyOwnedWiki(game, ownedWikis);
    bySlug.set(game.slug, game);
  }

  // 第二步：games.json 里原本就有、但选题库里没覆盖到的游戏（比如还没排进 Top100 的大作占位卡），
  // 原样保留，不动它们的任何字段。
  for (const g of existing.games) {
    if (!atlasSlugs.has(g.slug) && !bySlug.has(g.slug)) {
      bySlug.set(g.slug, g);
    }
  }

  const games = [...bySlug.values()].sort((a, b) => {
    // owned 置顶，然后按热度降序，最后按发行日期排序，方便人工浏览
    if ((a.coverage === "owned") !== (b.coverage === "owned")) return a.coverage === "owned" ? -1 : 1;
    return (b.hype ?? 0) - (a.hype ?? 0);
  });
  applyManualCovers(games, await loadManualCovers());

  const output = { generatedAt: new Date().toISOString(), count: games.length, games };
  await writeFile(path.join(DATA_DIR, "games.json"), JSON.stringify(output, null, 2));

  const ownedCount = games.filter((g) => g.coverage === "owned").length;
  const atlasCount = games.filter((g) => g.coverage === "atlas").length;
  const otherCount = games.length - ownedCount - atlasCount;
  console.log(`✅ 已写入 data/games.json，共 ${games.length} 款游戏。`);
  console.log(`   其中 owned（有自有 wiki 直链）：${ownedCount} 款`);
  console.log(`   atlas（选题库，暂无自有 wiki）：${atlasCount} 款`);
  console.log(`   其他（历史手填占位）：${otherCount} 款`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("❌ 构建失败:", err);
    process.exit(1);
  });
}

export { main };
