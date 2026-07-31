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

## 2026-07-28 更新：Top100 选题库导入

新增了 `data/game-atlas.json`，来自 Norris 的 `game_seo_atlas_top100_2026_2027.xlsx`（Top100 sheet），
100 款游戏一次性导入。这批数据和 `data/owned-wikis.json` 是两个独立文件，职责分开：

- **改游戏范围/排期/平台/类型**：编辑 `data/game-atlas.json`。
- **新建了独立 wiki，想让某款游戏直链过去**：还是编辑 `data/owned-wikis.json`（跟以前一样，
  `match` 数组填游戏英文名的小写关键词，`wikiUrl` 填完整域名，比如 `https://xxx.wiki`）。
  只要 `owned-wikis.json` 里配置了，`fetch-games.mjs` 和 `build-from-atlas.mjs` 都会自动
  把对应游戏的 `coverage` 升级成 `"owned"`，游戏详情页就会出现「进入完整独立攻略 Wiki →」的
  跳转按钮（`src/components/GameDetail.astro` 里 `coverage==="owned" && wikiUrl!=="#"` 那段）。

`scripts/fetch-games.mjs`（每天定时跑、需要 IGDB 密钥）现在会强制收录 `game-atlas.json` 里的全部
100 款游戏，不管 IGDB 热度阈值，标记成 `coverage:"atlas"`（命中 owned-wikis 的会再升级成
`"owned"`）。也就是说：以后每天自动更新不会把这 100 款游戏挤掉。

如果不想等明天的定时任务，改完 `game-atlas.json` 或 `owned-wikis.json` 想立刻在本地看效果，
跑一次（不需要 IGDB 密钥，纯离线）：

```bash
node scripts/build-from-atlas.mjs
```

会直接重写 `data/games.json`，然后 `npm run build` 预览。

**当前已经配好直链的 wiki（16 个）**：Star Wars Zero Company、Planet Zoo 2、Moonlight Peaks、
Nivalis Nights、Neverway、RuneScape: Dragonwilds、CONTROL Resonant、Ace Combat 8、
Grave Seasons、The Blood of Dawnwalker、Phantom Blade Zero、Mistfall Hunter、
Beast of Reincarnation、REKA、Valheim 1.0。

**还差 1 个待确认**：Harvest Moon: Echoes of Teradea 的域名在截图里被截断成
`harvestmoonechoesofter...`，`data/owned-wikis.json` 里先留空（不会变成死链接，只是详情页
暂时不显示跳转按钮），把完整域名发过来就能立刻补上。

另外 Beast of Reincarnation 目前填的是 `https://beast-of-reincarnation.vercel.app`——截图里
域名同样被截断成 `.ver...`，这是按 Vercel 默认项目域名规则推断的，如果实际域名不一样（比如后来
换了自定义域名）请告诉我更新。

## 2026-07-28 更新（二）：本月热门榜单

新增了一个独立于选题库的功能：**本月热门榜单**（`/{locale}/monthly-chart/`，首页也有一个 Top 8 的
小组件）。这个榜单跟踪的是"现在全网都在玩/在看什么"（Counter-Strike 2、GTA、League of Legends
这类长青大作），跟选题库那 100 款"2026-2027 待发行新游"是两个完全不同的范畴，不要混淆。

**数据来源（两个独立信号，互不依赖）：**
- Twitch Helix `games/top`——当前观看人数最高的游戏分类。**不需要新申请密钥**，直接复用已经
  配置好的 `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET`（IGDB 鉴权本来就是走 Twitch 开发者账号的
  OAuth，这两个值本身就是一个 Twitch App 的凭据）。
- SteamSpy `top100in2weeks`——近两周玩家数最高的 Steam 游戏。完全公开的接口，不需要任何密钥。

**「本月」怎么滚动更新**：`scripts/fetch-trending.mjs` 现在跟 `fetch-games.mjs` 一起，被
`.github/workflows/daily-fetch.yml` 每天自动调用一次。每天的原始排名快照存进
`data/trending-history/<日期>.json`（永久保留，不覆盖），然后把当前自然月的全部快照按名次加权
累计打分，重新生成 `data/monthly-trending.json`。这样榜单反映的是"这个月持续保持热度"，而不是
"今天恰好冲榜一次"；到了下个月，日期前缀自动变了，榜单也就自然重新开始计算，不需要手动清空任何东西。

**内链 vs 外链**：榜单里的游戏，如果 slug 命中了平台自己的选题库/自有 wiki（比如这次正好命中的
Halo: Campaign Evolved、Assassin's Creed Black Flag Resynced、The Mound: Omen of Cthulhu），
点击直接跳转到本站的攻略页；其余不在咱们范围内的长青大作（CS2、Dota2、LoL 等）会外链到对应的
Steam 商店页或 Twitch 分类页，不会为了凑数硬建一个空页面。

**如果想立刻手动跑一次（不想等明天的定时任务）**：
```bash
node scripts/fetch-trending.mjs
```
跟 `build-from-atlas.mjs` 一样，改动只影响 `data/monthly-trending.json` 和
`data/trending-history/`，跟 `games.json` 完全独立，互不干扰。

**当前 `data/monthly-trending.json` 里的 20 款游戏是人工研究种子数据**（2026-07-28，综合
GameGrin 整理的 Steam 官方畅销榜与 TwitchTracker 的观看数据），第一次 `fetch-trending.mjs`
成功跑起来之后会被自动榜单整体覆盖，字段结构完全一致，不需要额外处理。

## 2026-07-28 更新（三）：最新资讯 + FAQ 汇总

新增了两个独立栏目，首页和导航都有入口：

### 最新资讯（`/{locale}/news/`）

每天自动汇总几家主流游戏媒体（PC Gamer、Eurogamer、Rock Paper Shotgun、PCGamesN、GamesRadar+）
的 RSS 公开订阅源，偏"攻略/Wiki 视角"——版本更新、阵容公布、玩法机制解读，而不是纯评测/八卦。
只存标题 + 来源 + 原文链接 + 日期，不转载正文，符合版权要求（跟 Google 新闻一样的聚合索引逻辑）。

- **不需要任何密钥**：RSS 是公开订阅源，`scripts/fetch-news.mjs` 直接用 `fetch()` 读取。
- 如果新闻标题里出现了本站已收录的游戏名（比如这次种子数据里的 Star Wars Zero Company、
  Planet Zoo 2、Halo: Campaign Evolved），会自动加一个"查看本站攻略页"的内链。
- 已经接进 `.github/workflows/daily-fetch.yml`，跟游戏数据、热门榜单一起每天自动跑，
  单独失败不影响其他两个脚本（`continue-on-error: true`）。
- 想立刻手动跑一次：`node scripts/fetch-news.mjs`。
- 当前 `data/news.json` 里的 10 条是人工研究种子数据（2026-07-28 真实搜索整理），
  第一次 `fetch-news.mjs` 成功跑起来后会被自动列表整体覆盖。
- 如果哪天某个媒体的 RSS 地址失效了：编辑 `scripts/fetch-news.mjs` 顶部的 `FEEDS` 数组，
  改 `url` 或者加/删源，其他源不受影响。

### 常见问题 FAQ（`/{locale}/faq/`）

把本站每一款游戏的基础 FAQ（发行日期、平台、开发商——跟每个游戏详情页底部那三条一模一样，
两边共用同一个函数 `buildFaqItems()`，写在 `src/lib/games.js` 里，不会出现两套口径）汇总到一个
可折叠列表页，按热度排序，点开某一款可以看到完整 Q&A，再点"查看完整攻略"跳到那款游戏自己的页面。
首页放了热度最高的 6 款做预览。

这批 FAQ 目前都是自动生成的基础三问；以后要是给某款游戏写了更详细的编辑内容（存在
`data/wiki/<slug>.json` 里，字段是 `content.<locale>.faq`），`buildFaqItems()` 会自动优先用那份
更详细的内容，FAQ 汇总页和游戏详情页会同步更新，不需要额外操作。

## 2026-07-28 更新（四）：每款游戏的 Wiki 空间

给 `data/games.json` 里现在的全部 105 款游戏，在 `data/wiki/<slug>.json` 建了空的"wiki 空间"——
5 种语言各留好 `summary`（简介）/ `faq`（问答）/ `guideSections`（攻略板块）/ `sources`（信息源）
四个位置。这些字段名跟 `src/components/GameDetail.astro` 已经在读的字段完全对上，**不需要改任何
代码，直接编辑对应游戏的 JSON 文件、填内容、提交，就会出现在那款游戏的详情页上**。

### 为什么这样设计

目标是"用户搜某款游戏的 wiki，能搜到你的站"。这靠两件事：
1. 页面得先能被搜索引擎收录（不是所有语言、所有游戏现在都能被收录，下面细说）。
2. 收录了以后，内容得是真东西，不是凑数的空壳——不然排名也上不去，跟本站一直坚持的
   "宁可不发布也不糊弄"原则一致。

### 什么时候一个游戏页面才会被收录

`src/lib/games.js` 里的 `isGameIndexable()` 说了算，两个条件都要满足：
- `data/wiki/<slug>.json` 里没有把 `publishStatus` 设成 `"draft"`（脚手架默认不写这个字段，
  等同于没设置，不会挡索引）。
- 这个语言的"内容分"够 3 分：`summary` 填了算 2 分，`faq` 每条 1 分（最多算 2 分），
  `guideSections` 填了算 2 分，`sources` 填了算 1 分。**英文页面还有个额外豁免**：如果这款游戏
  本身的结构化资料（封面图/平台/类型/链接/开发商，5 项里有 3 项以上）够扎实，英文页面不用写
  wiki 内容也能先收录——这是目前 105 款里 20 款英文页已经在收录的原因。**其他 4 种语言没有这个
  豁免，必须实打实写内容才能收录。**

也就是说：现在大部分游戏（尤其是中/日/西/德文版本）还没被收录，写 wiki 空间正是解决这个问题的
办法——随便挑一个你有把握的游戏，把 `summary` 写几句 + `guideSections` 填一条，这个语言的页面
就能过 3 分的坎，进入可收录状态。

### 最快能过关的填法

不用五个字段全填，够 3 分就行。最推荐的组合：**`summary` 写 2-3 句真实简介 +
`guideSections` 填 1 条**（2+2=4 分，稳过 3 分），这样 `faq` 可以留空，页面照样会显示自动生成的
「发行日期/平台/开发商」三问（这是 `buildFaqItems()` 的兜底行为）。如果 `faq` 字段自己也填了内容，
会**整个替换掉**自动生成的那三问，不是叠加——所以如果想自己写 FAQ，记得把发行日期/平台/开发商也
一并写进去，不然这几条不会消失但也不会用你写的版本，是完全被你的内容取代。

### 已经写好的示范：`data/wiki/star-wars-zero-company.json`

这个文件的英文部分是真实内容（简介、4 条 FAQ、2 个攻略板块、3 个信息源，都来自公开报道），
`publishStatus` 设成了 `"published"`，可以直接打开看格式怎么写、字段怎么填。其余 104 个都是
空壳，结构一样，复制这个文件的形状填自己的内容就行。中/日/西/德文部分我先留空，等你自己写或者
之后要我帮忙翻译都可以。

### 新游戏怎么办

以后往 `data/game-atlas.json` 里加新游戏之后，跑一次：
```bash
node scripts/scaffold-wiki.mjs
```
会自动给还没有 wiki 文件的新游戏建好空模板，已经写过内容的游戏不会被碰。也可以指定只给某几个
新游戏建：`node scripts/scaffold-wiki.mjs some-slug another-slug`。

## 2026-07-28 更新（五）：SEO 加强

这一批不是新功能，是给现有页面补齐几块之前缺的 SEO 基础设施，目标是提升搜索排名和社交分享效果：

- **Open Graph / Twitter Card**：之前整站没有任何 `og:` / `twitter:` 标签，分享到微博/推特/Discord
  只会显示光秃秃的链接。现在每个页面都有——游戏详情页用游戏自己的封面图当分享图，
  其余页面（首页、榜单、FAQ、新闻等）用 `public/images/og-default.jpg` 这张统一生成的品牌图。
- **WebSite + Organization 结构化数据**：加在 `src/layouts/Base.astro` 里，全站每个页面都有，
  带了 `SearchAction`（指向首页已有的 `?q=` 搜索参数），有机会让 Google 在搜索结果里给出
  Sitelinks 搜索框。
- **BreadcrumbList 结构化数据 + 可视面包屑**：游戏详情页现在是「GameRadar / 类型 / 游戏名」
  三级面包屑，图上可点，也有对应的结构化数据——两者保持一致，这是 Google 官方对结构化数据的
  要求（结构化数据不能凭空多出页面上没有的导航层级）。
- **同类型游戏推荐**（游戏详情页新增板块）：跟当前游戏共享至少一个类型标签的其他游戏，按热度
  排序显示 4 个。这是真实的站内导流，不是凑数据——类型标签是从 Excel 选题库来的自由文本，
  比较的时候做了归一化（大小写、写法差异不影响匹配），但个别类型写得比较独特的游戏
  （比如"Tactical strategy"只有一款游戏在用）不会硬凑出不存在的相关推荐，这种情况下这个板块
  就不显示，不影响页面其他部分。
- **自定义 404 页**：之前没有专门的 404 页，现在有一个跟全站风格一致、带返回首页按钮的版本，
  减少用户点到失效链接时直接流失。

**这些改动不需要你做任何操作**，直接用这次的 zip 覆盖部署就行，下次 Google 重新抓取的时候
会自动读到新的 meta 标签和结构化数据。想验证效果，可以把某个游戏页面的网址丢进
[Google 的 Rich Results Test](https://search.google.com/test/rich-results) 看结构化数据是否被正确识别。

## 2026-07-28 更新（六）：全站游戏详情页的简版 Wiki 内容

之前 105 款游戏里，只有 10 款（Star Wars Zero Company 等重点 owned 游戏）手写过英文简介，
其余 95 款、以及所有游戏的中/日/西/德文版本，`data/wiki/<slug>.json` 里都是空的——这意味着
除了英文页靠"资料够扎实"侥幸豁免收录的约 20 款游戏，**其余绝大多数游戏页面在所有语言下都不会
被搜索引擎收录**，这正是"用户搜某款游戏，搜不到你的站"的根本原因。

新增了 `scripts/build-baseline-wiki.mjs`，跑一次直接给全部 105 款游戏、5 种语言，批量生成
一段真实的简介 + 一个"平台与发行状态"说明——**内容 100% 来自 `games.json` 里已经确认的结构化
事实**（类型、平台、开发商、发行商、发行日期/状态），不编造任何剧情、角色、玩法细节，纯粹是把
表格里的事实转成正常语句。跑完这一次，全站 105 款游戏 × 5 种语言 = **525 个游戏详情页现在全部
变成可收录状态**（跑之前只有英文页里资料够扎实的约 20 款游戏侥幸达标，其余全部被挡在外面）。

**绝对安全，不会覆盖你已经写好的内容**：脚本只处理 `summary` 字段还是空的语言，只要某个游戏
某种语言已经有文字（不管是我之前深挖的 10 款英文内容，还是你以后自己写的任何内容），会完整跳过、
一个字都不碰。可以随时重复运行，新加的游戏会自动补上，已经写过的不受影响。

用法：
```bash
node scripts/build-baseline-wiki.mjs              # 处理全部游戏缺失的语言
node scripts/build-baseline-wiki.mjs some-slug     # 只处理指定的一两个游戏
```

**这跟之前深挖的 10 款游戏内容是什么关系**：不冲突，是两层不同深度的内容。批量生成的是
"保底能被收录"的基础事实页；已经深挖过的 10 款（以及以后你或者我继续手写的任何游戏）内容
更丰富、更有可读性，会一直保留，不会被这个脚本的产出替换掉。往后建议按 `data/games.json`
里的热度（`hype` 字段）从高到低，继续把批量生成的基础版换成真正深挖过的版本——具体怎么写、
去哪查资料、写成什么格式，参照前面「Wiki 空间怎么填」那一节，或者直接把某几个游戏的 slug
发给我，我可以继续帮你深挖着写。

## 2026-07-28 更新（七）：每款游戏的长尾 URL 扩展

给每一款游戏的详情页扩出了两个独立的长尾 URL，站点页面总数从 1067 涨到 2117（+1050 = 105 款
游戏 × 2 个新页面 × 5 种语言）：

- **`/games/<slug>/faq/`**——比主详情页那 3-4 条问答更完整的长尾 FAQ，除了发行日期/平台/开发商，
  还加了"是什么类型"、"关注度高不高"，以及**逐平台问答**（"XX 会登陆 PS5 吗？"、"XX 上 Switch
  吗？"这种）——这类问法是真实存在的高频长尾搜索词，回答完全基于 `games.json` 里已确认的
  `platforms` 字段，登陆了就说确认，没登陆就明确说目前没有计划，不是硬编的。
- **`/games/<slug>/release-date/`**——独立的发行日期 + 倒计时页面，未发行的游戏有实时倒计时
  （复用首页那套倒计时逻辑），已发行的游戏显示"已经发行"标签，同样附带逐平台问答。

两个新页面都有独立的 `<title>`/meta description/JSON-LD（FAQPage + BreadcrumbList），
跟主详情页共用同一套收录判定逻辑（`isGameIndexable`）——主页面在某个语言下能不能被收录，
这两个长尾页跟着走，不需要额外配置。

**顺手修了一个过时的 sitemap 规则**：之前 `astro.config.mjs` 里有一条"非英文的 /games/ 页面
一律不进 sitemap"的硬规则，是选题库刚导入、非英文内容还是空的时候写的安全阀。现在全站游戏
在 5 种语言下都有真实内容了，这条规则已经过时、反而拖后腿——改成跟页面上实际的
`<meta name="robots">` 状态完全一致：真的可收录才进 sitemap，不再无脑排除非英文页面。
现在 sitemap 里每种语言各有 315 条游戏相关网址（105 款 × 3 个页面）。

**主详情页新增的入口**：原来的"快速解答"板块下面加了两个链接——"查看完整 FAQ →"和
"查看发行倒计时 →"，分别跳到这两个新页面，形成完整的内部链接闭环。

这些改动不需要你做任何操作，直接覆盖部署即可。

## 2026-07-28 更新（八）：owned 游戏深挖收尾 + 第三个长尾 URL（新闻页）

**16 款 owned 游戏（有你自己独立 wiki 的那批）现在 100% 都有真实深挖过的英文内容**——这次
补完了剩下 6 款：Valheim 1.0、CONTROL Resonant、Mistfall Hunter、Nivalis Nights、
Ace Combat 8: Wings of Theve、Neverway。每款都是真实搜索来的资料（开发商、发行日期、
核心玩法机制），格式跟之前一致：简介 + 2 个攻略板块 + 2-3 个真实信息源链接。

**新增第三个长尾 URL**：`/games/<slug>/news/`——只给**真的有相关新闻**的游戏生成这个页面
（判断依据：`data/news.json` 里 `relatedSlug` 字段命中这款游戏），没有新闻的游戏不会生成空页面，
避免单薄内容。目前只有 3 款游戏（Star Wars Zero Company、Planet Zoo 2、Halo: Campaign Evolved）
够格，但 `scripts/fetch-news.mjs` 每天自动跑，以后会有更多游戏自然攒够新闻，届时这个页面
会自动生成，不需要手动维护名单。

主详情页的"快速解答"板块下面现在最多有三个入口：查看完整 FAQ、查看发行倒计时、
（如果有相关新闻）查看相关资讯——三个长尾页面加上主页面，每款游戏现在最多有 4 个独立 URL。

**下一步建议**：owned 游戏已经全部深挖完了，接下来可以按热度从高到低，继续把"选题库"里
其余约 89 款游戏的基础版内容换成深挖版——同样的流程，把想深挖的游戏 slug 发给我就行。

## 2026-07-28 更新（九）：SEO 细节修复

排查了一遍全站的标题长度、sitemap 数据质量，修了几个之前没注意到的小问题：

- **标题过长导致搜索结果被截断**：之前游戏名比较长的页面（比如 "IRON NEST: Heavy Turret
  Simulator"），拼上 " | GameRadar" 品牌后缀后经常超过 Google 搜索结果的显示宽度，
  被截断成省略号。现在加了一个 `pageTitle()` 的小工具函数（`src/lib/games.js`）——
  拼上品牌后缀还在预算内就拼，超预算就宁可不带品牌后缀，优先保游戏名和描述完整可读。
  全站原本 409 个页面标题过长，现在降到 126 个（剩下的都是游戏名本身就很长，去掉品牌后缀
  也无法再缩短，不是这次能解决的）。
- **sitemap 一直没有 `lastmod`**：Google 没法据此判断哪些页面是新鲜的、该优先重新抓取。
  现在每个网址都带上了准确的最后更新时间——游戏详情/FAQ/发行日期页优先用对应
  `data/wiki/<slug>.json` 文件的实际修改时间，首页/月度榜单/最新资讯各自用对应数据文件
  自己的时间戳，其余页面退回用 `games.json` 整体的生成时间。
- **裸域名 `/` 之前也被列进了 sitemap**：这个网址本身是 noindex 的语言探测跳转页（不是真的
  内容页，见上一轮修复），列进 sitemap 会自相矛盾——sitemap 应该只列真正想被收录的网址。
  现在已经排除。

顺手确认了一遍 meta description 长度：之前担心的一批"过短"的描述，查下来全部是日文/中文的
类型页/平台页——这些页面本来就不进英文以外语言的 sitemap（前面几轮就定好的规则），描述长度
不影响任何东西；真正会被收录的英文类型/平台页描述长度都在 115-130 字符，健康范围内，不用改。

## 2026-07-28 更新（十）：发行日历页面体系（P0）

对标了一圈行业站（PC Gamer、GamesRadar、GameSpot、VGC、Game Informer、Destructoid、
Beebom、Mobalytics 全都有"2026 游戏发行日历"页面）之后补的一块结构性空缺——**GameRadar
明明有 105 款游戏的结构化排期数据，却一直没有按时间维度的落地页**，等于把自己最擅长的
关键词（"2026 年新游戏"、"8 月发行游戏"）整块让出去了。

新增 `/releases/` 下面一整套自动生成的日历页：

- `/releases/` —— 日历总入口，列出所有年份/月份/待定分组
- `/releases/2026/` —— 年度日历，内部再按月分组展示（比竞品那种几百款平铺在一个长页里好读）
- `/releases/2026-08/` 等 —— 月度页，每月一个独立 URL
- `/releases/tba/` —— 已公布但尚未定档的游戏，按关注度排序

**全部由 `data/games.json` 自动生成，零维护成本**——每天定时任务更新完游戏数据，日历页跟着
自动重算，永远不会过期。这是相对竞品的核心优势：它们那些日历页全靠人工手动维护，经常有漏、
有过期。

**薄内容门槛**（写在 `src/lib/games.js` 里）：年度页至少 10 款、月度页至少 4 款、待定页至少
5 款游戏才会生成。一个月只有 1 款游戏的页面就是薄内容，与其生成出来拉低整站质量，不如不生成——
随着选题库变大，够格的月份自然会出现，不需要手动维护名单。当前生成了 8 个日历页 × 5 种语言
= 40 个新页面，站点总页数从 2132 涨到 2172。

每个日历页都带 BreadcrumbList + ItemList 结构化数据、完整的 5 语言翻译、以及 sitemap 里
准确的 lastmod。导航栏和页脚也都加了"发行日历"入口。

## 2026-07-28 更新（十一）：AAA 大作深挖 + 一个数据源头 bug

这批深挖了搜索量最大的四款 AAA：**GTA VI、Marvel's Wolverine、Halo: Campaign Evolved、
Gears of War: E-Day**。累计已深挖 37 款。

**顺手修了一个我自己前几轮埋下的坑（重要）**：之前核实到 Onimusha 官方把发行日期从 9/25 提前到
9/4 时，我直接改了 `data/games.json`——但那是**派生文件**，真正的源头是 `data/game-atlas.json`。
只要谁跑一次 `node scripts/build-from-atlas.mjs`（而这在文档里就是常规维护步骤），这个修正就会
被源头的旧数据悄悄覆盖回去。现在已经改到源头 `game-atlas.json` 里，重新生成后验证过，修正是
持久的了。

**教训写在这里供以后参考**：`data/games.json` 是自动生成的派生文件，**任何手动修正都不要直接
改它**——改对应的源头文件：
- 选题库里的游戏（发行日期/平台/类型）→ 改 `data/game-atlas.json`
- 自有 wiki 直链 → 改 `data/owned-wikis.json`
- 封面图 → 改 `data/manual-covers.json`
- wiki 正文内容 → 改 `data/wiki/<slug>.json`

同时借这次重新生成，修正了 3 款已过发行日但状态还停留在"即将发行"的游戏
（Halo: Campaign Evolved、Mistfall Hunter、Corsair Cove）——`build-from-atlas.mjs` 会按当天日期
自动重算 `status`，所以以后只要定期跑，这类状态漂移会自动修好。

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
