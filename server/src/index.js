import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { signToken, verifyToken } from "./auth.js";
import * as store from "./store.js";

const app = express();
const PORT = Number(process.env.PORT) || 8787;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload?.sub) {
    return res.status(401).json({ error: "未登录或令牌无效" });
  }
  req.user = { id: Number(payload.sub), username: payload.username };
  next();
}

app.post("/api/auth/register", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (username.length < 2 || username.length > 32) {
    return res.status(400).json({ error: "用户名长度为 2–32 个字符" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "密码至少 6 位" });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const id = store.createUser(username, hash);
    const token = signToken(id, username);
    return res.json({ token, user: { id, username } });
  } catch (e) {
    if (e instanceof Error && e.message === "UNIQUE") {
      return res.status(409).json({ error: "用户名已存在" });
    }
    throw e;
  }
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const row = store.findUserByName(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }
  const token = signToken(row.id, username);
  res.json({ token, user: { id: row.id, username } });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

app.get("/api/saves", authMiddleware, (req, res) => {
  const rows = store.listSaves(req.user.id);
  res.json({
    saves: rows.map((r) => ({
      id: r.id,
      slotName: r.slot_name,
      updatedAt: r.updated_at,
      payload: JSON.parse(r.payload),
    })),
  });
});

app.put("/api/saves/:slotName", authMiddleware, (req, res) => {
  const slotName = decodeURIComponent(req.params.slotName);
  if (!slotName || slotName.length > 64) {
    return res.status(400).json({ error: "存档槽名称无效" });
  }
  const payload = req.body?.payload;
  if (payload === undefined) {
    return res.status(400).json({ error: "缺少 payload" });
  }
  const row = store.upsertSave(req.user.id, slotName, payload);
  res.json({ id: row.id, slotName, updatedAt: row.updated_at });
});

app.delete("/api/saves/:slotName", authMiddleware, (req, res) => {
  const slotName = decodeURIComponent(req.params.slotName);
  const deleted = store.deleteSave(req.user.id, slotName);
  res.json({ deleted });
});

app.get("/api/health", (_, res) => res.json({ ok: true }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(staticDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(staticDir, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`三国英杰传 http://localhost:${PORT}`);
});
