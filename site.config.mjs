// ============================================================================
// 每次为新游戏复制这个模板，理论上只需要改这一个文件（+ 换 public/ 里的 logo/banner 图），
// 网站的名字、配色、外部链接、首页分类卡片就都会跟着变。
// 内容本身（wiki 文章）在 src/content/wiki/ 下面用 Markdown 写，跟这个文件无关，改这个文件
// 不会动到已经写好的文章。
// ============================================================================

export const SITE = {
  // 网站基础信息
  name: "Moonlight Peaks Wiki", // 显示在标题栏、页头
  shortName: "Moonlight Peaks", // 面包屑、页脚等空间小的地方用
  tagline: "任务、法术、作物与恋爱攻略 —— 社区维护的完整攻略百科",
  url: "https://moonlightpeakswiki.com", // 用于 sitemap / canonical / JSON-LD，换新游戏时改成新域名
  description: "Moonlight Peaks 完整攻略维基：任务流程、作物与法术数据、居民好感与恋爱攻略，每天由玩家和编辑持续更新。",

  // 主题色：整个模板只有这一个可调的强调色变量，其余配色（背景/边框/文字灰阶）在
  // src/styles/tokens.css 里是固定的，保证「所有用这套模板做的 wiki 视觉骨架一致，
  // 只有强调色随游戏气质变化」。想要更换字体等更深入的定制，去 tokens.css 改。
  accent: "#8B7FD1", // 换游戏时改这一个值就能让整站强调色变掉

  // 页头 logo（建议 SVG 或透明底 PNG，高度约 40px）与首页大banner图
  logo: "/images/logo.svg",
  banner: "/images/banner.jpg",
  bannerAlt: "Moonlight Peaks key art",

  // 外部链接：显示在侧边栏「Links」区块，来源页面之类的，没有的可以留空数组项直接删掉
  externalLinks: [
    { label: "Official website", url: "https://example.com" },
    { label: "Steam page", url: "https://store.steampowered.com/" },
    { label: "Discord", url: "https://discord.gg/" },
    { label: "X (Twitter)", url: "https://x.com/" },
  ],

  // 首页分类卡片网格顺序 —— 必须跟 src/content/wiki/ 下面的分类目录名（slug）对应，
  // 顺序就是首页网格的显示顺序。新增一个分类：在 wiki/ 下建目录 + 这里加一项。
  categories: [
    { slug: "gameplay", label: "Gameplay", icon: "🗺️", description: "Core loops, controls, and systems" },
    { slug: "farm", label: "Farm", icon: "🌾", description: "Crops, animals, and your homestead" },
    { slug: "characters", label: "Characters", icon: "🧛", description: "Residents, romance, and gifts" },
    { slug: "items", label: "Items", icon: "🎒", description: "Tools, recipes, and crafting materials" },
  ],

  // GitHub Analytics 之类的可选统计代码，留空就不注入
  analyticsId: "",
};
