import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Home() {
  const { user, logout } = useAuth();
  return (
    <div className="page home">
      <header className="hero">
        <h1>三国英杰传</h1>
        <p className="tagline">网页版 · 序章试玩</p>
      </header>
      <nav className="home-actions">
        <Link className="btn primary" to="/game">
          进入战场
        </Link>
        {user ? (
          <>
            <p className="user-line">
              已登录：<strong>{user.username}</strong>
            </p>
            <button type="button" className="btn ghost" onClick={logout}>
              退出登录
            </button>
          </>
        ) : (
          <>
            <Link className="btn" to="/login">
              登录
            </Link>
            <Link className="btn" to="/register">
              注册
            </Link>
            <p className="hint">登录后可将存档同步到服务器；未登录也可本地游玩。</p>
          </>
        )}
      </nav>
      <section className="rules">
        <h2>操作说明</h2>
        <ul>
          <li>回合制战棋：点击尚未行动的我军单位，蓝色格为可移动范围，再点目标格移动。</li>
          <li>不想移动时，在移动阶段再点同一武将或脚下格子可原地打开菜单。移动后同样弹出菜单；多目标时方向键或鼠标选敌，Enter 或点击确认。</li>
          <li>Esc 或右键：选目标时返回菜单；在菜单时撤销本武将本回合操作并恢复回合初位置与状态。</li>
          <li>三名武将全数行动完毕后进入敌军回合。</li>
        </ul>
      </section>
    </div>
  );
}
