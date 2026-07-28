# Wiki Site Template · 使用说明

这是一套**独立深度 wiki 站模板**，跟你的 GameRadar 聚合站（game-hub-platform）是两个不同的东西：

- **GameRadar**（gameradar.wiki）：一款游戏一个页面，做的是"发现层"——简介、发行日期、
  跳转链接，目标是把搜索流量导出去。
- **这套模板**：一款游戏一整个独立网站，多页面、有分类、有搜索，目标是**接住**那些搜索流量，
  跟 moonlightpeakswiki.com、starwarszerocompany.cc 一样，是真正沉淀内容、慢慢喂大的深度 wiki。

每个重点游戏都应该有自己独立的一份（独立域名、独立仓库、独立 Vercel 项目），复制这个模板起步，
然后各自独立地持续加内容——互不影响，这款游戏加了新任务不会动到那款游戏的文章。

---

## 一、给新游戏建一个新 wiki，怎么操作（GitHub Desktop 全程可做）

1. 把这个模板文件夹整个复制一份，改个新文件夹名（比如 `witchbrook-wiki`）。
2. 在 GitHub Desktop 里新建一个仓库，把复制出来的文件夹拖进去，Publish 到 GitHub。
3. 打开根目录的 **`site.config.mjs`**，这是唯一必须改的文件，改完这一个文件，网站的名字、
   配色、外部链接、首页分类卡片就全变了。见下面「二、site.config.mjs 逐项说明」。
4. 把 `public/images/logo.svg` 和 `public/images/banner.jpg` 换成这款游戏的真实素材
   （文件名保持一致，或者改了文件名要同步改 `site.config.mjs` 里的 `logo` / `banner` 路径）。
5. 把 `src/content/wiki/` 下面几个示范分类目录里的示范文章删掉，换成这款游戏自己的文章
   （怎么写见下面「三、怎么加一篇新文章」）。
6. GitHub Desktop 里 commit + push。
7. 去 Vercel 新建一个项目，指向这个新仓库，Build Command 保持默认（`npm run build`），
   绑定这款游戏的独立域名。完成。

以后要continuously优化：直接在 `src/content/wiki/` 里加新的 `.md` 文件、或者编辑已有的，
GitHub Desktop commit + push，Vercel 自动重新构建，几分钟就上线，不需要碰任何代码。

---

## 二、`site.config.mjs` 逐项说明

```js
export const SITE = {
  name: "完整的网站标题，用在 <title> 标签",
  shortName: "简短名字，用在页头 logo 旁边、面包屑",
  tagline: "暂时没在页面上用到，留着给以后扩展",
  url: "https://这款游戏的wiki域名.com",  // 一定要改，sitemap/canonical/robots.txt 都靠这个
  description: "首页的默认 meta description，一两句话概括这个 wiki",

  accent: "#8B7FD1",  // 整站唯一的可调强调色，换成符合这款游戏气质的颜色就行

  logo: "/images/logo.svg",
  banner: "/images/banner.jpg",
  bannerAlt: "banner 图的 alt 文字",

  externalLinks: [
    { label: "Official website", url: "..." },
    // 想加几个加几个，想删的直接删掉那一项
  ],

  categories: [
    { slug: "gameplay", label: "Gameplay", icon: "🗺️", description: "..." },
    // slug 必须跟 src/content/wiki/ 下面的目录名对应
    // 顺序就是首页卡片网格、侧边栏的显示顺序
  ],
};
```

**关于配色**：整套模板故意只留了一个 `accent` 变量可调——背景、边框、文字灰阶这些在
`src/styles/tokens.css` 里是固定值，这样你名下所有用这套模板做的 wiki，视觉骨架永远一致
（用户一看就知道是同一个人在维护的一套高质量 wiki 网络），只有强调色随游戏气质变化。
如果哪天想更深入定制字体/圆角这些，去 `tokens.css` 改，但一般不需要。

---

## 三、怎么加一篇新文章

在 `src/content/wiki/<分类>/` 下面新建一个 `.md` 文件，比如
`src/content/wiki/gameplay/boss-guide.md`：

```md
---
title: "Boss Guide"
category: "gameplay"          # 必须是 site.config.mjs 里 categories 的某个 slug
summary: "一两句话摘要，会出现在分类页列表和搜索结果里"
order: 3                       # 侧边栏里同分类下的排序，数字越小越靠前，不填默认 100
updatedAt: "2026-07-28"        # 文章底部显示的更新日期
infobox:                       # 可选：右侧信息卡，没有就删掉整个 infobox 字段
  "HP": "12,000"
  "Weakness": "Fire"
tags: ["boss", "combat"]       # 可选：文章底部的标签
---

这里往下就是正文，正常 Markdown 语法：标题、列表、表格、链接、引用块都支持，
样式已经配置好了，不用操心。

## 二级标题

内链用相对路径，比如 [Crops](/wiki/crops/) 这样直接跳到另一篇文章。
```

保存、commit、push，网站会自动：
- 把这篇文章加进对应分类的侧边栏和分类页列表
- 更新首页"共 N 篇文章"的统计数字
- 加进搜索索引（不用手动配置，`npm run build` 会自动跑一遍 Pagefind 重新生成索引）

**新增一个分类**：先在 `src/content/wiki/` 下新建一个目录（比如 `lore/`），再去
`site.config.mjs` 的 `categories` 数组里加一项，slug 要跟目录名一致。

---

## 四、搜索是怎么运作的

用的是 [Pagefind](https://pagefind.app)——静态站点专用的搜索引擎，构建时（`npm run build`）
自动扫描所有生成的页面、建好索引，不需要任何后端、不需要 API key、不需要维护。页头的搜索框
是开箱即用的，加新文章之后只要重新 build 一次（Vercel 每次 push 都会自动 build），新内容
立刻能被搜到。

---

## 五、跟其他 owned wiki 保持独立

这个仓库/网站只对应**一款游戏**。不同游戏之间：
- 各自独立的 GitHub 仓库、独立的 Vercel 项目、独立的域名。
- 互不共享内容或配置——改这款游戏的 wiki 不会影响那款的。
- 但共享同一套模板代码，意味着以后如果想给"所有 wiki"统一加个功能（比如加个"最近更新"页面），
  可以把改动做在这个模板仓库里，再手动同步到各个已经衍生出去的独立仓库——这是唯一需要手动同步
  的地方，模板本身不会帮你自动推送更新到已经衍生的站点。
