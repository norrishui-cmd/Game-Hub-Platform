#!/usr/bin/env node
/**
 * Wiki 空间脚手架脚本
 * ============================================================================
 * 给 data/games.json 里的每一款游戏，在 data/wiki/<slug>.json 建一个空的"wiki 空间"——
 * 5 种语言各留好 summary / faq / guideSections / sources 四个位置，字段名跟
 * GameDetail.astro、buildFaqItems() 已经在读的字段完全对上，开箱即用。
 *
 * 只新增，绝不覆盖：已经存在的 data/wiki/<slug>.json 一律跳过，不会动你已经写好的内容。
 * 可以随时重复运行——新游戏进了选题库之后，跑一次这个脚本，新游戏会自动补上空的 wiki 文件，
 * 旧游戏已经写的内容原封不动。
 *
 * 用法：
 *   node scripts/scaffold-wiki.mjs           # 给所有还没有 wiki 文件的游戏建空模板
 *   node scripts/scaffold-wiki.mjs some-slug some-other-slug   # 只给指定的 slug 建
 *
 * 建好之后怎么填，详见 SETUP.md「wiki 空间怎么填」一节，以及本仓库里
 * data/wiki/star-wars-zero-company.json 这个已经写了真实内容的示范文件。
 * ============================================================================
 */

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { LOCALES } from "../src/i18n/locales.js";

const WIKI_DIR = path.join(process.cwd(), "data", "wiki");

function emptyLocaleContent() {
  return { summary: "", faq: [], guideSections: [], sources: [] };
}

function emptyScaffold() {
  const content = {};
  for (const locale of LOCALES) content[locale] = emptyLocaleContent();
  // 注意：这里故意不写 publishStatus 字段。isGameIndexable() 只在 publishStatus === "draft"
  // 时才会强制拦掉这个语言页面；不写这个字段 == 之前根本没有 wiki 文件时的行为，索引情况完全不变。
  // 现在有 20 款游戏的英文页是靠 dataScore（封面/平台/类型/链接/开发商凑够 3 项）拿到的英文事实页
  // 豁免在收录，如果这里默认写 "draft"，会把这 20 款已经在收录的英文页也一起打回不可索引——
  // 千万不要在这个脚手架里加 publishStatus:"draft" 默认值。真的还没写完、不想被搜索引擎看到的
  // 页面，自己手动加这个字段就行（见 SETUP.md）。
  return { content };
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadGames() {
  const p = path.join(process.cwd(), "data", "games.json");
  const parsed = JSON.parse(await readFile(p, "utf-8"));
  return parsed.games || [];
}

async function main() {
  const onlySlugs = process.argv.slice(2);
  await mkdir(WIKI_DIR, { recursive: true });

  const games = await loadGames();
  const targets = onlySlugs.length ? games.filter((g) => onlySlugs.includes(g.slug)) : games;

  if (onlySlugs.length) {
    const found = new Set(targets.map((g) => g.slug));
    for (const s of onlySlugs) {
      if (!found.has(s)) console.warn(`  ⚠ games.json 里没有找到 slug「${s}」，跳过`);
    }
  }

  let created = 0;
  let skipped = 0;
  for (const g of targets) {
    const filePath = path.join(WIKI_DIR, `${g.slug}.json`);
    if (await fileExists(filePath)) {
      skipped++;
      continue;
    }
    await writeFile(filePath, JSON.stringify(emptyScaffold(), null, 2));
    created++;
    console.log(`  + 已建立 data/wiki/${g.slug}.json（${g.titleEn}）`);
  }

  console.log(`\n✅ 完成：新建 ${created} 个，跳过已存在的 ${skipped} 个（不会覆盖已写内容）。`);
}

main().catch((err) => {
  console.error("❌ 脚手架生成失败:", err);
  process.exit(1);
});
