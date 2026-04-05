/**
 * 将 archer / cavalry / infantry 统一为固定画布（默认 512×512）、透明底、等比缩放居中，
 * 立绘靠下对齐，便于格内与 TroopEmblem 表现一致。
 * 用法：node scripts/normalize-unit-sprites.mjs [边长，默认 512]
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const unitsDir = path.join(root, "public/sprites/units");

const SIZE = Math.max(64, Math.min(2048, parseInt(process.argv[2] || "512", 10) || 512));
const FILES = ["archer.png", "cavalry.png", "infantry.png"];

for (const name of FILES) {
  const inputPath = path.join(unitsDir, name);
  if (!fs.existsSync(inputPath)) {
    console.warn("Skip (missing):", inputPath);
    continue;
  }

  const buf = await sharp(inputPath)
    .ensureAlpha()
    .trim()
    .resize(SIZE, SIZE, {
      fit: "contain",
      position: "bottom",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await fs.promises.writeFile(inputPath, buf);
  const meta = await sharp(buf).metadata();
  console.log("Wrote", name, `${meta.width}×${meta.height}`, `(canvas ${SIZE}×${SIZE}, transparent)`);
}
