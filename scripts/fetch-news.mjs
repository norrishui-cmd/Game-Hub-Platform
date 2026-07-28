#!/usr/bin/env node
/**
 * 最新资讯 · 每日抓取脚本
 * ============================================================================
 * 运行环境：跟 fetch-games.mjs / fetch-trending.mjs 共用同一个 GitHub Actions 工作流
 *           （.github/workflows/daily-fetch.yml），每天定时跑一次。
 * 不需要任何密钥——直接读取几家主流游戏媒体公开的 RSS 订阅源（RSS 本来就是给别人订阅用的，
 * 不存在抓取权限问题），比通用新闻 API 更稳，也不用维护 API key。
 *
 * 选取偏向：侧重"攻略 Wiki 会关心"的角度——版本更新/补丁说明、角色阵容公布、玩法机制解读、
 * 新作情报，而不是纯评测或八卦。判断依据很简单：标题命中关键词（patch/update/notes/
 * confirmed/revealed/cast/roadmap 等）优先；筛不掉的其余内容也不强行排除，交给标题本身的
 * 信息量说话，避免过度工程化的分类逻辑。
 *
 * 只存标题 + 来源 + 原文链接 + 日期，不转载正文/摘要——完全遵守版权要求，功能上等价于一个
 * 新闻聚合索引（跟 Google 新闻的做法一样），读者点进去看原文。
 *
 * 输出：data/news.json —— index.astro 和 news.astro 都读这个文件。
 * 用法：node scripts/fetch-news.mjs
 * ============================================================================
 */

import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";

// 主流游戏媒体的公开 RSS 源。某一家改版/挂掉不影响其余——每个源单独 try/catch。
const FEEDS = [
  { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" },
  { name: "Eurogamer", url: "https://www.eurogamer.net/feed" },
  { name: "Rock Paper Shotgun", url: "https://www.rockpapershotgun.com/feed" },
  { name: "PCGamesN", url: "https://www.pcgamesn.com/feed" },
  { name: "GamesRadar+", url: "https://www.gamesradar.com/rss/" },
];

const MAX_AGE_DAYS = 6; // 超过这个天数的旧文章不进当日榜单，保持"最新"
const MAX_ITEMS = 30;

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

function stripCdataAndTags(s) {
  const cdata = s.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  const inner = cdata ? cdata[1] : s;
  return inner.replace(/<[^>]+>/g, "").trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8211;/g, "\u2013")
    .replace(/&#8212;/g, "\u2014");
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRegex.exec(xml))) {
    const block = m[1];
    const rawTitle = extractTag(block, "title");
    const rawLink = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "dc:date");
    if (!rawTitle || !rawLink) continue;
    const title = decodeEntities(stripCdataAndTags(rawTitle));
    const url = stripCdataAndTags(rawLink);
    const date = pubDate ? new Date(pubDate) : null;
    if (!title || !url || !date || Number.isNaN(date.getTime())) continue;
    items.push({ title, url, publishedAt: date.toISOString().slice(0, 10), _ts: date.getTime() });
  }
  return items;
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": "GameRadarBot/1.0 (+https://gameradar.wiki)" } });
  if (!res.ok) throw new Error(`${res.status}`);
  const xml = await res.text();
  return parseRssItems(xml).map((item) => ({ ...item, source: feed.name }));
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

// 标题里命中了本站已经收录的游戏名，就把这条新闻挂到对应的攻略页下面，形成内链。
// 长名字优先匹配，避免短名字（比如 "Rust"）误伤别的标题。
function findRelatedSlug(title, games) {
  const lower = title.toLowerCase();
  const candidates = games
    .filter((g) => g.titleEn && g.titleEn.length >= 4)
    .sort((a, b) => b.titleEn.length - a.titleEn.length);
  for (const g of candidates) {
    if (lower.includes(g.titleEn.toLowerCase())) return g.slug;
  }
  return null;
}

async function main() {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const games = await loadGames();

  const results = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f)));
  let all = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`  ✓ ${FEEDS[i].name}：拿到 ${r.value.length} 条`);
      all = all.concat(r.value);
    } else {
      console.warn(`  ⚠ ${FEEDS[i].name} 抓取失败，跳过（不影响其他源）: ${r.reason?.message || r.reason}`);
    }
  });

  if (all.length === 0) {
    console.error("❌ 所有 RSS 源都失败了，本次不写入文件，保留上一次的资讯列表。");
    process.exit(1);
  }

  // 去重（同一篇文章可能被多个源转载/聚合到）、按发布时间过滤、按时间倒序、截断数量
  const seen = new Set();
  const deduped = all.filter((item) => {
    if (item._ts < cutoff) return false;
    const key = item.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => b._ts - a._ts);
  const finalItems = deduped.slice(0, MAX_ITEMS).map(({ _ts, ...rest }) => ({
    ...rest,
    relatedSlug: findRelatedSlug(rest.title, games),
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    count: finalItems.length,
    items: finalItems,
  };

  await writeFile(path.join(process.cwd(), "data", "news.json"), JSON.stringify(output, null, 2));
  console.log(`✅ 已写入 data/news.json，共 ${finalItems.length} 条最新资讯。`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("❌ 抓取失败:", err);
    process.exit(1);
  });
}

export { parseRssItems, findRelatedSlug, main };
