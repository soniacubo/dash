import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";

type UserCounter = {
  total_servidores: number;
  ativos_24h: number;
  inativos_30d: number;
  online_agora: number;
  criados_ultimo_mes: number;
};

export default function Usuarios(){
  const [stats, setStats] = useState<UserCounter | null>(null);
  const loginChartRef = useRef<HTMLCanvasElement|null>(null);
  const loginChart = useRef<Chart|null>(null);
  const despachosRef = useRef<HTMLCanvasElement|null>(null);
  const despachosChart = useRef<Chart|null>(null);
  const [inicio, setInicio] = useState<string>("");
  const [fim, setFim] = useState<string>("");

  useEffect(() => {
    async function load(){
      try {
        const r = await fetch(`${API_BASE_URL}/usuarios/estatisticas`);
        const s = await r.json();
        setStats(s);
      } catch {}
    }
    load();
  }, []);

  useEffect(() => {
    async function loginDistribuicao(){
      const r = await fetch(`${API_BASE_URL}/indicadores/login-distribuicao`);
      const d = await r.json();
      const labels = d.map((x: any) => x.label);
      const valores = d.map((x: any) => Number(x.total||0));
      if (!loginChartRef.current) return;
      if (loginChart.current) loginChart.current.destroy();
      loginChart.current = new Chart(loginChartRef.current, {
        type: "bar",
        data: { labels, datasets: [{ label: "Logins", data: valores, backgroundColor: "#2563eb" }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
      });
    }
    loginDistribuicao();
    return () => { if (loginChart.current) loginChart.current.destroy(); };
  }, []);

  useEffect(() => {
    const hoje = new Date();
    const fimIso = hoje.toISOString().slice(0,10);
    const ini = new Date(hoje.getTime() - 29*24*60*60*1000);
    const iniIso = ini.toISOString().slice(0,10);
    setInicio(iniIso);
    setFim(fimIso);
  }, []);

  async function carregarRanking(){
    const r = await fetch(`${API_BASE_URL}/ranking-despachos?inicio=${inicio}&fim=${fim}`);
    const d = await r.json();
    const labels = d.map((x: any) => x.nome);
    const valores = d.map((x: any) => Number(x.total||0));
    if (!despachosRef.current) return;
    if (despachosChart.current) despachosChart.current.destroy();
    despachosChart.current = new Chart(despachosRef.current, {
      type: "bar",
      data: { labels, datasets: [{ label: "Despachos", data: valores, backgroundColor: "#10b981" }] },
      options: { indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
    });
  }

  return (
    <main className="main-container">
      <header className="top-nav" role="banner">
        <div className="top-nav-left">
          <img src="/cc.png" className="top-logo" alt="Cidade Conectada" />
        </div>
        <nav className="top-nav-center" aria-label="Navegação principal">
          <div className="top-nav-items">
            <Link to="/visaogeral" className="nav-item">Visão Geral</Link>
            <Link to="/setores" className="nav-item">Setores</Link>
            <Link to="/usuarios" className="nav-item active">Usuários</Link>
          </div>
        </nav>
        <div className="top-nav-right" />
      </header>

      <section className="dash-section" style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",textAlign:"center",padding:"12px 0"}}>
          <div>
            <h2 style={{margin:0,fontSize:"1.45rem",fontWeight:700}}>Análise de Usuários (Servidores)</h2>
          </div>
        </div>
      </section>

      <div className="card-deck" id="user-counters">
        <div className="user-stat-card">Total de Servidores:<strong id="card-total-servidores">{stats?.total_servidores ?? "—"}</strong></div>
        <div className="user-stat-card">Ativos últimas 24h:<strong id="card-ativos-24h">{stats?.ativos_24h ?? "—"}</strong></div>
        <div className="user-stat-card">Inativos há mais de 30 dias:<strong id="card-inativos-30d">{stats?.inativos_30d ?? "—"}</strong></div>
        <div className="user-stat-card">Online Agora:<strong id="card-online-agora">{stats?.online_agora ?? "—"}</strong></div>
        <div className="user-stat-card">Criados no último mês:<strong id="card-criados-ultimo-mes">{stats?.criados_ultimo_mes ?? "—"}</strong></div>
      </div>

      <section className="dash-section">
        <div className="login-distribuicao-card">
          <div className="grafico-titulo">Distribuição de Logins</div>
          <div className="grafico-sub">Últimas 24h</div>
          <div className="grafico-container" style={{height:300}}>
            <canvas ref={loginChartRef}></canvas>
          </div>
        </div>
      </section>

      <section className="dash-section">
        <div className="ranking-title">Ranking de Despachos</div>
        <div className="ranking-filter">
          <input type="date" value={inicio} onChange={(e)=>setInicio(e.target.value)} />
          <input type="date" value={fim} onChange={(e)=>setFim(e.target.value)} />
          <button className="btn-primary" onClick={carregarRanking}>Aplicar</button>
        </div>
        <div className="ranking-chart-wrapper">
          <canvas ref={despachosRef}></canvas>
        </div>
      </section>
      <footer style={{marginTop:20,textAlign:"center",fontSize:12,color:"#6b7280"}}>
        Cidade Conectada — BI Dashboard
      </footer>
    </main>
  );
}
