import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE } from "./site.config.mjs";

// 每个新游戏的 wiki 只需要改 site.config.mjs 里的 SITE.url，这里不用动。
export default defineConfig({
  site: SITE.url,
  integrations: [sitemap()],
});
