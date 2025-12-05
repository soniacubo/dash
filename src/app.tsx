import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Visaogeral from "./pages/Visaogeral";
import Setores from "./pages/Setores";
import Usuarios from "./pages/Usuarios";
import Solicitacoes from "./pages/solicitacoes";

export function resolveApiBase() {
  const origin = window.location.origin;

  // LOCALHOST → usa o backend local
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return "http://localhost:3000/api";
  }

  // PRODUÇÃO → backend Render
  return "https://dash-backend-vhhl.onrender.com/api";
}

export const API_BASE_URL = resolveApiBase();

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/visaogeral" replace />} />

        {/* Rotas principais */}
        <Route path="/visaogeral" element={<Visaogeral />} />
        <Route path="/setores" element={<Setores />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/solicitacoes" element={<Solicitacoes />} />

        {/* fallback opcional */}
        <Route path="*" element={<Navigate to="/visaogeral" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
