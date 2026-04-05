/** 将领头像：渐变底色 + 姓名首字（无外部图片资源，每人仍可有独特配色） */

export function portraitInitial(name: string): string {
  const s = name.trim();
  if (!s) return "?";
  const first = [...s][0];
  return first ?? "?";
}

export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** 势力主色相（HSL 色相 0–359） */
export function factionHue(faction: string): number {
  const f = faction.trim();
  if (f.includes("蜀")) return 142;
  if (f.includes("魏")) return 218;
  if (f.includes("吴")) return 198;
  if (f.includes("黄巾")) return 48;
  if (f.includes("董")) return 278;
  if (f.includes("吕")) return 352;
  if (f.includes("袁")) return 28;
  if (f.includes("汉")) return 42;
  return -1;
}

export function avatarGradientStyle(
  seed: string,
  faction: string
): { background: string; boxShadow: string } {
  let h0 = factionHue(faction);
  if (h0 < 0) {
    h0 = hashSeed(seed) % 360;
  }
  const h1 = (h0 + (hashSeed(seed) % 50) - 25 + 360) % 360;
  const h2 = (h0 + (hashSeed(`${seed}|b`) % 40) - 15 + 360) % 360;
  const background = `linear-gradient(145deg, hsl(${h1} 52% 26%) 0%, hsl(${h2} 46% 42%) 100%)`;
  const boxShadow = `0 0 0 2px hsla(${h0} 58% 50% / 0.5), 0 2px 10px rgba(0,0,0,0.5)`;
  return { background, boxShadow };
}
