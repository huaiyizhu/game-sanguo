import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "./home-landing.css";

const HERO_SRC = "/images/home-hero.png";

export default function Home() {
  const { user, logout } = useAuth();
  const [heroOk, setHeroOk] = useState(true);

  return (
    <div className="home-landing">
      <div className="home-landing__bg-wrap" aria-hidden>
        {heroOk ? (
          <img
            className="home-landing__bg-img"
            src={HERO_SRC}
            alt=""
            decoding="async"
            onError={() => setHeroOk(false)}
          />
        ) : (
          <div className="home-landing__bg-fallback" />
        )}
      </div>
      <div className="home-landing__veil" aria-hidden />
      <div className="home-landing__fire" aria-hidden />
      <div className="home-landing__vigor" aria-hidden />
      <div className="home-landing__embers" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} />
        ))}
      </div>

      <main className="home-landing__main">
        <header className="home-landing__header">
          <h1 className="home-landing__title">三国</h1>
          <p className="home-landing__subtitle">——铁马金戈 志吞山河——</p>
          <p className="home-landing__war-cry">是英雄，便来战</p>
        </header>

        <nav className="home-landing__panel" aria-label="主导航">
          <div className="home-landing__cta-row">
            <Link className="home-landing__cta-battle" to="/prelude">
              进入游戏
            </Link>
            {user ? (
              <>
                <p className="home-landing__user">{user.username}</p>
                <button type="button" className="btn ghost home-landing__logout" onClick={logout}>
                  退出登录
                </button>
              </>
            ) : (
              <div className="home-landing__cta-sub">
                <Link className="home-landing__cta-link" to="/login">
                  登录
                </Link>
                <Link className="home-landing__cta-link" to="/register">
                  注册
                </Link>
              </div>
            )}
          </div>
        </nav>
      </main>
    </div>
  );
}
