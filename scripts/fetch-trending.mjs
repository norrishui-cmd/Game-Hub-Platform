#!/usr/bin/env node
/**
 * 本月热门榜单 · 每日抓取脚本
 * ============================================================================
 * 运行环境：跟 fetch-games.mjs 共用同一个 GitHub Actions 工作流（.github/workflows/daily-fetch.yml），
 *           每天定时跑一次，也能在 Actions 标签页手动 "Run workflow" 触发。
 * 不需要新申请任何密钥：Twitch 那部分直接复用已经配置好的 IGDB_CLIENT_ID / IGDB_CLIENT_SECRET——
 * IGDB 的鉴权本来就是走 Twitch 开发者账号的 OAuth client_credentials，这两个值本质上就是一个
 * Twitch App 的 Client ID / Secret，同一份凭据既能查 IGDB 也能查 Twitch Helix API。
 * SteamSpy 那部分完全不需要密钥（公开接口）。
 *
 * 数据源（两个独立信号，各自失败不互相影响）：
 *   1. Twitch Helix `GET /helix/games/top` —— 当前观看人数最高的游戏分类，反映"现在大家在看谁玩"。
 *      过滤掉 Just Chatting / IRL 这类非游戏分类。
 *   2. SteamSpy `top100in2weeks` —— 近两周玩家数最高的 Steam 游戏，反映"现在大家在玩什么"。
 *      公开 API，不需要 Steam 开发者账号。
 *
 * 输出：
 *   data/trending-history/<YYYY-MM-DD>.json —— 每天一份快照，原始排名，不覆盖历史。
 *   data/monthly-trending.json             —— 汇总当月（自然月）全部快照算出的滚动榜单，
 *                                              index.astro 和 monthly-chart.astro 都读这个文件。
 *
 * 「本月」怎么算：每天快照里排进前 20 的游戏，按名次给分（第 1 名 20 分，第 20 名 1 分，
 * 不在前 20 的当天记 0 分），把当月所有快照的分数加总排序。这样偶尔空降一次 #1 但只出现一天的游戏，
 * 不会压过整个月持续保持中上游的游戏——更符合"本月热门"的直觉，而不是"今天热门"。
 * 每到新的自然月，历史文件的日期前缀自动换了，榜单也就跟着自然重新计算，不需要手动清空任何东西。
 *
 * 用法：node scripts/fetch-trending.mjs
 * ============================================================================
 */

import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getAccessToken } from "./fetch-games.mjs";

const CLIENT_ID = process.env.IGDB_CLIENT_ID;
const CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

// Twitch 目录里排名很高、但不是"游戏"的分类，需要过滤掉
const NON_GAME_CATEGORIES = new Set([
  "just chatting", "irl", "music", "talk shows & podcasts", "art",
  "asmr", "special events", "makers & crafting", "food & drink",
  "pools, hot tubs, and beaches", "sports", "games + demos",
  "software and game development",
]);

async function fetchTwitchTopGames(token) {
  const res = await fetch("https://api.twitch.tv/helix/games/top?first=30", {
    headers: { "Client-Id": CLIENT_ID, "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Twitch helix/games/top 请求失败: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.data || [])
    .filter((g) => !NON_GAME_CATEGORIES.has(String(g.name).trim().toLowerCase()))
    .slice(0, 20)
    .map((g, i) => ({ rank: i + 1, name: g.name }));
}

async function fetchSteamSpyTop() {
  const res = await fetch("https://steamspy.com/api.php?request=top100in2weeks");
  if (!res.ok) throw new Error(`SteamSpy 请求失败: ${res.status}`);
  const json = await res.json();
  return Object.values(json)
    .slice(0, 20)
    .map((g, i) => ({ rank: i + 1, name: g.name, appid: g.appid }));
}

function slugify(text) {
  return String(text).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

async function loadGames() {
  try {
    const p = path.join(process.cwd(), "data", "games.json");
    const parsed = JSON.parse(await readFile(p, "utf-8"));
    return parsed.games || [];
  } catch {
    return [];
  }
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ 缺少 IGDB_CLIENT_ID / IGDB_CLIENT_SECRET 环境变量（本脚本复用同一份 Twitch 凭据）。");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const month = today.slice(0, 7); // YYYY-MM

  console.log("→ 正在获取 Twitch access token...");
  const token = await getAccessToken();

  let twitch = [];
  try {
    console.log("→ 正在抓取 Twitch 当前观看热度榜...");
    twitch = await fetchTwitchTopGames(token);
    console.log(`  拿到 ${twitch.length} 条`);
  } catch (e) {
    console.warn("⚠ Twitch 榜单获取失败，本次跳过（不影响 SteamSpy 数据）:", e.message);
  }

  let steamspy = [];
  try {
    console.log("→ 正在抓取 SteamSpy 近两周玩家数榜...");
    steamspy = await fetchSteamSpyTop();
    console.log(`  拿到 ${steamspy.length} 条`);
  } catch (e) {
    console.warn("⚠ SteamSpy 榜单获取失败，本次跳过（不影响 Twitch 数据）:", e.message);
  }

  if (twitch.length === 0 && steamspy.length === 0) {
    console.error("❌ 两个数据源都失败了，本次不写入任何文件，保留上一次的榜单。");
    process.exit(1);
  }

  // 第一步：写入今天的快照，历史快照永远不覆盖，只新增
  const historyDir = path.join(process.cwd(), "data", "trending-history");
  await mkdir(historyDir, { recursive: true });
  await writeFile(
    path.join(historyDir, `${today}.json`),
    JSON.stringify({ date: today, twitch, steamspy }, null, 2)
  );
  console.log(`✅ 已写入今天的快照 data/trending-history/${today}.json`);

  // 第二步：读取当月（自然月）全部快照，按名次加权累计打分
  const files = (await readdir(historyDir)).filter((f) => f.startsWith(month) && f.endsWith(".json"));
  const scoreByKey = new Map(); // key -> { displayName, score, sources:Set, appid }

  function addSnapshot(entries, sourceTag, weight) {
    for (const e of entries) {
      const key = e.name.trim().toLowerCase();
      const points = (21 - e.rank) * weight;
      if (!scoreByKey.has(key)) {
        scoreByKey.set(key, { displayName: e.name, score: 0, sources: new Set(), appid: null });
      }
      const cur = scoreByKey.get(key);
      cur.score += points;
      cur.sources.add(sourceTag);
      if (e.appid) cur.appid = e.appid;
    }
  }

  for (const file of files) {
    let snap;
    try {
      snap = JSON.parse(await readFile(path.join(historyDir, file), "utf-8"));
    } catch {
      continue;
    }
    addSnapshot(snap.twitch || [], "twitch", 1.0);
    addSnapshot(snap.steamspy || [], "steam", 1.2);
  }

  const games = await loadGames();
  const bySlug = new Map(games.map((g) => [g.slug, g]));

  const ranked = [...scoreByKey.values()].sort((a, b) => b.score - a.score).slice(0, 20);
  const outGames = ranked.map((g, i) => {
    const slug = slugify(g.displayName);
    const hub = bySlug.get(slug);
    return {
      rank: i + 1,
      titleEn: g.displayName,
      slug: hub ? hub.slug : null,
      hasHub: Boolean(hub),
      externalUrl: !hub && g.appid ? `https://store.steampowered.com/app/${g.appid}/` : (!hub ? `https://www.twitch.tv/directory/game/${encodeURIComponent(g.displayName)}` : null),
      sources: [...g.sources].sort(),
      score: Math.round(g.score * 10) / 10,
    };
  });

  const output = {
    month,
    updatedAt: new Date().toISOString(),
    daysTracked: files.length,
    sources: ["twitch_top_games", "steamspy_top100in2weeks"],
    count: outGames.length,
    games: outGames,
  };

  await writeFile(path.join(process.cwd(), "data", "monthly-trending.json"), JSON.stringify(output, null, 2));
  console.log(`✅ 已写入 data/monthly-trending.json，共 ${outGames.length} 款游戏（本月已累计 ${files.length} 天快照）。`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("❌ 抓取失败:", err);
    process.exit(1);
  });
}

export { fetchTwitchTopGames, fetchSteamSpyTop, main };
