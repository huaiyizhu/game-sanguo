/**
 * 将领头像图片路径：放置于 public/sprites/avatars/
 * 优先 catalogId.png，其次按姓名（便于无图鉴 id 的杂兵配同名图）。
 */
const base = import.meta.env.BASE_URL;
const root = base.endsWith("/") ? `${base}sprites/avatars/` : `${base}/sprites/avatars/`;

function slugName(name: string): string {
  const t = name.trim();
  if (!t) return "";
  return t.replace(/[/\\:*?"<>|]/g, "_");
}

/** 依次尝试加载，全部 404 则 UI 回退到字头像 */
export function portraitImageCandidates(
  catalogId: string | null | undefined,
  name: string
): string[] {
  const urls: string[] = [];
  if (catalogId) {
    urls.push(`${root}${encodeURIComponent(catalogId)}.png`);
  }
  const sn = slugName(name);
  if (sn) {
    urls.push(`${root}name_${encodeURIComponent(sn)}.png`);
  }
  return urls;
}
