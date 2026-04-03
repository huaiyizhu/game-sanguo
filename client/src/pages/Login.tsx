import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
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
      await login(username.trim(), password);
      nav("/");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page auth">
      <h1>登录</h1>
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          用户名
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={2}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            minLength={6}
          />
        </label>
        {err && <p className="error">{err}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
      <p>
        没有账号？<Link to="/register">注册</Link>
      </p>
      <p>
        <Link to="/">返回首页</Link>
      </p>
    </div>
  );
}
