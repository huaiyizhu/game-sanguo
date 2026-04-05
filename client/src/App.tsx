import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import GameIntro from "./pages/GameIntro";
import GamePage from "./pages/GamePage";

export default function App() {
  const { ready } = useAuth();
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
