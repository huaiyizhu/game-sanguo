/**
 * 列出所有将领图鉴 id，对应头像文件名 {id}.png
 * 运行：npm run avatars:list-ids
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const generalsPath = path.join(__dirname, "../src/game/generals.ts");
const t = fs.readFileSync(generalsPath, "utf8");

const famous = [...t.matchAll(/G\("([^"]+)"/g)].map((m) => m[1]);
const m = t.match(/const NPC_SPEC =\s*\n?\s*"((?:[^"\\]|\\.)*)"/s);
if (!m) {
  console.error("Could not parse NPC_SPEC");
  process.exit(1);
}
const specBody = m[1].replace(/\\"/g, '"');
const parts = specBody.split("|");
const npcIds = [];
for (let i = 0; i + 3 < parts.length; i += 4) {
  const name = parts[i];
  const idx = npcIds.length;
  npcIds.push(`npc_${String(idx + 1).padStart(3, "0")}_${name.replace(/\s/g, "")}`);
}

const all = [...new Set([...famous, ...npcIds])].sort();
for (const id of all) {
  console.log(id);
}
console.error(`\n共 ${all.length} 个 id → 放置 client/public/sprites/avatars/{id}.png`);
