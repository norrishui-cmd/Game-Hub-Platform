#!/usr/bin/env node
/**
 * GameRadar 每日抓取脚本
 * ============================================================================
 * 运行环境：GitHub Actions（见 .github/workflows/daily-fetch.yml），
 *           每天定时跑一次，也可以在 GitHub 网页的 Actions 标签页手动点「Run workflow」触发。
 * 数据源：  IGDB API（api-docs.igdb.com），认证走 Twitch OAuth2 client_credentials。
 * 输出：    data/games.json —— index.html 页面加载时会 fetch 这个文件来渲染卡片。
 *
 * 需要的环境变量（在 GitHub 仓库 Settings → Secrets and variables → Actions 里设置，
 * 全程网页操作，不需要命令行，具体步骤见 SETUP.md）：
 *   IGDB_CLIENT_ID
 *   IGDB_CLIENT_SECRET
 *
 * 收录规则（越靠前优先级越高，都在下面 RULES 里，调参只改这一处）：
 *   1. data/owned-wikis.json 里配置的游戏——不管热度多低、资料多单薄，一定收录，且强制标记为
 *      coverage:"owned"，直链到对应的 wikiUrl（这是本站存在的核心目的：把流量导给自己的深度 wiki）。
 *   2. 其余「即将发行」游戏——hypes（预发行热度）达到阈值才进入候选池，且只要主游戏（category=0），
 *      过滤掉 DLC / 资料片 / 合集 / 移植版这类噪音。热度进一步达到 upcomingTrendingHypeMin 的，
 *      额外打上「本周热门」标签（即将发行 ≠ 不能热门，一款没上线但话题度爆炸的游戏应该两边都算）。
 *   3. 其余「近期上线」游戏——total_rating_count（评分人数，衡量话题度）达到阈值才进入候选池，同样只要主游戏，
 *      进来的都算「本周热门」。
 *   4. 进候选池之后还有一道「资料完整度」关卡：封面、平台、类型、外链、开发商这 5 项里
 *      少于 minCompletenessScore 项的，不会出现在公开的 data/games.json 里，
 *      而是单独写进 data/drafts.json——这是当前单页架构下 noindex 的真正等价物：
 *      与其把半页空白的资料页发布出去再让 Google 别收录，不如干脆先不发布，等信息长起来。
 *      data/drafts.json 只是给你自己看的雷达清单，index.html 不会读取它。
 *
 * 已知的 IGDB API 细节（2026-07 核实过一次，若脚本报错先看这里是否已经过期）：
 *   - websites.category 字段在 IGDB 最新 proto 定义里被标记为 deprecated，但目前仍正常返回数据。
 *     如果未来某天这个字段不再返回值，需要改成查 websites.type 并联查 /website_types 端点重新映射。
 *   - category 字段同样标记为 deprecated（新字段是 game_type），但官方示例代码目前仍在用
 *     category=0 表示主游戏，这里沿用这个用法；失效的话换成 game_type 重新对照。
 *   - follows 字段已 deprecated，热度信号改用 hypes（预发行）与 total_rating_count（已发行）。
 * ============================================================================
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const CLIENT_ID = process.env.IGDB_CLIENT_ID;
const CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

// ---------------------------------------------------------------------------
// 规则阈值：以后想收录得更多/更少、时间窗口更长/更短，只改这里，不用碰下面的逻辑。
// ---------------------------------------------------------------------------
const RULES = {
  upcomingHypeMin: 3,          // 预发行热度最低门槛，低于这个值大概率信息量太薄
  upcomingLimit: 24,           // 「即将发行」最多收录多少条
  upcomingTrendingHypeMin: 20, // 即将发行的游戏热度达到这个值，才额外打上「本周热门」标签
  trendingRatingCountMin: 15,  // 已发行游戏至少要有这么多条评分才算「有热度」
  trendingWindowDays: 240,     // 发行日期在过去多少天内的游戏才进入「近期热门」候选池
  trendingLimit: 24,           // 「近期热门」最多收录多少条
  minCompletenessScore: 2,     // 封面/平台/类型/外链/开发商 5 项里至少要占几项才公开展示，见下面 completenessScore()
};

// IGDB websites.category 的数值含义（见文件头部说明，目前仍可用但已标记 deprecated）
const WEBSITE_CATEGORY = {
  1: "official", 13: "steam", 14: "reddit", 18: "discord",
  16: "epicgames", 17: "gog", 2: "fanwiki", 3: "fanwiki",
};

const GRADIENTS = [
  ["#5b6cff", "#9b4dff"], ["#1fa87a", "#3dd6a6"], ["#e8624a", "#f6b44c"],
  ["#b0453f", "#d98a3d"], ["#3a6d8c", "#4f9dbf"], ["#7a5cff", "#4f9dbf"],
  ["#8a3d2f", "#c25a3a"], ["#1f8a7a", "#4fbfa0"],
];

const FIELDS = `fields name, slug, first_release_date, hypes, total_rating, total_rating_count, category,
  cover.url, platforms.name, genres.name,
  involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
  websites.url, websites.category;`;

// ---------------------------------------------------------------------------
// Twitch OAuth：换取 access token（有效期约 60 天，这里每次运行都重新换一次，
// 免去持久化 token 的麻烦，反正一天只跑一次，不会触发 Twitch 的频率限制）。
// ---------------------------------------------------------------------------
async function getAccessToken() {
  const url = `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Twitch OAuth 换取 token 失败: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

async function igdb(token, endpoint, apicalypseBody) {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": CLIENT_ID,
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Content-Type": "text/plain",
    },
    body: apicalypseBody,
  });
  if (!res.ok) throw new Error(`IGDB /${endpoint} 请求失败: ${res.status} ${await res.text()}`);
  return res.json();
}

const nowUnix = () => Math.floor(Date.now() / 1000);

async function fetchUpcoming(token) {
  const q = `${FIELDS}
    where first_release_date > ${nowUnix()} & hypes != null & hypes >= ${RULES.upcomingHypeMin} & category = 0;
    sort hypes desc;
    limit ${RULES.upcomingLimit};`;
  return igdb(token, "games", q);
}

async function fetchTrending(token) {
  const since = nowUnix() - RULES.trendingWindowDays * 86400;
  const q = `${FIELDS}
    where first_release_date > ${since} & first_release_date <= ${nowUnix()}
      & total_rating_count != null & total_rating_count >= ${RULES.trendingRatingCountMin} & category = 0;
    sort total_rating_count desc;
    limit ${RULES.trendingLimit};`;
  return igdb(token, "games", q);
}

async function searchGameByName(token, name) {
  const q = `${FIELDS} search "${name.replace(/"/g, "")}"; limit 1;`;
  const rows = await igdb(token, "games", q);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// 归一化：把 IGDB 原始结构转换成 index.html 期望的卡片数据结构
// ---------------------------------------------------------------------------
function pickGradient(seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

function normalize(raw, { trending = false } = {}) {
  const developer =
    raw.involved_companies?.find((c) => c.developer)?.company?.name ||
    raw.involved_companies?.[0]?.company?.name ||
    null; // 找不到就是 null，怎么显示（"—"、"Unknown"、"未知"...）交给展示层的 i18n 决定，数据层不该掺语言判断
  const publisher = raw.involved_companies?.find((c) => c.publisher)?.company?.name || "";

  const links = {};
  for (const w of raw.websites || []) {
    const key = WEBSITE_CATEGORY[w.category];
    if (key && !links[key]) links[key] = w.url; // 每类只留第一个，避免重复
  }

  const cover = raw.cover?.url ? "https:" + raw.cover.url.replace("t_thumb", "t_cover_big") : null;

  const isUpcoming = raw.first_release_date ? raw.first_release_date * 1000 > Date.now() : false;
  const releaseIso = raw.first_release_date
    ? new Date(raw.first_release_date * 1000).toISOString().slice(0, 10)
    : "TBA";

  return {
    slug: raw.slug || `igdb-${raw.id}`,
    // 自动抓取暂时没有可靠的中文名来源，titleZh/titleEn 先保持一致；
    // index.html 会在两者相同时自动隐藏重复的英文副标题行。
    titleZh: raw.name,
    titleEn: raw.name,
    developer,
    publisher,
    platforms: (raw.platforms || []).map((p) => p.name),
    genres: (raw.genres || []).map((g) => g.name),
    release: releaseIso,
    hype: Math.round(raw.hypes ?? raw.total_rating ?? 0),
    status: isUpcoming ? "upcoming" : "live",
    trending,
    coverage: "nav",
    links,
    cover,
    grad: pickGradient(raw.slug || raw.name),
    mono: (raw.name || "?").trim().charAt(0).toUpperCase(),
  };
}

// ---------------------------------------------------------------------------
// 资料完整度打分：封面/平台/类型/外链/开发商，5 项里占了几项。
// 这是当前单页架构下能做的、真正有效的「noindex」替代——分不够就不发布，而不是发布了再标记不收录。
// ---------------------------------------------------------------------------
function completenessScore(g) {
  let score = 0;
  if (g.cover) score++;
  if (g.platforms.length > 0) score++;
  if (g.genres.length > 0) score++;
  if (Object.keys(g.links).length > 0) score++;
  if (g.developer) score++;
  return score;
}

// ---------------------------------------------------------------------------
// owned-wikis 映射：命中就强制切到「我的 Wiki」直链，且不受热度阈值影响
// ---------------------------------------------------------------------------
async function loadOwnedWikis() {
  const p = path.join(process.cwd(), "data", "owned-wikis.json");
  try {
    return JSON.parse(await readFile(p, "utf-8"));
  } catch {
    console.warn("⚠ 未找到或无法解析 data/owned-wikis.json，本次跳过自有 Wiki 映射。");
    return [];
  }
}

function applyOwnedWiki(game, ownedList) {
  const name = game.titleEn.toLowerCase();
  const hit = ownedList.find((o) => o.match.some((m) => name.includes(m.toLowerCase())));
  if (hit) {
    game.coverage = "owned";
    game.wikiUrl = hit.wikiUrl || "#";
    if (hit.titleZh) game.titleZh = hit.titleZh;
    if (hit.featured) game.featured = true;
  }
  return game;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ 缺少 IGDB_CLIENT_ID / IGDB_CLIENT_SECRET 环境变量。请检查 GitHub 仓库的 Secrets 配置（见 SETUP.md）。");
    process.exit(1);
  }

  console.log("→ 正在获取 Twitch access token...");
  const token = await getAccessToken();

  console.log("→ 正在抓取「即将发行」...");
  const upcomingRaw = await fetchUpcoming(token);
  console.log(`  拿到 ${upcomingRaw.length} 条`);

  console.log("→ 正在抓取「近期热门」...");
  const trendingRaw = await fetchTrending(token);
  console.log(`  拿到 ${trendingRaw.length} 条`);

  const ownedWikis = await loadOwnedWikis();

  const bySlug = new Map();
  for (const raw of upcomingRaw) {
    // 即将发行的游戏本身有独立的「够不够热到算 trending」判断——
    // 不能指望它也出现在 trendingRaw 里，因为两条查询按发行日期前/后互斥，同一款游戏不可能两边都命中。
    const isHot = (raw.hypes ?? 0) >= RULES.upcomingTrendingHypeMin;
    const g = applyOwnedWiki(normalize(raw, { trending: isHot }), ownedWikis);
    bySlug.set(g.slug, g);
  }
  for (const raw of trendingRaw) {
    const g = applyOwnedWiki(normalize(raw, { trending: true }), ownedWikis);
    // 正常情况下不会发生 slug 冲突（两条查询的发行日期条件互斥），这里只是防御性合并，
    // 防止 IGDB 数据出现异常重复时把之前已收录的记录覆盖掉。
    if (bySlug.has(g.slug)) bySlug.get(g.slug).trending = true;
    else bySlug.set(g.slug, g);
  }

  // 保底：owned-wikis.json 里配置的游戏，不管有没有挤进上面两个榜单的排名截断，都必须出现。
  console.log("→ 正在核对自有 Wiki 游戏是否已覆盖...");
  for (const owned of ownedWikis) {
    const primaryName = owned.match[0];
    // 直接看 bySlug 里有没有游戏已经被 applyOwnedWiki 打上了这条配置的 titleZh——
    // 而不是自己再重新拿英文名做一次字符串匹配。两套匹配逻辑分开写很容易走偏
    // （比如真实标题里有冒号、破折号这类标点，会导致这里的宽松匹配失败，
    // 从而每天都白白多发一次搜索请求，还会打印一条其实没问题的「未找到」警告）。
    const alreadyIn = [...bySlug.values()].some((g) => g.coverage === "owned" && g.titleZh === owned.titleZh);
    if (alreadyIn) continue;
    try {
      const found = await searchGameByName(token, primaryName);
      if (found) {
        const g = applyOwnedWiki(normalize(found, { trending: false }), ownedWikis);
        bySlug.set(g.slug, g);
        console.log(`  + 补充收录「${g.titleZh}」`);
      } else {
        console.warn(`  ⚠ IGDB 未找到「${primaryName}」，请检查拼写或该游戏是否已被 IGDB 收录。`);
      }
    } catch (e) {
      console.warn(`  ⚠ 查询「${primaryName}」时出错: ${e.message}`);
    }
  }

  const games = [...bySlug.values()];

  // 资料完整度关卡：owned 的游戏永远放行（自家 wiki 兜底内容，不靠 IGDB 那点资料展示）；
  // 其余的必须达到 minCompletenessScore 才公开，没达到的进 drafts，不进公开的 games.json。
  const publicGames = [];
  const draftGames = [];
  for (const g of games) {
    if (g.coverage === "owned" || completenessScore(g) >= RULES.minCompletenessScore) {
      publicGames.push(g);
    } else {
      draftGames.push(g);
    }
  }

  const outDir = path.join(process.cwd(), "data");
  await mkdir(outDir, { recursive: true });

  const publicOutput = { generatedAt: new Date().toISOString(), count: publicGames.length, games: publicGames };
  await writeFile(path.join(outDir, "games.json"), JSON.stringify(publicOutput, null, 2));

  const draftOutput = {
    generatedAt: new Date().toISOString(),
    count: draftGames.length,
    note: "资料完整度不够 minCompletenessScore 的候选游戏，仅供你自己审阅趋势用。index.html 不会读取这个文件，不会公开展示。",
    games: draftGames,
  };
  await writeFile(path.join(outDir, "drafts.json"), JSON.stringify(draftOutput, null, 2));

  console.log(`✅ 已写入 data/games.json（公开），共 ${publicGames.length} 款游戏。`);
  console.log(`📋 已写入 data/drafts.json（仅自己看），共 ${draftGames.length} 款游戏资料不够完整，暂不公开。`);
}

// 只有直接 `node scripts/fetch-games.mjs` 运行时才会自动执行 main()；
// 被其他脚本 import 时（比如本地做单元测试）不会触发真实抓取，方便离线验证下面这些纯函数的逻辑。
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("❌ 抓取失败:", err);
    process.exit(1);
  });
}

export { normalize, completenessScore, applyOwnedWiki, pickGradient, main };
