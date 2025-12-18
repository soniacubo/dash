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
import ChartDataLabels from "chartjs-plugin-datalabels";

Chart.register(ChartDataLabels);

/* ============================================================
   HELPERS
============================================================ */
const getNomeSetor = (obj: any) =>
  obj?.sector_title || obj?.setor || obj?.nome || "—";

const formatNumber = (v: any, dec = 2) => {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toFixed(dec);
};

const formatPercent = (v: any) => {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toFixed(1) + "%";
};

// Ícone SVG de ordenação
const SortIcon = ({
  active,
  direction
}: {
  active: boolean;
  direction: "asc" | "desc";
}) => {
  const color = active ? "#2563eb" : "#9ca3af";

  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 20 20"
      style={{ marginLeft: 4, flexShrink: 0 }}
    >
      {direction === "asc" ? (
        <path d="M10 5 L5 10 H15 Z" fill={color} />
      ) : (
        <path d="M10 15 L5 10 H15 Z" fill={color} />
      )}
    </svg>
  );
};

/* ============================================================
   TIPOS
============================================================ */
type SetorRow = {
  sector_id: number;
  setor: string;
  parent_id?: number | null;
  nivel?: number;
  hierarquia?: string;
  path?: string;

  servicos_principal_individual?: number;
  servicos_participante_individual?: number;
  servicos_principal_consolidado?: number | string;
  servicos_participante_consolidado?: number | string;
};

type EficienciaRow = {
  sector_id: number;
  setor: string;
  total_solicitacoes: number;
  eficiencia_percentual: number | null;
  engajamento_percentual: number | null;

  // usados para cálculo real de engajamento
  total_concluidas?: number | null;
  total_respondidas?: number | null;
};

type QualidadeRow = {
  sector_id: number;
  setor: string;
  nota_media: number | null;
  total_avaliacoes?: number | null;
};

type UsuariosResumoRow = {
  sector_id: number;
  setor: string;
  total_usuarios?: number;  // 👈 novo campo
};


/* ============================================================
   COMPONENTE PRINCIPAL
============================================================ */
export default function Setores() {
  /* ===========================
       ESTADOS PRINCIPAIS
  =========================== */
  const [treeRows, setTreeRows] = useState<SetorRow[]>([]);

  // Popup / tooltip de indicadores
  const [popupOpen, setPopupOpen] = useState<number | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const popupRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);

  const [hoverInfo, setHoverInfo] = useState<{
    sectorId: number | null;
    type: "ef" | "eng" | "ql" | null;
  }>({ sectorId: null, type: null });

  // Rankings
  const [rankUsuarios, setRankUsuarios] = useState<UsuariosResumoRow[]>([]);
  const [rankEficiencia, setRankEficiencia] = useState<EficienciaRow[]>([]);
  const [rankQualidade, setRankQualidade] = useState<QualidadeRow[]>([]);
  const [rankServicos, setRankServicos] = useState<
    { sector_id: number; setor: string; total_servicos: number }[]
  >([]);

  // Maps para tabela
  const [eficienciaMap, setEficienciaMap] =
    useState<Record<number, EficienciaRow>>({});
  const [qualidadeMap, setQualidadeMap] =
    useState<Record<number, QualidadeRow>>({});
  const [usuariosMap, setUsuariosMap] = useState<Record<number, number>>({});

  // Gráficos
  const [graficoServicos, setGraficoServicos] =
    useState<{ setor: string; total: number }[]>([]);
  const [graficoEficiencia, setGraficoEficiencia] =
    useState<{ setor: string; eficiencia: number }[]>([]);

  const chartServicosRef = useRef<HTMLCanvasElement | null>(null);
  const chartEficienciaRef = useRef<HTMLCanvasElement | null>(null);
  const chartServicosInst = useRef<any>(null);
  const chartEficienciaInst = useRef<any>(null);

  // Expansão da árvore
  const [expandedRoot, setExpandedRoot] =
    useState<Record<number, boolean>>({});

  // Tooltip usuários
  const [openUsersSectorId, setOpenUsersSectorId] =
    useState<number | null>(null);
  const [usersBySector, setUsersBySector] =
    useState<Record<number, any[]>>({});
  const [usersLoading, setUsersLoading] = useState(false);
  const usersControllerRef = useRef<AbortController | null>(null);

  const cacheRef = useMemo(
    () => new Map<number, { data: any[]; ts: number }>(),
    []
  );
  const USERS_CACHE_TTL = 5 * 60 * 1000;

  const fmt = useMemo(() => new Intl.NumberFormat("pt-BR"), []);

  /* ============================================================
     KPI CARDS — FORMATADOS
  ============================================================ */
  const valorEfic =
    rankEficiencia[0] && !isNaN(Number(rankEficiencia[0].eficiencia_percentual))
      ? Number(rankEficiencia[0].eficiencia_percentual).toFixed(1) + "%"
      : "—";

  const nomeSetorEfic = getNomeSetor(rankEficiencia[0]);

  const valorQual =
    rankQualidade[0] && !isNaN(Number(rankQualidade[0].nota_media))
      ? Number(rankQualidade[0].nota_media).toFixed(2)
      : "—";

  const nomeSetorQual = getNomeSetor(rankQualidade[0]);

  const topUsuario = rankUsuarios[0];

  const valorUsuarios =
    topUsuario && topUsuario.total_usuarios != null
      ? Number(topUsuario.total_usuarios)
      : "—";

  const nomeSetorUsuarios = topUsuario?.setor ?? "—";




  const valorServicos =
    rankServicos[0] ? rankServicos[0].total_servicos : "—";

  const nomeSetorServicos = getNomeSetor(rankServicos[0]);

  /* ============================================================
     ORDENACAO — ESTADO
  ============================================================ */
  const [sortConfig, setSortConfig] = useState<{
    column: string | null;
    direction: "asc" | "desc";
    multi: { column: string; direction: "asc" | "desc" }[];
  }>({ column: null, direction: "asc", multi: [] });


  function getNomeSetorById(id: number, tree: any[]) {
    const found = tree.find((s) => s.sector_id === id);
    return found?.setor || found?.sector_title || found?.nome || "—";
  }


  function getConsolidadoSecretariasDaTabela(
    treeRows: SetorRow[],
    eficienciaMap: Record<number, EficienciaRow>,
    usuariosMap: Record<number, number>
  ) {
    const roots = treeRows.filter((r) => (r.nivel ?? 0) === 0);

    return roots.map((r) => {
      const family = treeRows.filter((row) => {
        const rowRoot = Number(
          (row.path || "").split(",")[0] || row.sector_id
        );
        return rowRoot === r.sector_id;
      });

      let total = 0;
      let concluidas = 0;
      let respondidas = 0;

      family.forEach((fr) => {
        const ef = eficienciaMap[fr.sector_id];
        if (ef) {
          total += ef.total_solicitacoes || 0;
          concluidas += ef.total_concluidas || 0;
          respondidas += ef.total_respondidas || 0;
        }
      });

      const eficiencia =
        total > 0 ? (concluidas / total) * 100 : null;

      return {
        sector_id: r.sector_id,
        setor: r.setor,
        eficiencia_percentual: eficiencia,
        total_solicitacoes: total
      };
    });
  }





  function requestSort(column: string, event?: any) {
    setSortConfig((prev) => {
      const isShift = event?.shiftKey;

      if (isShift) {
        const existingIndex = (prev.multi || []).findIndex(
          (c) => c.column === column
        );
        if (existingIndex >= 0) {
          const updated = [...prev.multi];
          const current = updated[existingIndex];
          updated[existingIndex] = {
            column,
            direction: current.direction === "asc" ? "desc" : "asc"
          };
          return { ...prev, multi: updated };
        }

        return {
          ...prev,
          multi: [...(prev.multi || []), { column, direction: "asc" }]
        };
      }

      // clique sem shift: coluna única
      const sameColumn = prev.column === column;
      return {
        column,
        direction: sameColumn && prev.direction === "asc" ? "desc" : "asc",
        multi: []
      };
    });
  }

  /* ============================================================
     ORDENACAO — getSortedRows (livre, ignora hierarquia)
  ============================================================ */
  function getSortedRows() {
    const criteria: { column: string; direction: "asc" | "desc" }[] = [];

    if (sortConfig.multi.length) {
      criteria.push(...sortConfig.multi);
    }
    if (sortConfig.column) {
      criteria.push({
        column: sortConfig.column,
        direction: sortConfig.direction
      });
    }

    if (!criteria.length) return treeRows;

    const rows = [...treeRows];

    function getValue(row: SetorRow, col: string): number {
      switch (col) {
        case "usuarios":
          return usuariosMap[row.sector_id] ?? 0;

        case "servicos": {
          const principal =
            Number(
              row.servicos_principal_consolidado ??
              row.servicos_principal_individual ??
              0
            ) || 0;
          const participante =
            Number(
              row.servicos_participante_consolidado ??
              row.servicos_participante_individual ??
              0
            ) || 0;
          return principal + participante;
        }

        case "eficiencia":
          return Number(
            eficienciaMap[row.sector_id]?.eficiencia_percentual ?? -1
          );

        case "qualidade":
          return Number(qualidadeMap[row.sector_id]?.nota_media ?? -1);

        case "engajamento": {
          const ef = eficienciaMap[row.sector_id];
          if (!ef) return -1;
          const total = ef.total_solicitacoes || 0;
          if (total <= 0) return -1;
          const concluidas = Number(ef.total_concluidas || 0);
          const respondidas = Number(ef.total_respondidas || 0);
          return ((concluidas + respondidas) / total) * 100;
        }

        default:
          return 0;
      }
    }

    return rows.sort((a, b) => {
      for (const c of criteria) {
        const vA = getValue(a, c.column);
        const vB = getValue(b, c.column);

        if (vA < vB) return c.direction === "asc" ? -1 : 1;
        if (vA > vB) return c.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }

  /* ============================================================
     EXPANSÃO DE ROOTS
  ============================================================ */
  const allRootsExpanded = useMemo(() => {
    const roots = treeRows.filter((r) => (r.nivel ?? 0) === 0);
    if (!roots.length) return true;

    return roots.every((r) => {
      const root = Number((r.path || "").split(",")[0] || r.sector_id);
      return expandedRoot[root] !== false;
    });
  }, [expandedRoot, treeRows]);

  function toggleAllRoots() {
    const newState: Record<number, boolean> = {};
    const roots = treeRows.filter((r) => (r.nivel ?? 0) === 0);
    const expand = !allRootsExpanded;

    roots.forEach((r) => {
      const root = Number((r.path || "").split(",")[0] || r.sector_id);
      newState[root] = expand;
    });

    setExpandedRoot(newState);
  }

  function toggleRoot(rootId: number) {
    setExpandedRoot((prev) => ({
      ...prev,
      [rootId]: prev[rootId] === false ? true : !prev[rootId]
    }));
  }

  /* ============================================================
     TOOLTIP MINI — EFICIÊNCIA | ENGAJAMENTO | QUALIDADE
  ============================================================ */
  function showInfo(sectorId: number, type: "ef" | "eng" | "ql") {
    setHoverInfo({ sectorId, type });
  }

  function hideInfo() {
    setHoverInfo({ sectorId: null, type: null });
  }

  /* ============================================================
     CLICK FORA DO POPUP
  ============================================================ */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node)
      ) {
        setPopupOpen(null);
      }
    }

    if (popupOpen != null) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [popupOpen]);

  /* ============================================================
     CARREGAMENTO MASTER — PROMISE.ALL
  ============================================================ */

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        // clicou fora da tabela → limpa ordenação
        setSortConfig({
          column: null,
          direction: "asc",
          multi: []
        });
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    async function loadAll() {
      try {
        const [setoresRes, usuariosRes, efRes, qualRes] = await Promise.all([
          fetch(`${API_BASE_URL}/setores`, { signal: ac.signal }),
          fetch(`${API_BASE_URL}/setores-usuarios-resumo`, { signal: ac.signal }),
          fetch(`${API_BASE_URL}/setores-eficiencia`, { signal: ac.signal }),
          fetch(`${API_BASE_URL}/setores-qualidade`, { signal: ac.signal })
        ]);

        const [setores, usuariosResumo, eficienciaList, qualidadeList] =
          await Promise.all([
            setoresRes.json(),
            usuariosRes.json(),
            efRes.json(),
            qualRes.json()
          ]);

        setTreeRows(setores || []);

        const exp: Record<number, boolean> = {};
        (setores || []).forEach((row: SetorRow) => {
          const root = Number(
            (row.path || "").split(",")[0] || row.sector_id
          );
          exp[root] = false;
        });
        setExpandedRoot(exp);

        const roots = (setores || []).filter(
          (s: SetorRow) => (s.nivel ?? 0) === 0
        );

        const rankServ = roots
          .map((s: SetorRow) => ({
            sector_id: s.sector_id,
            setor: s.setor,
            total_servicos:
              Number(s.servicos_principal_consolidado || 0) +
              Number(s.servicos_participante_consolidado || 0)
          }))
          .sort((a, b) => b.total_servicos - a.total_servicos)
          .slice(0, 5);

        setRankServicos(rankServ);
        setGraficoServicos(
          rankServ.map((r) => ({
            setor: r.setor,
            total: r.total_servicos
          }))
        );

        const uMap: Record<number, number> = {};

        (usuariosResumo || []).forEach((u: any) => {
          uMap[u.sector_id] = Number(u.total_usuarios ?? 0);  // 👈 CHAVE CORRETA
        });

        setUsuariosMap(uMap);

        const rankU = [...(usuariosResumo || [])]
          .sort(
            (a, b) =>
              Number(b.total_usuarios ?? 0) - Number(a.total_usuarios ?? 0)
          )
          .slice(0, 5);

        setRankUsuarios(rankU);


        const efMap: Record<number, EficienciaRow> = {};
        (eficienciaList || []).forEach((e: EficienciaRow) => {
          efMap[e.sector_id] = e;
        });
        setEficienciaMap(efMap);


      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.error("Erro ao carregar setores:", err);
        }
      }
    }

    loadAll();
    return () => ac.abort();
  }, []);


  useEffect(() => {
    if (!chartServicosRef.current || graficoServicos.length === 0) return;

    const ctx: any = chartServicosRef.current.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 600, 0);
    gradient.addColorStop(0, "rgba(37,99,235,0.85)");
    gradient.addColorStop(1, "rgba(29,78,216,0.95)");

    if (chartServicosInst.current) chartServicosInst.current.destroy();

    chartServicosInst.current = new Chart(chartServicosRef.current, {
      type: "bar",
      data: {
        labels: graficoServicos.map((s) => s.setor),
        datasets: [
          {
            label: "Serviços",
            data: graficoServicos.map((s) => s.total),
            backgroundColor: gradient,
            borderRadius: 8,
            barThickness: 22
          }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
          datalabels: {
            anchor: "end",
            align: "right",
            formatter: (value: number) => fmt.format(value),
            color: "#ffffff",
            font: { weight: "bold", size: 11 },
            clip: true
          }
        },
        scales: {
          x: { beginAtZero: true, grid: { display: false } },
          y: { grid: { display: false } }
        }
      }
    });

    return () => chartServicosInst.current?.destroy();
  }, [graficoServicos, fmt]);


      useEffect(() => {
          if (!chartEficienciaRef.current || treeRows.length === 0) return;

          // 🔹 pegar apenas roots (secretarias)
          const roots = treeRows.filter((r) => (r.nivel ?? 0) === 0);

          const dados = roots.map((r) => {
            const family = treeRows.filter((row) => {
              const rowRoot = Number(
                (row.path || "").split(",")[0] || row.sector_id
              );
              return rowRoot === r.sector_id;
            });

            let total = 0;
            let concluidas = 0;

            family.forEach((fr) => {
              const ef = eficienciaMap[fr.sector_id];
              if (ef) {
                total += ef.total_solicitacoes || 0;
                concluidas += ef.total_concluidas || 0;
              }
            });

            const eficiencia =
              total > 0 ? (concluidas / total) * 100 : 0;

            return {
              setor: r.setor,
              eficiencia
            };
          });

          // 🔹 ordenar e pegar top 5
          const top5 = dados
            .sort((a, b) => b.eficiencia - a.eficiencia)
            .slice(0, 5);

          const ctx: any = chartEficienciaRef.current.getContext("2d");

          const gradient = ctx.createLinearGradient(0, 0, 600, 0);
          gradient.addColorStop(0, "rgba(16,185,129,0.85)");
          gradient.addColorStop(1, "rgba(5,150,105,0.95)");

          if (chartEficienciaInst.current)
            chartEficienciaInst.current.destroy();

          chartEficienciaInst.current = new Chart(chartEficienciaRef.current, {
            type: "bar",
            data: {
              labels: top5.map((d) => d.setor),
              datasets: [
                {
                  label: "Eficiência (%)",
                  data: top5.map((d) => d.eficiencia),
                  backgroundColor: gradient,
                  borderRadius: 8,
                  barThickness: 22
                }
              ]
            },
            options: {
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx: any) =>
                      `${ctx.raw.toFixed(1)}% de eficiência`
                  }
                },
                datalabels: {
                  anchor: "end",
                  align: "right",
                  formatter: (v: number) => v.toFixed(1) + "%",
                  color: "#ffffff",
                  font: { weight: "bold", size: 11 },
                  clip: true
                }
              },
              scales: {
                x: {
                  beginAtZero: true,
                  max: 100,
                  grid: { display: false },
                  ticks: {
                    callback: (v: any) => v + "%"
                  }
                },
                y: {
                  grid: { display: false }
                }
              }
            }
          });

          return () => chartEficienciaInst.current?.destroy();
        }, [treeRows, eficienciaMap]);


  async function showSectorUsers(sectorId: number) {
    setOpenUsersSectorId(sectorId);

    const now = Date.now();
    const cached = cacheRef.get(sectorId);
    if (cached && now - cached.ts < USERS_CACHE_TTL) {
      setUsersBySector((prev) => ({ ...prev, [sectorId]: cached.data }));
      return;
    }

    try {
      setUsersLoading(true);
      if (usersControllerRef.current) usersControllerRef.current.abort();
      const ac = new AbortController();
      usersControllerRef.current = ac;
      const r = await fetch(`${API_BASE_URL}/setores/${sectorId}/usuarios`, { signal: ac.signal });
      const data = await r.json();

      cacheRef.set(sectorId, { data: data || [], ts: now });

      setUsersBySector((prev) => ({
        ...prev,
        [sectorId]: data || []
      }));
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      usersControllerRef.current?.abort();
    };
  }, []);

  function hideSectorUsers(sectorId: number) {
    if (openUsersSectorId === sectorId) setOpenUsersSectorId(null);
  }

  /* ============================================================
     CORES DAS CÉLULAS (CLASSES CSS)
  ============================================================ */
  function getColorClassEfEng(v: any) {
    const n = Number(v);
    if (isNaN(n)) return "valor-neutro";
    if (n < 40) return "valor-vermelho";
    if (n <= 70) return "valor-laranja";
    return "valor-verde";
  }

  function getColorClassQual(v: any) {
    const n = Number(v);
    if (isNaN(n)) return "valor-neutro";
    if (n < 3) return "valor-vermelho";
    if (n <= 3.5) return "valor-laranja";
    return "valor-verde";
  }

  /* ============================================================
     RENDER — JSX
  ============================================================ */
  return (
    <main className="main-container">
      <Header />

      {/* ===================== 1) INDICADORES POR SETOR ===================== */}
      <section className="dash-section">
        <div className="section-title-wrapper">
          <TitleWithTooltip
            tooltip="Desempenho geral dos setores."
            className="section-title-main"
          >
            Indicadores por setor
          </TitleWithTooltip>
          <p className="section-title-sub">
            Eficiência, usuários e qualidade.
          </p>
        </div>

        <div className="setores-kpi-grid">
          <div className="setor-kpi-card">
            <div className="setor-kpi-icon lightning">⚡</div>
            <div className="setor-kpi-label">Mais eficiente</div>
            <div className="setor-kpi-value">{valorEfic}</div>
            <div
              className="setor-kpi-sector"
              style={{ fontSize: "1.05rem", fontWeight: 700 }}
            >
              {nomeSetorEfic}
            </div>
          </div>

          <div className="setor-kpi-card">
            <div className="setor-kpi-icon star">⭐</div>
            <div className="setor-kpi-label">Melhor qualidade</div>
            <div className="setor-kpi-value">{valorQual}</div>
            <div
              className="setor-kpi-sector"
              style={{ fontSize: "1.05rem", fontWeight: 700 }}
            >
              {nomeSetorQual}
            </div>
          </div>

          <div className="setor-kpi-card">
            <div className="setor-kpi-icon users">👥</div>
            <div className="setor-kpi-label">Mais usuários</div>
            <div className="setor-kpi-value">{valorUsuarios}</div>
            <div
              className="setor-kpi-sector"
              style={{ fontSize: "1.05rem", fontWeight: 700 }}
            >
              {nomeSetorUsuarios}
            </div>
          </div>

          <div className="setor-kpi-card">
            <div className="setor-kpi-icon trophy">🏆</div>
            <div className="setor-kpi-label">Mais serviços</div>
            <div className="setor-kpi-value">{valorServicos}</div>
            <div
              className="setor-kpi-sector"
              style={{ fontSize: "1.05rem", fontWeight: 700 }}
            >
              {nomeSetorServicos}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== 2) RANKING – GRÁFICOS ===================== */}
      <section className="dash-section">
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <TitleWithTooltip
            tooltip="Setores com mais serviços e maior eficiência."
            className="section-title-main"
          >
            Ranking de setores
          </TitleWithTooltip>
          <p className="section-title-sub">
            Serviços cadastrados e eficiência.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            width: "100%",
            marginTop: 10
          }}
        >
          <article className="period-card">
            <header className="period-card-header">
              <h3>Serviços cadastrados</h3>
              <span className="period-card-subtitle">Top 5</span>
            </header>

            <div className="period-card-body">
              <div className="mini-chart-wrapper" style={{ height: 300 }}>
                <canvas ref={chartServicosRef}></canvas>
              </div>
            </div>
          </article>

          <article className="period-card">
            <header className="period-card-header">
              <h3>Eficiência</h3>
              <span className="period-card-subtitle">Top 5</span>
            </header>

            <div className="period-card-body">
              <div className="mini-chart-wrapper" style={{ height: 300 }}>
                <canvas ref={chartEficienciaRef}></canvas>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* ===================== 3) TABELA COMPLETA ===================== */}
      <section className="dash-section">
        <div className="section-title-wrapper" style={{ textAlign: "center" }}>
          <TitleWithTooltip
            tooltip="Visão de todos os setores."
            className="section-title-main"
          >
            Visão consolidada
          </TitleWithTooltip>
          <p className="section-title-sub">
            Usuários, serviços, eficiência, engajamento e qualidade.
          </p>
        </div>

        <table id="tabela-setores" ref={tableRef}>
          <thead>
            <tr>
              <th className="col-setor">
                <div className="setor-th-wrapper">
                  <button
                    className="toggle-all-roots"
                    onClick={toggleAllRoots}
                  >
                    {allRootsExpanded ? "▼" : "▶"}
                  </button>
                  <span>Setores</span>
                </div>
              </th>

              {/* Cabeçalhos com ordenação */}
              <th
                className="th-sort"
                onClick={(e) => requestSort("usuarios", e)}
                style={{
                  cursor: "pointer",
                  color:
                    sortConfig.column === "usuarios"
                      ? "#111827"
                      : "#6b7280",
                  backgroundColor:
                    sortConfig.column === "usuarios"
                      ? "#eef2ff"
                      : "transparent"
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Usuários
                  <SortIcon
                    active={sortConfig.column === "usuarios"}
                    direction={sortConfig.direction}
                  />
                </span>
              </th>

              <th
                className="th-sort"
                onClick={(e) => requestSort("servicos", e)}
                style={{
                  cursor: "pointer",
                  color:
                    sortConfig.column === "servicos"
                      ? "#111827"
                      : "#6b7280",
                  backgroundColor:
                    sortConfig.column === "servicos"
                      ? "#eef2ff"
                      : "transparent"
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Serviços
                  <SortIcon
                    active={sortConfig.column === "servicos"}
                    direction={sortConfig.direction}
                  />
                </span>
              </th>

              <th
                className="th-sort"
                onClick={(e) => requestSort("eficiencia", e)}
                style={{
                  cursor: "pointer",
                  color:
                    sortConfig.column === "eficiencia"
                      ? "#111827"
                      : "#6b7280",
                  backgroundColor:
                    sortConfig.column === "eficiencia"
                      ? "#eef2ff"
                      : "transparent"
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Eficiência
                  <SortIcon
                    active={sortConfig.column === "eficiencia"}
                    direction={sortConfig.direction}
                  />
                </span>
              </th>

              <th
                className="th-sort"
                onClick={(e) => requestSort("engajamento", e)}
                style={{
                  cursor: "pointer",
                  color:
                    sortConfig.column === "engajamento"
                      ? "#111827"
                      : "#6b7280",
                  backgroundColor:
                    sortConfig.column === "engajamento"
                      ? "#eef2ff"
                      : "transparent"
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Engajamento
                  <SortIcon
                    active={sortConfig.column === "engajamento"}
                    direction={sortConfig.direction}
                  />
                </span>
              </th>

              <th
                className="th-sort"
                onClick={(e) => requestSort("qualidade", e)}
                style={{
                  cursor: "pointer",
                  color:
                    sortConfig.column === "qualidade"
                      ? "#111827"
                      : "#6b7280",
                  backgroundColor:
                    sortConfig.column === "qualidade"
                      ? "#eef2ff"
                      : "transparent"
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Qualidade
                  <SortIcon
                    active={sortConfig.column === "qualidade"}
                    direction={sortConfig.direction}
                  />
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            {getSortedRows().map((r) => {
              const isRoot = (r.nivel ?? 0) === 0;
              const indent = (r.nivel ?? 0) * 18;

              const principal =
                Number(
                  isRoot
                    ? r.servicos_principal_consolidado
                    : r.servicos_principal_individual
                ) || 0;

              const participante =
                Number(
                  isRoot
                    ? r.servicos_participante_consolidado
                    : r.servicos_participante_individual
                ) || 0;

              const rootId = Number(
                (r.path || "").split(",")[0] || r.sector_id
              );

              const ef = eficienciaMap[r.sector_id];
              const efNum =
                ef && ef.eficiencia_percentual != null
                  ? Number(ef.eficiencia_percentual)
                  : null;

              // novo engajamento: (concluídas + respondidas) / total
              let engNum: number | null = null;
              if (ef) {
                const total = ef.total_solicitacoes || 0;
                if (total > 0) {
                  const concluidas = Number(ef.total_concluidas || 0);
                  const respondidas = Number(ef.total_respondidas || 0);
                  engNum = ((concluidas + respondidas) / total) * 100;
                }
              }

              const ql = qualidadeMap[r.sector_id];
              const qlNum =
                ql?.nota_media != null ? Number(ql.nota_media) : null;

              const usuariosRaw = usuariosMap[r.sector_id] ?? 0;
              const usuariosFmt = fmt.format(usuariosRaw);

              const visible = isRoot || expandedRoot[rootId] !== false;

              const classEf = getColorClassEfEng(efNum);
              const classEng = getColorClassEfEng(engNum);
              const classQl = getColorClassQual(qlNum);

              /* ============================================================
                 CONSOLIDADO (ROOT)
              ============================================================ */
              let consol = {
                usuarios: 0,
                total_solicitacoes: 0,
                concluidas: 0,
                respondidas: 0,
                eficiencia_percentual: null as number | null,
                engajamento_percentual: null as number | null,
                qualidade_media: null as number | null
              };

              if (isRoot) {
                const family = treeRows.filter((row) => {
                  const rowRoot = Number(
                    (row.path || "").split(",")[0] || row.sector_id
                  );
                  return rowRoot === r.sector_id;
                });

                let somaAval = 0;
                let somaNotas = 0;

                family.forEach((fr) => {
                  consol.usuarios += usuariosMap[fr.sector_id] ?? 0;

                  const efRow = eficienciaMap[fr.sector_id];
                  if (efRow) {
                    consol.total_solicitacoes +=
                      efRow.total_solicitacoes || 0;
                    consol.concluidas += efRow.total_concluidas || 0;
                    consol.respondidas += efRow.total_respondidas || 0;
                  }

                  const qRow = qualidadeMap[fr.sector_id];
                  if (qRow?.nota_media != null) {
                    const votos = qRow.total_avaliacoes || 0;
                    if (votos > 0) {
                      somaAval += votos;
                      somaNotas += votos * qRow.nota_media;
                    }
                  }
                });

                consol.eficiencia_percentual =
                  consol.total_solicitacoes > 0
                    ? (consol.concluidas / consol.total_solicitacoes) * 100
                    : null;

                consol.engajamento_percentual =
                  consol.total_solicitacoes > 0
                    ? ((consol.concluidas + consol.respondidas) /
                      consol.total_solicitacoes) *
                    100
                    : null;

                consol.qualidade_media =
                  somaAval > 0 ? somaNotas / somaAval : null;
              }

              /* ============================================================
                 RENDER DA ROW
              ============================================================ */
              return (
                <React.Fragment key={r.sector_id}>
                  <tr
                    className={isRoot ? "nivel-0" : ""}
                    style={{ display: visible ? "" : "none" }}
                  >
                    {/* SETOR */}
                    <td className="td-setor" style={{ position: "relative" }}>
                      <div
                        className="td-setor-inner"
                        style={{
                          marginLeft: indent,
                          cursor: "pointer"
                        }}
                        onClick={(e) => {
                          setPopupPos({
                            x: e.clientX + 12,
                            y: e.clientY - 40
                          });
                          setPopupOpen(
                            popupOpen === r.sector_id ? null : r.sector_id
                          );
                        }}
                      >
                        {isRoot && (
                          <button
                            className="toggle"
                            onClick={(e2) => {
                              e2.stopPropagation();
                              toggleRoot(rootId);
                            }}
                          >
                            {expandedRoot[rootId] !== false ? "▼" : "▶"}
                          </button>
                        )}

                        <span className="td-setor-nome">{r.setor}</span>
                      </div>

                      {/* POPUP LATERAL PRÓXIMO AO CLIQUE */}
                      {isRoot && popupOpen === r.sector_id && popupPos && (
                        <div
                          ref={popupRef}
                          className="popup-lateral"
                          style={{
                            position: "fixed",
                            left: popupPos.x,
                            top: popupPos.y,
                            zIndex: 50
                          }}
                        >
                          <button
                            className="popup-close"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPopupOpen(null);
                            }}
                          >
                            ✖
                          </button>

                          <h4 className="popup-title">
                            Resumo Consolidado — {r.setor}
                          </h4>

                          <div className="popup-section">
                            <h5>Usuários & Serviços</h5>
                            <div className="popup-grid">
                              <span>Usuários:</span>
                              <strong>{fmt.format(consol.usuarios)}</strong>

                              <span>Serviços principais:</span>
                              <strong>{fmt.format(principal)}</strong>

                              <span>Serviços participantes:</span>
                              <strong>{fmt.format(participante)}</strong>
                            </div>
                          </div>

                          <div className="popup-section">
                            <h5>Atendimentos</h5>
                            <div className="popup-grid">
                              <span>Solicitações:</span>
                              <strong>
                                {fmt.format(consol.total_solicitacoes)}
                              </strong>

                              <span>Concluídas:</span>
                              <strong>{fmt.format(consol.concluidas)}</strong>

                              <span>Respondidas:</span>
                              <strong>
                                {fmt.format(consol.respondidas)}
                              </strong>
                            </div>
                          </div>

                          <div className="popup-section">
                            <h5>Indicadores</h5>
                            <div className="popup-grid">
                              <span>Eficiência:</span>
                              <strong className={classEf}>
                                {consol.eficiencia_percentual?.toFixed(1) ??
                                  "—"}
                                %
                              </strong>

                              <span>Engajamento:</span>
                              <strong className={classEng}>
                                {consol.engajamento_percentual?.toFixed(1) ??
                                  "—"}
                                %
                              </strong>

                              <span>Qualidade:</span>
                              <strong className={classQl}>
                                {consol.qualidade_media
                                  ? consol.qualidade_media.toFixed(2)
                                  : "—"}
                              </strong>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* USUÁRIOS */}
                    <td
                      className="td-usuarios"
                      style={{
                        textAlign: "center",
                        position: "relative",
                        cursor: "pointer"
                      }}
                      onMouseEnter={() => showSectorUsers(r.sector_id)}
                      onMouseLeave={() => hideSectorUsers(r.sector_id)}
                    >
                      {usuariosFmt}

                      {openUsersSectorId === r.sector_id && (
                        <div
                          className="tooltip-mini"
                          style={{ width: 240, maxWidth: 260 }}
                        >
                          <strong>Usuários</strong>

                          {usersLoading ? (
                            <div
                              style={{
                                padding: "8px 0",
                                fontSize: ".85rem",
                                color: "#6b7280"
                              }}
                            >
                              Carregando...
                            </div>
                          ) : (
                            <div
                              style={{
                                maxHeight: 150,
                                overflowY: "auto",
                                overflowX: "hidden",
                                marginTop: 4,
                                paddingRight: 6
                              }}
                            >
                              {(usersBySector[r.sector_id] || []).length ===
                                0 ? (
                                <div
                                  style={{
                                    padding: 6,
                                    fontSize: ".85rem",
                                    color: "#9ca3af"
                                  }}
                                >
                                  Nenhum usuário encontrado
                                </div>
                              ) : (
                                usersBySector[r.sector_id].map(
                                  (u: any, idx: number) => (
                                    <div
                                      key={idx}
                                      style={{
                                        padding: "4px 0",
                                        borderBottom:
                                          "1px solid #f3f4f6"
                                      }}
                                    >
                                      <div style={{ fontWeight: 600 }}>
                                        {u.nome}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: ".8rem",
                                          color: "#6b7280",
                                          marginTop: 2
                                        }}
                                      >
                                        {u.email || "—"}
                                      </div>
                                    </div>
                                  )
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* SERVIÇOS */}
                    <td style={{ textAlign: "center" }}>
                      {fmt.format(principal)} / {fmt.format(participante)}
                    </td>

                    {/* EFICIÊNCIA */}
                    <td
                      className={classEf}
                      style={{ textAlign: "center", position: "relative" }}
                      onMouseEnter={() => showInfo(r.sector_id, "ef")}
                      onMouseLeave={hideInfo}
                    >
                      {efNum != null ? efNum.toFixed(1) + "%" : "—"}

                      {hoverInfo.sectorId === r.sector_id &&
                        hoverInfo.type === "ef" && (
                          <div className="tooltip-mini">
                            <strong>Eficiência</strong>
                            <div>
                              Total:{" "}
                              {fmt.format(ef?.total_solicitacoes || 0)}
                            </div>
                            <div>
                              Concluídas:{" "}
                              {fmt.format(ef?.total_concluidas || 0)}
                            </div>
                            <hr />
                            <small>
                              Fórmula: concluídas ÷ total × 100
                            </small>
                          </div>
                        )}
                    </td>

                    {/* ENGAJAMENTO */}
                    <td
                      className={classEng}
                      style={{ textAlign: "center", position: "relative" }}
                      onMouseEnter={() => showInfo(r.sector_id, "eng")}
                      onMouseLeave={hideInfo}
                    >
                      {engNum != null ? engNum.toFixed(1) + "%" : "—"}

                      {hoverInfo.sectorId === r.sector_id &&
                        hoverInfo.type === "eng" && (
                          <div className="tooltip-mini">
                            <strong>Engajamento</strong>
                            <div>
                              Total:{" "}
                              {fmt.format(ef?.total_solicitacoes || 0)}
                            </div>
                            <div>
                              Concluídas:{" "}
                              {fmt.format(ef?.total_concluidas || 0)}
                            </div>
                            <div>
                              Respondidas:{" "}
                              {fmt.format(ef?.total_respondidas || 0)}
                            </div>
                            <hr />
                            <small>
                              Fórmula: (concluídas + respondidas) ÷ total ×
                              100
                            </small>
                          </div>
                        )}
                    </td>

                    {/* QUALIDADE */}
                    <td
                      className={classQl}
                      style={{ textAlign: "center", position: "relative" }}
                      onMouseEnter={() => showInfo(r.sector_id, "ql")}
                      onMouseLeave={hideInfo}
                    >
                      {qlNum != null ? qlNum.toFixed(2) : "—"}

                      {hoverInfo.sectorId === r.sector_id &&
                        hoverInfo.type === "ql" && (
                          <div className="tooltip-mini">
                            <strong>Qualidade</strong>
                            <div>
                              Avaliações:{" "}
                              {fmt.format(ql?.total_avaliacoes || 0)}
                            </div>
                            <div>
                              Média:{" "}
                              {ql?.nota_media != null
                                ? Number(ql.nota_media).toFixed(2)
                                : "—"}
                            </div>
                            <hr />
                            <small>
                              Fórmula: soma(nota × votos) ÷ total
                            </small>
                          </div>
                        )}
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </section>

      <footer
        style={{
          marginTop: 24,
          textAlign: "center",
          fontSize: 12,
          color: "#6b7280"
        }}
      >
        Cidade Conectada — BI Dashboard
      </footer>
    </main>
  );
}
