import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Visaogeral from "./pages/Visaogeral";
import Setores from "./pages/Setores";
import Usuarios from "./pages/Usuarios";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.host.includes("localhost")
    ? "http://localhost:3000/api"
    : "https://dash-backend-vhh1.onrender.com/api");


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

