// IGDB 返回的 genre.name 是英文，这里是英文 -> 中文/西语的翻译表。
// key 必须和 IGDB 实际返回的英文名完全一致（大小写、标点都算），可以在
// https://www.igdb.com/genres 核对完整列表。新出现一个没覆盖的 genre 不会报错，
// 会自动 fallback 显示英文原名——宁可显示英文也不要崩。
const GENRE_MAP = {
  "Point-and-click": { zh: "点击式冒险", es: "Point-and-click" },
  "Fighting": { zh: "格斗", es: "Lucha" },
  "Shooter": { zh: "射击", es: "Disparos" },
  "Music": { zh: "音乐", es: "Musical" },
  "Platform": { zh: "平台跳跃", es: "Plataformas" },
  "Puzzle": { zh: "解谜", es: "Puzles" },
  "Racing": { zh: "竞速", es: "Carreras" },
  "Real Time Strategy (RTS)": { zh: "即时战略", es: "Estrategia en tiempo real" },
  "Role-playing (RPG)": { zh: "角色扮演", es: "Rol (RPG)" },
  "Simulator": { zh: "模拟经营", es: "Simulación" },
  "Sport": { zh: "体育", es: "Deportes" },
  "Strategy": { zh: "策略", es: "Estrategia" },
  "Turn-based strategy (TBS)": { zh: "回合制战术", es: "Estrategia por turnos" },
  "Tactical": { zh: "战术", es: "Táctico" },
  "Quiz/Trivia": { zh: "问答", es: "Preguntas y respuestas" },
  "Hack and slash/Beat 'em up": { zh: "砍杀", es: "Beat 'em up" },
  "Pinball": { zh: "弹球", es: "Pinball" },
  "Adventure": { zh: "冒险", es: "Aventura" },
  "Arcade": { zh: "街机", es: "Arcade" },
  "Visual Novel": { zh: "视觉小说", es: "Novela visual" },
  "Card & Board Game": { zh: "卡牌桌游", es: "Cartas y mesa" },
  "MOBA": { zh: "MOBA", es: "MOBA" },
  "Indie": { zh: "独立游戏", es: "Independiente" },
};

export function translateGenre(englishName, locale) {
  if (locale === "en" || !englishName) return englishName;
  const hit = GENRE_MAP[englishName];
  if (!hit) return englishName; // 没收录就显示英文原名，不猜、不崩
  return hit[locale] || englishName;
}

export function translateGenres(englishNames, locale) {
  return (englishNames || []).map((n) => translateGenre(n, locale));
}
