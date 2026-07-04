#!/usr/bin/env node
/**
 * fetch-games.mjs 的离线集成测试。
 * ============================================================================
 * 和 completenessScore/applyOwnedWiki 那种纯函数单元测试不一样——这个测试把 main() 整条链路
 * （认证 → 两条查询 → 合并去重 → owned-wikis 保底搜索 → 完整度关卡分流 → 写文件）都跑一遍，
 * 只是把 fetch 换成本地模拟数据，不连真实 IGDB，也不需要 IGDB_CLIENT_ID / IGDB_CLIENT_SECRET。
 * 不会碰真实的 data/ 目录：整个流程在一个临时目录里跑，跑完自动清理。
 *
 * 用法：node scripts/fetch-games.test.mjs
 * 什么时候该跑一次：改了 fetch-games.mjs 里 main() / normalize() / RULES 的逻辑之后，
 * 想在真的部署、真的连 IGDB 之前先确认整条链路没有明显 bug。
 * ============================================================================
 */

import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

process.env.IGDB_CLIENT_ID = "test-client-id";
process.env.IGDB_CLIENT_SECRET = "test-client-secret";

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// 模拟数据：字段结构照抄真实 IGDB /games 响应（involved_companies/platforms/genres/
// websites/cover 的嵌套形状），尽量贴近真实情况，而不是随手编一个简化版。
// ---------------------------------------------------------------------------
const FIXTURE_UPCOMING = [
  {
    // owned-wikis 命中 + 本来就直接出现在 upcoming 结果里（测试「已经在里面就不用再保底搜索」分支）
    id: 1001, name: "Star Wars: Zero Company", slug: "star-wars-zero-company",
    first_release_date: now + 54 * DAY, hypes: 90, category: 0,
    involved_companies: [{ company: { name: "Bit Reactor" }, developer: true, publisher: false }],
    platforms: [{ name: "PC" }, { name: "PS5" }], genres: [{ name: "Strategy" }],
    websites: [{ url: "https://starwarszerocompany.cc", category: 1 }],
    cover: { url: "//images.igdb.com/igdb/image/upload/t_thumb/sw.jpg" },
  },
  {
    // 资料齐全 + 热度够高，应该进公开列表，且因为 hypes>=20 应该被打上 trending
    id: 1002, name: "Fixture Rich Upcoming Game", slug: "fixture-rich-upcoming-game",
    first_release_date: now + 120 * DAY, hypes: 50, category: 0,
    involved_companies: [
      { company: { name: "Fixture Studio" }, developer: true, publisher: false },
      { company: { name: "Fixture Publisher" }, developer: false, publisher: true },
    ],
    platforms: [{ name: "PC" }], genres: [{ name: "Adventure" }, { name: "Shooter" }],
    websites: [{ url: "https://fixture-rich.example", category: 1 }, { url: "https://reddit.com/r/fixture", category: 14 }],
    cover: { url: "//images.igdb.com/igdb/image/upload/t_thumb/rich.jpg" },
  },
  {
    // 热度够进候选池，但没到 trending 门槛，应该进公开列表但 trending:false
    id: 1003, name: "Fixture Low Hype Game", slug: "fixture-low-hype-game",
    first_release_date: now + 200 * DAY, hypes: 5, category: 0,
    involved_companies: [{ company: { name: "Quiet Studio" }, developer: true, publisher: false }],
    platforms: [{ name: "PC" }], genres: [{ name: "Simulator" }],
    websites: [{ url: "https://quiet.example", category: 1 }],
    cover: { url: "//images.igdb.com/igdb/image/upload/t_thumb/quiet.jpg" },
  },
];

const FIXTURE_TRENDING = [
  {
    // 已发行 + 资料单薄（没封面/平台/类型/外链，开发商也拿不到名字），应该被完整度关卡挡进 drafts
    id: 2001, name: "Fixture Thin Live Game", slug: "fixture-thin-live-game",
    first_release_date: now - 30 * DAY, total_rating_count: 40, category: 0,
    involved_companies: [], platforms: [], genres: [], websites: [], cover: null,
  },
  {
    // 已发行 + 资料齐全，应该进公开列表，trending:true，status:live
    id: 2002, name: "Fixture Popular Live Game", slug: "fixture-popular-live-game",
    first_release_date: now - 10 * DAY, total_rating_count: 80, category: 0,
    involved_companies: [{ company: { name: "Live Studio" }, developer: true, publisher: false }],
    platforms: [{ name: "PS5" }, { name: "Xbox Series" }], genres: [{ name: "Shooter" }],
    websites: [{ url: "https://livegame.example", category: 1 }, { url: "https://store.steampowered.com", category: 13 }],
    cover: { url: "//images.igdb.com/igdb/image/upload/t_thumb/live.jpg" },
  },
];

// owned-wikis 里配置了但没出现在上面两个候选池里的游戏——只能靠 searchGameByName 的保底搜索找到
const FIXTURE_SEARCH_RESULTS = {
  "my other wiki game": [
    {
      id: 3001, name: "My Other Wiki Game", slug: "my-other-wiki-game",
      first_release_date: now + 300 * DAY, hypes: 1, category: 0,
      involved_companies: [], platforms: [], genres: [], websites: [], cover: null,
    },
  ],
};

function jsonResponse(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}

const originalFetch = globalThis.fetch;
let networkCallLog = [];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  networkCallLog.push(u.split("?")[0]);

  if (u.startsWith("https://id.twitch.tv/oauth2/token")) {
    return jsonResponse({ access_token: "fake-token-for-test", expires_in: 5000000, token_type: "bearer" });
  }

  if (u.startsWith("https://api.igdb.com/v4/games")) {
    const body = String(opts.body || "");
    if (body.includes('search "')) {
      const m = body.match(/search "([^"]*)"/);
      const key = (m?.[1] || "").toLowerCase();
      const hit = Object.entries(FIXTURE_SEARCH_RESULTS).find(([k]) => key.includes(k));
      return jsonResponse(hit ? hit[1] : []);
    }
    if (body.includes("sort hypes desc")) return jsonResponse(FIXTURE_UPCOMING);
    if (body.includes("sort total_rating_count desc")) return jsonResponse(FIXTURE_TRENDING);
    return jsonResponse([]);
  }

  throw new Error("测试模式下出现了未预期的网络请求（不应该访问真实网络）: " + u);
};

// ---------------------------------------------------------------------------
// 在临时目录里跑，带一份模拟的 owned-wikis.json，跑完清理，不碰真实仓库的 data/。
// ---------------------------------------------------------------------------
const tmp = await mkdtemp(path.join(tmpdir(), "gameradar-fetch-test-"));
await mkdir(path.join(tmp, "data"), { recursive: true });
await writeFile(
  path.join(tmp, "data", "owned-wikis.json"),
  JSON.stringify([
    { match: ["star wars zero company", "zero company"], titleZh: "星球大战：零号连队", wikiUrl: "https://starwarszerocompany.cc", featured: true },
    { match: ["my other wiki game"], titleZh: "测试保底游戏", wikiUrl: "", featured: false },
  ])
);

const originalCwd = process.cwd();
process.chdir(tmp);

let failed = false;
try {
  const scriptPath = path.join(originalCwd, "scripts", "fetch-games.mjs");
  const { main } = await import(`file://${scriptPath}`);
  await main();

  const games = JSON.parse(await readFile(path.join(tmp, "data", "games.json"), "utf-8"));
  const drafts = JSON.parse(await readFile(path.join(tmp, "data", "drafts.json"), "utf-8"));
  const bySlugPublic = Object.fromEntries(games.games.map((g) => [g.slug, g]));
  const bySlugDraft = Object.fromEntries(drafts.games.map((g) => [g.slug, g]));

  function check(label, cond) {
    if (cond) {
      console.log(`  ✅ ${label}`);
    } else {
      console.log(`  ❌ ${label}`);
      failed = true;
    }
  }

  console.log("\n[owned-wikis：直接命中已在候选池里的情形]");
  check("Star Wars Zero Company 在公开列表里", !!bySlugPublic["star-wars-zero-company"]);
  check("coverage 被强制改成 owned", bySlugPublic["star-wars-zero-company"]?.coverage === "owned");
  check("wikiUrl 正确", bySlugPublic["star-wars-zero-company"]?.wikiUrl === "https://starwarszerocompany.cc");
  check("titleZh 被换成中文名", bySlugPublic["star-wars-zero-company"]?.titleZh === "星球大战：零号连队");
  check("featured 标记被带出来了", bySlugPublic["star-wars-zero-company"]?.featured === true);

  console.log("\n[owned-wikis：候选池里没有，靠保底搜索找到的情形]");
  check("My Other Wiki Game 靠 searchGameByName 被补充收录", !!bySlugPublic["my-other-wiki-game"]);
  check("即使资料单薄也被强制 coverage:owned（不受完整度关卡影响）", bySlugPublic["my-other-wiki-game"]?.coverage === "owned");

  console.log("\n[trending 标签：即将发行的游戏也能靠自己的热度拿到 trending]");
  check("高热度的即将发行游戏 trending:true", bySlugPublic["fixture-rich-upcoming-game"]?.trending === true);
  check("低热度的即将发行游戏 trending:false", bySlugPublic["fixture-low-hype-game"]?.trending === false);
  check("已发行热门游戏 trending:true", bySlugPublic["fixture-popular-live-game"]?.trending === true);
  check("已发行热门游戏 status:live", bySlugPublic["fixture-popular-live-game"]?.status === "live");

  console.log("\n[完整度关卡：资料单薄的非 owned 游戏应该被拦进 drafts，不出现在公开列表]");
  check("资料单薄的游戏没有出现在公开列表里", !bySlugPublic["fixture-thin-live-game"]);
  check("资料单薄的游戏出现在 drafts 里", !!bySlugDraft["fixture-thin-live-game"]);

  console.log("\n[基本健全性]");
  check("公开列表数量符合预期（5 款：3 upcoming + 1 live + 1 保底owned）", games.games.length === 5);
  check("drafts 数量符合预期（1 款）", drafts.games.length === 1);
  check("整个过程只调用了预期内的两个域名", networkCallLog.every((u) => u.startsWith("https://id.twitch.tv") || u.startsWith("https://api.igdb.com")));

  if (failed) {
    console.log("\n❌ 有断言没通过，看上面标红的行。");
    process.exitCode = 1;
  } else {
    console.log("\n✅ 全部通过：main() 整条链路（认证→查询→合并→保底搜索→完整度分流→写文件）逻辑正确。");
  }
} catch (err) {
  console.error("\n❌ 测试运行本身出错（不是断言失败，是代码跑不通）:", err);
  process.exitCode = 1;
} finally {
  process.chdir(originalCwd);
  globalThis.fetch = originalFetch;
  await rm(tmp, { recursive: true, force: true });
}
