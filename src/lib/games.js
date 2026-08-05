// 全站共用的游戏数据小工具。
// 核心目的 1：coverage==="owned" 但还没填 wikiUrl 的游戏（比如占位中的动物园之星 2）
// 不应该变成死链接，而是也应该有一个真实的 /{locale}/games/{slug}/ 页面兜底——
// 这条判断只写这一处，GameCard 和 [slug].astro 的 getStaticPaths 都从这里引用，避免两边逻辑走偏。
// 核心目的 2：所有语言相关的判断都集中在这个文件 + i18n/ 目录，数据层（fetch-games.mjs）
// 不应该再出现任何硬编码的中文——语言是展示层的事，不是数据层的事。

import { t } from "../i18n/ui.js";
import { translateGenre, translateGenres } from "../i18n/genres.js";
import { DEFAULT_LOCALE } from "../i18n/locales.js";

// 搜索结果里标题超过一定长度会被截断成省略号，游戏名本来就长的话（尤其加了副标题/数字后缀），
// 拼上品牌后缀很容易把关键的游戏名挤到截断线以外。这里做法很简单：拼上品牌后缀还在预算内就拼，
// 超预算就宁可不带品牌后缀，保住游戏名和描述短语完整可读——品牌曝光跟标题可读性冲突的时候，
// 优先保标题可读性，反正每个页面本来就有 og:site_name 兜底站点身份。
export function pageTitle(base, brand = "GameRadar", maxLen = 60) {
  const withBrand = `${base} | ${brand}`;
  return withBrand.length <= maxLen ? withBrand : base;
}

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

function validSources(content) {
  return (content?.sources || []).filter((source) =>
    source?.label?.trim() && /^https:\/\//.test(source?.url || "")
  );
}

function validGuideSections(content) {
  return (content?.guideSections || []).filter((section) =>
    section?.title?.trim().length >= 4 && section?.description?.trim().length >= 80
  );
}

export function contentScore(game, locale = DEFAULT_LOCALE) {
  const content = game.content?.[locale];
  let score = 0;
  if (content?.summary?.trim().length >= 120) score += 3;
  score += Math.min(2, validGuideSections(content).length);
  score += Math.min(2, validSources(content).length);
  return score;
}

export function isGameIndexable(game, locale = DEFAULT_LOCALE) {
  const content = game.content?.[locale];
  return game.publishStatus === "published"
    && contentScore(game, locale) >= 7
    && Boolean(game.titleEn || game.titleZh)
    && validSources(content).length >= 2
    && validGuideSections(content).length >= 2;
}

export function isGameFaqIndexable(game, locale = DEFAULT_LOCALE) {
  if (!isGameIndexable(game, locale)) return false;
  const faqs = game.content?.[locale]?.faq || [];
  return faqs.length >= 3 && faqs.every((faq) =>
    faq?.question?.trim().length >= 12 && faq?.answer?.trim().length >= 80
  );
}

export function isGameReleaseIndexable(game, locale = DEFAULT_LOCALE) {
  if (!isGameIndexable(game, locale) || !hasRealDate(game)) return false;
  const details = game.content?.[locale]?.releaseDetails;
  const summary = typeof details === "string" ? details : details?.summary;
  return Boolean(summary?.trim().length >= 120);
}

export function isGameNewsIndexable(game, locale = DEFAULT_LOCALE, newsItems = []) {
  // A list of outbound headlines is useful for monitoring, but it is not an
  // original editorial destination. Only expose a game-news URL to search when
  // at least two items carry a substantial, source-backed summary *and* an
  // explicit explanation of what the update changes for players.
  const editorialItems = Array.isArray(newsItems)
    ? newsItems.filter((item) =>
        item?.editorialSummary?.trim().length >= 80
        && item?.playerImpact?.trim().length >= 80
      )
    : [];
  return locale === DEFAULT_LOCALE
    && isGameIndexable(game, locale)
    && editorialItems.length >= 2;
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
  if (effectiveStatus(game) === "live") return t(locale, "relLive");
  const d = daysUntil(game.release);
  if (d === null) return t(locale, "relTBA");
  if (d < 0) return t(locale, "relReleased");
  if (d === 0) return t(locale, "relToday");
  return t(locale, "relDaysUntil", d);
}

export function effectiveStatus(game, now = Date.now()) {
  if (game?.release && game.release !== "TBA") {
    const releaseAt = new Date(`${game.release}T00:00:00Z`).getTime();
    if (Number.isFinite(releaseAt) && releaseAt <= now) return "live";
  }
  return game?.status === "live" ? "live" : "upcoming";
}

export function listSeparator(locale = DEFAULT_LOCALE) {
  if (locale === "zh") return "、";
  if (locale === "ja") return "・";
  return ", ";
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

// ---------------------------------------------------------------------------
// 发行日历：把游戏按年/月/待定分桶，生成 /releases/ 下面的日历落地页。
// 门槛的意义：一个月只有 1 款游戏的页面就是薄内容，与其生成出来拉低整站质量，
// 不如干脆不生成——随着选题库变大，够格的月份自然会出现，不需要手动维护名单。
// ---------------------------------------------------------------------------
export const RELEASE_YEAR_MIN = 10; // 年度页至少要有这么多款游戏才生成
export const RELEASE_MONTH_MIN = 4; // 月度页至少要有这么多款游戏才生成
export const RELEASE_TBA_MIN = 5; // 待定页至少要有这么多款游戏才生成

export function hasRealDate(game) {
  return Boolean(game.release && game.release !== "TBA");
}

// 按发行日期升序；同一天的按热度降序，让当天最受关注的排前面
function byDateThenHype(a, b) {
  if (a.release !== b.release) return a.release < b.release ? -1 : 1;
  return (b.hype ?? 0) - (a.hype ?? 0);
}

export function collectReleaseYears(games) {
  const map = new Map();
  for (const g of games) {
    if (!hasRealDate(g)) continue;
    const year = g.release.slice(0, 4);
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(g);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length >= RELEASE_YEAR_MIN)
    .map(([year, list]) => ({ year, games: list.sort(byDateThenHype) }))
    .sort((a, b) => (a.year < b.year ? -1 : 1));
}

export function collectReleaseMonths(games) {
  const map = new Map();
  for (const g of games) {
    if (!hasRealDate(g)) continue;
    const month = g.release.slice(0, 7); // "2026-08"
    if (!map.has(month)) map.set(month, []);
    map.get(month).push(g);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length >= RELEASE_MONTH_MIN)
    .map(([month, list]) => ({ month, games: list.sort(byDateThenHype) }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

export function collectTbaGames(games) {
  return games.filter((g) => !hasRealDate(g)).sort((a, b) => (b.hype ?? 0) - (a.hype ?? 0));
}

// 年度页里再按月分组展示，比一长串平铺列表好读，也跟竞品的日历结构一致
export function groupByMonth(games) {
  const map = new Map();
  for (const g of games) {
    if (!hasRealDate(g)) continue;
    const month = g.release.slice(0, 7);
    if (!map.has(month)) map.set(month, []);
    map.get(month).push(g);
  }
  return [...map.entries()]
    .map(([month, list]) => ({ month, games: list.sort(byDateThenHype) }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
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
