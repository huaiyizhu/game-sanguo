/**
 * 去掉背景与水印残留：边缘洪水填充 + 与背景色相近的晕边剔除 + 全局色键（去掉与背景同色、
 * 且与透明像素相邻的块，可清除边角水印、非连通底图）。
 * 步兵/弓兵使用更强 halo/fringe。
 * 用法：
 *   node scripts/remove-sprite-bg.mjs [输入.png 输出.png]
 *   node scripts/remove-sprite-bg.mjs --final   # 就地处理 archer/cavalry/infantry.png
 * 成品净化 + 统一画布：npm run sprites:units-final
 * 仅统一尺寸：npm run sprites:units-size
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

/** 已是 512 成品的兵种图：就地净化后再 npm run sprites:units-size */
const FINAL_UNIT_NAMES = ["archer.png", "cavalry.png", "infantry.png"];

const DX8 = [1, -1, 0, 0, 1, 1, -1, -1];
const DY8 = [0, 0, 1, -1, 1, -1, 1, -1];

/** @param {number[][]} samples */
function medianRgb(samples) {
  const med = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return [med(samples.map((c) => c[0])), med(samples.map((c) => c[1])), med(samples.map((c) => c[2]))];
}

/** @param {string} outputPath @param {{ final?: boolean }} mode */
function presetForOutput(outputPath, mode = {}) {
  const base = path.basename(outputPath, ".png");
  const final = Boolean(mode.final);
  if (base === "infantry" || base === "archer") {
    return {
      T2: final ? 72 * 72 : 58 * 58,
      HALO_T2: final ? 22 * 22 : 18 * 18,
      HALO_ITERS: final ? 12 : 8,
      fringeT2: final ? 48 * 48 : 42 * 42,
      fringeIters: final ? 6 : 4,
      globalChromaG2: final ? 78 * 78 : 62 * 62,
      globalChromaIters: final ? 4 : 2,
      alphaDustMax: final ? 36 : 24,
    };
  }
  return {
    T2: final ? 68 * 68 : 52 * 52,
    HALO_T2: final ? 26 * 26 : 24 * 24,
    HALO_ITERS: final ? 10 : 5,
    fringeT2: final ? 40 * 40 : 34 * 34,
    fringeIters: final ? 4 : 2,
    globalChromaG2: final ? 75 * 75 : 58 * 58,
    globalChromaIters: final ? 4 : 2,
    alphaDustMax: final ? 36 : 24,
  };
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{ final?: boolean }} opts
 */
async function removeSpriteBackground(inputPath, outputPath, opts = {}) {
  const final = Boolean(opts.final);
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const out = Buffer.from(data);
  const pr = presetForOutput(outputPath, opts);

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

  const edgeSamples = [];
  for (let x = 0; x < w; x++) {
    edgeSamples.push(rgbAt(x));
    edgeSamples.push(rgbAt((h - 1) * w + x));
  }
  for (let y = 0; y < h; y++) {
    edgeSamples.push(rgbAt(y * w));
    edgeSamples.push(rgbAt(y * w + w - 1));
  }

  const bg = final ? medianRgb(edgeSamples) : [
    edgeSamples.reduce((s, c) => s + c[0], 0) / edgeSamples.length,
    edgeSamples.reduce((s, c) => s + c[1], 0) / edgeSamples.length,
    edgeSamples.reduce((s, c) => s + c[2], 0) / edgeSamples.length,
  ];

  const { T2, HALO_T2, HALO_ITERS, fringeT2, fringeIters, globalChromaG2, globalChromaIters, alphaDustMax } =
    pr;

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

  /* 极低 alpha 的杂点（常见水印半透明底）直接透明 */
  for (let p = 0; p < w * h; p++) {
    const a = out[p * 4 + 3];
    if (a > 0 && a < alphaDustMax) out[p * 4 + 3] = 0;
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

  function neighbor4Clear(p) {
    const x = p % w;
    const y = (p / w) | 0;
    if (x + 1 < w && alphaAt(p + 1) === 0) return true;
    if (x > 0 && alphaAt(p - 1) === 0) return true;
    if (y + 1 < h && alphaAt(p + w) === 0) return true;
    if (y > 0 && alphaAt(p - w) === 0) return true;
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

  /* 全局色键：与背景色足够接近且与透明区相邻（4 邻）的像素反复剔除，去掉水印字、孤岛底 */
  const G2 = globalChromaG2;
  for (let round = 0; round < globalChromaIters; round++) {
    const kill = [];
    for (let p = 0; p < w * h; p++) {
      if (alphaAt(p) === 0) continue;
      if (dist2(rgbAt(p), bg) > G2) continue;
      if (neighbor4Clear(p)) kill.push(p);
    }
    for (const p of kill) out[p * 4 + 3] = 0;
  }

  /* 再一轮 halo，吃掉色键后露出的薄边 */
  for (let iter = 0; iter < Math.min(4, HALO_ITERS); iter++) {
    const kill = [];
    for (let p = 0; p < w * h; p++) {
      if (alphaAt(p) === 0) continue;
      if (dist2(rgbAt(p), bg) > HALO_T2) continue;
      if (neighbor8Clear(p)) kill.push(p);
    }
    for (const p of kill) out[p * 4 + 3] = 0;
  }

  /* 半透明 + 近背景色：常见叠加水印字 */
  if (final) {
    const WM_G2 = 55 * 55;
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      const a = out[i + 3];
      if (a === 0 || a >= 248) continue;
      if (dist2([out[i], out[i + 1], out[i + 2]], bg) <= WM_G2) out[i + 3] = 0;
    }
  }

  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  console.log(
    "Wrote",
    outputPath,
    `(${w}x${h}, flood ${cleared} px, bg≈rgb(${bg.map((n) => n.toFixed(0)).join(",")}), ${final ? "final" : "default"})`
  );
}

const argv = process.argv.slice(2);
const isFinal = argv.includes("--final");
const posArgs = argv.filter((a) => !a.startsWith("--"));

if (posArgs.length >= 2) {
  const argIn = posArgs[0];
  const argOut = posArgs[1];
  if (!fs.existsSync(argIn)) {
    console.error("Missing:", argIn);
    process.exit(1);
  }
  await removeSpriteBackground(path.resolve(argIn), path.resolve(argOut), { final: isFinal });
} else if (isFinal) {
  for (const name of FINAL_UNIT_NAMES) {
    const p = path.join(unitsDir, name);
    if (!fs.existsSync(p)) {
      console.warn("Skip (missing):", p);
      continue;
    }
    const tmp = path.join(unitsDir, `.${name}.tmp.png`);
    await removeSpriteBackground(p, tmp, { final: true });
    await fs.promises.rename(tmp, p);
    console.log("In place:", name);
  }
} else {
  for (const [srcName, outName] of DEFAULT_JOBS) {
    const input = path.join(unitsDir, srcName);
    const output = path.join(unitsDir, outName);
    if (!fs.existsSync(input)) {
      console.warn("Skip (no source):", input);
      continue;
    }
    await removeSpriteBackground(input, output, { final: false });
  }
}
