// 三语配置的唯一真源。加第四种语言时，理论上只用改这一个文件 + ui.js 里补一份翻译。
export const LOCALES = ["zh", "en", "es"];
export const DEFAULT_LOCALE = "zh";

export const LOCALE_META = {
  zh: { label: "中文", htmlLang: "zh-CN" },
  en: { label: "English", htmlLang: "en" },
  es: { label: "Español", htmlLang: "es" },
};

export function isValidLocale(locale) {
  return LOCALES.includes(locale);
}

// 同一个 path（不带 locale 前缀）在三种语言下各自的 URL，用来生成 hreflang。
// 前提：路由结构里除了 locale 前缀，路径其余部分三种语言完全一致
// （类型/平台专题页的 slug 也是直接拿英文原名 slugify，没有另外做多语言 slug 翻译）。
export function buildAlternates(pathSuffix = "") {
  return Object.fromEntries(LOCALES.map((l) => [l, `/${l}${pathSuffix}`]));
}
