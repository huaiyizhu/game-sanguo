import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await register(username.trim(), password);
      nav("/");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "注册失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page auth">
      <h1>注册</h1>
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          用户名（2–32 字符）
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={2}
            maxLength={32}
          />
        </label>
        <label>
          密码（至少 6 位）
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </label>
        {err && <p className="error">{err}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "注册中…" : "注册并登录"}
        </button>
      </form>
      <p>
        已有账号？<Link to="/login">登录</Link>
      </p>
      <p>
        <Link to="/">返回首页</Link>
      </p>
    </div>
  );
}
