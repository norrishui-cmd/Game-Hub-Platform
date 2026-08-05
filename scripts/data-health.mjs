import { readFile } from "node:fs/promises";

const strict = process.argv.includes("--strict");
const now = Date.now();
const checks = [
  { label: "games", file: "data/games.json", field: "generatedAt", maxAgeHours: 36 },
  { label: "monthly trending", file: "data/monthly-trending.json", field: "updatedAt", maxAgeHours: 72 },
  { label: "news", file: "data/news.json", field: "generatedAt", maxAgeHours: 72 },
];

const failures = [];
const loaded = new Map();
for (const check of checks) {
  try {
    const data = JSON.parse(await readFile(check.file, "utf8"));
    loaded.set(check.label, data);
    const timestamp = Date.parse(data[check.field]);
    if (!Number.isFinite(timestamp)) {
      failures.push(`${check.label}: missing or invalid ${check.field}`);
      continue;
    }
    const ageHours = (now - timestamp) / 3_600_000;
    if (ageHours > check.maxAgeHours) failures.push(`${check.label}: ${ageHours.toFixed(1)}h old (limit ${check.maxAgeHours}h)`);
    if (ageHours < -1) failures.push(`${check.label}: timestamp is in the future`);
  } catch (error) {
    failures.push(`${check.label}: cannot read ${check.file} (${error.message})`);
  }
}

const games = loaded.get("games")?.games || [];
const today = new Date(now).toISOString().slice(0, 10);
for (const game of games) {
  if (game.status === "upcoming" && game.release && game.release !== "TBA" && game.release <= today) {
    failures.push(`${game.slug}: release ${game.release} has passed but status is still upcoming`);
  }
}

if (failures.length) {
  const prefix = strict ? "Data health failed" : "Data health warnings";
  console.error(`${prefix} (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  if (strict) process.exit(1);
} else {
  console.log("Data health passed: freshness and release statuses are current.");
}
