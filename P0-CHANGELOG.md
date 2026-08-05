# P0 优化交付说明（2026-08-05）

## 已完成

- 统一 `src/config/site.js` 为域名、品牌和联系邮箱的配置源。
- robots 正确指向 `https://gameradar.wiki/sitemap-index.xml`。
- Sitemap 自动排除 noindex、草稿、薄 FAQ、薄发行日页和未审核翻译。
- 游戏页只允许 `published` 且通过摘要、攻略板块和双来源门槛的语言版本索引。
- 105 份 Wiki 数据均补齐 `slug` 和显式发布状态：48 published、57 draft。
- 清理 Moonlight Peaks 旧路由、内容集合与旧站点配置。
- 修复年度发行页指向未生成月份的失效链接。
- 首页和游戏页按实际日期修正已发行状态，不再展示过期倒计时。
- 隐藏缺失的开发商/发行商字段，移除无公开方法说明的 Hype 分数。
- 新增五语言 About、编辑规范、来源、纠错、隐私、条款和广告独立性说明。
- noindex 页面不再加载 AdSense 脚本。
- 每日工作流新增数据新鲜度、发行状态、构建和 SEO 检查，并对外部源失败明确标红。
- SEO 审计新增 robots 域名、Sitemap/noindex 冲突和失效内部链接检查。

## 验证结果

- Astro 构建：通过，2,187 个 HTML 页面。
- SEO 审计：通过，2,187 个页面全部检查。
- 抓取链路测试：通过。
- 当前 Sitemap：只包含通过质量门且可索引的 URL。

## 部署前必须确认

1. 在 GitHub Actions 手动运行一次“每日抓取游戏数据”，确保 IGDB、趋势榜和新闻三个源均为绿色。
2. 确认 `contact@gameradar.wiki` 邮箱已经建立并可收信。
3. 部署后打开 `/robots.txt`，确认 Sitemap 域名正确，再向 GSC 重新提交 Sitemap。
4. “GameRadar”与 GamesRadar+ 名称接近；本轮没有擅自更名，需单独完成品牌/商标筛查后决定新名称。
