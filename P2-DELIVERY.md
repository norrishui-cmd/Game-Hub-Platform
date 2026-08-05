# GameRadar P2 完整覆盖包

本包基于已通过回归的 P0 与 P1，P2 重点从“能浏览”升级为“能持续跟踪、能做选择”，同时增强现有专题页的搜索实体表达。完整源代码可直接覆盖原项目目录；`node_modules/` 与 `dist/` 不进入交付包，部署时重新安装和构建。

## P1 复核结论

- 五语言游戏浏览、筛选、排序、渐进加载正常构建。
- 全站搜索联想、模糊匹配和键盘状态保留。
- 发行计划器、浏览器关注列表及 ICS 导出保留。
- 新闻聚合页继续保持 `noindex,follow`，未达到原创摘要和玩家影响门槛的游戏新闻页不会进入 Sitemap。
- P1 的 canonical、hreflang、结构化数据、内部链接和 sitemap/noindex 一致性继续通过自动审计。

## P2 新增功能

### 1. My Radar 关注中心

- 新增五语言 `/{locale}/watchlist/`。
- 汇总保存在当前浏览器中的关注游戏、下一款已确认发行的游戏及已定档数量。
- 支持单项移除、全部清空、进入游戏对比和导出 `.ics` 日历。
- 与游戏详情页、发行计划器共用 `gr_watchlist` 数据，并在同页操作后同步更新导航数量。
- 这是个人化空壳页，因此明确使用 `noindex,follow`，不进入 Sitemap，也不加载广告。

### 2. 游戏对比工具

- 新增五语言 `/{locale}/compare/`，最多同时对比三款游戏。
- 对比字段只使用结构化确认数据：发行日期、发行状态、开发商、发行商、平台、类型和攻略覆盖。
- 自动计算共同平台；支持从详情页预选一款游戏，也支持复制包含选择状态的分享链接。
- 查询参数统一 canonical 到无参数工具页，避免组合参数制造重复索引 URL。
- 五语言工具页均包含原创使用说明，并使用 `WebApplication` 与 `BreadcrumbList` 结构化数据。

### 3. 类型与平台专题增强

- 英文 `/genres/`、`/platforms/` 及达到最低游戏数量门槛的叶子页新增可见介绍。
- 新增 `CollectionPage`、`ItemList`、`BreadcrumbList` 结构化数据。
- 仍维持原有质量门：叶子页至少三款游戏，未审核翻译继续 noindex，不为扩大数量解除门槛。

### 4. 导航与入口闭环

- 全站导航新增 Tools 下拉，包含 My Radar 和游戏对比。
- My Radar 显示当前浏览器的关注数量。
- 游戏详情页新增“对比这款游戏”入口。
- 发行计划器新增 My Radar 入口。
- 移动端维持可展开导航和完整键盘可访问控件。

## 市场模式依据

- RAWG 使用类型、平台和发行日历组织发现路径，说明结构化分类与时间筛选是游戏发现门户的基础能力。
- IGDB 将“发现、Coming Soon、Recently Released”与用户列表/追踪结合，说明门户需要从一次性浏览延伸到持续跟踪。
- 本站不复制竞品评分或价格数据，而是围绕自有的发行排期、独立 Wiki 覆盖和来源质量建立差异化工具。

## 验证结果

- Astro 生产构建：通过，共 2,202 个 HTML 页面。
- SEO 自动审计：通过，共检查 2,202 个 HTML 页面。
- Sitemap：136 个可收录业务 URL；新增 5 个本地化对比工具 URL，5 个个人关注页全部排除。
- P2 五语言文案键一致性已纳入 `scripts/seo-audit.mjs`。
- 对比工具的 `WebApplication`、专题页的 `CollectionPage`、个人页 noindex 状态已纳入持续自动审计。
- 数据抓取链路离线测试：通过，1/1。
- Wiki 发布质量审计：通过。

## 覆盖部署

```bash
npm ci
npm run build
npm run seo:audit
```

部署 `dist/`，上线后抽查：

- `/en/compare/`、`/zh/compare/`
- `/en/watchlist/`、`/zh/watchlist/`
- `/en/genre/action-rpg/`
- `/en/platform/pc/`
- 任一游戏详情页和 `/en/releases/`
- `/robots.txt` 与 `/sitemap-index.xml`

当前数据快照仍超过日常更新时限；这是数据源凭据/定时任务层面的提醒，不影响本包构建。上线环境恢复抓取凭据后应运行每日数据任务并重新构建。

