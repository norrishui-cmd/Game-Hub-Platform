# GameRadar P3 完整覆盖交付

交付日期：2026-08-05

## 结论

P2 已再次通过全站 SEO 回归，P3 已完成并通过构建、SEO、数据管线与自定义验收。P3 只新增五个高价值工具页，没有批量生成“每款游戏一个相似列表”之类的薄索引 URL。

## P3 已完成

### 1. 五语言相似游戏发现器

- 路由：`/{locale}/discover/`，覆盖 English、Deutsch、日本語、Español、中文。
- 选择一款游戏后，按完整类型、复合类型共同词元、共同平台和发行阶段进行排序。
- 支持平台、发行状态、攻略覆盖筛选。
- 筛选状态写入查询参数，可复制分享；所有查询参数继续 canonical 到同一个工具页。
- 每条结果显示实际匹配理由，不生成评分、销量或未测量的“玩家喜好”。
- 支持“随机挑一款”、空结果说明、键盘可操作的原生表单控件与无封面字母占位。
- 五个页面均包含 WebApplication 与 BreadcrumbList JSON-LD。

### 2. 详情页相关推荐升级

- `src/lib/games.js` 新增共用的 `similaritySignals()` 与 `findSimilarGames()`。
- 完整类型匹配优先于复合类型词元，平台弱兜底始终排在真正的类型关联之后。
- 每个公开游戏详情页增加“发现相似游戏”入口，并把当前游戏写入分享参数。
- 详情页相关推荐显示匹配理由，形成游戏详情 → 相似发现 → 新详情页的内链闭环。

### 3. 内容运营优先队列

- 新命令：`npm run content:backlog`。
- 当前识别 57 个 draft/review 候选，按已有 hype、trending、featured、自有 Wiki 价值和结构化资料完整度生成编辑排期分。
- priority 明确是编辑排期分，不是游戏评分，不能替代来源核查或发布审核。
- 支持 `npm run content:backlog -- --limit=50` 和 `npm run content:backlog -- --json`。

### 4. 入口、索引与审计

- 顶部 Tools、页脚、游戏详情页均已接入发现器。
- sitemap 为发现器写入 `games.json` 的准确 lastmod。
- `scripts/seo-audit.mjs` 新增 P3 五语言字典对齐、发现器可索引状态、WebApplication、BreadcrumbList 与主控件检查。
- 个性化 My Radar 继续保持 noindex 且不进入 sitemap；P0–P2 的既有规则没有放宽。

## 验收结果

- Astro 静态构建：通过，2,207 页。
- 全站 SEO 审计：通过，2,207 个 HTML 页面。
- sitemap 业务 URL：141。
- 发现器 sitemap URL：5。
- My Radar sitemap URL：0。
- 游戏详情页发现入口：525 / 525（105 款 × 5 语言）。
- 内容队列 JSON：通过，57 个候选。
- 离线抓取管线集成测试：通过。
- `planet-zoo-2` Wiki 质量审核：通过。
- 相似度排序断言：类型匹配优先于平台兜底，自身不会被推荐。

## 已知数据状态

`data:health` 仍提示三份外部数据快照超过日常阈值：

- games：约 123.6 小时（阈值 36 小时）
- monthly trending：约 206.9 小时（阈值 72 小时）
- news：约 206.9 小时（阈值 72 小时）

本地环境没有 IGDB/Twitch 凭据，因此本次没有伪造“已刷新”时间。部署环境配置凭据后应手动运行一次每日抓取工作流。

`neverway` 当前结构化游戏记录没有类型和平台，发现器会诚实显示空结果；其 Wiki 正文虽然包含描述，但在来源数据进入 `games.json` 前不会被拿来反向伪造结构化推荐信号。

## 覆盖部署

1. 备份线上仓库或当前目录。
2. 解压完整覆盖包。
3. 用包内 `Game-Hub-Platform-main/` 覆盖同名项目目录。
4. 运行 `npm install`。
5. 运行 `ASTRO_TELEMETRY_DISABLED=1 npm run build` 和 `npm run seo:audit`。
6. 部署后手动运行每日数据抓取，并确认 `npm run data:health:strict` 通过。
