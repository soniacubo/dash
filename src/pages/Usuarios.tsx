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
  departamentos?: string | null;
  data_cadastro: string | null;
  ultimo_despacho: string | null;
  dias_sem_despacho: number | null;
  despachos_periodo: number;
  email?: string | null;
  phone?: string | null;
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

type EvolucaoMes = {
  ano: number;
  mes: number; // 1..12
  label: string;
  total: number;
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
      // Este ano: de 1º de janeiro até hoje
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

    default:
      inicio.setDate(fim.getDate() - 29);
      inicio.setHours(0, 0, 0, 0);
      break;
  }

  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const toBR = (d: Date) => d.toLocaleDateString("pt-BR");

  return {
    key: period,
    inicioISO: toISO(inicio),
    fimISO: toISO(fim),
    inicioBR: toBR(inicio),
    fimBR: toBR(fim)
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
  const date = d.toLocaleDateString("pt-BR");
  const time = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${date}, ${time}`;
}

function isRecent(dateStr: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const diffDias = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diffDias <= 5;
}

function sortIcon(active: boolean, dir: "asc" | "desc") {
  if (!active) return "▾";
  return dir === "asc" ? "▴" : "▾";
}

/* ============================================================
   COMPONENTE
============================================================ */

const Usuarios: React.FC = () => {
  /* --------------------- Estados principais --------------------- */
  const [kpis, setKpis] = useState<UsuariosKpis | null>(null);

  // Dados para gráficos (distribuição / ranking) – período A
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [usuariosPeriodo, setUsuariosPeriodo] = useState<UserDetail[]>([]);

  // Dados para tabela detalhada – período B (independente)
  const [usuariosTabela, setUsuariosTabela] = useState<UserDetail[]>([]);
  const [loadingUsuariosTabela, setLoadingUsuariosTabela] = useState(false);
  const [erroUsuariosTabela, setErroUsuariosTabela] = useState<string | null>(
    null
  );

  // Período dos gráficos
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [range, setRange] = useState<PeriodRange>(() =>
    getPeriodRange("30d")
  );

  // Período da tabela (dropdown)
  const [periodTable, setPeriodTable] = useState<PeriodKey>("7d");
  const [rangeTable, setRangeTable] = useState<PeriodRange>(() =>
    getPeriodRange("7d")
  );

  // Ordenação da tabela – começa por despachos no período (desc)
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "despachos_periodo",
    direction: "desc"
  });

  const tabelaWrapperRef = useRef<HTMLDivElement | null>(null);

  /* --------------------- Charts refs --------------------- */
  const evolucaoChartRef = useRef<HTMLCanvasElement | null>(null);
  const evolucaoChartInstance = useRef<Chart | null>(null);

  const atividadeChartRef = useRef<HTMLCanvasElement | null>(null);
  const atividadeChartInstance = useRef<Chart | null>(null);

  const rankingChartRef = useRef<HTMLCanvasElement | null>(null);
  const rankingChartInstance = useRef<Chart | null>(null);

  /* ============================================================
     1) Carga inicial: KPIs + evolução 12 meses
  ============================================================= */
  useEffect(() => {
    async function loadKpis() {
      try {
        const r = await fetch(`${API_BASE_URL}/usuarios/kpis`);
        if (!r.ok) throw new Error("Erro ao buscar KPIs");
        const data: UsuariosKpis = await r.json();
        setKpis(data);
      } catch (err) {
        console.error(err);
      }
    }

    async function loadEvolucao12Meses() {
      try {
        const r = await fetch(`${API_BASE_URL}/usuarios/detalhes`);
        if (!r.ok) throw new Error("Erro ao buscar evolução de usuários");

        const data: UserDetail[] = await r.json();

        // monta os últimos 12 meses (sempre 1º dia de cada mês)
        const base = new Date();
        base.setDate(1);
        base.setHours(0, 0, 0, 0);

        const meses: EvolucaoMes[] = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(base);
          d.setMonth(base.getMonth() - i);
          const ano = d.getFullYear();
          const mes = d.getMonth() + 1;
          const label = d.toLocaleDateString("pt-BR", {
            month: "short"
          });

          meses.push({ ano, mes, label, total: 0 });
        }

        const minAnoMes = meses[0].ano * 12 + (meses[0].mes - 1);
        const maxAnoMes =
          meses[meses.length - 1].ano * 12 +
          (meses[meses.length - 1].mes - 1);

        data.forEach(u => {
          if (!u.data_cadastro) return;
          const d = new Date(u.data_cadastro);
          if (isNaN(d.getTime())) return;

          const ym = d.getFullYear() * 12 + d.getMonth();
          if (ym < minAnoMes || ym > maxAnoMes) return;

          const idx = meses.findIndex(
            m => m.ano === d.getFullYear() && m.mes === d.getMonth() + 1
          );
          if (idx >= 0) {
            meses[idx].total += 1;
          }
        });

        setEvolucao(meses);
      } catch (err) {
        console.error(err);
      }
    }

    loadKpis();
    loadEvolucao12Meses();
  }, []);

  /* ============================================================
     2) Atualiza ranges quando os períodos mudam
  ============================================================= */
  useEffect(() => {
    setRange(getPeriodRange(period));
  }, [period]);

  useEffect(() => {
    setRangeTable(getPeriodRange(periodTable));
  }, [periodTable]);

  /* ============================================================
     3) Buscar detalhes + ranking para os GRÁFICOS
        sempre que o range (gráficos) mudar
  ============================================================= */
  useEffect(() => {
    async function loadUsuariosPeriodo() {
      try {
        const url = new URL(
          `${API_BASE_URL}/usuarios/detalhes`,
          window.location.href
        );
        url.searchParams.set("inicio", range.inicioISO);
        url.searchParams.set("fim", range.fimISO);

        const r = await fetch(url.toString());
        if (!r.ok) throw new Error("Erro ao buscar detalhes (gráficos)");

        const data: UserDetail[] = await r.json();
        setUsuariosPeriodo(data);
      } catch (err) {
        console.error(err);
      }
    }

    async function loadRanking() {
      try {
        const url = new URL(
          `${API_BASE_URL}/usuarios/ranking`,
          window.location.href
        );
        url.searchParams.set("inicio", range.inicioISO);
        url.searchParams.set("fim", range.fimISO);

        const r = await fetch(url.toString());
        if (!r.ok) throw new Error("Erro ao buscar ranking");

        const data: RankingItem[] = await r.json();
        setRanking(data);
      } catch (err) {
        console.error(err);
      }
    }

    loadUsuariosPeriodo();
    loadRanking();
  }, [range.inicioISO, range.fimISO]);

  /* ============================================================
     4) Buscar detalhes para a TABELA (período independente)
  ============================================================= */
  useEffect(() => {
    async function loadUsuariosTabela() {
      try {
        setLoadingUsuariosTabela(true);
        setErroUsuariosTabela(null);

        const url = new URL(
          `${API_BASE_URL}/usuarios/detalhes`,
          window.location.href
        );
        url.searchParams.set("inicio", rangeTable.inicioISO);
        url.searchParams.set("fim", rangeTable.fimISO);

        const r = await fetch(url.toString());
        if (!r.ok) throw new Error("Erro ao buscar detalhes (tabela)");

        const data: UserDetail[] = await r.json();
        setUsuariosTabela(data);
      } catch (err) {
        console.error(err);
        setErroUsuariosTabela(
          "Erro ao carregar lista detalhada de usuários."
        );
      } finally {
        setLoadingUsuariosTabela(false);
      }
    }

    loadUsuariosTabela();
  }, [rangeTable.inicioISO, rangeTable.fimISO]);

  /* ============================================================
     5) Gráfico 12 meses – evolução de novos usuários
  ============================================================= */
  const [evolucao, setEvolucao] = useState<EvolucaoMes[]>([]);

  useEffect(() => {
    if (!evolucao.length) return;
    const canvas = evolucaoChartRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (evolucaoChartInstance.current) {
      evolucaoChartInstance.current.destroy();
    }

    evolucaoChartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: evolucao.map(m => m.label),
        datasets: [
          {
            label: "Novos servidores",
            data: evolucao.map(m => m.total),
            borderWidth: 2,
            fill: false,
            tension: 0.25,
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                return `${ctx.parsed.y} novos servidores`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        }
      }
    });
  }, [evolucao]);

  /* ============================================================
     6) Distribuição de atividade – colunas verticais
        (faixas de despachos no período – gráficos)
  ============================================================= */

  const atividadeDistribuicao = useMemo(() => {
    const buckets = [
      { label: "Sem despachos", min: 0, max: 0, total: 0 },
      { label: "1 a 5", min: 1, max: 5, total: 0 },
      { label: "6 a 20", min: 6, max: 20, total: 0 },
      { label: "21 a 50", min: 21, max: 50, total: 0 },
      { label: "51 ou mais", min: 51, max: Infinity, total: 0 }
    ];

    usuariosPeriodo.forEach(u => {
      const d = u.despachos_periodo ?? 0;
      const bucket = buckets.find(b => d >= b.min && d <= b.max);
      if (bucket) bucket.total += 1;
    });

    return buckets;
  }, [usuariosPeriodo]);

  useEffect(() => {
    const canvas = atividadeChartRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (atividadeChartInstance.current) {
      atividadeChartInstance.current.destroy();
    }

    const labels = atividadeDistribuicao.map(b => b.label);
    const data = atividadeDistribuicao.map(b => b.total);

    atividadeChartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Servidores",
            data
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const qtd = ctx.parsed.y || 0;
                return `${qtd} servidores`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              font: { size: 11 }
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 5
            }
          }
        }
      }
    });
  }, [atividadeDistribuicao]);

  /* ============================================================
     7) Ranking TOP 5 – filtrando cidadãos (somente servidores)
  ============================================================= */

  const rankingServidores = useMemo(() => {
    if (!ranking.length || !usuariosPeriodo.length) return [];
    return ranking.filter(r => {
      const u = usuariosPeriodo.find(u => u.nome === r.nome);
      return u && u.secretaria && u.secretaria.trim() !== "";
    });
  }, [ranking, usuariosPeriodo]);

  useEffect(() => {
    const canvas = rankingChartRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (rankingChartInstance.current) {
      rankingChartInstance.current.destroy();
    }

    const top5 = rankingServidores.slice(0, 5);
    if (top5.length === 0) {
      rankingChartInstance.current = null;
      return;
    }

    const labels = top5.map((_, idx) => `${idx + 1}º`);
    const data = top5.map(r => r.total);

    const secretarias = top5.map(r => {
      const u = usuariosPeriodo.find(u => u.nome === r.nome);
      return u?.secretaria || "—";
    });

    const medalColors = top5.map((_, idx) => {
      if (idx === 0) return "#fbbf24"; // ouro
      if (idx === 1) return "#9ca3af"; // prata
      if (idx === 2) return "#f97316"; // bronze
      return "#3b82f6"; // padrão
    });

    rankingChartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Despachos",
            data,
            backgroundColor: medalColors
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) {
                const idx = items[0].dataIndex;
                return top5[idx].nome;
              },
              label(ctx) {
                return `${ctx.parsed.y} despachos`;
              },
              afterBody(items) {
                const idx = items[0].dataIndex;
                return `Secretaria: ${secretarias[idx]}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 5 }
          }
        }
      }
    });
  }, [rankingServidores, usuariosPeriodo]);

  /* ============================================================
     8) Ordenação da tabela
  ============================================================= */
  const sortedUsuarios = useMemo(() => {
    const list = [...usuariosTabela];

    return list.sort((a, b) => {
      const { key, direction } = sortConfig;

      const dirFactor = direction === "asc" ? 1 : -1;

      const getValue = (user: UserDetail) => {
        switch (key) {
          case "nome":
            return (user.nome || "").toLowerCase();
          case "secretaria":
            return (user.secretaria || "").toLowerCase();
          case "data_cadastro":
            return user.data_cadastro || "";
          case "ultimo_despacho":
            return user.ultimo_despacho || "";
          case "dias_sem_despacho":
            return user.dias_sem_despacho ?? Number.POSITIVE_INFINITY;
          case "despachos_periodo":
            return user.despachos_periodo;
          default:
            return "";
        }
      };

      const va = getValue(a);
      const vb = getValue(b);

      if (va === vb) return 0;

      if (typeof va === "number" && typeof vb === "number") {
        return va > vb ? dirFactor : -dirFactor;
      }

      return String(va) > String(vb) ? dirFactor : -dirFactor;
    });
  }, [usuariosTabela, sortConfig]);

  function handleSort(column: SortKey) {
    setSortConfig(prev => {
      if (prev.key === column) {
        return {
          key: column,
          direction: prev.direction === "asc" ? "desc" : "asc"
        };
      }
      return { key: column, direction: "asc" };
    });
  }

  /* ============================================================
     9) Clique fora da tabela → reset ordenação (despachos desc)
  ============================================================= */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const wrapper = tabelaWrapperRef.current;
      if (!wrapper) return;

      if (!wrapper.contains(e.target as Node)) {
        setSortConfig({ key: "despachos_periodo", direction: "desc" });
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  /* ============================================================
     RENDER
  ============================================================= */

  return (
    <main className="main-container">
      <Header />

      {/* ==================== HEADER / TÍTULO PRINCIPAL ==================== */}
      <section className="dash-section">
        <div className="section-title-wrapper">
          <TitleWithTooltip
            tooltip="Visão consolidada de servidores ativos, engajamento e atividade de despacho."
            className="section-title-main"
          >
            Usuários do sistema
          </TitleWithTooltip>
          <p className="section-title-sub">
            Visão consolidada de servidores, engajamento e atividade de despacho.
          </p>
        </div>

        {/* ==================== KPIs SUPERIORES – CARDS CENTRALIZADOS ==================== */}
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

      {/* ==================== EVOLUÇÃO + GRÁFICOS ==================== */}
      <section className="dash-section">
        {/* Gráfico 12 meses */}
        <div className="vg-chart-card">
          <div style={{ textAlign: "center" }}>
            <p className="vg-chart-title">
              Evolução de novos servidores ativos (últimos 12 meses)
            </p>
            <p className="vg-chart-sub">
              Quantidade de usuários criados em cada mês, considerando apenas
              servidores ativos.
            </p>
          </div>
          <div
            className="mini-chart-wrapper"
            style={{ height: 260, marginTop: 8 }}
          >
            <canvas ref={evolucaoChartRef} />
          </div>
        </div>

        {/* Filtro de período (igual visão geral) */}
        <div className="section-title-wrapper" style={{ marginTop: 28 }}>
          <TitleWithTooltip
            tooltip="Atividade de despacho e ranking de servidores dentro do intervalo selecionado."
            className="section-title-main"
          >
            Indicadores por Período
          </TitleWithTooltip>
          <p className="section-title-sub">
            Atividade de despacho e ranking de servidores dentro do intervalo
            selecionado.
          </p>
        </div>

        <div className="period-filter">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPeriod(opt.key)}
              className={
                period === opt.key ? "period-btn active" : "period-btn"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Gráficos lado a lado */}
        <div className="section-content-flex" style={{ marginTop: 20 }}>
          {/* Distribuição de atividade */}
          <div className="ranking-box">
            <div className="vg-chart-card">
              <p className="vg-chart-title">Distribuição de atividade</p>
              <p className="vg-chart-sub">
                Quantidade de servidores ativos por faixa de despachos
                realizados entre{" "}
                <strong>{range.inicioBR}</strong> e{" "}
                <strong>{range.fimBR}</strong>.
              </p>
              <div
                className="mini-chart-wrapper"
                style={{ height: 260, marginTop: 8 }}
              >
                <canvas ref={atividadeChartRef} />
              </div>
            </div>
          </div>

          {/* Ranking TOP 5 */}
          <div className="ranking-box">
            <div className="vg-chart-card">
              <p className="vg-chart-title">Ranking de despachos no período</p>
              <p className="vg-chart-sub">
                Servidores que mais realizaram despachos entre{" "}
                <strong>{range.inicioBR}</strong> e{" "}
                <strong>{range.fimBR}</strong>. Passe o mouse nas colunas para
                ver a secretaria de cada servidor.
              </p>
              {rankingServidores.slice(0, 5).length === 0 ? (
                <p
                  style={{
                    fontSize: "0.85rem",
                    color: "#6b7280",
                    marginTop: 12
                  }}
                >
                  Nenhum despacho encontrado no período selecionado.
                </p>
              ) : (
                <div
                  className="mini-chart-wrapper"
                  style={{ height: 260, marginTop: 8 }}
                >
                  <canvas ref={rankingChartRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== LISTA DETALHADA ==================== */}
      <section className="dash-section">
        {/* Header da seção com título + dropdown de período da TABELA */}
        <div className="section-title-wrapper">
          <TitleWithTooltip
            tooltip="Relatório detalhado de servidores, secretaria de atuação e comportamento de despacho no período selecionado (apenas para esta tabela)."
            className="section-title-main"
          >
            Lista detalhada de usuários
          </TitleWithTooltip>
          <p className="section-title-sub">
            Veja o comportamento de despacho dos servidores no período escolhido
            abaixo.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            gap: 16,
            flexWrap: "wrap"
          }}
        >
          <span
            style={{
              fontSize: "0.85rem",
              color: "#6b7280"
            }}
          >
            Período selecionado:{" "}
            <strong>
              {rangeTable.inicioBR} a {rangeTable.fimBR}
            </strong>
          </span>

          <div>
            <label
              htmlFor="usuarios-periodo-tabela"
              style={{
                fontSize: "0.8rem",
                color: "#6b7280",
                marginRight: 8
              }}
            >
              Período da tabela:
            </label>
            <select
              id="usuarios-periodo-tabela"
              className="eco-select"
              value={periodTable}
              onChange={e =>
                setPeriodTable(e.target.value as PeriodKey)
              }
            >
              {PERIOD_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabela */}
        <div className="table-wrapper" ref={tabelaWrapperRef}>
          {erroUsuariosTabela && (
            <p style={{ color: "#b91c1c", fontSize: "0.9rem" }}>
              {erroUsuariosTabela}
            </p>
          )}

          {loadingUsuariosTabela ? (
            <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
              Carregando usuários...
            </p>
          ) : (
            <table className="cc-table cc-table-usuarios">
              <thead>
                <tr>
                  <th
                    className={
                      "cc-col-nome sortable" +
                      (sortConfig.key === "nome"
                        ? " sortable--active"
                        : "")
                    }
                    onClick={() => handleSort("nome")}
                  >
                    <div className="sortable-inner">
                      Nome
                      <span className="sort-icon">
                        {sortIcon(
                          sortConfig.key === "nome",
                          sortConfig.direction
                        )}
                      </span>
                    </div>
                  </th>

                  <th
                    className={
                      "cc-col-secretaria sortable" +
                      (sortConfig.key === "secretaria"
                        ? " sortable--active"
                        : "")
                    }
                    onClick={() => handleSort("secretaria")}
                    style={{ textAlign: "left" }}
                  >
                    <div className="sortable-inner">
                      Secretaria
                      <span className="sort-icon">
                        {sortIcon(
                          sortConfig.key === "secretaria",
                          sortConfig.direction
                        )}
                      </span>
                    </div>
                  </th>

                  <th
                    className={
                      "cc-col-data sortable" +
                      (sortConfig.key === "data_cadastro"
                        ? " sortable--active"
                        : "")
                    }
                    onClick={() => handleSort("data_cadastro")}
                    style={{ textAlign: "center" }}
                  >
                    <div className="sortable-inner">
                      Data de cadastro
                      <span className="sort-icon">
                        {sortIcon(
                          sortConfig.key === "data_cadastro",
                          sortConfig.direction
                        )}
                      </span>
                    </div>
                  </th>

                  <th
                    className={
                      "cc-col-numero sortable" +
                      (sortConfig.key === "dias_sem_despacho"
                        ? " sortable--active"
                        : "")
                    }
                    onClick={() => handleSort("dias_sem_despacho")}
                    style={{ textAlign: "center" }}
                  >
                    <div className="sortable-inner">
                      Dias sem despachar
                      <span className="sort-icon">
                        {sortIcon(
                          sortConfig.key === "dias_sem_despacho",
                          sortConfig.direction
                        )}
                      </span>
                    </div>
                  </th>

                  <th
                    className={
                      "cc-col-data sortable" +
                      (sortConfig.key === "ultimo_despacho"
                        ? " sortable--active"
                        : "")
                    }
                    onClick={() => handleSort("ultimo_despacho")}
                    style={{ textAlign: "center" }}
                  >
                    <div className="sortable-inner">
                      Último despacho
                      <span className="sort-icon">
                        {sortIcon(
                          sortConfig.key === "ultimo_despacho",
                          sortConfig.direction
                        )}
                      </span>
                    </div>
                  </th>

                  <th
                    className={
                      "cc-col-numero sortable" +
                      (sortConfig.key === "despachos_periodo"
                        ? " sortable--active"
                        : "")
                    }
                    onClick={() => handleSort("despachos_periodo")}
                    style={{ textAlign: "center" }}
                  >
                    <div className="sortable-inner">
                      Despachos no período
                      <span className="sort-icon">
                        {sortIcon(
                          sortConfig.key === "despachos_periodo",
                          sortConfig.direction
                        )}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedUsuarios.map(u => (
                  <tr key={u.id}>
                    <td style={{ textAlign: "left" }}>{u.nome}</td>

                    <td style={{ textAlign: "left" }}>
                      {u.secretaria || "—"}
                    </td>

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
                      className={
                        isRecent(u.ultimo_despacho) ? "valor-verde" : ""
                      }
                    >
                      {formatDateTime(u.ultimo_despacho)}
                    </td>

                    <td style={{ textAlign: "center" }}>
                      {u.despachos_periodo ?? 0}
                    </td>
                  </tr>
                ))}

                {sortedUsuarios.length === 0 && !loadingUsuariosTabela && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 16 }}>
                      Nenhum usuário encontrado para o período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
};

export default Usuarios;
