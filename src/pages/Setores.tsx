import React, { useEffect, useMemo, useRef, useState } from "react";

import Header from "../components/Header";
import TitleWithTooltip from "../components/TitleWithTooltip";
import { API_BASE_URL } from "../app";

import Chart from "chart.js/auto";
import ChartDataLabels from "chartjs-plugin-datalabels";

Chart.register(ChartDataLabels);

/* ============================================================
   HELPERS
============================================================ */
const getNomeSetor = (obj: any) => obj?.sector_title || obj?.setor || obj?.nome || "—";

const formatNumber = (v: any, dec = 2) => {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toFixed(dec);
};

const formatPercent = (v: any) => {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toFixed(1) + "%";
};

const getRootIdFromPath = (row: { path?: string; sector_id: number }) => {
  const first = String(row.path || "").split(",")[0];
  const root = Number(first || row.sector_id);
  return Number.isFinite(root) ? root : row.sector_id;
};

// Ícone SVG de ordenação
const SortIcon = ({
  active,
  direction,
}: {
  active: boolean;
  direction: "asc" | "desc";
}) => {
  const color = active ? "#2563eb" : "#9ca3af";
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" style={{ marginLeft: 4, flexShrink: 0 }}>
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

  // legado: usado apenas para tabela (principal/participante)
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

  total_concluidas?: number | null;
  total_respondidas?: number | null;
  total_abertas?: number | null;
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
  total_usuarios?: number;
};

type RankingServicosRoot = {
  sector_id: number; // root_id
  setor: string;     // root title
  total_servicos: number; // serviços únicos ativos
};

type ConsolidadoRoot = {
  sector_id: number; // root_id
  setor: string;     // root title

  usuarios: number;

  total_solicitacoes: number;
  concluidas: number;
  respondidas: number;

  eficiencia_percentual: number | null;
  engajamento_percentual: number | null;

  qualidade_media: number | null;
  qualidade_total_avaliacoes: number;
};

/* ============================================================
   COMPONENTE
============================================================ */
export default function Setores() {
  /* ===========================
       ESTADOS PRINCIPAIS
  =========================== */
  const [treeRows, setTreeRows] = useState<SetorRow[]>([]);

  // Popup / tooltip do consolidado
  const [popupOpen, setPopupOpen] = useState<number | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);

  const [hoverInfo, setHoverInfo] = useState<{
    sectorId: number | null;
    type: "ef" | "eng" | "ql" | null;
  }>({ sectorId: null, type: null });

  // Maps (tabela e cálculos)
  const [eficienciaMap, setEficienciaMap] = useState<Record<number, EficienciaRow>>({});
  const [qualidadeMap, setQualidadeMap] = useState<Record<number, QualidadeRow>>({});
  const [usuariosMap, setUsuariosMap] = useState<Record<number, number>>({});

  // Rankings (roots)
  const [rankServicosRoots, setRankServicosRoots] = useState<RankingServicosRoot[]>([]);
  const [rankEficienciaRoots, setRankEficienciaRoots] = useState<ConsolidadoRoot[]>([]);
  const [rankQualidadeRoots, setRankQualidadeRoots] = useState<ConsolidadoRoot[]>([]);
  const [rankUsuariosRoots, setRankUsuariosRoots] = useState<ConsolidadoRoot[]>([]);

  // Toggle (serviços)
  const [showAllServicos, setShowAllServicos] = useState(false);

  // Gráficos
  const chartServicosRef = useRef<HTMLCanvasElement | null>(null);
  const chartEficienciaRef = useRef<HTMLCanvasElement | null>(null);
  const chartServicosInst = useRef<any>(null);
  const chartEficienciaInst = useRef<any>(null);

  // Expansão da árvore
  const [expandedRoot, setExpandedRoot] = useState<Record<number, boolean>>({});

  // Tooltip usuários
  const [openUsersSectorId, setOpenUsersSectorId] = useState<number | null>(null);
  const [usersBySector, setUsersBySector] = useState<Record<number, any[]>>({});
  const [usersLoading, setUsersLoading] = useState(false);
  const usersControllerRef = useRef<AbortController | null>(null);

  // Cache de usuários por setor (tooltip)
  const cacheRef = useMemo(() => new Map<number, { data: any[]; ts: number }>(), []);
  const USERS_CACHE_TTL = 5 * 60 * 1000;

  const fmt = useMemo(() => new Intl.NumberFormat("pt-BR"), []);

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
     CONSOLIDAÇÃO ÚNICA (FONTE DA VERDADE PARA ROOTS)
     -> usada por KPIs, Ranking Eficiência (igual tabela) e Rankings
  ============================================================ */
  const roots = useMemo(() => treeRows.filter((r) => (r.nivel ?? 0) === 0), [treeRows]);

  const familyByRoot = useMemo(() => {
    const map: Record<number, SetorRow[]> = {};
    for (const row of treeRows) {
      const rootId = getRootIdFromPath(row);
      if (!map[rootId]) map[rootId] = [];
      map[rootId].push(row);
    }
    return map;
  }, [treeRows]);

  const consolidadoRoots: ConsolidadoRoot[] = useMemo(() => {
    if (!roots.length) return [];

    return roots.map((root) => {
      const fam = familyByRoot[root.sector_id] || [root];

      let usuarios = 0;
      let total_solicitacoes = 0;
      let concluidas = 0;
      let respondidas = 0;

      let somaAval = 0;
      let somaNotas = 0;

      fam.forEach((fr) => {
        usuarios += usuariosMap[fr.sector_id] ?? 0;

        const ef = eficienciaMap[fr.sector_id];
        if (ef) {
          total_solicitacoes += ef.total_solicitacoes || 0;
          concluidas += Number(ef.total_concluidas || 0);
          respondidas += Number(ef.total_respondidas || 0);
        }

        const q = qualidadeMap[fr.sector_id];
        if (q?.nota_media != null) {
          const votos = Number(q.total_avaliacoes || 0);
          if (votos > 0) {
            somaAval += votos;
            somaNotas += votos * Number(q.nota_media);
          }
        }
      });

      const eficiencia_percentual =
        total_solicitacoes > 0 ? (concluidas / total_solicitacoes) * 100 : null;

      const engajamento_percentual =
        total_solicitacoes > 0 ? ((concluidas + respondidas) / total_solicitacoes) * 100 : null;

      const qualidade_media = somaAval > 0 ? somaNotas / somaAval : null;

      return {
        sector_id: root.sector_id,
        setor: root.setor,
        usuarios,
        total_solicitacoes,
        concluidas,
        respondidas,
        eficiencia_percentual,
        engajamento_percentual,
        qualidade_media,
        qualidade_total_avaliacoes: somaAval,
      };
    });
  }, [roots, familyByRoot, usuariosMap, eficienciaMap, qualidadeMap]);

  /* ============================================================
     KPIs (agora coerentes por ROOT/NÍVEL 0)
  ============================================================ */
  const topEficRoot = useMemo(() => {
    return [...consolidadoRoots]
      .filter((r) => r.eficiencia_percentual != null)
      .sort((a, b) => Number(b.eficiencia_percentual) - Number(a.eficiencia_percentual))[0];
  }, [consolidadoRoots]);

  const topQualRoot = useMemo(() => {
    return [...consolidadoRoots]
      .filter((r) => r.qualidade_media != null)
      .sort((a, b) => Number(b.qualidade_media) - Number(a.qualidade_media))[0];
  }, [consolidadoRoots]);

  const topUsersRoot = useMemo(() => {
    return [...consolidadoRoots].sort((a, b) => b.usuarios - a.usuarios)[0];
  }, [consolidadoRoots]);

  const topServicosRoot = useMemo(() => {
    return [...rankServicosRoots].sort((a, b) => b.total_servicos - a.total_servicos)[0];
  }, [rankServicosRoots]);

  const valorEfic = topEficRoot?.eficiencia_percentual != null ? formatPercent(topEficRoot.eficiencia_percentual) : "—";
  const nomeSetorEfic = topEficRoot ? getNomeSetor(topEficRoot) : "—";

  const valorQual = topQualRoot?.qualidade_media != null ? formatNumber(topQualRoot.qualidade_media, 2) : "—";
  const nomeSetorQual = topQualRoot ? getNomeSetor(topQualRoot) : "—";

  const valorUsuarios = topUsersRoot ? fmt.format(topUsersRoot.usuarios || 0) : "—";
  const nomeSetorUsuarios = topUsersRoot ? getNomeSetor(topUsersRoot) : "—";

  const valorServicos = topServicosRoot ? fmt.format(topServicosRoot.total_servicos || 0) : "—";
  const nomeSetorServicos = topServicosRoot ? getNomeSetor(topServicosRoot) : "—";

  /* ============================================================
     ORDENACAO — ESTADO
  ============================================================ */
  const [sortConfig, setSortConfig] = useState<{
    column: string | null;
    direction: "asc" | "desc";
    multi: { column: string; direction: "asc" | "desc" }[];
  }>({ column: null, direction: "asc", multi: [] });

  function requestSort(column: string, event?: any) {
    setSortConfig((prev) => {
      const isShift = event?.shiftKey;

      if (isShift) {
        const existingIndex = (prev.multi || []).findIndex((c) => c.column === column);
        if (existingIndex >= 0) {
          const updated = [...prev.multi];
          const current = updated[existingIndex];
          updated[existingIndex] = {
            column,
            direction: current.direction === "asc" ? "desc" : "asc",
          };
          return { ...prev, multi: updated };
        }

        return {
          ...prev,
          multi: [...(prev.multi || []), { column, direction: "asc" }],
        };
      }

      const sameColumn = prev.column === column;
      return {
        column,
        direction: sameColumn && prev.direction === "asc" ? "desc" : "asc",
        multi: [],
      };
    });
  }

  /* ============================================================
     ORDENACAO — getSortedRows (livre, ignora hierarquia)
  ============================================================ */
  function getSortedRows() {
    const criteria: { column: string; direction: "asc" | "desc" }[] = [];

    if (sortConfig.multi.length) criteria.push(...sortConfig.multi);
    if (sortConfig.column) criteria.push({ column: sortConfig.column, direction: sortConfig.direction });
    if (!criteria.length) return treeRows;

    const rows = [...treeRows];

    function getValue(row: SetorRow, col: string): number {
      switch (col) {
        case "usuarios":
          return usuariosMap[row.sector_id] ?? 0;

        case "servicos": {
          const principal = Number(row.servicos_principal_individual ?? 0) || 0;
          const participante = Number(row.servicos_participante_individual ?? 0) || 0;
          // Para root, o legado vinha consolidado, mas tabela mostra principal/participante de root consolidado:
          // aqui mantemos valor comparável: root usa consolidado; leaf usa individual.
          const isRoot = (row.nivel ?? 0) === 0;
          const p = Number(isRoot ? row.servicos_principal_consolidado ?? 0 : principal) || 0;
          const part = Number(isRoot ? row.servicos_participante_consolidado ?? 0 : participante) || 0;
          return p + part;
        }

        case "eficiencia": {
          // IMPORTANTE: tabela para root calcula consolidado de família.
          // Para ordenação da tabela (qualquer linha), mantemos o comportamento atual:
          // - leaf: eficiênciaMap[sector_id]
          // - root: usa consolidadoRoots (fonte da verdade)
          const isRoot = (row.nivel ?? 0) === 0;
          if (isRoot) {
            const r = consolidadoRoots.find((x) => x.sector_id === row.sector_id);
            return Number(r?.eficiencia_percentual ?? -1);
          }
          return Number(eficienciaMap[row.sector_id]?.eficiencia_percentual ?? -1);
        }

        case "qualidade": {
          const isRoot = (row.nivel ?? 0) === 0;
          if (isRoot) {
            const r = consolidadoRoots.find((x) => x.sector_id === row.sector_id);
            return Number(r?.qualidade_media ?? -1);
          }
          return Number(qualidadeMap[row.sector_id]?.nota_media ?? -1);
        }

        case "engajamento": {
          const isRoot = (row.nivel ?? 0) === 0;
          if (isRoot) {
            const r = consolidadoRoots.find((x) => x.sector_id === row.sector_id);
            return Number(r?.engajamento_percentual ?? -1);
          }

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
    if (!roots.length) return true;
    return roots.every((r) => expandedRoot[r.sector_id] !== false);
  }, [expandedRoot, roots]);

  function toggleAllRoots() {
    const newState: Record<number, boolean> = {};
    const expand = !allRootsExpanded;
    roots.forEach((r) => (newState[r.sector_id] = expand));
    setExpandedRoot(newState);
  }

  function toggleRoot(rootId: number) {
    setExpandedRoot((prev) => ({
      ...prev,
      [rootId]: prev[rootId] === false ? true : !prev[rootId],
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
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopupOpen(null);
      }
    }
    if (popupOpen != null) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popupOpen]);

  // click fora da tabela -> limpa ordenação
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setSortConfig({ column: null, direction: "asc", multi: [] });
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ============================================================
     CARREGAMENTO MASTER — PROMISE.ALL
  ============================================================ */
  useEffect(() => {
    const ac = new AbortController();

    async function loadAll() {
      try {
        const [setoresRes, usuariosRes, efRes, qualRes, servRankRes] = await Promise.all([
          fetch(`${API_BASE_URL}/setores`, { signal: ac.signal }),
          fetch(`${API_BASE_URL}/setores-usuarios-resumo`, { signal: ac.signal }),
          fetch(`${API_BASE_URL}/setores-eficiencia`, { signal: ac.signal }),
          fetch(`${API_BASE_URL}/setores-qualidade`, { signal: ac.signal }),
          fetch(`${API_BASE_URL}/setores-ranking-servicos`, { signal: ac.signal }),
        ]);

        const [setores, usuariosResumo, eficienciaList, qualidadeList, servRank] = await Promise.all([
          setoresRes.json(),
          usuariosRes.json(),
          efRes.json(),
          qualRes.json(),
          servRankRes.json(),
        ]);

        setTreeRows(setores || []);

        // expand inicia fechado
        const exp: Record<number, boolean> = {};
        (setores || [])
          .filter((r: SetorRow) => (r.nivel ?? 0) === 0)
          .forEach((r: SetorRow) => (exp[r.sector_id] = false));
        setExpandedRoot(exp);

        // usuariosMap
        const uMap: Record<number, number> = {};
        (usuariosResumo || []).forEach((u: any) => {
          uMap[u.sector_id] = Number(u.total_usuarios ?? 0);
        });
        setUsuariosMap(uMap);

        // eficienciaMap
        const efMap: Record<number, EficienciaRow> = {};
        (eficienciaList || []).forEach((e: EficienciaRow) => {
          efMap[e.sector_id] = e;
        });
        setEficienciaMap(efMap);

        // qualidadeMap (corrige o “branco”)
        const qMap: Record<number, QualidadeRow> = {};
        (qualidadeList || []).forEach((q: QualidadeRow) => {
          qMap[q.sector_id] = q;
        });
        setQualidadeMap(qMap);

        // ranking serviços roots (novo endpoint)
        const servRoots: RankingServicosRoot[] = (servRank || []).map((r: any) => ({
          sector_id: Number(r.sector_id),
          setor: r.setor,
          total_servicos: Number(r.total_servicos || 0),
        }));
        setRankServicosRoots(servRoots);
      } catch (err) {
        if ((err as any)?.name !== "AbortError") console.error("Erro ao carregar setores:", err);
      }
    }

    loadAll();
    return () => ac.abort();
  }, []);

  /* ============================================================
     RANKINGS ROOTS (derivados do consolidado — fonte da verdade)
     - Eficiência: exatamente a tabela filtrada em nivel 0 e ordenada por eficiência
  ============================================================ */
  useEffect(() => {
    const byEf = [...consolidadoRoots]
      .filter((r) => r.eficiencia_percentual != null)
      .sort((a, b) => Number(b.eficiencia_percentual) - Number(a.eficiencia_percentual));
    setRankEficienciaRoots(byEf);

    const byQual = [...consolidadoRoots]
      .filter((r) => r.qualidade_media != null)
      .sort((a, b) => Number(b.qualidade_media) - Number(a.qualidade_media));
    setRankQualidadeRoots(byQual);

    const byUsers = [...consolidadoRoots].sort((a, b) => b.usuarios - a.usuarios);
    setRankUsuariosRoots(byUsers);
  }, [consolidadoRoots]);

  /* ============================================================
     GRÁFICO: SERVIÇOS (top5 + toggle todos)
  ============================================================ */
  const servicosChartData = useMemo(() => {
    const sorted = [...rankServicosRoots].sort((a, b) => b.total_servicos - a.total_servicos);
    return showAllServicos ? sorted : sorted.slice(0, 5);
  }, [rankServicosRoots, showAllServicos]);

  useEffect(() => {
    if (!chartServicosRef.current || servicosChartData.length === 0) return;

    const ctx: any = chartServicosRef.current.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 600, 0);
    gradient.addColorStop(0, "rgba(37,99,235,0.85)");
    gradient.addColorStop(1, "rgba(29,78,216,0.95)");

    if (chartServicosInst.current) chartServicosInst.current.destroy();

    chartServicosInst.current = new Chart(chartServicosRef.current, {
      type: "bar",
      data: {
        labels: servicosChartData.map((s) => s.setor),
        datasets: [
          {
            label: "Serviços únicos",
            data: servicosChartData.map((s) => s.total_servicos),
            backgroundColor: gradient,
            borderRadius: 8,
            barThickness: 22,
          },
        ],
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
            clip: true,
          },
        },
        scales: {
          x: { beginAtZero: true, grid: { display: false } },
          y: { grid: { display: false } },
        },
      },
    });

    return () => chartServicosInst.current?.destroy();
  }, [servicosChartData, fmt]);

  /* ============================================================
     GRÁFICO: EFICIÊNCIA (Top 5) — MESMA ORDEM DA TABELA (roots)
  ============================================================ */
  const eficienciaTop5 = useMemo(() => {
    const sorted = [...rankEficienciaRoots].filter((r) => r.eficiencia_percentual != null);
    return sorted.slice(0, 5);
  }, [rankEficienciaRoots]);

  useEffect(() => {
    if (!chartEficienciaRef.current || eficienciaTop5.length === 0) return;

    const ctx: any = chartEficienciaRef.current.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 600, 0);
    gradient.addColorStop(0, "rgba(16,185,129,0.85)");
    gradient.addColorStop(1, "rgba(5,150,105,0.95)");

    if (chartEficienciaInst.current) chartEficienciaInst.current.destroy();

    chartEficienciaInst.current = new Chart(chartEficienciaRef.current, {
      type: "bar",
      data: {
        labels: eficienciaTop5.map((d) => d.setor),
        datasets: [
          {
            label: "Eficiência (%)",
            data: eficienciaTop5.map((d) => Number(d.eficiencia_percentual || 0)),
            backgroundColor: gradient,
            borderRadius: 8,
            barThickness: 22,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c: any) => `${Number(c.raw).toFixed(1)}% de eficiência`,
            },
          },
          datalabels: {
            anchor: "end",
            align: "right",
            formatter: (v: number) => `${Number(v).toFixed(1)}%`,
            color: "#ffffff",
            font: { weight: "bold", size: 11 },
            clip: true,
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            grid: { display: false },
            ticks: { callback: (v: any) => v + "%" },
          },
          y: { grid: { display: false } },
        },
      },
    });

    return () => chartEficienciaInst.current?.destroy();
  }, [eficienciaTop5]);

  /* ============================================================
     TOOLTIP USUÁRIOS (hover)
  ============================================================ */
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
      setUsersBySector((prev) => ({ ...prev, [sectorId]: data || [] }));
    } finally {
      setUsersLoading(false);
    }
  }

  function hideSectorUsers(sectorId: number) {
    if (openUsersSectorId === sectorId) setOpenUsersSectorId(null);
  }

  useEffect(() => {
    return () => {
      usersControllerRef.current?.abort();
    };
  }, []);

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <main className="main-container">
      <Header />

      {/* ===================== 1) INDICADORES POR SETOR ===================== */}
      <section className="dash-section">
        <div className="section-title-wrapper">
          <TitleWithTooltip tooltip="Desempenho geral dos setores (consolidado por secretaria / nível 0)." className="section-title-main">
            Indicadores por setor
          </TitleWithTooltip>
          <p className="section-title-sub">Eficiência, usuários e qualidade.</p>
        </div>

        <div className="setores-kpi-grid">
          <div className="setor-kpi-card">
            <div className="setor-kpi-icon lightning">⚡</div>
            <div className="setor-kpi-label">Mais eficiente</div>
            <div className="setor-kpi-value">{valorEfic}</div>
            <div className="setor-kpi-sector" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
              {nomeSetorEfic}
            </div>
          </div>

          <div className="setor-kpi-card">
            <div className="setor-kpi-icon star">⭐</div>
            <div className="setor-kpi-label">Melhor qualidade</div>
            <div className="setor-kpi-value">{valorQual}</div>
            <div className="setor-kpi-sector" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
              {nomeSetorQual}
            </div>
          </div>

          <div className="setor-kpi-card">
            <div className="setor-kpi-icon users">👥</div>
            <div className="setor-kpi-label">Mais usuários</div>
            <div className="setor-kpi-value">{valorUsuarios}</div>
            <div className="setor-kpi-sector" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
              {nomeSetorUsuarios}
            </div>
          </div>

          <div className="setor-kpi-card">
            <div className="setor-kpi-icon trophy">🏆</div>
            <div className="setor-kpi-label">Mais serviços</div>
            <div className="setor-kpi-value">{valorServicos}</div>
            <div className="setor-kpi-sector" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
              {nomeSetorServicos}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== 2) RANKINGS – GRÁFICOS ===================== */}
      <section className="dash-section">
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <TitleWithTooltip tooltip="Ranking consolidado por secretaria (nível 0)." className="section-title-main">
            Ranking de setores
          </TitleWithTooltip>
          <p className="section-title-sub">Serviços cadastrados (únicos) e eficiência.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", marginTop: 10 }}>
          <article className="period-card">
            <header className="period-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h3 style={{ margin: 0 }}>Serviços cadastrados</h3>
                <span className="period-card-subtitle">
                  {showAllServicos ? "Todos" : "Top 5"} (serviços únicos ativos)
                </span>
              </div>

              <button
                className="period-action-btn"
                onClick={() => setShowAllServicos((s) => !s)}
                style={{
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  padding: "8px 10px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "#111827",
                }}
              >
      
              </button>
            </header>

            <div className="period-card-body">
              <div className="mini-chart-wrapper" style={{ height: 320 }}>
                <canvas ref={chartServicosRef}></canvas>
              </div>
            </div>
          </article>

          <article className="period-card">
            <header className="period-card-header">
              <h3>Eficiência</h3>
              <span className="period-card-subtitle">Top 5 (mesma ordem da tabela por eficiência)</span>
            </header>

            <div className="period-card-body">
              <div className="mini-chart-wrapper" style={{ height: 320 }}>
                <canvas ref={chartEficienciaRef}></canvas>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* ===================== 3) TABELA COMPLETA ===================== */}
      <section className="dash-section">
        <div className="section-title-wrapper" style={{ textAlign: "center" }}>
          <TitleWithTooltip tooltip="Visão de todos os setores (roots consolidados na própria linha)." className="section-title-main">
            Visão consolidada
          </TitleWithTooltip>
          <p className="section-title-sub">Usuários, serviços, eficiência, engajamento e qualidade.</p>
        </div>

        <table id="tabela-setores" ref={tableRef}>
          <thead>
            <tr>
              <th className="col-setor">
                <div className="setor-th-wrapper">
                  <button className="toggle-all-roots" onClick={toggleAllRoots}>
                    {allRootsExpanded ? "▼" : "▶"}
                  </button>
                  <span>Setores</span>
                </div>
              </th>

              <th
                className="th-sort"
                onClick={(e) => requestSort("usuarios", e)}
                style={{
                  cursor: "pointer",
                  color: sortConfig.column === "usuarios" ? "#111827" : "#6b7280",
                  backgroundColor: sortConfig.column === "usuarios" ? "#eef2ff" : "transparent",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Usuários
                  <SortIcon active={sortConfig.column === "usuarios"} direction={sortConfig.direction} />
                </span>
              </th>

              <th
                className="th-sort"
                onClick={(e) => requestSort("servicos", e)}
                style={{
                  cursor: "pointer",
                  color: sortConfig.column === "servicos" ? "#111827" : "#6b7280",
                  backgroundColor: sortConfig.column === "servicos" ? "#eef2ff" : "transparent",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Serviços
                  <SortIcon active={sortConfig.column === "servicos"} direction={sortConfig.direction} />
                </span>
              </th>

              <th
                className="th-sort"
                onClick={(e) => requestSort("eficiencia", e)}
                style={{
                  cursor: "pointer",
                  color: sortConfig.column === "eficiencia" ? "#111827" : "#6b7280",
                  backgroundColor: sortConfig.column === "eficiencia" ? "#eef2ff" : "transparent",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Eficiência
                  <SortIcon active={sortConfig.column === "eficiencia"} direction={sortConfig.direction} />
                </span>
              </th>

              <th
                className="th-sort"
                onClick={(e) => requestSort("engajamento", e)}
                style={{
                  cursor: "pointer",
                  color: sortConfig.column === "engajamento" ? "#111827" : "#6b7280",
                  backgroundColor: sortConfig.column === "engajamento" ? "#eef2ff" : "transparent",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Engajamento
                  <SortIcon active={sortConfig.column === "engajamento"} direction={sortConfig.direction} />
                </span>
              </th>

              <th
                className="th-sort"
                onClick={(e) => requestSort("qualidade", e)}
                style={{
                  cursor: "pointer",
                  color: sortConfig.column === "qualidade" ? "#111827" : "#6b7280",
                  backgroundColor: sortConfig.column === "qualidade" ? "#eef2ff" : "transparent",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Qualidade
                  <SortIcon active={sortConfig.column === "qualidade"} direction={sortConfig.direction} />
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            {getSortedRows().map((r) => {
              const isRoot = (r.nivel ?? 0) === 0;
              const indent = (r.nivel ?? 0) * 18;

              const rootId = getRootIdFromPath(r);

              const visible = isRoot || expandedRoot[rootId] !== false;

              // serviços (tabela mantém principal/participante legado)
              const principal = Number(isRoot ? r.servicos_principal_consolidado : r.servicos_principal_individual) || 0;
              const participante = Number(isRoot ? r.servicos_participante_consolidado : r.servicos_participante_individual) || 0;

              // consolidado root (mesma lógica usada no ranking)
              const consol = isRoot
                ? consolidadoRoots.find((x) => x.sector_id === r.sector_id) || null
                : null;

              // Ef/Eng/Qual: root usa consolidado, leaf usa maps
              const efRow = eficienciaMap[r.sector_id];
              const qlRow = qualidadeMap[r.sector_id];

              const efNum = isRoot ? consol?.eficiencia_percentual ?? null : efRow?.eficiencia_percentual ?? null;
              const engNum = isRoot ? consol?.engajamento_percentual ?? null : (() => {
                if (!efRow) return null;
                const total = efRow.total_solicitacoes || 0;
                if (total <= 0) return null;
                const concl = Number(efRow.total_concluidas || 0);
                const resp = Number(efRow.total_respondidas || 0);
                return ((concl + resp) / total) * 100;
              })();

              const qlNum = isRoot ? consol?.qualidade_media ?? null : (qlRow?.nota_media ?? null);

              const classEf = getColorClassEfEng(efNum);
              const classEng = getColorClassEfEng(engNum);
              const classQl = getColorClassQual(qlNum);

              const usuariosRaw = isRoot
                ? (consol?.usuarios ?? 0)
                : (usuariosMap[r.sector_id] ?? 0);
              const usuariosFmt = fmt.format(usuariosRaw);

              return (
                <React.Fragment key={r.sector_id}>
                  <tr className={isRoot ? "nivel-0" : ""} style={{ display: visible ? "" : "none" }}>
                    {/* SETOR */}
                    <td className="td-setor" style={{ position: "relative" }}>
                      <div
                        className="td-setor-inner"
                        style={{ marginLeft: indent, cursor: "pointer" }}
                        onClick={(e) => {
                          setPopupPos({ x: e.clientX + 12, y: e.clientY - 40 });
                          setPopupOpen(popupOpen === r.sector_id ? null : r.sector_id);
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

                      {/* POPUP consolidado para root */}
                      {isRoot && popupOpen === r.sector_id && popupPos && consol && (
                        <div
                          ref={popupRef}
                          className="popup-lateral"
                          style={{ position: "fixed", left: popupPos.x, top: popupPos.y, zIndex: 50 }}
                        >
                          <button className="popup-close" onClick={(ev) => { ev.stopPropagation(); setPopupOpen(null); }}>
                            ✖
                          </button>

                          <h4 className="popup-title">Resumo Consolidado — {r.setor}</h4>

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
                              <strong>{fmt.format(consol.total_solicitacoes)}</strong>

                              <span>Concluídas:</span>
                              <strong>{fmt.format(consol.concluidas)}</strong>

                              <span>Respondidas:</span>
                              <strong>{fmt.format(consol.respondidas)}</strong>
                            </div>
                          </div>

                          <div className="popup-section">
                            <h5>Indicadores</h5>
                            <div className="popup-grid">
                              <span>Eficiência:</span>
                              <strong className={classEf}>
                                {consol.eficiencia_percentual != null ? consol.eficiencia_percentual.toFixed(1) + "%" : "—"}
                              </strong>

                              <span>Engajamento:</span>
                              <strong className={classEng}>
                                {consol.engajamento_percentual != null ? consol.engajamento_percentual.toFixed(1) + "%" : "—"}
                              </strong>

                              <span>Qualidade:</span>
                              <strong className={classQl}>
                                {consol.qualidade_media != null ? consol.qualidade_media.toFixed(2) : "—"}
                              </strong>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* USUÁRIOS */}
                    <td
                      className="td-usuarios"
                      style={{ textAlign: "center", position: "relative", cursor: "pointer" }}
                      onMouseEnter={() => showSectorUsers(r.sector_id)}
                      onMouseLeave={() => hideSectorUsers(r.sector_id)}
                    >
                      {usuariosFmt}

                      {openUsersSectorId === r.sector_id && (
                        <div className="tooltip-mini" style={{ width: 240, maxWidth: 260 }}>
                          <strong>Usuários</strong>

                          {usersLoading ? (
                            <div style={{ padding: "8px 0", fontSize: ".85rem", color: "#6b7280" }}>
                              Carregando...
                            </div>
                          ) : (
                            <div style={{ maxHeight: 150, overflowY: "auto", overflowX: "hidden", marginTop: 4, paddingRight: 6 }}>
                              {(usersBySector[r.sector_id] || []).length === 0 ? (
                                <div style={{ padding: 6, fontSize: ".85rem", color: "#9ca3af" }}>Nenhum usuário encontrado</div>
                              ) : (
                                usersBySector[r.sector_id].map((u: any, idx: number) => (
                                  <div key={idx} style={{ padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
                                    <div style={{ fontWeight: 600 }}>{u.nome}</div>
                                    <div style={{ fontSize: ".8rem", color: "#6b7280", marginTop: 2 }}>{u.email || "—"}</div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* SERVIÇOS (legado principal/participante) */}
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
                  {Number.isFinite(Number(efNum))
  ? Number(efNum).toFixed(1) + "%"
  : "—"}


                      {hoverInfo.sectorId === r.sector_id && hoverInfo.type === "ef" && (
                        <div className="tooltip-mini">
                          <strong>Eficiência</strong>
                          <div>Total: {fmt.format(isRoot ? (consol?.total_solicitacoes || 0) : (efRow?.total_solicitacoes || 0))}</div>
                          <div>Concluídas: {fmt.format(isRoot ? (consol?.concluidas || 0) : (efRow?.total_concluidas || 0))}</div>
                          <hr />
                          <small>Fórmula: concluídas ÷ total × 100</small>
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
                   {Number.isFinite(Number(engNum))
  ? Number(engNum).toFixed(1) + "%"
  : "—"}


                      {hoverInfo.sectorId === r.sector_id && hoverInfo.type === "eng" && (
                        <div className="tooltip-mini">
                          <strong>Engajamento</strong>
                          <div>Total: {fmt.format(isRoot ? (consol?.total_solicitacoes || 0) : (efRow?.total_solicitacoes || 0))}</div>
                          <div>Concluídas: {fmt.format(isRoot ? (consol?.concluidas || 0) : (efRow?.total_concluidas || 0))}</div>
                          <div>Respondidas: {fmt.format(isRoot ? (consol?.respondidas || 0) : (efRow?.total_respondidas || 0))}</div>
                          <hr />
                          <small>Fórmula: (concluídas + respondidas) ÷ total × 100</small>
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
                      {Number.isFinite(Number(qlNum))
  ? Number(qlNum).toFixed(2)
  : "—"}


                      {hoverInfo.sectorId === r.sector_id && hoverInfo.type === "ql" && (
                        <div className="tooltip-mini">
                          <strong>Qualidade</strong>
                          <div>
                            Avaliações:{" "}
                            {fmt.format(
                              isRoot
                                ? (consol?.qualidade_total_avaliacoes || 0)
                                : (qlRow?.total_avaliacoes || 0)
                            )}
                          </div>
                          <div>Média: {qlNum != null ? Number(qlNum).toFixed(2) : "—"}</div>
                          <hr />
                          <small>Fórmula: soma(nota × votos) ÷ total</small>
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

      <footer style={{ marginTop: 24, textAlign: "center", fontSize: 12, color: "#6b7280" }}>
        Cidade Conectada — BI Dashboard
      </footer>
    </main>
  );
}
