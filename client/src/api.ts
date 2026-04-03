const TOKEN_KEY = "sanguo_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function parseJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || res.statusText };
  }
}

export async function apiRegister(username: string, password: string) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || "注册失败");
  return data as { token: string; user: { id: number; username: string } };
}

export async function apiLogin(username: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || "登录失败");
  return data as { token: string; user: { id: number; username: string } };
}

export async function apiMe(token: string) {
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || "会话无效");
  return data as { user: { id: number; username: string } };
}

export type ServerSaveRow = {
  id: number;
  slotName: string;
  updatedAt: string;
  payload: unknown;
};

export async function apiListSaves(token: string) {
  const res = await fetch("/api/saves", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || "读取存档失败");
  return data as { saves: ServerSaveRow[] };
}

export async function apiPutSave(token: string, slotName: string, payload: unknown) {
  const enc = encodeURIComponent(slotName);
  const res = await fetch(`/api/saves/${enc}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ payload }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || "保存失败");
  return data as { id: number; slotName: string; updatedAt: string };
}

export async function apiDeleteSave(token: string, slotName: string) {
  const enc = encodeURIComponent(slotName);
  const res = await fetch(`/api/saves/${enc}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || "删除失败");
  return data as { deleted: boolean };
}
