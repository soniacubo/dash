import { NavLink } from "react-router-dom";

export default function Header() {
  return (
    <header className="top-nav" role="banner">
      <div className="top-nav-left">
        <img src="/cc.png" className="top-logo" alt="Cidade Conectada" />
      </div>

      <nav className="top-nav-center" aria-label="Navegação principal">
        <div className="top-nav-items">

          <NavLink
            to="/visaogeral"
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            Visão Geral
          </NavLink>

          <NavLink
            to="/setores"
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            Setores
          </NavLink>

          <NavLink
            to="/usuarios"
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            Usuários
          </NavLink>

          <NavLink
            to="/solicitacoes"
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            Solicitações
          </NavLink>

          <NavLink
            to="/avaliacoes"
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            Avaliações
          </NavLink>

          

        </div>
      </nav>

      <div className="top-nav-right" />
    </header>
  );
}
