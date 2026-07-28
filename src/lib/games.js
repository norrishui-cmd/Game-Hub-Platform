// 全站共用的游戏数据小工具。
// 核心目的 1：coverage==="owned" 但还没填 wikiUrl 的游戏（比如占位中的动物园之星 2）
// 不应该变成死链接，而是也应该有一个真实的 /{locale}/games/{slug}/ 页面兜底——
// 这条判断只写这一处，GameCard 和 [slug].astro 的 getStaticPaths 都从这里引用，避免两边逻辑走偏。
// 核心目的 2：所有语言相关的判断都集中在这个文件 + i18n/ 目录，数据层（fetch-games.mjs）
// 不应该再出现任何硬编码的中文——语言是展示层的事，不是数据层的事。

import { t } from "../i18n/ui.js";
import { translateGenre, translateGenres } from "../i18n/genres.js";
import { DEFAULT_LOCALE } from "../i18n/locales.js";

export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-") // 字母数字（含中文）以外的字符（斜杠、括号、撇号…）统统换成连字符
    .replace(/^-+|-+$/g, "");         // 去掉首尾多余的连字符
}

export function hasOwnPage(game) {
  // Every game keeps a local hub. Owned wikis are promoted from that hub instead
  // of replacing it, so this domain can build topical authority and useful paths.
  return Boolean(game?.slug);
}

export function localePath(locale, path = "") {
  return `/${locale}${path}`;
}

export function cardHref(game, locale) {
  return `/${locale}/games/${game.slug}/`;
}

export function isExternalLink(game) {
  return false;
}

export function dataScore(game) {
  return [game.cover, game.platforms?.length, game.genres?.length,
    Object.keys(game.links || {}).length, game.developer].filter(Boolean).length;
}

export function contentScore(game, locale = DEFAULT_LOCALE) {
  const content = game.content?.[locale];
  let score = 0;
  if (content?.summary?.trim()) score += 2;
  if (content?.faq?.length) score += Math.min(2, content.faq.length);
  if (content?.guideSections?.length) score += 2;
  if (content?.sources?.length) score += 1;
  // English fact hubs are the reviewed fallback in phase one. Translated pages
  // require explicit localized content before they can be indexed.
  if (locale === DEFAULT_LOCALE && dataScore(game) >= 3) score += 3;
  return score;
}

export function isGameIndexable(game, locale = DEFAULT_LOCALE) {
  return game.publishStatus !== "draft" && contentScore(game, locale) >= 3;
}

// 中文有自己的中文名（titleZh，主要给 owned-wikis 手动配置用）；
// 英文/西语统一显示国际通用的英文名——不瞎编西语译名。
export function displayTitle(game, locale) {
  if (locale === "zh" && game.titleZh) return game.titleZh;
  return game.titleEn || game.titleZh;
}

export function searchBlob(game, locale) {
  const title = displayTitle(game, locale);
  const genres = translateGenres(game.genres, locale);
  return [title, game.titleEn, game.developer, ...genres]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const LOCALE_DATE_TAG = { zh: "zh-CN", en: "en-US", es: "es-ES", de: "de-DE", ja: "ja-JP" };

export function fmtDate(iso, locale = DEFAULT_LOCALE) {
  if (!iso || iso === "TBA") return t(locale, "relTBA");
  return new Date(iso + "T00:00:00").toLocaleDateString(LOCALE_DATE_TAG[locale] || "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function daysUntil(iso) {
  if (!iso || iso === "TBA") return null;
  return Math.ceil((new Date(iso + "T00:00:00").getTime() - Date.now()) / 86400000);
}

export function fmtMonth(monthIso, locale = DEFAULT_LOCALE) {
  if (!monthIso) return "";
  return new Date(monthIso + "-01T00:00:00").toLocaleDateString(LOCALE_DATE_TAG[locale] || "en-US", {
    year: "numeric",
    month: "long",
  });
}

export function relText(game, locale = DEFAULT_LOCALE) {
  if (game.status === "live") return t(locale, "relLive");
  const d = daysUntil(game.release);
  if (d === null) return t(locale, "relTBA");
  if (d < 0) return t(locale, "relReleased");
  if (d === 0) return t(locale, "relToday");
  return t(locale, "relDaysUntil", d);
}

// 图标是语言无关的，文案通过 t() 按 key 拼出来（linkOfficial/linkOfficialSub 之类，见 i18n/ui.js）
export const LINK_ICON = {
  official: "🌐", steam: "🎮", reddit: "👥", discord: "💬",
  fanwiki: "📖", epicgames: "🛒", gog: "🛒",
};
const LINK_KEYS = Object.keys(LINK_ICON);

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function availableLinks(game, locale = DEFAULT_LOCALE) {
  return LINK_KEYS.filter((key) => game.links && game.links[key]).map((key) => ({
    key,
    icon: LINK_ICON[key],
    name: t(locale, "link" + capitalize(key)),
    sub: t(locale, "link" + capitalize(key) + "Sub"),
    url: game.links[key],
  }));
}

// FAQ 生成逻辑集中在这一处：GameDetail.astro（单个游戏页）和 faq.astro（全站 FAQ 汇总页）
// 都调用这个函数，保证同一款游戏在两个地方看到的 FAQ 完全一致，不会出现两套口径。
export function buildFaqItems(game, locale = DEFAULT_LOCALE) {
  const title = displayTitle(game, locale);
  const editorial = game.content?.[locale];
  if (editorial?.faq?.length) return editorial.faq;

  const releaseAnswer = game.release === "TBA" ? t(locale, "relTBA") : fmtDate(game.release, locale);
  const platformAnswer = game.platforms?.length ? game.platforms.join(", ") : "—";
  const items = [
    { question: t(locale, "faqReleaseQ", title), answer: releaseAnswer },
    { question: t(locale, "faqPlatformQ", title), answer: platformAnswer },
  ];
  if (game.developer) items.push({ question: t(locale, "faqDeveloperQ", title), answer: game.developer });
  return items;
}

// 全站认可的平台标签集合，跟 platforms.astro 分类页用的是同一份口径。
// 用来生成"是否登陆XX平台"这类长尾问答——不管这款游戏实际有没有登陆某个平台，
// 只要回答准确（有 → 平台+发行状态；没有 → 明确说目前没有），就是真实有用的内容，
// 不是编出来的。
export const CANONICAL_PLATFORMS = ["PC", "PS5", "Xbox Series", "Xbox", "Switch", "Switch 2", "Mobile", "Console"];

export function buildPlatformQA(game, locale = DEFAULT_LOCALE) {
  const title = displayTitle(game, locale);
  const has = new Set(game.platforms || []);
  return CANONICAL_PLATFORMS.map((p) => ({
    question: t(locale, "isOnPlatformQ", title, p),
    answer: has.has(p) ? t(locale, "yesOnPlatform", p) : t(locale, "noOnPlatform", p),
  }));
}

function anticipationLevel(hype) {
  if (hype >= 80) return "high";
  if (hype >= 60) return "strong";
  if (hype >= 40) return "moderate";
  return "early";
}

// 长尾 FAQ 汇总页专用：在主页那 3-4 条基础问答之上，加上类型问答、逐平台问答、
// 关注度问答，覆盖更多具体的搜索词（"XX值得关注吗" "XX上Switch吗" 这类）。
// 跟主详情页的 buildFaqItems() 是两套不同深度的内容，不是同一份东西拆两页。
export function buildExtendedFaqItems(game, locale = DEFAULT_LOCALE) {
  const title = displayTitle(game, locale);
  const base = buildFaqItems(game, locale);
  const items = [...base];

  if (game.genres?.length) {
    items.push({ question: t(locale, "faqGenreQ", title), answer: translateGenres(game.genres, locale).join(locale === "zh" ? "、" : locale === "ja" ? "・" : ", ") });
  }
  if (typeof game.hype === "number") {
    items.push({ question: t(locale, "faqAnticipationQ", title), answer: t(locale, `anticipation_${anticipationLevel(game.hype)}`) });
  }
  items.push(...buildPlatformQA(game, locale));
  return items;
}

export function collectTaxonomy(games, field) {
  const map = new Map(); // slug -> { label, count }（label 始终是英文原名，展示时再翻译）
  for (const g of games) {
    for (const label of g[field] || []) {
      const slug = slugify(label);
      if (!map.has(slug)) map.set(slug, { label, slug, count: 0 });
      map.get(slug).count++;
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function buildBreadcrumbJsonLd(items) {
  // items: [{ name, url }, ...]，第一项一般是首页
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildJsonLd(game, pageUrl, locale = DEFAULT_LOCALE) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: displayTitle(game, locale),
    url: pageUrl,
    inLanguage: locale,
  };
  if (game.genres?.length) jsonLd.genre = translateGenres(game.genres, locale);
  if (game.platforms?.length) jsonLd.gamePlatform = game.platforms;
  if (game.developer) jsonLd.author = { "@type": "Organization", name: game.developer };
  if (game.publisher) jsonLd.publisher = { "@type": "Organization", name: game.publisher };
  if (game.release && game.release !== "TBA") jsonLd.datePublished = game.release;
  if (game.cover) jsonLd.image = game.cover;
  return jsonLd;
}

export { translateGenre, translateGenres };
