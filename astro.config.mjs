import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import gamesData from "./data/games.json";

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

export default defineConfig({
  // sitemap、hreflang、JSON-LD 里的绝对链接都靠这个字段拼出来。
  site: "https://gameradar.wiki",

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
        if (/\/(de|ja|es|zh)\/games\//.test(path)) return undefined;
        if (/\/(de|ja|es|zh)\/(genres|platforms)\/$/.test(path)) return undefined;
        const taxonomy = path.match(/^\/(en|de|ja|es|zh)\/(genre|platform)\/([^/]+)\/$/);
        if (taxonomy) {
          const [, locale, type, slug] = taxonomy;
          const count = (type === "genre" ? genreCounts : platformCounts).get(slug) || 0;
          if (locale !== "en" || count < 3) return undefined;
        }
        return item;
      },
    }),
  ],
});
