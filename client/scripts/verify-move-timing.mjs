/**
 * 校验走格滑步与逻辑步间隔一致，避免改 battle.ts 后漏改 GamePage/CSS 导致跳帧。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const battlePath = path.join(__dirname, "../src/game/battle.ts");
const battle = fs.readFileSync(battlePath, "utf8");

function exportConstLine(name) {
  const m = battle.match(new RegExp(`^export const ${name} = (.+);\\s*$`, "m"));
  assert.ok(m, `missing export const ${name} in battle.ts`);
  return m[1].trim();
}

const slideMs = Number(exportConstLine("MOVE_SLIDE_DURATION_MS"));
assert.ok(Number.isFinite(slideMs) && slideMs > 0, "MOVE_SLIDE_DURATION_MS must be positive number");

const fallbackExpr = exportConstLine("MOVE_SLIDE_FALLBACK_MS");
assert.equal(fallbackExpr, "MOVE_SLIDE_DURATION_MS + 32");

const playerStep = exportConstLine("MOVE_STEP_MS_PLAYER");
const enemyStep = exportConstLine("MOVE_STEP_MS_ENEMY");
assert.equal(playerStep, "MOVE_SLIDE_DURATION_MS");
assert.equal(enemyStep, "MOVE_SLIDE_DURATION_MS");

const spritesPath = path.join(__dirname, "../src/game/troopWalkSprites.ts");
const sprites = fs.readFileSync(spritesPath, "utf8");
assert.match(
  sprites,
  /import\s*\{\s*MOVE_SLIDE_DURATION_MS\s*\}\s*from\s*["']\.\/battle["']/,
  "troopWalkSprites must import MOVE_SLIDE_DURATION_MS from ./battle",
);

console.log("verify-move-timing: ok (slide %d ms, steps alias slide)", slideMs);
