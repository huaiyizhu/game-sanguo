import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const storePath = path.join(dataDir, "store.json");

/** @typedef {{ id: number, username: string, password_hash: string }} UserRow */
/** @typedef {{ id: number, user_id: number, slot_name: string, payload: string, updated_at: string }} SaveRow */
/** @typedef {{ users: UserRow[], saves: SaveRow[], nextUserId: number, nextSaveId: number }} Store */

function emptyStore() {
  return { users: [], saves: [], nextUserId: 1, nextSaveId: 1 };
}

/** @returns {Store} */
function readStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    const s = emptyStore();
    fs.writeFileSync(storePath, JSON.stringify(s, null, 2), "utf8");
    return s;
  }
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const o = JSON.parse(raw);
    if (!o.users || !o.saves) return emptyStore();
    return {
      users: o.users,
      saves: o.saves,
      nextUserId: o.nextUserId ?? 1,
      nextSaveId: o.nextSaveId ?? 1,
    };
  } catch {
    return emptyStore();
  }
}

/** @param {Store} s */
function writeStore(s) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(s, null, 2), "utf8");
}

export function createUser(username, passwordHash) {
  const s = readStore();
  if (s.users.some((u) => u.username === username)) {
    throw new Error("UNIQUE");
  }
  const id = s.nextUserId++;
  s.users.push({ id, username, password_hash: passwordHash });
  writeStore(s);
  return id;
}

export function findUserByName(username) {
  const s = readStore();
  return s.users.find((u) => u.username === username) ?? null;
}

/** @param {number} userId */
export function listSaves(userId) {
  const s = readStore();
  return s.saves
    .filter((x) => x.user_id === userId)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

/** @param {number} userId @param {string} slotName @param {unknown} payload */
export function upsertSave(userId, slotName, payload) {
  const s = readStore();
  const json = JSON.stringify(payload);
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const existing = s.saves.find((x) => x.user_id === userId && x.slot_name === slotName);
  if (existing) {
    existing.payload = json;
    existing.updated_at = now;
    writeStore(s);
    return { id: existing.id, updated_at: existing.updated_at };
  }
  const id = s.nextSaveId++;
  s.saves.push({ id, user_id: userId, slot_name: slotName, payload: json, updated_at: now });
  writeStore(s);
  return { id, updated_at: now };
}

/** @param {number} userId @param {string} slotName */
export function deleteSave(userId, slotName) {
  const s = readStore();
  const before = s.saves.length;
  s.saves = s.saves.filter((x) => !(x.user_id === userId && x.slot_name === slotName));
  writeStore(s);
  return s.saves.length < before;
}
