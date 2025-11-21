import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Visaogeral from "./pages/Visaogeral";
import Setores from "./pages/Setores";
import Usuarios from "./pages/Usuarios";

export function resolveApiBase(){
  const loc = window.location as Location;
  const origin = (loc as any).origin || `${loc.protocol}//${loc.host}`;
  if (origin.includes(":3000")) return `${origin}/api`;
  return `${loc.protocol}//${loc.hostname}:3000/api`;
}

export const API_BASE_URL = resolveApiBase();

export default function App(){
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/visaogeral" replace />} />
        <Route path="/visaogeral" element={<Visaogeral />} />
        <Route path="/setores" element={<Setores />} />
        <Route path="/usuarios" element={<Usuarios />} />
      </Routes>
    </BrowserRouter>
  );
}

