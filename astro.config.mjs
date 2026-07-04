import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  // TODO(Norris): 换成正式域名后记得改这里——sitemap、hreflang、JSON-LD 里的绝对链接都靠这个字段拼出来。
  site: "https://your-gameradar-domain.example",

  // 三语路由：全部带前缀（/zh/ /en/ /es/），没有不带前缀的默认语言。
  // 根路径 "/" 的跳转交给 vercel.json 的 redirect 规则处理，不靠 Astro 自己的 i18n 重定向中间件——
  // 站点全是自定义的动态路由（[slug]/[genre]/[platform]），locale 本身也是当成普通路由参数手动处理的，
  // 这里声明 i18n 配置主要是为了在页面里能用 astro:i18n 之类的辅助方法，以及下面 sitemap 的 i18n 选项。
  i18n: {
    defaultLocale: "zh",
    locales: ["zh", "en", "es"],
    routing: { prefixDefaultLocale: true },
  },

  integrations: [
    sitemap({
      i18n: {
        defaultLocale: "zh",
        locales: { zh: "zh-CN", en: "en-US", es: "es-ES" },
      },
      // 草稿页是 noindex 的，不应该出现在 sitemap 里——sitemap 应该只列你想被收录的页面。
      // 注意：不要额外去 robots.txt 里 disallow 这些草稿页，
      // 那样 Googlebot 反而看不到页面上的 noindex 标签，效果适得其反。
      serialize(item) {
        return item.url.includes("/games/draft/") ? undefined : item;
      },
    }),
  ],
});
