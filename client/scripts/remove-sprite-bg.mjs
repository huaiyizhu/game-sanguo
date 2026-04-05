/**
 * 去掉与边缘连通的背景，输出透明 PNG。
 * 步兵/弓兵使用更强参数 + 全边缘平均色 + fringe，抠得更干净。
 * 用法：node scripts/remove-sprite-bg.mjs [输入.png 输出.png]
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const unitsDir = path.join(root, "public/sprites/units");

const DEFAULT_JOBS = [
  ["cavalry-source.png", "cavalry.png"],
  ["infantry-source.png", "infantry.png"],
  ["archer-source.png", "archer.png"],
];

const DX8 = [1, -1, 0, 0, 1, 1, -1, -1];
const DY8 = [0, 0, 1, -1, 1, -1, 1, -1];

/** @param {string} outputPath */
function presetForOutput(outputPath) {
  const base = path.basename(outputPath, ".png");
  if (base === "infantry" || base === "archer") {
    return {
      T2: 58 * 58,
      HALO_T2: 18 * 18,
      HALO_ITERS: 8,
      fringeT2: 42 * 42,
      fringeIters: 4,
    };
  }
  return {
    T2: 52 * 52,
    HALO_T2: 24 * 24,
    HALO_ITERS: 5,
    fringeT2: 34 * 34,
    fringeIters: 2,
  };
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 */
async function removeSpriteBackground(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const out = Buffer.from(data);
  const pr = presetForOutput(outputPath);

  function rgbAt(p) {
    const i = p * 4;
    return [out[i], out[i + 1], out[i + 2]];
  }

  function dist2(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  /** 整条外圈像素平均，比四角更贴渐变/脏边背景 */
  const edgeSamples = [];
  for (let x = 0; x < w; x++) {
    edgeSamples.push(rgbAt(x));
    edgeSamples.push(rgbAt((h - 1) * w + x));
  }
  for (let y = 0; y < h; y++) {
    edgeSamples.push(rgbAt(y * w));
    edgeSamples.push(rgbAt(y * w + w - 1));
  }
  const n = edgeSamples.length;
  const bg = [
    edgeSamples.reduce((s, c) => s + c[0], 0) / n,
    edgeSamples.reduce((s, c) => s + c[1], 0) / n,
    edgeSamples.reduce((s, c) => s + c[2], 0) / n,
  ];

  const { T2, HALO_T2, HALO_ITERS, fringeT2, fringeIters } = pr;

  function matchesBg(p) {
    return dist2(rgbAt(p), bg) <= T2;
  }

  const visited = new Uint8Array(w * h);
  const q = [];

  function tryPush(p) {
    if (p < 0 || p >= w * h || visited[p]) return;
    if (!matchesBg(p)) return;
    visited[p] = 1;
    q.push(p);
  }

  for (let x = 0; x < w; x++) {
    tryPush(x);
    tryPush((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    tryPush(y * w);
    tryPush(y * w + w - 1);
  }

  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    const x = p % w;
    const y = (p / w) | 0;
    if (x + 1 < w) tryPush(p + 1);
    if (x > 0) tryPush(p - 1);
    if (y + 1 < h) tryPush(p + w);
    if (y > 0) tryPush(p - w);
  }

  let cleared = 0;
  for (let p = 0; p < w * h; p++) {
    if (visited[p]) {
      out[p * 4 + 3] = 0;
      cleared++;
    }
  }

  function alphaAt(p) {
    return out[p * 4 + 3];
  }

  function neighbor8Clear(p) {
    const x = p % w;
    const y = (p / w) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX8[k];
      const ny = y + DY8[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true;
      if (alphaAt(ny * w + nx) === 0) return true;
    }
    return false;
  }

  for (let iter = 0; iter < HALO_ITERS; iter++) {
    const kill = [];
    for (let p = 0; p < w * h; p++) {
      if (alphaAt(p) === 0) continue;
      if (dist2(rgbAt(p), bg) > HALO_T2) continue;
      if (neighbor8Clear(p)) kill.push(p);
    }
    for (const p of kill) out[p * 4 + 3] = 0;
  }

  for (let iter = 0; iter < fringeIters; iter++) {
    const kill = [];
    for (let p = 0; p < w * h; p++) {
      if (alphaAt(p) === 0) continue;
      if (dist2(rgbAt(p), bg) > fringeT2) continue;
      if (neighbor8Clear(p)) kill.push(p);
    }
    for (const p of kill) out[p * 4 + 3] = 0;
  }

  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  console.log(
    "Wrote",
    outputPath,
    `(${w}x${h}, flood ${cleared} px, bg≈rgb(${bg.map((n) => n.toFixed(0)).join(",")}), preset ${path.basename(outputPath, ".png")})`
  );
}

const argIn = process.argv[2];
const argOut = process.argv[3];

if (argIn && argOut) {
  if (!fs.existsSync(argIn)) {
    console.error("Missing:", argIn);
    process.exit(1);
  }
  await removeSpriteBackground(path.resolve(argIn), path.resolve(argOut));
} else {
  for (const [srcName, outName] of DEFAULT_JOBS) {
    const input = path.join(unitsDir, srcName);
    const output = path.join(unitsDir, outName);
    if (!fs.existsSync(input)) {
      console.warn("Skip (no source):", input);
      continue;
    }
    await removeSpriteBackground(input, output);
  }
}
