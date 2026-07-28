import { getCollection } from "astro:content";
import { SITE } from "../../site.config.mjs";

// 所有文章，按分类里配置的 order 排序（同分类内按 order，跨分类顺序无所谓，
// 侧边栏/分类页会自己按分类分组）
export async function getAllArticles() {
  const entries = await getCollection("wiki");
  return entries.sort((a, b) => (a.data.order ?? 100) - (b.data.order ?? 100));
}

// 按 site.config.mjs 里 categories 的顺序，把文章分组，方便侧边栏 / 首页统计使用
export async function getArticlesByCategory() {
  const all = await getAllArticles();
  return SITE.categories.map((cat) => ({
    ...cat,
    articles: all.filter((a) => a.data.category === cat.slug),
  }));
}

export function articleHref(entry) {
  // 文章的 URL 只用文件名（不带分类目录前缀），这样在别的文章里手写内链的时候
  // 不用记住这篇文章归在哪个分类目录下，以后要把某篇文章挪到别的分类，链接也不会跟着断。
  return `/wiki/${entry.slug.split("/").pop()}/`;
}

export function categoryHref(slug) {
  return `/category/${slug}/`;
}
