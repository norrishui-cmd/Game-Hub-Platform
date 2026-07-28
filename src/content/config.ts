import { defineCollection, z } from "astro:content";
import { SITE } from "../../site.config.mjs";

// 每篇 wiki 文章的 frontmatter 字段。写新文章的时候，把这几个字段填对，
// 首页统计、侧边栏分组、分类页、面包屑就会自动生成，不用手动维护任何目录/索引。
const wiki = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(), // 文章标题，显示在页头和 <title> 里
    category: z.enum(SITE.categories.map((c) => c.slug)), // 必须是 site.config.mjs 里 categories 的 slug 之一
    summary: z.string(), // 一两句话摘要，用在分类页列表和搜索结果里
    order: z.number().default(100), // 侧边栏里同一分类下的排序，数字越小越靠前
    updatedAt: z.string(), // "2026-07-28" 格式，显示在文章底部「最近更新」
    infobox: z.record(z.string()).optional(), // 右侧信息卡的 key-value，比如 { "Season": "Summer", "Sell Price": "120g" }
    tags: z.array(z.string()).default([]), // 文章底部的标签，方便交叉关联
  }),
});

export const collections = { wiki };
