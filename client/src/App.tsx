import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import GameIntro from "./pages/GameIntro";
import GamePage from "./pages/GamePage";

export default function App() {
  const { ready } = useAuth();

  useEffect(() => {
    const preventContextMenu = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", preventContextMenu);

    const allowNativeTextInteraction = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(
          'input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), select:not([disabled]), [contenteditable="true"], [contenteditable="plaintext-only"]'
        )
      );
    };

    const onSelectStart = (e: Event) => {
      if (!allowNativeTextInteraction(e.target)) e.preventDefault();
    };
    const onDragStart = (e: Event) => {
      if (!allowNativeTextInteraction(e.target)) e.preventDefault();
    };

    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("dragstart", onDragStart);

    return () => {
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("dragstart", onDragStart);
    };
  }, []);
  if (!ready) {
    return (
      <div className="app-loading">
        <p>载入中…</p>
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/prelude" element={<GameIntro />} />
      <Route path="/game" element={<GamePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
