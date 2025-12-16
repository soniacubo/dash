import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Visaogeral from "./pages/Visaogeral";
import Setores from "./pages/Setores";
import Usuarios from "./pages/Usuarios";
import Solicitacoes from "./pages/Solicitacoes";
import Avaliacoes from "./pages/Avaliacoes";

/* ============================================================
   RESOLVE API BASE — LOCAL, VERCEL, RENDER
============================================================ */
export function resolveApiBase() {
  const origin = window.location.origin;

  // 🔥 Rodando LOCAL (127, localhost, portas do Vite)
  const isLocal =
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("5173") ||
    origin.includes("5174") ||
    origin.includes("4173") ||
    origin.includes("4174");

  if (isLocal) {
    return "http://localhost:3000/api"; // backend local
  }

  // 🔥 Produção (Vercel front → Render backend)
  return "https://dash-backend-vhhl.onrender.com/api";
}

export const API_BASE_URL = resolveApiBase();

/* ============================================================
   APP
============================================================ */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirecionamento inicial */}
        <Route path="/" element={<Navigate to="/visaogeral" replace />} />

        {/* Rotas principais */}
        <Route path="/visaogeral" element={<Visaogeral />} />
        <Route path="/setores" element={<Setores />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/solicitacoes" element={<Solicitacoes />} />
        <Route path="/avaliacoes" element={<Avaliacoes />} />

        {/* Rota fallback */}
        <Route path="*" element={<Navigate to="/visaogeral" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
