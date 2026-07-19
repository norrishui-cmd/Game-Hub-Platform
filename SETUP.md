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

**域名已经配好**：`astro.config.mjs` 的 `site` 和 `public/robots.txt` 的 Sitemap 链接
都指向 `gameradar.wiki` 了。这两处只影响生成的链接内容，不代表域名已经接到 Vercel 上——
域名解析/绑定还是要去 Vercel 项目的 **Settings → Domains** 里手动添加 `gameradar.wiki`，
按提示在 NameSilo 那边加对应的 DNS 记录，这是两件独立的事。

## 第四步：直接 push，Vercel 自动识别 Astro

不用改任何 Vercel 设置。push 之后 Vercel 自动跑 `npm install && astro build`，发布 `dist/` 目录。
纯静态站，不产生 serverless function。

## 第五步：手动跑一次抓取，确认没问题

打开仓库 **Actions** 标签页 → "每日抓取游戏数据" → "Run workflow" 手动触发。绿色 ✅ 说明
`data/games.json` / `data/drafts.json` 被更新并 push 回仓库，Vercel 会自动重新构建。

## 三语路由是怎么设计的

- 三种语言**都带前缀**：`/en/`、`/es/`、`/zh/`，没有不带前缀的"默认语言"。
- **根路径 `/` 是智能跳转**，不是固定跳去某一种语言：`src/pages/index.astro` 里有一段脚本，
  先看有没有记住过的语言选择（上次手动切换过的话，存在 localStorage 里），没有的话看浏览器
  语言列表，依次匹配英语/西语/中文，一个都不匹配就落到英文——对应"英文优先，其次西语、中文"
  的要求。这段逻辑纯前端 JS 实现，不需要 Vercel Edge Middleware 之类的服务端能力，
  站点依然是 100% 静态的，不会碰到 serverless function 额度问题。
  2 秒的 `meta refresh` 是没启用 JS 时的兜底，正常情况下走不到（JS 几乎瞬间执行完）。
- 这里有个 Astro 的坑记一下：`astro.config.mjs` 里如果只写 `prefixDefaultLocale: true`
  不写 `redirectToDefaultLocale: false`，Astro 会自动用它自己生成的跳转页整个覆盖掉
  `src/pages/index.astro` 的内容（我们上一版就是这样，所以当时改了文件内容也没用）。
  这次显式加了 `redirectToDefaultLocale: false`，`index.astro` 的内容才是真正生效的。
- `vercel.json` 之前那条 `/` → `/zh/` 的 redirect 规则**已经删掉**——留着的话它会在
  Vercel 边缘节点直接拦截，用户根本收不到上面这段智能跳转的 JS，两边会打架。
  现在 `vercel.json` 里没有实际内容了，纯粹是个占位。
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

## 游戏封面图

真实抓取管线（`scripts/fetch-games.mjs`）已经会自动从 IGDB 官方的图片 CDN
（`images.igdb.com`）拿封面图，这是 IGDB 官方 API 本来就支持、也是业内数据库类网站
的标准做法——IGDB key 配好、Action 真的跑起来之后，每款游戏会自动带上封面，不用
额外配置。

`data/games.json` 里那 8 条手填的样例数据目前 `cover` 都是 `null`，展示成渐变色
+ 字母的占位样式。这次没有直接去网上搜图填进去——单独抓某个具体商业游戏的封面图
拿去自己网站长期展示，版权边界不是完全清晰，比较谨慎的做法是要么等真实管线跑起来
自动走 IGDB 官方图源，要么如果你手上有官方 press kit 或者自己有权使用的素材，
把图片 URL 直接填进对应游戏的 `cover` 字段就行（格式：`"cover": "https://..."`）。

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

## 快速 Wiki 生产工作流

IGDB 的自动数据保存在 `data/games.json`，人工编辑内容独立保存在
`data/wiki/{slug}.json`，因此每日抓取不会覆盖 FAQ、指南栏目或来源。

```bash
# 为已进入 games.json 的游戏创建内容草稿
npm run game:create -- planet-zoo-2

# 编辑 data/wiki/planet-zoo-2.json 后运行质量审核
npm run game:audit -- planet-zoo-2

# 只有审核通过的内容才能切换为 published
npm run game:publish -- planet-zoo-2

# 部署前检查生成后的全部页面
npm run build
npm run seo:audit
```

发布门目前要求：英文摘要至少 120 个字符、至少两条有具体答案的 FAQ、至少一个 HTTPS
来源，并拒绝 TBD、coming soon、check back 等占位文案。其他语言只有提供独立本地化内容
并达到内容分数后才会进入索引。

## 语言版本与索引策略

站点支持 `/en/`、`/de/`、`/ja/`、`/es/`、`/zh/` 五种语言。德语和日语已经覆盖
导航、首页、筛选、日期、类型词典、游戏 Hub、FAQ、链接名称以及 SEO 元数据。语言首页可以
索引；游戏详情、类型和平台叶子页只有在对应语言拥有独立且通过质量门的内容后才进入
sitemap。不要为了扩大 URL 数量而直接解除这些页面的 `noindex`。

## AdSense 全站配置

发布商账号为 `ca-pub-9505220977121599`。全局布局和根跳转页的 `<head>` 均包含
AdSense异步加载脚本及 `google-adsense-account` 元标记；`public/ads.txt` 包含：

```text
google.com, pub-9505220977121599, DIRECT, f08c47fec0942fa0
```

部署后应能直接访问 `https://gameradar.wiki/ads.txt`。`npm run seo:audit` 会逐页检查
账户标记、加载脚本和ads.txt，任何一项缺失都会阻止审核通过。

## 自有游戏 Banner

自有游戏图片存放于 `public/images/games/`，具体匹配规则保存在
`data/owned-wikis.json` 的 `banner` 和 `coverPosition` 字段。抓取任务命中游戏后会强制使用
本地Banner覆盖IGDB封面；即使IGDB暂时搜索不到游戏，也会保留本地配置的游戏卡片。
`npm run seo:audit` 会检查每个本地图片路径是否真实存在。

## 已知的下一步

- `category = 0`（只要主游戏）用的是 IGDB 已标记 deprecated 但目前仍可用的字段，
  失效的话需要换成新字段 `game_type`。
- 类型/平台专题页目前还没有各自的 JSON-LD（CollectionPage 之类）。
- `src/i18n/genres.js` 目前覆盖了约 22 个 IGDB 标准类型，真实抓取跑起来后如果出现没覆盖到的
  新类型，会自动 fallback 显示英文，不会报错，但可以顺手来这个文件补一条翻译。
