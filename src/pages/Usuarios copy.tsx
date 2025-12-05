import React, { useEffect, useMemo, useRef, useState } from "react";

import Header from "../components/Header";
import { Title2 } from "../components/Title2";
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

type RankingItemWithSecretaria = RankingItem & {
  secretaria?: string | null;
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

type PeriodKey = "7d" | "30d" | "90d" | "6m" | "1y";

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
  { key: "7d", label: "Últimos 7 dias" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "90d", label: "Últimos 90 dias" },
  { key: "6m", label: "Últimos 6 meses" },
  { key: "1y", label: "Últimos 12 meses" }
];

function getPeriodRange(period: PeriodKey): PeriodRange {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const fim = new Date(hoje);
  const inicio = new Date(hoje);

  switch (period) {
    case "7d":
      inicio.setDate(fim.getDate() - 6);
      break;
    case "30d":
      inicio.setDate(fim.getDate() - 29);
      break;
    case "90d":
      inicio.setDate(fim.getDate() - 89);
      break;
    case "6m":
      inicio.setMonth(fim.getMonth() - 6);
      break;
    case "1y":
      inicio.setFullYear(fim.getFullYear() - 1);
      break;
    default:
      inicio.setDate(fim.getDate() - 29);
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
   BUCKETS DE ATIVIDADE (DESPACHOS NO PERÍODO)
============================================================ */

const ACTIVITY_BUCKETS = [
  { label: "0 despachos", min: 0, max: 0 },
  { label: "1 a 5", min: 1, max: 5 },
  { label: "6 a 20", min: 6, max: 20 },
  { label: "21 a 50", min: 21, max: 50 },
  { label: "51+", min: 51, max: Infinity }
];

/* ============================================================
   COMPONENTE
============================================================ */

const Usuarios: React.FC = () => {
  /* --------------------- Estados principais --------------------- */
  const [kpis, setKpis] = useState<UsuariosKpis | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [usuarios, setUsuarios] = useState<UserDetail[]>([]);

  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [erroUsuarios, setErroUsuarios] = useState<string | null>(null);

  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [range, setRange] = useState<PeriodRange>(() =>
    getPeriodRange("30d")
  );

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "nome",
    direction: "asc"
  });

  const tabelaWrapperRef = useRef<HTMLDivElement | null>(null);
  const [displayCount, setDisplayCount] = useState<number>(0);
  const incrementTimerRef = useRef<number | null>(null);

  /* --------------------- Chart.js refs --------------------- */
  const activityChartRef = useRef<HTMLCanvasElement | null>(null);
  const activityChartInstance = useRef<Chart | null>(null);

  const newUsersChartRef = useRef<HTMLCanvasElement | null>(null);
  const newUsersChartInstance = useRef<Chart | null>(null);

  /* ============================================================
     1) Carga inicial: KPIs
  ============================================================= */
  useEffect(() => {
    const ac = new AbortController();
    async function loadKpis() {
      try {
        const r = await fetch(`${API_BASE_URL}/usuarios/kpis`, { signal: ac.signal });
        if (!r.ok) throw new Error("Erro ao buscar KPIs");
        const data: UsuariosKpis = await r.json();
        setKpis(data);
      } catch (err) {
        if ((err as any)?.name !== "AbortError") console.error(err);
      }
    }

    loadKpis();
    return () => ac.abort();
  }, []);

  /* ============================================================
     2) Atualiza range quando o período muda
  ============================================================= */
  useEffect(() => {
    setRange(getPeriodRange(period));
  }, [period]);

  /* ============================================================
     3) Buscar detalhes + ranking sempre que o range mudar
  ============================================================= */
  useEffect(() => {
    const ac = new AbortController();
    async function loadUsuariosDetalhes() {
      try {
        setLoadingUsuarios(true);
        setErroUsuarios(null);

        const url = new URL(
          `${API_BASE_URL}/usuarios/detalhes`,
          window.location.href
        );
        url.searchParams.set("inicio", range.inicioISO);
        url.searchParams.set("fim", range.fimISO);

        const r = await fetch(url.toString(), { signal: ac.signal });
        if (!r.ok) throw new Error("Erro ao buscar detalhes");

        const data: UserDetail[] = await r.json();
        setUsuarios(data);
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.error(err);
          setErroUsuarios("Erro ao carregar lista detalhada de usuários.");
        }
      } finally {
        setLoadingUsuarios(false);
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

        const r = await fetch(url.toString(), { signal: ac.signal });
        if (!r.ok) throw new Error("Erro ao buscar ranking");

        const data: RankingItem[] = await r.json();
        setRanking(data);
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.error(err);
        }
      }
    }

    loadUsuariosDetalhes();
    loadRanking();
    return () => ac.abort();
  }, [range.inicioISO, range.fimISO]);

  /* ============================================================
     4) Dados derivados para gráficos
  ============================================================= */

  // Distribuição de atividade de despacho por faixas
  const activityDistribution = useMemo(() => {
    const counts = ACTIVITY_BUCKETS.map(() => 0);

    usuarios.forEach(u => {
      const d = u.despachos_periodo ?? 0;
      const idx = ACTIVITY_BUCKETS.findIndex(
        b => d >= b.min && d <= b.max
      );
      if (idx >= 0) counts[idx] += 1;
    });

    return {
      labels: ACTIVITY_BUCKETS.map(b => b.label),
      data: counts
    };
  }, [usuarios]);

  // Evolução de novos usuários ativos (criados no período e que despacharam)
  const newUsersSeries = useMemo(() => {
    if (!usuarios.length) {
      return { labels: [] as string[], data: [] as number[] };
    }

    const inicioDate = new Date(`${range.inicioISO}T00:00:00`);
    const fimDate = new Date(`${range.fimISO}T23:59:59`);

    const map = new Map<string, number>();

    usuarios.forEach(u => {
      if (!u.data_cadastro) return;
      if (!u.despachos_periodo || u.despachos_periodo <= 0) return;

      const d = new Date(u.data_cadastro);
      if (isNaN(d.getTime())) return;

      if (d < inicioDate || d > fimDate) return;

      const key = `${d.getFullYear()}-${String(
        d.getMonth() + 1
      ).padStart(2, "0")}`;

      map.set(key, (map.get(key) || 0) + 1);
    });

    const sortedKeys = Array.from(map.keys()).sort();
    const labels = sortedKeys.map(key => {
      const [year, month] = key.split("-");
      return `${month}/${year}`;
    });
    const data = sortedKeys.map(key => map.get(key) || 0);

    return { labels, data };
  }, [usuarios, range.inicioISO, range.fimISO]);

  // Ranking com secretaria (buscando no array de usuários detalhes)
  const rankingWithSecretaria: RankingItemWithSecretaria[] = useMemo(() => {
    if (!ranking.length) return [];

    return ranking.map(r => {
      const user = usuarios.find(u => u.nome === r.nome);
      return {
        ...r,
        secretaria: user?.secretaria || null
      };
    });
  }, [ranking, usuarios]);

  /* ============================================================
     5) Gráfico Chart.js — Distribuição de atividade
  ============================================================= */
  useEffect(() => {
    const canvas = activityChartRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (activityChartInstance.current) {
      activityChartInstance.current.destroy();
    }

    activityChartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: activityDistribution.labels,
        datasets: [
          {
            label: "Servidores",
            data: activityDistribution.data
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
                return `${ctx.parsed.y} servidores`;
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
              stepSize: 1
            }
          }
        }
      }
    });
  }, [activityDistribution]);

  /* ============================================================
     6) Gráfico Chart.js — Evolução novos usuários ativos
  ============================================================= */
  useEffect(() => {
    const canvas = newUsersChartRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (newUsersChartInstance.current) {
      newUsersChartInstance.current.destroy();
    }

    newUsersChartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: newUsersSeries.labels,
        datasets: [
          {
            label: "Novos usuários ativos",
            data: newUsersSeries.data
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
                return `${ctx.parsed.y} servidores`;
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
              stepSize: 1
            }
          }
        }
      }
    });
  }, [newUsersSeries]);

  /* ============================================================
     7) Ordenação da tabela
  ============================================================= */
  const sortedUsuarios = useMemo(() => {
    const list = [...usuarios];

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
  }, [usuarios, sortConfig]);

  useEffect(() => {
    if (incrementTimerRef.current) {
      clearInterval(incrementTimerRef.current);
      incrementTimerRef.current = null;
    }

    const total = sortedUsuarios.length;
    if (total === 0) {
      setDisplayCount(0);
      return;
    }

    const initial = Math.min(50, total);
    setDisplayCount(initial);

    let current = initial;
    incrementTimerRef.current = window.setInterval(() => {
      current = Math.min(current + 200, total);
      setDisplayCount(current);
      if (current >= total && incrementTimerRef.current) {
        clearInterval(incrementTimerRef.current);
        incrementTimerRef.current = null;
      }
    }, 60);

    return () => {
      if (incrementTimerRef.current) {
        clearInterval(incrementTimerRef.current);
        incrementTimerRef.current = null;
      }
    };
  }, [sortedUsuarios]);

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
     8) Clique fora da tabela → reset ordenação (Nome ASC)
  ============================================================= */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const wrapper = tabelaWrapperRef.current;
      if (!wrapper) return;

      if (!wrapper.contains(e.target as Node)) {
        setSortConfig({ key: "nome", direction: "asc" });
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

      {/* Título geral da página */}
      <Title2
        title="Usuários do sistema"
        subtitle="Visão consolidada de servidores, engajamento e atividade de despacho."
      />

      {/* ==================== KPIs SUPERIORES (fixos) ==================== */}
      <section className="dash-section">
        <div id="vg-kpis">
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

      {/* ==================== GRÁFICOS DE ATIVIDADE ==================== */}
      <section className="dash-section">
        <div className="section-content-flex">
          {/* Distribuição de atividade */}
          <div className="ranking-box">
            <div className="chart-container">
              <p className="chart-title">Distribuição de atividade</p>
              <p className="chart-subtitle">
                Servidores agrupados por faixas de despachos realizados no período{" "}
                <strong>
                  {range.inicioBR} a {range.fimBR}
                </strong>
                .
              </p>
              <div className="mini-chart-wrapper">
                <canvas ref={activityChartRef} />
              </div>
            </div>
          </div>

          {/* Ranking de despachos com medalhas */}
          <div className="ranking-box">
            <div className="vg-chart-card">
              <p className="vg-chart-title">Ranking de despachos no período</p>
              <p className="vg-chart-sub">
                Servidores que mais realizaram despachos entre{" "}
                <strong>{range.inicioBR}</strong> e{" "}
                <strong>{range.fimBR}</strong>.
              </p>

              <ul className="vg-chart-list">
                {rankingWithSecretaria.length === 0 && (
                  <li style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                    Nenhum despacho encontrado no período selecionado.
                  </li>
                )}

                {rankingWithSecretaria.map((r, idx) => (
                  <li key={r.nome} className="vg-chart-item">
                    <span
                      className={`vg-rank-badge ${
                        idx === 0
                          ? "rank-1"
                          : idx === 1
                          ? "rank-2"
                          : idx === 2
                          ? "rank-3"
                          : ""
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="vg-bar">
                      <div className="vg-bar-fill">
                        <span className="vg-value">
                          {r.nome}
                          {r.secretaria
                            ? ` – ${r.secretaria} — ${r.total}`
                            : ` — ${r.total}`}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== EVOLUÇÃO DE NOVOS USUÁRIOS ATIVOS ==================== */}
      <section className="dash-section">
        <div className="chart-container">
          <p className="chart-title">Evolução de novos usuários ativos</p>
          <p className="chart-subtitle">
            Servidores criados no período selecionado e que realizaram ao menos
            um despacho. Agrupado por mês de criação.
          </p>

          <div className="mini-chart-wrapper">
            {newUsersSeries.labels.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                Nenhum novo usuário ativo encontrado no período selecionado.
              </p>
            ) : (
              <canvas ref={newUsersChartRef} />
            )}
          </div>
        </div>
      </section>

      {/* ==================== LISTA DETALHADA ==================== */}
      <section className="dash-section">
        {/* Header da seção com período (modelo B) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12
          }}
        >
          <TitleWithTooltip
            tooltip="Relatório detalhado de servidores, secretaria de atuação e comportamento de despacho no período selecionado."
            className="chart-title"
          >
            Lista detalhada de usuários
          </TitleWithTooltip>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: "0.85rem",
              color: "#6b7280"
            }}
          >
            <span>
              Período:{" "}
              <strong>
                {range.inicioBR} a {range.fimBR}
              </strong>
            </span>

            <select
              className="eco-select"
              value={period}
              onChange={e => setPeriod(e.target.value as PeriodKey)}
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
          {erroUsuarios && (
            <p style={{ color: "#b91c1c", fontSize: "0.9rem" }}>
              {erroUsuarios}
            </p>
          )}

          {loadingUsuarios ? (
            <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
              Carregando usuários...
            </p>
          ) : (
            <table className="cc-table cc-table-usuarios">
              <thead>
                <tr>
                  <th
                    className="cc-col-nome sortable sortable--active"
                    onClick={() => handleSort("nome")}
                    style={{ textAlign: "left" }}
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
                    className="cc-col-secretaria sortable"
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
                    className="cc-col-data sortable"
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
                    className="cc-col-numero sortable"
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
                    className="cc-col-data sortable"
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
                    className="cc-col-numero sortable"
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
                {sortedUsuarios.slice(0, displayCount).map(u => (
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
                      className={isRecent(u.ultimo_despacho) ? "valor-verde" : ""}
                    >
                      {formatDateTime(u.ultimo_despacho)}
                    </td>

                    <td style={{ textAlign: "center" }}>
                      {u.despachos_periodo ?? 0}
                    </td>
                  </tr>
                ))}

                {sortedUsuarios.length === 0 && !loadingUsuarios && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 16 }}>
                      Nenhum usuário encontrado para o período selecionado.
                    </td>
                  </tr>
                )}

                {displayCount < sortedUsuarios.length && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 12, color: "#6b7280" }}>
                      Carregando mais linhas...
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
