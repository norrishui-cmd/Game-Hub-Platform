import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { readFileSync, readdirSync, statSync } from "node:fs";
import gamesData from "./data/games.json";
import newsData from "./data/news.json";
import trendingData from "./data/monthly-trending.json";
import { SITE } from "./src/config/site.js";
import {
  isGameIndexable,
  isGameFaqIndexable,
  isGameReleaseIndexable,
  isGameNewsIndexable,
} from "./src/lib/games.js";

const taxonomyCounts = (field) => {
  const counts = new Map();
  for (const game of gamesData.games) for (const value of game[field] || []) {
    const slug = String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  return counts;
};
const genreCounts = taxonomyCounts("genres");
const platformCounts = taxonomyCounts("platforms");

// 跟 [slug].astro / faq.astro / release-date.astro 的 getStaticPaths 用的是同一份逻辑：
// 把 data/wiki/<slug>.json 的 content/publishStatus 合并进游戏对象，再判断收录资格。
// 之前这里对非英文 /games/ 页面是"不管三七二十一整个排除"，现在选题库批量生成了
// 5 种语言的基础内容之后，这条一刀切规则已经过时——改成跟页面上 <meta name="robots">
// 实际展示的收录状态完全一致，sitemap 才不会自相矛盾（列出的都是真的可收录的页面）。
const wikiBySlug = new Map();
const wikiMtimeBySlug = new Map();
try {
  for (const file of readdirSync("./data/wiki")) {
    if (!file.endsWith(".json")) continue;
    const slug = file.replace(/\.json$/, "");
    const path = `./data/wiki/${file}`;
    wikiBySlug.set(slug, JSON.parse(readFileSync(path, "utf-8")));
    wikiMtimeBySlug.set(slug, statSync(path).mtime);
  }
} catch {
  // data/wiki 目录不存在也不报错，这种情况下所有游戏都当作没有 wiki 内容处理
}
const gamesBySlug = new Map(gamesData.games.map((g) => [g.slug, g]));
const newsItemsBySlug = new Map();
for (const item of newsData.items || []) {
  if (!item.relatedSlug) continue;
  if (!newsItemsBySlug.has(item.relatedSlug)) newsItemsBySlug.set(item.relatedSlug, []);
  newsItemsBySlug.get(item.relatedSlug).push(item);
}

// sitemap 里一直没有 lastmod，Google 没法据此判断哪些页面是新鲜的、该优先重新抓取。
// 游戏详情/FAQ/发行日期三个长尾页优先用对应 data/wiki/<slug>.json 文件的实际修改时间——
// 这才是这款游戏内容真正最后一次变动的时间；没有 wiki 文件的游戏（纯选题库基础版）
// 就退回用 games.json 整体的 generatedAt，因为它们的问答内容就是从这份数据当场生成的。
function lastmodForSlug(slug) {
  return wikiMtimeBySlug.get(slug) || new Date(gamesData.generatedAt);
}

function isGamePathIndexable(locale, slug, pageType) {
  const base = gamesBySlug.get(slug);
  if (!base) return false;
  const wiki = wikiBySlug.get(slug) || {};
  const game = { ...base, publishStatus: wiki.publishStatus, content: wiki.content };
  if (pageType === "faq") return isGameFaqIndexable(game, locale);
  if (pageType === "release-date") return isGameReleaseIndexable(game, locale);
  if (pageType === "news") return isGameNewsIndexable(game, locale, newsItemsBySlug.get(slug) || []);
  return isGameIndexable(game, locale);
}

export default defineConfig({
  // sitemap、hreflang、JSON-LD 里的绝对链接都靠这个字段拼出来。
  site: SITE.url,

  // 三语路由：全部带前缀（/en/ /es/ /zh/），没有不带前缀的默认语言。
  // redirectToDefaultLocale:false 很关键——不加这个，Astro 会用它自己生成的跳转页
  // 整个覆盖掉 src/pages/index.astro 的内容（亲测踩过这个坑）。加了之后，
  // 根路径 "/" 真正跑的是 src/pages/index.astro 里手写的"探测浏览器语言，
  // 英文优先、其次西语、中文兜底"的逻辑，而不是 Astro 自带的无脑跳默认语言。
  i18n: {
    defaultLocale: "en",
    locales: ["en", "de", "ja", "es", "zh"],
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },

  integrations: [
    sitemap({
      // hreflang is emitted page-by-page only for quality-approved locales.
      // Do not let the sitemap integration add alternates to noindex translations.
      // 草稿页是 noindex 的，不应该出现在 sitemap 里——sitemap 应该只列你想被收录的页面。
      // 注意：不要额外去 robots.txt 里 disallow 这些草稿页，
      // 那样 Googlebot 反而看不到页面上的 noindex 标签，效果适得其反。
      serialize(item) {
        const path = new URL(item.url).pathname;
        if (path.includes("/games/draft/")) return undefined;
        if (/^\/(en|de|ja|es|zh)\/watchlist\/$/.test(path)) return undefined;
        // 裸域名 "/" 本身是 noindex 的语言探测跳转页（详见 src/pages/index.astro 里的说明），
        // 不该出现在 sitemap 里——sitemap 应该只列真正想被收录的网址，不然自相矛盾。
        if (path === "/") return undefined;

        // The global FAQ remains a discovery aid, but its generated answers are
        // not an independent search destination. Localized news/chart pages are
        // also noindex until their translated editorial content is reviewed.
        if (/^\/(en|de|ja|es|zh)\/(faq|news)\/$/.test(path)) return undefined;
        if (/^\/(de|ja|es|zh)\/monthly-chart\/$/.test(path)) return undefined;

        // 游戏主页、FAQ 长尾页、发行日期长尾页，三种路径都走同一套收录判定。
        const gameMatch = path.match(/^\/(en|de|ja|es|zh)\/games\/([^/]+)\/(?:(faq|release-date|news)\/)?$/);
        if (gameMatch) {
          const [, locale, slug, pageType] = gameMatch;
          if (!isGamePathIndexable(locale, slug, pageType)) return undefined;
          item.lastmod = lastmodForSlug(slug);
          return item;
        }

        if (/\/(de|ja|es|zh)\/(genres|platforms)\/$/.test(path)) return undefined;
        const taxonomy = path.match(/^\/(en|de|ja|es|zh)\/(genre|platform)\/([^/]+)\/$/);
        if (taxonomy) {
          const [, locale, type, slug] = taxonomy;
          const count = (type === "genre" ? genreCounts : platformCounts).get(slug) || 0;
          if (locale !== "en" || count < 3) return undefined;
          item.lastmod = new Date(gamesData.generatedAt);
          return item;
        }
        if (/^\/en\/(genres|platforms)\/$/.test(path)) {
          item.lastmod = new Date(gamesData.generatedAt);
          return item;
        }
        // 发行日历页（/releases/、/releases/2026/、/releases/2026-08/、/releases/tba/）
        // 内容完全由 games.json 派生，用它的生成时间当 lastmod 最准确。
        if (/^\/(en|de|ja|es|zh)\/(games|releases)\/([^/]+\/)?$/.test(path)) {
          item.lastmod = new Date(gamesData.generatedAt);
          return item;
        }
        if (/^\/(en|de|ja|es|zh)\/(compare|discover)\/$/.test(path)) {
          item.lastmod = new Date(gamesData.generatedAt);
          return item;
        }

        // 首页、月度榜单、最新资讯——这三类内容更新频率最高，各自对应数据文件自己的
        // generatedAt/updatedAt 字段就是最准确的 lastmod，比整站用同一个时间戳更真实。
        if (/^\/(en|de|ja|es|zh)\/$/.test(path)) {
          item.lastmod = new Date(gamesData.generatedAt);
        } else if (/^\/(en|de|ja|es|zh)\/monthly-chart\/$/.test(path)) {
          item.lastmod = new Date(trendingData.updatedAt);
        } else if (/^\/(en|de|ja|es|zh)\/news\/$/.test(path)) {
          item.lastmod = new Date(newsData.generatedAt);
        } else if (/^\/(en|de|ja|es|zh)\/faq\/$/.test(path)) {
          item.lastmod = new Date(gamesData.generatedAt);
        }
        return item;
      },
    }),
  ],
});
