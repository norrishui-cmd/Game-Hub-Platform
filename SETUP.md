# GameRadar 启用步骤

全程网页操作，不需要命令行。现在站点是三语的：中文（默认）、English、Español。

## 第一步 · 第二步：拿 IGDB key、设 GitHub Secrets

1. 打开 https://dev.twitch.tv/console/apps ，登录后点 "Register Your Application" 创建一个应用
   （Name 随便填，OAuth Redirect URLs 填 `https://localhost` 占位，Category 选 "Application Integration"），
   拿到 **Client ID** 和 **Client Secret**。
2. 打开 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions** → "New repository secret"，
   添加 `IGDB_CLIENT_ID` 和 `IGDB_CLIENT_SECRET` 两条。

## 第三步：把整个项目结构放进仓库

```
package.json
astro.config.mjs
vercel.json
.gitignore
public/robots.txt
src/
  i18n/
    locales.js
    ui.js
    genres.js
  layouts/Base.astro
  components/GameCard.astro
  components/GameDetail.astro
  lib/games.js
  styles/global.css
  pages/
    index.astro                       ← 根路径占位，见下方"三语路由"说明
    [locale]/
      index.astro
      genres.astro
      platforms.astro
      genre/[genre].astro
      platform/[platform].astro
      games/[slug].astro
      games/draft/[slug].astro
      games/draft/index.astro
data/
  games.json
  drafts.json
  owned-wikis.json
scripts/
  fetch-games.mjs
  fetch-games.test.mjs
.github/workflows/daily-fetch.yml
```

**必须改一处**：`astro.config.mjs` 里的 `site`、`public/robots.txt` 里的 Sitemap 链接、
`vercel.json` 用不到域名所以不用改。域名定了之后回来改前两处。

## 第四步：直接 push，Vercel 自动识别 Astro

不用改任何 Vercel 设置。push 之后 Vercel 自动跑 `npm install && astro build`，发布 `dist/` 目录。
纯静态站，不产生 serverless function。

## 第五步：手动跑一次抓取，确认没问题

打开仓库 **Actions** 标签页 → "每日抓取游戏数据" → "Run workflow" 手动触发。绿色 ✅ 说明
`data/games.json` / `data/drafts.json` 被更新并 push 回仓库，Vercel 会自动重新构建。

## 三语路由是怎么设计的

- 三种语言**都带前缀**：`/zh/`、`/en/`、`/es/`，没有不带前缀的"默认语言"。
  好处是路由规则统一、不用分两套逻辑维护；代价是根路径 `/` 本身不是一个真实页面，需要跳转。
- 根路径的跳转由 **`vercel.json`** 的 redirect 规则负责（`/` → `/zh/`），发生在 Vercel 边缘节点，
  没有内容闪烁。`src/pages/index.astro` 这个文件必须存在（Astro 的 i18n 配置要求 src/pages
  下有一个根 index 页面），但它的实际内容会被 Astro 自动生成的跳转页整个覆盖掉——
  这个文件与其说是"页面"，不如说是满足构建要求的占位符，改它的内容不会影响线上效果。
- 类型 / 平台专题页的 URL slug（比如 `/genre/role-playing-rpg/`）三种语言完全一样，
  只是页面里显示的类型名字翻译了——这样 hreflang 才能简单地"只换前缀，路径其余部分不变"，
  不用另外维护一张多语言 slug 对照表。

## 文案怎么管理

- **界面文案**（导航、按钮、标签之类）：`src/i18n/ui.js`，一个大字典，中/英/西三份一一对应。
  加新文案时三种语言的 key 必须对齐，漏了哪个语言会自动回退显示中文（不会崩，但看着奇怪，
  加完自己扫一眼）。
- **游戏类型翻译**：`src/i18n/genres.js`，key 是 IGDB 返回的英文类型名（比如
  `"Role-playing (RPG)"`），没收录的类型会直接显示英文原文兜底，不会报错。以后 IGDB
  抓回来新的类型名如果想要翻译，来这个文件加一条就行。
- **游戏名**：中文页面优先显示 `owned-wikis.json` 里配置的 `titleZh`（没配就用英文名）；
  英文、西语页面统一显示英文/国际通用名，没有另外造西语译名——这是有意的，大部分游戏
  在西语媒体里也是直接用英文名。
- **平台名**（PC、PS5、Xbox Series…）三语言不翻译，本来就是国际通用的写法。

## 构建注意事项：一定要先 npm install

**不要**直接用 `npx astro build`——这次开发过程里踩过一次坑：本地没有 `node_modules` 时，
`npx` 会自己去网上抓一个最新版 Astro（抓到过 7.0.6，比 `package.json` 里锁定的 5.x 新两个大版本），
版本对不上导致连配置文件都读不出来。正确顺序永远是先 `npm install`（装出跟 `package.json`
版本一致的本地依赖），再 `npm run build`。Vercel 自动部署走的就是这个正确顺序，不受影响，
这条只是给以后本地/沙盒里手动验证时的提醒。

## 日常怎么维护

- **新建了独立 wiki，想让门户直链过去**：编辑 `data/owned-wikis.json`。
- **调收录松紧度 / trending 判定门槛**：改 `scripts/fetch-games.mjs` 开头 `RULES` 里的数字。
- **看草稿雷达**：网站的 `/{locale}/games/draft/` 页面，或直接看 `data/drafts.json`。
- **部署前想再确认管线逻辑没问题**：跑 `node scripts/fetch-games.test.mjs`，离线集成测试，
  不需要真实 IGDB key。

## 关于 noindex 的一个重要细节

`public/robots.txt` 允许抓取所有页面，**没有**禁止 `/games/draft/`。这是故意的：如果在
robots.txt 里禁止抓取草稿页，Googlebot 根本进不去页面，也就看不到页面上的 noindex 标签，
反而可能因为有外部链接指向而把它收录成一个没有摘要的空壳链接。

## 顺带一提

Astro 在 2026 年初被 Cloudflare 收购了，现在已经出到 7.x（这次踩坑意外发现的）。这不影响你——
`package.json` 特意锁定 5.x 稳定线，Vercel 上静态 Astro 站依然是官方零配置部署路径。

## 已知的下一步

- `category = 0`（只要主游戏）用的是 IGDB 已标记 deprecated 但目前仍可用的字段，
  失效的话需要换成新字段 `game_type`。
- 类型/平台专题页目前还没有各自的 JSON-LD（CollectionPage 之类）。
- `src/i18n/genres.js` 目前覆盖了约 22 个 IGDB 标准类型，真实抓取跑起来后如果出现没覆盖到的
  新类型，会自动 fallback 显示英文，不会报错，但可以顺手来这个文件补一条翻译。
