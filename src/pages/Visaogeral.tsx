import { useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";

export default function Visaogeral(){
  const fmt = useMemo(() => new Intl.NumberFormat("pt-BR"), []);
  const evolucaoRef = useRef<HTMLCanvasElement|null>(null);
  const chartRef = useRef<Chart|null>(null);
  const perfilRef = useRef<HTMLCanvasElement|null>(null);
  const perfilChart = useRef<Chart|null>(null);
  const [anos, setAnos] = useState<number[]>([]);
  const [anoSel, setAnoSel] = useState<number>(new Date().getFullYear());
  const [economiaRows, setEconomiaRows] = useState<{mes_iso:string, solicitacoes_mes:number, economia_estimativa:number}[]>([]);

  useEffect(() => {
    async function carregar(){
      const r = await fetch(`${API_BASE_URL}/visao-geral/contadores`);
      const k = await r.json();
      const set = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("vg-servicos", fmt.format(k.total_servicos || 0));
      set("vg-usuarios", fmt.format(k.total_usuarios || 0));
      set("vg-cidadaos-total", fmt.format(k.total_cidadaos || 0));
      set("vg-setores", fmt.format(k.total_setores || 0));
      set("vg-eficiencia", `${Number(k.eficiencia_pct||0).toFixed(1)}%`);
      set("vg-qualidade", Number(k.qualidade_media||0) > 0 ? Number(k.qualidade_media||0).toFixed(2) : "—");
    }
    carregar();
  }, [fmt]);

  useEffect(() => {
    async function cidadaos(){
      const r = await fetch(`${API_BASE_URL}/visao-geral/cidadaos-resumo`);
      const c = await r.json();
      const set = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("vg-cidadaos-homens", fmt.format(c.homens || 0));
      set("vg-cidadaos-mulheres", fmt.format(c.mulheres || 0));
      const idade = c.idade_media != null ? Number(c.idade_media) : null;
      set("vg-idade-media", idade != null ? `${idade.toFixed(0)} anos` : "—");
      set("vg-publico-homens", fmt.format(c.homens || 0));
      set("vg-publico-mulheres", fmt.format(c.mulheres || 0));
      set("vg-publico-idade", idade != null ? `${idade.toFixed(0)} anos` : "—");
    }
    cidadaos();
  }, [fmt]);

  useEffect(() => {
    async function evolucao(){
      const r = await fetch(`${API_BASE_URL}/visao-geral/evolucao-uso`);
      const data = await r.json();
      if (!evolucaoRef.current) return;
      const labels = data.map((d: any) => {
        const dt = new Date(`${d.mes_iso}T00:00:00`);
        return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(dt).replace(".", "");
      });
      const abertas = data.map((d: any) => Number(d.abertas||0));
      const concluidas = data.map((d: any) => Number(d.concluidas||0));
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new Chart(evolucaoRef.current, {
        type: "line",
        data: { labels, datasets: [
          { label: "Abertas", data: abertas, borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.12)", borderWidth: 2, pointRadius: 2, tension: .25 },
          { label: "Concluídas", data: concluidas, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,.12)", borderWidth: 2, pointRadius: 2, tension: .25, hidden: true }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
      });
    }
    evolucao();
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, []);

  useEffect(() => {
    async function perfis(){
      const r = await fetch(`${API_BASE_URL}/visao-geral/contadores`);
      const k = await r.json();
      if (!perfilRef.current) return;
      const servidores = Number(k.total_usuarios||0);
      const cidadaos = Number(k.total_cidadaos||0);
      const representantes = 45000;
      const raw = [servidores, cidadaos, representantes];
      const display = raw.map(v => Math.sqrt(Math.max(1, v)));
      if (perfilChart.current) perfilChart.current.destroy();
      perfilChart.current = new Chart(perfilRef.current, {
        type: "doughnut",
        data: {
          labels: ["Servidores", "Cidadãos", "Representantes"],
          datasets: [{
            data: display,
            backgroundColor: ["#2563eb", "#60a5fa", "#93c5fd"],
            borderColor: "#ffffff",
            borderWidth: 2,
            offset: (ctx: any) => ctx.dataIndex === 0 ? 8 : 0,
            hoverOffset: 10
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "45%",
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: (ctx: any) => {
                  const idx = ctx.dataIndex ?? 0;
                  const val = raw[idx] ?? 0;
                  return `${ctx.label}: ${fmt.format(Number(val||0))}`;
                }
              }
            }
          }
        }
      });
    }
    perfis();
    return () => { if (perfilChart.current) perfilChart.current.destroy(); };
  }, []);

  useEffect(() => {
    const y = new Date().getFullYear();
    setAnos([y, y-1, y-2, y-3, y-4]);
  }, []);

  useEffect(() => {
    async function economia(){
      const r = await fetch(`${API_BASE_URL}/visao-geral/economia?ano=${anoSel}`);
      const rows = await r.json();
      setEconomiaRows(rows||[]);
      const totEco = rows.reduce((sum: number, row: any) => sum + Number(row.economia_estimativa||0), 0);
      const el = document.getElementById("vg-economia");
      if (el) el.textContent = `R$ ${fmt.format(Number(totEco||0))}`;
    }
    economia();
  }, [anoSel, fmt]);

  return (
    <main className="main-container">
      <Header />

      <section className="dash-section" style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",textAlign:"center",padding:"12px 0"}}>
          <div>
            <h2 style={{margin:0,fontSize:"1.45rem",fontWeight:700}}>Visão Geral do Município no Cidade Conectada</h2>
            <p style={{margin:"4px 0 0",color:"#6b7280",fontSize:".95rem"}}>Panorama consolidado de uso, qualidade e economia gerada pelo sistema</p>
          </div>
        </div>
      </section>

      <section className="dash-section" aria-labelledby="kpi-title">
        <h2 id="kpi-title" style={{ textAlign: "center", color: "#000", margin: "0 0 12px" }}>
          Indicadores principais
        </h2>

        <div className="card-deck" id="vg-kpis"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            width: "100%"
          }}
        >
          <div className="user-stat-card">
            Setores
            <strong id="vg-setores">—</strong>
          </div>

          <div className="user-stat-card">
            Usuários (servidores)
            <strong id="vg-usuarios">—</strong>
          </div>

          <div className="user-stat-card">
            Eficiência média
            <strong id="vg-eficiencia">—%</strong>
            <div className="kpi__sub">Concluídas / Abertas</div>
          </div>

          <div className="user-stat-card">
            Qualidade média
            <strong id="vg-qualidade">—</strong>
            <div className="kpi__sub">Nota média das avaliações</div>
          </div>

          <div className="user-stat-card">
            Serviços cadastrados
            <strong id="vg-servicos">—</strong>
          </div>

          <div className="user-stat-card kpi-cidadaos">
            Cidadãos (contas)
            <strong id="vg-cidadaos-total">—</strong>
          </div>

          <div className="user-stat-card">
            Público
            <div className="kpi-gender" style={{ marginTop: 6 }}>
              <span style={{ color: "#2563eb" }}>♂ <b id="vg-publico-homens">—</b></span>
              <span style={{ marginLeft: 8, color: "#ec4899" }}>♀ <b id="vg-publico-mulheres">—</b></span>
            </div>
            <div className="kpi-age">
              <span>Média de Idade: <b id="vg-publico-idade">—</b></span>
            </div>
          </div>

          <div className="user-stat-card kpi-card--accent">
            Economia estimada
            <strong id="vg-economia" className="currency">—</strong>
            <div className="kpi__sub">Páginas/Impressões evitadas × custo médio</div>
          </div>
        </div>
      </section>


      <section className="dash-section" style={{marginTop:10}} aria-labelledby="evolucao-title">
        <div className="section-content-flex">
          <div className="ranking-box" style={{flex:1}}>
            <h3 id="evolucao-title">Evolução de uso (últimos 12 meses)</h3>
            <p style={{fontSize: ".9rem", color: "#6b7280"}}>Volume mensal de solicitações/processos</p>
            <div className="chart-container" style={{height:330}}>
              <canvas ref={evolucaoRef}></canvas>
            </div>
          </div>
          <div className="ranking-box" style={{flex:1}}>
            <h3>Distribuição de Acessos por Perfil</h3>
            <p style={{fontSize: ".9rem", color: "#6b7280"}}>Servidores × Cidadãos × Representantes</p>
            <div className="chart-container" style={{height:330}}>
              <canvas ref={perfilRef}></canvas>
            </div>
          </div>
        </div>
      </section>

      <section className="dash-section" aria-labelledby="economia-title">
        <h3 id="economia-title">Resumo de Economia</h3>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div className="periodo-title"><span className="dot"></span><strong>Dados do Período — Ano:</strong></div>
          <select className="year-select" value={String(anoSel)} onChange={(e)=>setAnoSel(Number(e.target.value))}>
            {anos.map(a => (<option key={a} value={a}>{a}</option>))}
          </select>
        </div>
        <div className="periodo-wrapper">
          <table className="periodo-table">
            <thead>
              <tr className="top-head">
                <th scope="col">Período</th>
                <th scope="col">Solicitações</th>
                <th scope="col">💰 Economia Gerada</th>
              </tr>
            </thead>
            <tbody>
              {economiaRows.map((row) => {
                const dt = new Date(`${row.mes_iso}T00:00:00`);
                const mesNome = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(dt);
                const mes = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);
                return (
                  <tr key={row.mes_iso}>
                    <td>{mes}</td>
                    <td className="center">{fmt.format(Number(row.solicitacoes_mes||0))}</td>
                    <td className="right">{`R$ ${fmt.format(Number(row.economia_estimativa||0))}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <footer style={{marginTop:20,textAlign:"center",fontSize:12,color:"#6b7280"}}>
        Cidade Conectada — BI Dashboard
      </footer>
    </main>
  );
}
