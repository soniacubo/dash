import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import Header from "../components/Header";
import TitleWithTooltip from "../components/TitleWithTooltip";
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";

/* ============================================================
   TIPOS
============================================================ */

type UserDetail = {
  id: number;
  nome: string;
  secretaria: string | null;
  email: string | null;
  phone: string | null;
  data_cadastro: string | null;
  ultimo_despacho: string | null;
  dias_sem_despacho: number | null;
  despachos_periodo: number;
};

type UsuariosKpis = {
  total_servidores: number;
  despacharam_24h: number;
  sem_despachar_30d: number;
  criados_30d: number;
};

type RankingItem = {
  nome: string;
  total: number;
};

type SortKey =
  | "nome"
  | "secretaria"
  | "data_cadastro"
  | "dias_sem_despacho"
  | "ultimo_despacho"
  | "despachos_periodo";

type SortConfig = {
  key: SortKey;
  direction: "asc" | "desc";
};

type PeriodKey =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "6m"
  | "1y"
  | "ano_passado"
  | "all";

type PeriodRange = {
  key: PeriodKey;
  inicioISO: string;
  fimISO: string;
  inicioBR: string;
  fimBR: string;
};

/* ============================================================
   HELPERS
============================================================ */

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "90d", label: "Últimos 90 dias" },
  { key: "6m", label: "Últimos 6 meses" },
  { key: "1y", label: "Este ano" },
  { key: "ano_passado", label: "Ano passado" },
  { key: "all", label: "Todo período" }
];

function getPeriodRange(period: PeriodKey): PeriodRange {
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);

  const fim = new Date(hoje);
  const inicio = new Date(hoje);

  switch (period) {
    case "today":
      inicio.setHours(0, 0, 0, 0);
      break;

    case "7d":
      inicio.setDate(fim.getDate() - 6);
      inicio.setHours(0, 0, 0, 0);
      break;

    case "30d":
      inicio.setDate(fim.getDate() - 29);
      inicio.setHours(0, 0, 0, 0);
      break;

    case "90d":
      inicio.setDate(fim.getDate() - 89);
      inicio.setHours(0, 0, 0, 0);
      break;

    case "6m":
      inicio.setMonth(fim.getMonth() - 6);
      inicio.setHours(0, 0, 0, 0);
      break;

    case "1y":
      inicio.setMonth(0, 1);
      inicio.setHours(0, 0, 0, 0);
      break;

    case "ano_passado":
      inicio.setFullYear(fim.getFullYear() - 1, 0, 1);
      inicio.setHours(0, 0, 0, 0);

      fim.setFullYear(fim.getFullYear() - 1, 11, 31);
      fim.setHours(23, 59, 59, 999);
      break;

    case "all":
      inicio.setFullYear(2000, 0, 1);
      inicio.setHours(0, 0, 0, 0);
      break;
  }

  return {
    key: period,
    inicioISO: inicio.toISOString().slice(0, 10),
    fimISO: fim.toISOString().slice(0, 10),
    inicioBR: inicio.toLocaleDateString("pt-BR"),
    fimBR: fim.toLocaleDateString("pt-BR")
  };
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";

  return (
    d.toLocaleDateString("pt-BR") +
    ", " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function isRecent(value: string | null) {
  if (!value) return false;
  const d = new Date(value);
  if (isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) / 86400000 <= 5;
}

function sortIcon(active: boolean, dir: "asc" | "desc") {
  if (!active) return "▾";
  return dir === "asc" ? "▴" : "▾";
}

/* ============================================================
   COMPONENTE PRINCIPAL
============================================================ */

const Usuarios: React.FC = () => {
  /* ---------------- ESTADOS ---------------- */
  const [kpis, setKpis] = useState<UsuariosKpis | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [usuariosPeriodo, setUsuariosPeriodo] = useState<UserDetail[]>([]);
  const [usuariosTabela, setUsuariosTabela] = useState<UserDetail[]>([]);
  const [loadingUsuariosTabela, setLoadingUsuariosTabela] = useState(false);
  const [erroUsuariosTabela, setErroUsuariosTabela] = useState<string | null>(null);

  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [periodTable, setPeriodTable] = useState<PeriodKey>("7d");

  const [range, setRange] = useState(() => getPeriodRange("30d"));
  const [rangeTable, setRangeTable] = useState(() => getPeriodRange("7d"));

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "despachos_periodo",
    direction: "desc"
  });

  /* ------------ GRÁFICOS ------------ */
  const evolucaoChartRef = useRef<HTMLCanvasElement | null>(null);
  const evolucaoChartInstance = useRef<Chart | null>(null);

  const atividadeChartRef = useRef<HTMLCanvasElement | null>(null);
  const atividadeChartInstance = useRef<Chart | null>(null);

  const rankingChartRef = useRef<HTMLCanvasElement | null>(null);
  const rankingChartInstance = useRef<Chart | null>(null);

  /* ============================================================
     1) CARREGAMENTO DE KPIS + EVOLUÇÃO
  ============================================================= */

  useEffect(() => {
    async function loadKpis() {
      try {
        const r = await fetch(`${API_BASE_URL}/usuarios/kpis`);
        const data: UsuariosKpis = await r.json();
        setKpis(data);
      } catch (e) {
        console.error("Erro KPIs:", e);
      }
    }

    async function loadEvolucao() {
      try {
        const r = await fetch(`${API_BASE_URL}/usuarios/detalhes`);
        const data: UserDetail[] = await r.json();

        const base = new Date();
        base.setDate(1);

        const meses = [];

        for (let i = 11; i >= 0; i--) {
          const d = new Date(base);
          d.setMonth(base.getMonth() - i);

          meses.push({
            ano: d.getFullYear(),
            mes: d.getMonth() + 1,
            label: d.toLocaleDateString("pt-BR", { month: "short" }),
            total: 0
          });
        }

        data.forEach(u => {
          if (!u.data_cadastro) return;
          const d = new Date(u.data_cadastro);

          const mes = meses.find(
            m => m.ano === d.getFullYear() && m.mes === d.getMonth() + 1
          );

          if (mes) mes.total++;
        });

        setEvolucao(meses);
      } catch (e) {
        console.error("Erro evolução:", e);
      }
    }

    loadKpis();
    loadEvolucao();
  }, []);

  /* ============================================================
     2) PERIOD CHANGES
  ============================================================= */

  useEffect(() => {
    setRange(getPeriodRange(period));
  }, [period]);

  useEffect(() => {
    setRangeTable(getPeriodRange(periodTable));
  }, [periodTable]);

  /* ============================================================
     3) CARREGAR RANKING + DETALHES DOS GRÁFICOS
  ============================================================= */

  useEffect(() => {
    async function loadPeriodo() {
      try {
        const r = await fetch(
          `${API_BASE_URL}/usuarios/detalhes?inicio=${range.inicioISO}&fim=${range.fimISO}`
        );
        const data = await r.json();
        setUsuariosPeriodo(data);
      } catch (e) {
        console.error("Erro período:", e);
      }
    }

    async function loadRanking() {
      try {
        const r = await fetch(
          `${API_BASE_URL}/usuarios/ranking?inicio=${range.inicioISO}&fim=${range.fimISO}`
        );
        const data = await r.json();
        setRanking(data);
      } catch (e) {
        console.error("Erro ranking:", e);
      }
    }

    loadPeriodo();
    loadRanking();
  }, [range.inicioISO, range.fimISO]);

  /* ============================================================
     4) CARREGAR LISTA DETALHADA DA TABELA
  ============================================================= */

  useEffect(() => {
    async function loadTabela() {
      try {
        setLoadingUsuariosTabela(true);
        setErroUsuariosTabela(null);

        const r = await fetch(
          `${API_BASE_URL}/usuarios/detalhes?inicio=${rangeTable.inicioISO}&fim=${rangeTable.fimISO}`
        );

        const data: UserDetail[] = await r.json();
        setUsuariosTabela(data);

      } catch (e) {
        console.error("Erro tabela:", e);
        setErroUsuariosTabela("Erro ao carregar usuários.");
      } finally {
        setLoadingUsuariosTabela(false);
      }
    }

    loadTabela();
  }, [rangeTable.inicioISO, rangeTable.fimISO]);

  /* ============================================================
     RANKING — Filtrar apenas servidores (não cidadãos)
  ============================================================= */

  const rankingServidores = useMemo(() => {
    return ranking.filter(r =>
      usuariosPeriodo.some(
        u => u.nome === r.nome && u.secretaria && u.secretaria.trim() !== ""
      )
    );
  }, [ranking, usuariosPeriodo]);

  /* ============================================================
     GRÁFICO — Evolução 12 meses
  ============================================================= */

  const [evolucao, setEvolucao] = useState<any[]>([]);

  useEffect(() => {
    if (!evolucao.length) return;

    const canvas = evolucaoChartRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (evolucaoChartInstance.current)
      evolucaoChartInstance.current.destroy();

    evolucaoChartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: evolucao.map(m => m.label),
        datasets: [
          {
            label: "Novos servidores",
            data: evolucao.map(m => m.total),
            borderWidth: 2,
            tension: 0.25,
            fill: false
          }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }, [evolucao]);

  /* ============================================================
     GRÁFICO — Distribuição
  ============================================================= */

  const atividadeDistribuicao = useMemo(() => {
    const ranges = [
      { label: "Sem despachos", min: 0, max: 0, total: 0 },
      { label: "1 a 5", min: 1, max: 5, total: 0 },
      { label: "6 a 20", min: 6, max: 20, total: 0 },
      { label: "21 a 50", min: 21, max: 50, total: 0 },
      { label: "51+", min: 51, max: Infinity, total: 0 }
    ];

    usuariosPeriodo.forEach(u => {
      const v = u.despachos_periodo ?? 0;
      const r = ranges.find(r => v >= r.min && v <= r.max);
      if (r) r.total++;
    });

    return ranges;
  }, [usuariosPeriodo]);

  useEffect(() => {
    const canvas = atividadeChartRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (atividadeChartInstance.current)
      atividadeChartInstance.current.destroy();

    atividadeChartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: atividadeDistribuicao.map(b => b.label),
        datasets: [
          {
            label: "Servidores",
            data: atividadeDistribuicao.map(b => b.total)
          }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }, [atividadeDistribuicao]);

  /* ============================================================
     GRÁFICO — Ranking
  ============================================================= */

/* ============================================================
   GRÁFICO — Ranking (versão melhorada com nomes)
============================================================ */
useEffect(() => {
  const canvas = rankingChartRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (rankingChartInstance.current)
    rankingChartInstance.current.destroy();

  const top5 = rankingServidores.slice(0, 5);
  if (!top5.length) return;

  rankingChartInstance.current = new Chart(ctx, {
    type: "bar",
    data: {
      labels: top5.map(r => r.nome), // << agora mostra o nome!
      datasets: [
        {
          label: "Despachos",
          data: top5.map(r => r.total),
          backgroundColor: "rgba(59, 130, 246, 0.55)", // azul suave
          borderColor: "rgba(59, 130, 246, 1)",
          borderWidth: 2,
          borderRadius: 6, // cantos arredondados
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: { display: false },

        datalabels: {
          anchor: "end",
          align: "top",
          formatter: value => value,
          font: {
            weight: "bold",
            size: 12
          },
          color: "#1e3a8a"
        },

        tooltip: {
          callbacks: {
            title: () => "",
            label: ctx => `${ctx.label}: ${ctx.formattedValue} despachos`
          }
        }
      },

      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            minRotation: 0,
            font: { size: 11, weight: "bold" },
            callback: function (value) {
              const name: string = this.getLabelForValue(value);
              return name.length > 14
                ? name.slice(0, 14) + "…" // reduz label longo com "..."
                : name;
            }
          }
        },

        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.06)" }
        }
      }
    }
  });
}, [rankingServidores]);


  /* ============================================================
     ORDENAR TABELA
  ============================================================= */

  const sortedUsuarios = useMemo(() => {
    const list = [...usuariosTabela];
    const { key, direction } = sortConfig;
    const factor = direction === "asc" ? 1 : -1;

    const val = (u: UserDetail) => {
      switch (key) {
        case "nome": return u.nome.toLowerCase();
        case "secretaria": return (u.secretaria || "").toLowerCase();
        case "data_cadastro": return u.data_cadastro || "";
        case "ultimo_despacho": return u.ultimo_despacho || "";
        case "dias_sem_despacho": return u.dias_sem_despacho ?? Infinity;
        case "despachos_periodo": return u.despachos_periodo;
      }
    };

    return list.sort((a, b) => {
      const va = val(a);
      const vb = val(b);

      if (va === vb) return 0;

      if (typeof va === "number" && typeof vb === "number") {
        return va > vb ? factor : -factor;
      }

      return String(va) > String(vb) ? factor : -factor;
    });
  }, [usuariosTabela, sortConfig]);

  function handleSort(col: SortKey) {
    setSortConfig(prev =>
      prev.key === col
        ? { key: col, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key: col, direction: "asc" }
    );
  }

  /* ============================================================
     RENDER FINAL
  ============================================================= */

  return (
    <main className="main-container">
      <Header />

      {/* ============================================================ */}
      {/* TÍTULO PRINCIPAL */}
      {/* ============================================================ */}

      <section className="dash-section">
        <div className="section-title-wrapper">
          <TitleWithTooltip
            tooltip="Visão consolidada de servidores ativos e atividade."
            className="section-title-main"
          >
            Usuários do sistema
          </TitleWithTooltip>
          <p className="section-title-sub">
            Visão consolidada de servidores, engajamento e atividade de despacho.
          </p>
        </div>

        {/* ============================================================ */}
        {/* KPIs */}
        {/* ============================================================ */}
        <div className="card-deck">
          <div className="user-stat-card">
            <span>Total de servidores ativos</span>
            <strong>{kpis?.total_servidores ?? 0}</strong>
          </div>

          <div className="user-stat-card">
            <span>Despacharam nas últimas 24h</span>
            <strong>{kpis?.despacharam_24h ?? 0}</strong>
          </div>

          <div className="user-stat-card">
            <span>Sem despachar há 30 dias ou mais</span>
            <strong>{kpis?.sem_despachar_30d ?? 0}</strong>
          </div>

          <div className="user-stat-card">
            <span>Criados nos últimos 30 dias</span>
            <strong>{kpis?.criados_30d ?? 0}</strong>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* EVOLUÇÃO */}
      {/* ============================================================ */}

      <section className="dash-section">
        <div className="vg-chart-card">
          <p className="vg-chart-title">
            Evolução de novos servidores cadastrados no sistema (últimos 12 meses)
          </p>
          <p className="vg-chart-sub">Quantidade de usuários criados mensalmente.</p>

          <div className="mini-chart-wrapper" style={{ height: 260 }}>
            <canvas ref={evolucaoChartRef} />
          </div>
        </div>

        {/* ============================================================ */}
        {/* TÍTULO DOS INDICADORES POR PERÍODO */}
        {/* ============================================================ */}

        <div className="section-title-wrapper" style={{ marginTop: 28 }}>
          <TitleWithTooltip
            tooltip="Indicadores calculados dentro do período selecionado."
            className="section-title-main"
          >
            Indicadores por Período
          </TitleWithTooltip>

          <p className="section-title-sub"> <p> 
            Atividade de despacho e ranking de servidores dentro do período selecionado.
          </p></p>
        </div>

        {/* ============================================================ */}
        {/* BOTÕES DO PERÍODO */}
        {/* ============================================================ */}

        <div className="period-filter">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={period === opt.key ? "period-btn active" : "period-btn"}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ============================================================ */}
        {/* GRÁFICOS EM LINHA */}
        {/* ============================================================ */}

        <div className="section-content-flex" style={{ marginTop: 20 }}>
          {/* Distribuição */}
          <div className="ranking-box">
            <div className="vg-chart-card">
              <p className="vg-chart-title">Distribuição de atividade</p>
              <p className="vg-chart-sub">
                Quantidade de servidores por faixa de despachos entre{" "}
                <strong>{range.inicioBR}</strong> e{" "}
                <strong>{range.fimBR}</strong>.
              </p>

              <div className="mini-chart-wrapper" style={{ height: 260 }}>
                <canvas ref={atividadeChartRef} />
              </div>
            </div>
          </div>

          {/* Ranking */}
          <div className="ranking-box">
            <div className="vg-chart-card">
              <p className="vg-chart-title">Ranking de despachos</p>
              <p className="vg-chart-sub">
                Servidores que mais realizaram despachos no período informado.
              </p>

              {rankingServidores.length === 0 ? (
                <p style={{ color: "#6b7280", marginTop: 12 }}>
                  Nenhum servidor encontrado no período selecionado.
                </p>
              ) : (
                <div className="mini-chart-wrapper" style={{ height: 260 }}>
                  <canvas ref={rankingChartRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* TABELA COMPLETA */}
      {/* ============================================================ */}

      <section className="dash-section">
        <div className="section-title-wrapper">
          <TitleWithTooltip
            tooltip="Relatório detalhado de servidores e comportamento recente."
            className="section-title-main"
          >
            Lista detalhada de usuários
          </TitleWithTooltip>

          <p className="section-title-sub">
            Lista de servidores ativos e seus indicadores no período selecionado.
          </p>
        </div>

        {/* Filtro do período da tabela */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12
          }}
        >
          <strong style={{ color: "#555", fontSize: "0.9rem" }}>
            Período selecionado: {rangeTable.inicioBR} → {rangeTable.fimBR}
          </strong>

          <select
            className="eco-select"
            value={periodTable}
            onChange={e => setPeriodTable(e.target.value as PeriodKey)}
          >
            {PERIOD_OPTIONS.map(p => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tabela */}
        <div className="table-wrapper">
          {erroUsuariosTabela && (
            <p style={{ color: "#b91c1c" }}>{erroUsuariosTabela}</p>
          )}

          {loadingUsuariosTabela ? (
            <p style={{ color: "#777" }}>Carregando usuários...</p>
          ) : (
            <table className="cc-table cc-table-usuarios">
              <thead>
                <tr>
                  <th onClick={() => handleSort("nome")}>
                    Nome {sortIcon(sortConfig.key === "nome", sortConfig.direction)}
                  </th>

                  <th onClick={() => handleSort("secretaria")}>
                    Secretaria{" "}
                    {sortIcon(sortConfig.key === "secretaria", sortConfig.direction)}
                  </th>

                  <th onClick={() => handleSort("data_cadastro")} style={{ textAlign: "center" }}>
                    Cadastro{" "}
                    {sortIcon(sortConfig.key === "data_cadastro", sortConfig.direction)}
                  </th>

                  <th onClick={() => handleSort("dias_sem_despacho")} style={{ textAlign: "center" }}>
                    Sem despachar{" "}
                    {sortIcon(sortConfig.key === "dias_sem_despacho", sortConfig.direction)}
                  </th>

                  <th onClick={() => handleSort("ultimo_despacho")} style={{ textAlign: "center" }}>
                    Último despacho{" "}
                    {sortIcon(sortConfig.key === "ultimo_despacho", sortConfig.direction)}
                  </th>

                  <th onClick={() => handleSort("despachos_periodo")} style={{ textAlign: "center" }}>
                    No período{" "}
                    {sortIcon(sortConfig.key === "despachos_periodo", sortConfig.direction)}
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedUsuarios.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 18 }}>
                      Nenhum usuário encontrado nesse período.
                    </td>
                  </tr>
                )}

                {sortedUsuarios.map(u => (
                  <tr key={u.id}>
                    <td>{u.nome}</td>

                    <td>{u.secretaria || "—"}</td>

                    <td style={{ textAlign: "center" }}>
                      {formatDate(u.data_cadastro)}
                    </td>

                    <td style={{ textAlign: "center" }}>
                      {u.dias_sem_despacho == null
                        ? "—"
                        : `${u.dias_sem_despacho} dias`}
                    </td>

                    <td
                      style={{ textAlign: "center" }}
                      className={isRecent(u.ultimo_despacho) ? "valor-verde" : ""}
                    >
                      {formatDateTime(u.ultimo_despacho)}
                    </td>

                    <td style={{ textAlign: "center" }}>
                      {u.despachos_periodo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
};

export default Usuarios;
