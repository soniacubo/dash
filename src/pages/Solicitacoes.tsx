// ============================================================
// Solicitações.tsx — VERSÃO COM TOP 5 + MODAIS COMPLETOS
// ============================================================

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  MouseEvent,
  useTransition,
} from "react";
import Header from "../components/Header";
import TitleWithTooltip from "../components/TitleWithTooltip";
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";
import ChartDataLabels from "chartjs-plugin-datalabels";

Chart.register(ChartDataLabels);

/* ============================================================
   TIPOS
============================================================ */

type ResumoSolicitacoes = {
  total: number;
  iniciadas: number;
  espera: number;
  respondidas: number;
  concluidas: number; // já vem com concluídas + transferidas
};

type SolicitacaoRow = {
  id: number;
  created_at: string;
  protocol: string | null;
  status: number;
  cidadao: string | null;
  servico: string | null;
  setor: string | null;
  sector_id?: number | null;
};

type ListaSolicitacoesResponse = {
  rows: SolicitacaoRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type SetorOption = {
  sector_id: number;
  name: string;
};

type ServicoOption = {
  service_id: number;
  name: string;
};

type EvolucaoRow = {
  data_ref: string;
  abertas: number;
  concluidas: number;
};

type AgrupadoEvolucao = {
  label: string;
  abertas: number;
  concluidas: number;
};

type TopServico = {
  servico: string;
  total: number;
};

/* ====== TIPOS – TEMPO MÉDIO E PARADAS ======================= */

type TempoMedioResumo = {
  media_geral_dias: number; // média de conclusão
  total_concluidas: number;
};

type TempoMedioResponse = {
  media_geral_dias: number;
  total_concluidas: number;
};

type ParadasResumo = {
  total_paradas: number; // total em aberto (status != 1 e != 4)
  media_dias_paradas: number; // média de tempo em aberto
};

type ParadasSetor = {
  sector_id: number | null;
  setor: string | null;
  total_paradas: number;
  media_dias_parado: number; // 👈 nome correto
};



type ParadasServico = {
  service_id: number | null;
  servico: string | null;
  total_paradas: number;
  media_dias_parado: number; // 👈 nome igual ao backend
};


/* ============================================================
   HELPERS
============================================================ */

const fmtNumero = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

/**
 * Monta a query string a partir de um objeto,
 * ignorando valores vazios / nulos.
 */
function buildQuery(params: Record<string, any>): string {
  const q = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      q.append(key, String(value));
    }
  });

  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

function mapStatusLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return "—";
  switch (Number(code)) {
    case 0:
      return "Iniciada";
    case 1:
      return "Concluída";
    case 2:
      return "Em espera";
    case 3:
      return "Respondida";
    case 4:
      return "Transferida";
    default:
      return "—";
  }
}

function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function calcPercent(value: number, total: number): number {
  if (!total || total === 0) return 0;
  return (value / total) * 100;
}

/**
 * Agrupa os pontos da evolução em diário / semanal / mensal
 */
function agruparEvolucaoPorGranularidade(
  dados: EvolucaoRow[],
  granularidade: "daily" | "weekly" | "monthly"
): AgrupadoEvolucao[] {
  if (granularidade === "daily") {
    return dados.map((d) => ({
      label: formatDateBR(d.data_ref),
      abertas: Number(d.abertas) || 0,
      concluidas: Number(d.concluidas) || 0,
    }));
  }

  type Tmp = {
    key: string;
    label: string;
    abertas: number;
    concluidas: number;
    ts: number;
  };

  const mapa = new Map<string, Tmp>();

  for (const row of dados) {
    const d = new Date(row.data_ref);
    if (Number.isNaN(d.getTime())) continue;

    if (granularidade === "weekly") {
      const diaSemana = d.getDay();
      const offset = (diaSemana + 6) % 7;
      const inicioSemana = new Date(d);
      inicioSemana.setDate(d.getDate() - offset);
      inicioSemana.setHours(0, 0, 0, 0);

      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(inicioSemana.getDate() + 6);

      const key = `${inicioSemana.getFullYear()}-W${String(
        inicioSemana.getMonth() + 1
      ).padStart(2, "0")}-${String(inicioSemana.getDate()).padStart(2, "0")}`;

      const label = `${formatDateBR(
        inicioSemana.toISOString()
      )} – ${formatDateBR(fimSemana.toISOString())}`;

      const existente = mapa.get(key);
      if (!existente) {
        mapa.set(key, {
          key,
          label,
          abertas: Number(row.abertas) || 0,
          concluidas: Number(row.concluidas) || 0,
          ts: inicioSemana.getTime(),
        });
      } else {
        existente.abertas += Number(row.abertas) || 0;
        existente.concluidas += Number(row.concluidas) || 0;
      }
    } else {
      const ano = d.getFullYear();
      const mes = d.getMonth();
      const key = `${ano}-${String(mes + 1).padStart(2, "0")}`;
      const inicioMes = new Date(ano, mes, 1);
      const label = inicioMes.toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
      });

      const existente = mapa.get(key);
      if (!existente) {
        mapa.set(key, {
          key,
          label,
          abertas: Number(row.abertas) || 0,
          concluidas: Number(row.concluidas) || 0,
          ts: inicioMes.getTime(),
        });
      } else {
        existente.abertas += Number(row.abertas) || 0;
        existente.concluidas += Number(row.concluidas) || 0;
      }
    }
  }

  return Array.from(mapa.values())
    .sort((a, b) => a.ts - b.ts)
    .map((x) => ({
      label: x.label,
      abertas: x.abertas,
      concluidas: x.concluidas,
    }));
}

/* ============================================================
   HOOK: Debounce
============================================================ */

function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/* ============================================================
   COMPONENTE: MODAL SIMPLES (CENTRALIZADO)
============================================================ */

type SimpleModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
};

const SimpleModal: React.FC<SimpleModalProps> = ({
  open,
  title,
  subtitle,
  onClose,
  children,
}) => {
  if (!open) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onClose();
  };

  const handleModalClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  return (
    <div className="cc-modal-backdrop" onClick={handleBackdropClick}>
      <div className="cc-modal" onClick={handleModalClick}>
        <div className="cc-modal-header">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="cc-modal-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="cc-modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="cc-modal-body">{children}</div>
      </div>
    </div>
  );
};

/* ============================================================
   COMPONENTE: Painel Lateral de Setor (já existente)
============================================================ */

type SectorSidePanelProps = {
  open: boolean;
  sectorId: number | null;
  sectorName: string | null;
  onClose: () => void;
};

const SectorSidePanel: React.FC<SectorSidePanelProps> = ({
  open,
  sectorId,
  sectorName,
  onClose,
}) => {
  if (!open || !sectorId) return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onClose();
  };

  const handlePanelClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  return (
    <>
      <div
        className="side-panel-backdrop show"
        onClick={handleBackdropClick}
      ></div>

      <div className="side-panel open" onClick={handlePanelClick}>
        <div className="side-panel-header">
          <h2>{sectorName || "Setor"}</h2>
          <button
            type="button"
            id="fecharPainelSetor"
            onClick={onClose}
            aria-label="Fechar painel"
          >
            ×
          </button>
        </div>

        <div className="side-panel-content">
          <section className="painel-bloco">
            <h3>Comparativo mensal</h3>
            <p style={{ fontSize: ".9rem", color: "#6b7280" }}>
              Espaço reservado para gráfico de evolução mensal do setor{" "}
              {sectorName || ""}.
            </p>
          </section>

          <section className="painel-bloco">
            <h3>Status das Solicitações</h3>
            <p style={{ fontSize: ".9rem", color: "#6b7280" }}>
              Aqui você poderá ver a distribuição de status apenas deste setor.
            </p>
          </section>

          <section className="painel-bloco">
            <h3>Serviços mais solicitados</h3>
            <p style={{ fontSize: ".9rem", color: "#6b7280" }}>
              Lista dos serviços mais solicitados no setor {sectorName || ""}.
            </p>
          </section>
        </div>
      </div>
    </>
  );
};

/* ============================================================
   PÁGINA PRINCIPAL: Solicitações
============================================================ */

const Solicitacoes: React.FC = () => {
  /* Filtros */
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [filtroSetor, setFiltroSetor] = useState<string>("");
  const [filtroServico, setFiltroServico] = useState<string>("");

  /* Paginação */
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(50);
  const [totalRegistros, setTotalRegistros] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  /* Dados básicos */
  const [resumo, setResumo] = useState<ResumoSolicitacoes | null>(null);
  const [lista, setLista] = useState<SolicitacaoRow[]>([]);
  const [setores, setSetores] = useState<SetorOption[]>([]);
  const [servicos, setServicos] = useState<ServicoOption[]>([]);

  const [loadingResumo, setLoadingResumo] = useState(false);
  const [loadingTabela, setLoadingTabela] = useState(false);

  const [isPending, startTransition] = useTransition();

  /* ===== ESTADOS – TEMPO MÉDIO (CONCLUÍDAS) E PARADAS (ABERTAS) === */

  const [loadingTempo, setLoadingTempo] = useState(false);
  const [tempoResumo, setTempoResumo] = useState<TempoMedioResumo | null>(
    null
  );

  const [loadingParadas, setLoadingParadas] = useState(false);
  const [paradasResumo, setParadasResumo] = useState<ParadasResumo | null>(
    null
  );
  const [paradasSetor, setParadasSetor] = useState<ParadasSetor[]>([]);
  const [paradasServico, setParadasServico] = useState<ParadasServico[]>([]);

  /* Charts existentes */
  const statusCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusChartRef = useRef<Chart | null>(null);

  const evolucaoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const evolucaoChartRef = useRef<Chart | null>(null);

  const topServCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const topServChartRef = useRef<Chart | null>(null);

  /* Charts de processos em aberto (parados) */
  const paradasSetorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paradasSetorChartRef = useRef<Chart | null>(null);

  const paradasServicoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paradasServicoChartRef = useRef<Chart | null>(null);

  /* Painel lateral setor */
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelSectorId, setPanelSectorId] = useState<number | null>(null);
  const [panelSectorName, setPanelSectorName] = useState<string | null>(null);

  /* Modais de listagem completa */
  const [modalSetoresOpen, setModalSetoresOpen] = useState(false);
  const [modalServicosOpen, setModalServicosOpen] = useState(false);

  /* Query string de filtros + paginação (para lista/resumo/evolução) */
  const queryString = useMemo(() => {
    return buildQuery({
      inicio: dataInicio,
      fim: dataFim,
      setor: filtroSetor,
      servico: filtroServico,
      page,
      limit,
    });
  }, [dataInicio, dataFim, filtroSetor, filtroServico, page, limit]);

  const debouncedQueryString = useDebounce(queryString, 400);

  /* Query string apenas com filtros (sem paginação) – para SLA */
  const qsSemPaginacao = useMemo(() => {
    return buildQuery({
      inicio: dataInicio,
      fim: dataFim,
      setor: filtroSetor,
      servico: filtroServico,
    });
  }, [dataInicio, dataFim, filtroSetor, filtroServico]);

  const debouncedQsSemPaginacao = useDebounce(qsSemPaginacao, 400);

  /* Nome do setor/serviço selecionados para exibição nos títulos */
  const setorSelecionado = useMemo(() => {
    if (!filtroSetor) return "";
    const s = setores.find((x) => String(x.sector_id) === String(filtroSetor));
    return s?.name ?? "";
  }, [filtroSetor, setores]);

  const servicoSelecionado = useMemo(() => {
    if (!filtroServico) return "";
    const s = servicos.find(
      (x) => String(x.service_id) === String(filtroServico)
    );
    return s?.name ?? "";
  }, [filtroServico, servicos]);

  const descricaoFiltroAplicado = useMemo(() => {
    if (!setorSelecionado && !servicoSelecionado) {
      return "Todos os setores • Todos os serviços";
    }
    if (setorSelecionado && servicoSelecionado) {
      return `${setorSelecionado} • ${servicoSelecionado}`;
    }
    if (setorSelecionado) return setorSelecionado;
    return servicoSelecionado;
  }, [setorSelecionado, servicoSelecionado]);

  /* TOP 5 SERVIÇOS a partir da lista já carregada (filtrada) */
  const topServicos: TopServico[] = useMemo(() => {
    if (!lista || lista.length === 0) return [];
    const mapa = new Map<string, number>();

    for (let i = 0; i < lista.length; i++) {
      const row = lista[i];
      const nome = row.servico || "Não informado";
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1);
    }

    return Array.from(mapa.entries())
      .map(([servico, total]) => ({ servico, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [lista]);

  /* Listas completas (ordenadas) para os modais */
  const paradasSetorOrdenado = useMemo(
    () =>
      [...paradasSetor].sort(
        (a, b) => (b.total_paradas || 0) - (a.total_paradas || 0)
      ),
    [paradasSetor]
  );

  const paradasServicoOrdenado = useMemo(
    () =>
      [...paradasServico].sort(
        (a, b) => (b.total_paradas || 0) - (a.total_paradas || 0)
      ),
    [paradasServico]
  );

  /* ============================================================
     1) Load inicial filtros (setores + serviços)
  ============================================================ */

  useEffect(() => {
    async function carregarSetoresFiltro() {
      try {
        const res = await fetch(`${API_BASE_URL}/solicitacoes/setores`);
        if (!res.ok) throw new Error("Erro ao carregar setores");
        const data: SetorOption[] = await res.json();
        setSetores(data || []);
      } catch (err) {
        console.error("Erro ao carregar setores para filtro:", err);
        setSetores([]);
      }
    }

    async function carregarServicosTodos() {
      try {
        const res = await fetch(`${API_BASE_URL}/solicitacoes/servicos`);
        if (!res.ok) throw new Error("Erro ao carregar serviços");
        const data: ServicoOption[] = await res.json();
        setServicos(data || []);
      } catch (err) {
        console.error("Erro ao carregar serviços (todos):", err);
        setServicos([]);
      }
    }

    carregarSetoresFiltro().then(carregarServicosTodos);
  }, []);

  /* ============================================================
     2) Sempre que o setor mudar, recarrega serviços
  ============================================================ */

  useEffect(() => {
    async function carregarServicosPorSetor(setorId: string) {
      if (!setorId) {
        try {
          const res = await fetch(`${API_BASE_URL}/solicitacoes/servicos`);
          if (!res.ok) throw new Error("Erro ao carregar serviços");
          const data: ServicoOption[] = await res.json();
          setServicos(data || []);
        } catch (err) {
          console.error("Erro ao carregar serviços (todos):", err);
          setServicos([]);
        }
        return;
      }

      try {
        const res = await fetch(
          `${API_BASE_URL}/solicitacoes/servicos-por-setor?setor=${encodeURIComponent(
            setorId
          )}`
        );
        if (!res.ok) throw new Error("Erro ao carregar serviços por setor");
        const data: ServicoOption[] = await res.json();
        setServicos(data || []);
      } catch (err) {
        console.error("Erro ao carregar serviços por setor:", err);
        setServicos([]);
      }
    }

    carregarServicosPorSetor(filtroSetor);
  }, [filtroSetor]);

  /* ============================================================
     3) Atualizar resumo + tabela + SLA sempre que filtros mudam
  ============================================================ */

  useEffect(() => {
    atualizarResumoESyncVisual(debouncedQueryString);
    carregarTabelaSolicitacoes(debouncedQueryString);

    carregarTempoMedio(debouncedQsSemPaginacao);
    carregarParadasResumo(debouncedQsSemPaginacao);
    carregarParadasSetor(debouncedQsSemPaginacao);
    carregarParadasServico(debouncedQsSemPaginacao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQueryString, debouncedQsSemPaginacao]);

  /* ============================================================
     Resumo + Gráficos de Status / Evolução
  ============================================================ */

  async function atualizarResumoESyncVisual(qs: string = "") {
    setLoadingResumo(true);
    try {
      const res = await fetch(`${API_BASE_URL}/solicitacoes/resumo${qs}`);
      if (!res.ok) {
        throw new Error("Erro ao buscar resumo de solicitações");
      }
      const dados = (await res.json()) as ResumoSolicitacoes;

      const total = Number(dados.total || 0);
      const iniciadas = Number(dados.iniciadas || 0);
      const espera = Number(dados.espera || 0);
      const respondidas = Number(dados.respondidas || 0);
      const concluidas = Number(dados.concluidas || 0);

      setResumo({ total, iniciadas, espera, respondidas, concluidas });

      atualizarGraficoStatus({ iniciadas, espera, respondidas, concluidas });
      carregarGraficoEvolucao(qs);
    } catch (err) {
      console.error("Erro ao carregar resumo de solicitações:", err);
      setResumo(null);
      atualizarGraficoStatus({
        iniciadas: 0,
        espera: 0,
        respondidas: 0,
        concluidas: 0,
      });
    } finally {
      setLoadingResumo(false);
    }
  }

  function atualizarGraficoStatus(dados: {
    iniciadas: number;
    espera: number;
    respondidas: number;
    concluidas: number;
  }) {
    const canvas = statusCanvasRef.current;
    if (!canvas) return;

    const labels = ["Iniciadas", "Em Espera", "Respondidas", "Concluídas"];
    const values = [
      dados.iniciadas || 0,
      dados.espera || 0,
      dados.respondidas || 0,
      dados.concluidas || 0,
    ];

    const statusColors = [
      "#1D4ED8", // Iniciadas – azul
      "#FACC15", // Em Espera – amarelo
      "#60A5FA", // Respondidas – azul claro
      "#10B981", // Concluídas – verde
    ];

    if (statusChartRef.current) {
      statusChartRef.current.data.labels = labels;
      statusChartRef.current.data.datasets[0].data = values;
      (statusChartRef.current.data.datasets[0] as any).backgroundColor =
        statusColors;
      statusChartRef.current.update();
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    statusChartRef.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderWidth: 1,
            backgroundColor: statusColors,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        animation: false,
        layout: {
          padding: {
            top: 30,
            bottom: 10,
            left: 10,
            right: 10,
          },
        },
        plugins: {
          legend: { position: "left" },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const label = ctx.label || "";
                const value = ctx.raw as number;
                const total = values.reduce((acc, v) => acc + v, 0) || 0;
                const pct = calcPercent(value, total);
                return `${label}: ${fmtNumero.format(
                  value
                )} (${pct.toFixed(1)}%)`;
              },
            },
          },
          datalabels: {
            anchor: "end",
            align: "left",
            offset: 12,
            clip: false,
            clamp: true,
            textAlign: "left",
            borderColor: "#666",
            borderWidth: 1.2,
            borderRadius: 3,
            backgroundColor: "#fff",
            padding: 4,
            color: "#000",
            font: { weight: "bold", size: 12 },
            formatter: (_value: number, ctx: any) => {
              const vals = ctx.chart.data.datasets[0].data as number[];
              const total = vals.reduce((a: number, b: number) => a + b, 0);
              const v = vals[ctx.dataIndex];
              if (!total) return "";
              return ((v / total) * 100).toFixed(1) + "%";
            },
          },
        },
      },
    });
  }

  async function carregarGraficoEvolucao(qs: string = "") {
    const canvas = evolucaoCanvasRef.current;
    if (!canvas) return;

    try {
      const res = await fetch(`${API_BASE_URL}/solicitacoes/evolucao${qs}`);
      if (!res.ok) {
        console.warn(
          "API /solicitacoes/evolucao retornou erro ou não está disponível."
        );
        return;
      }

      const dados: EvolucaoRow[] = await res.json();
      if (!dados || dados.length === 0) {
        if (evolucaoChartRef.current) {
          evolucaoChartRef.current.data.labels = [];
          evolucaoChartRef.current.data.datasets[0].data = [];
          evolucaoChartRef.current.data.datasets[1].data = [];
          evolucaoChartRef.current.update();
        }
        return;
      }

      let rangeDias = 0;
      if (dataInicio && dataFim) {
        const di = new Date(dataInicio);
        const df = new Date(dataFim);
        rangeDias = Math.max(
          1,
          Math.round(
            (df.getTime() - di.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1
        );
      } else {
        const first = new Date(dados[0].data_ref);
        const last = new Date(dados[dados.length - 1].data_ref);
        rangeDias = Math.max(
          1,
          Math.round(
            (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1
        );
      }

      let granularidade: "daily" | "weekly" | "monthly";
      if (rangeDias <= 30) {
        granularidade = "daily";
      } else if (rangeDias <= 120) {
        granularidade = "weekly";
      } else {
        granularidade = "monthly";
      }

      let agrupado = agruparEvolucaoPorGranularidade(dados, granularidade);

      if (agrupado.length > 150) {
        const step = Math.ceil(agrupado.length / 150);
        agrupado = agrupado.filter((_, idx) => idx % step === 0);
      }

      const labels = agrupado.map((d) => d.label);
      const abertas = agrupado.map((d) => d.abertas);
      const concluidas = agrupado.map((d) => d.concluidas);

      if (evolucaoChartRef.current) {
        evolucaoChartRef.current.data.labels = labels;
        evolucaoChartRef.current.data.datasets[0].data = abertas;
        evolucaoChartRef.current.data.datasets[1].data = concluidas;
        evolucaoChartRef.current.update();
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      evolucaoChartRef.current = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Abertas",
              data: abertas,
              borderWidth: 2,
              tension: 0.25,
              borderColor: "#1D4ED8",
              backgroundColor: "rgba(37, 99, 235, 0.15)",
              pointRadius: 2,
            },
            {
              label: "Concluídas",
              data: concluidas,
              borderWidth: 2,
              tension: 0.25,
              borderColor: "#10B981",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              pointRadius: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: {
              display: true,
              position: "top",
              align: "center",
            },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  `${ctx.dataset.label}: ${fmtNumero.format(
                    ctx.parsed.y || 0
                  )}`,
              },
            },
            // @ts-ignore
            datalabels: {
              display: false,
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                maxRotation: 45,
                minRotation: 0,
              },
            },
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => fmtNumero.format(Number(value)),
              },
            },
          },
        },
      });
    } catch (err) {
      console.error("Erro ao carregar gráfico de evolução:", err);
    }
  }


  const [topServicosApi, setTopServicosApi] = useState<TopServico[]>([]);

async function carregarTopServicos(qsFiltros: string = "") {
  try {
    const res = await fetch(
      `${API_BASE_URL}/solicitacoes/top-servicos${qsFiltros}`
    );
    if (!res.ok) throw new Error("Erro ao buscar top serviços");
    const data = await res.json();
    setTopServicosApi(data || []);
  } catch (err) {
    console.error("Erro ao carregar top serviços:", err);
    setTopServicosApi([]);
  }
}

useEffect(() => {
  carregarTopServicos(debouncedQsSemPaginacao);
}, [debouncedQsSemPaginacao]);

  /* ============================================================
     Gráfico Top 5 Serviços (a partir da lista filtrada)
  ============================================================ */

  function atualizarGraficoTopServicos(dados: TopServico[]) {
    const canvas = topServCanvasRef.current;
    if (!canvas) return;

    if (!dados || dados.length === 0) {
      if (topServChartRef.current) {
        topServChartRef.current.data.labels = [];
        topServChartRef.current.data.datasets[0].data = [];
        topServChartRef.current.update();
      }
      return;
    }

    const labels = dados.map((d) => d.servico);
    const values = dados.map((d) => d.total);

    if (topServChartRef.current) {
      topServChartRef.current.data.labels = labels;
      topServChartRef.current.data.datasets[0].data = values;
      topServChartRef.current.update();
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    topServChartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Solicitações",
            data: values,
            borderWidth: 1,
            backgroundColor: "#1D4ED8",
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.label}: ${fmtNumero.format(
                  ctx.parsed.x || 0
                )} solicitações`,
            },
          },
          // @ts-ignore
          datalabels: {
            anchor: "center",
            align: "center",
            color: "#fff",
            font: { weight: "bold", size: 12 },
            formatter: (value: number) => value,
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (value) => fmtNumero.format(Number(value)),
            },
          },
          y: {
            grid: { display: false },
          },
        },
      },
    });
  }

  useEffect(() => {
    atualizarGraficoTopServicos(topServicosApi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topServicos]);

  /* ============================================================
     NOVAS FUNÇÕES – TEMPO MÉDIO (CONCLUÍDAS)
  ============================================================ */

  async function carregarTempoMedio(qsFiltros: string = "") {
    setLoadingTempo(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/solicitacoes/tempo-medio${qsFiltros}`
      );
      if (!res.ok) throw new Error("Erro tempo médio");
      const data = (await res.json()) as TempoMedioResponse;

      setTempoResumo({
        media_geral_dias: Number(data.media_geral_dias || 0),
        total_concluidas: Number(data.total_concluidas || 0),
      });
    } catch (err) {
      console.error("Erro ao carregar tempo médio:", err);
      setTempoResumo(null);
    } finally {
      setLoadingTempo(false);
    }
  }

  async function carregarParadasResumo(qsFiltros: string = "") {
    setLoadingParadas(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/solicitacoes/paradas${qsFiltros}`
      );
      if (!res.ok) throw new Error("Erro paradas resumo");
      const data = (await res.json()) as ParadasResumo;

      setParadasResumo({
        total_paradas: Number(data.total_paradas || 0),
        media_dias_paradas: Number(data.media_dias_paradas || 0),
      });
    } catch (err) {
      console.error("Erro ao carregar resumo de paradas:", err);
      setParadasResumo(null);
    } finally {
      setLoadingParadas(false);
    }
  }

  async function carregarParadasSetor(qsFiltros: string = "") {
    try {
      const res = await fetch(
        `${API_BASE_URL}/solicitacoes/paradas-por-setor${qsFiltros}`
      );
      if (!res.ok) throw new Error("Erro paradas por setor");
      const data = (await res.json()) as ParadasSetor[];
      setParadasSetor(data || []);
    } catch (err) {
      console.error("Erro ao carregar paradas por setor:", err);
      setParadasSetor([]);
    }
  }

  async function carregarParadasServico(qsFiltros: string = "") {
    try {
      const res = await fetch(
        `${API_BASE_URL}/solicitacoes/paradas-por-servico${qsFiltros}`
      );
      if (!res.ok) throw new Error("Erro paradas por serviço");
      const data = (await res.json()) as ParadasServico[];
      setParadasServico(data || []);
    } catch (err) {
      console.error("Erro ao carregar paradas por serviço:", err);
      setParadasServico([]);
    }
  }

  /* ============================================================
     GRÁFICOS – PARADAS POR SETOR / SERVIÇO (TOP 5)
  ============================================================ */

  function atualizarGraficoParadasSetor(dados: ParadasSetor[]) {
  const canvas = paradasSetorCanvasRef.current;
  if (!canvas) return;

  const ordenado = [...(dados || [])]
    .sort((a, b) => (b.total_paradas || 0) - (a.total_paradas || 0));

  const top = ordenado.slice(0, 5); // TOP 5 REAL


    if (!top || top.length === 0) {
      if (paradasSetorChartRef.current) {
        paradasSetorChartRef.current.data.labels = [];
        paradasSetorChartRef.current.data.datasets[0].data = [];
        paradasSetorChartRef.current.update();
      }
      return;
    }

    const labels = top.map((d) => d.setor || "—");
    const values = top.map((d) => d.total_paradas || 0);
const medias = top.map(
  (d) => Number(d.media_dias_parado) || 0
);


    if (paradasSetorChartRef.current) {
      paradasSetorChartRef.current.data.labels = labels;
      paradasSetorChartRef.current.data.datasets[0].data = values;
      paradasSetorChartRef.current.update();
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    paradasSetorChartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Solicitações em aberto",
            data: values,
            borderWidth: 1,
            backgroundColor: "#1D4ED8", // azul padrão
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const idx = ctx.dataIndex;
                const total = values[idx] || 0;
              const mediaDias = medias[idx] || 0;

                return `${ctx.label}: ${fmtNumero.format(
                  total
                )} em aberto • ${fmtNumero.format(
                  mediaDias
                )} dias em média`;
              },
            },
          },
          // @ts-ignore
          datalabels: {
            anchor: "center",
            align: "center",
            color: "#fff",
            font: { weight: "bold", size: 11 },
            formatter: (_value: number, ctx: any) => {
              const total = values[ctx.dataIndex] || 0;
              const mediaDias = medias[ctx.dataIndex] || 0;
              return `${total} • ${fmtNumero.format(mediaDias)}d`;
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (value) => fmtNumero.format(Number(value)),
            },
          },
          y: {
            grid: { display: false },
          },
        },
      },
    });
  }

  function atualizarGraficoParadasServico(dados: ParadasServico[]) {
    const canvas = paradasServicoCanvasRef.current;
    if (!canvas) return;

    const top = (dados || []).slice(0, 5); // TOP 5

    if (!top || top.length === 0) {
      if (paradasServicoChartRef.current) {
        paradasServicoChartRef.current.data.labels = [];
        paradasServicoChartRef.current.data.datasets[0].data = [];
        paradasServicoChartRef.current.update();
      }
      return;
    }

    const labels = top.map((d) => d.servico || "—");
    const values = top.map((d) => d.total_paradas || 0);
const medias = top.map(
  (d) => Number(d.media_dias_parado) || 0
);


    if (paradasServicoChartRef.current) {
      paradasServicoChartRef.current.data.labels = labels;
      paradasServicoChartRef.current.data.datasets[0].data = values;
      paradasServicoChartRef.current.update();
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    paradasServicoChartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Solicitações em aberto",
            data: values,
            borderWidth: 1,
            backgroundColor: "#60A5FA", // azul claro padrão
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const idx = ctx.dataIndex;
                const total = values[idx] || 0;
                const mediaDias = medias[idx] || 0;
                return `${ctx.label}: ${fmtNumero.format(
                  total
                )} em aberto • ${fmtNumero.format(
                  mediaDias
                )} dias em média`;
              },
            },
          },
          // @ts-ignore
          datalabels: {
            anchor: "center",
            align: "center",
            color: "#fff",
            font: { weight: "bold", size: 11 },
            formatter: (_value: number, ctx: any) => {
              const total = values[ctx.dataIndex] || 0;
              const mediaDias = medias[ctx.dataIndex] || 0;
              return `${total} • ${fmtNumero.format(mediaDias)}d`;
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (value) => fmtNumero.format(Number(value)),
            },
          },
          y: {
            grid: { display: false },
          },
        },
      },
    });
  }

  useEffect(() => {
    atualizarGraficoParadasSetor(paradasSetor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paradasSetor]);

  useEffect(() => {
    atualizarGraficoParadasServico(paradasServico);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paradasServico]);

  /* ============================================================
     Tabela de solicitações (paginação)
  ============================================================ */

  async function carregarTabelaSolicitacoes(qs: string = "") {
    setLoadingTabela(true);
    try {
      const res = await fetch(`${API_BASE_URL}/solicitacoes/lista${qs}`);
      if (!res.ok) {
        throw new Error("Erro ao buscar lista de solicitações");
      }
      const data = (await res.json()) as ListaSolicitacoesResponse;

      startTransition(() => {
        setLista(data.rows || []);
        setTotalRegistros(data.total || 0);
        setTotalPages(data.totalPages || 1);
      });
    } catch (err) {
      console.error("Erro ao carregar tabela de solicitações:", err);
      setLista([]);
      setTotalRegistros(0);
      setTotalPages(1);
    } finally {
      setLoadingTabela(false);
    }
  }

  /* ============================================================
     Handlers filtros + painel + paginação
  ============================================================ */

  function handleLimparFiltros() {
    setDataInicio("");
    setDataFim("");
    setFiltroSetor("");
    setFiltroServico("");
    setPage(1);
  }

  function handleSetorClick(row: SolicitacaoRow) {
    if (!row.setor || !row.sector_id) return;
    setPanelSectorId(row.sector_id);
    setPanelSectorName(row.setor);
    setPanelOpen(true);
  }

  function handleChangeInicio(value: string) {
    setDataInicio(value);
    setPage(1);
  }

  function handleChangeFim(value: string) {
    setDataFim(value);
    setPage(1);
  }

  function handleChangeSetor(value: string) {
    setFiltroSetor(value);
    setFiltroServico("");
    setPage(1);
  }

  function handleChangeServico(value: string) {
    setFiltroServico(value);
    setPage(1);
  }

  function handlePaginaAnterior() {
    setPage((old) => Math.max(1, old - 1));
  }

  function handleProximaPagina() {
    setPage((old) => Math.min(totalPages, old + 1));
  }

  /* Cleanup charts */
  useEffect(() => {
    return () => {
      if (statusChartRef.current) statusChartRef.current.destroy();
      if (evolucaoChartRef.current) evolucaoChartRef.current.destroy();
      if (topServChartRef.current) topServChartRef.current.destroy();
      if (paradasSetorChartRef.current) paradasSetorChartRef.current.destroy();
      if (paradasServicoChartRef.current)
        paradasServicoChartRef.current.destroy();
    };
  }, []);

  /* ============================================================
     RENDER
  ============================================================ */

  const total = resumo?.total ?? 0;
  const iniciadas = resumo?.iniciadas ?? 0;
  const espera = resumo?.espera ?? 0;
  const respondidas = resumo?.respondidas ?? 0;
  const concluidas = resumo?.concluidas ?? 0;

  const pIniciadas = calcPercent(iniciadas, total);
  const pEspera = calcPercent(espera, total);
  const pRespondidas = calcPercent(respondidas, total);
  const pConcluidas = calcPercent(concluidas, total);

  const isCarregandoTabela = loadingTabela || isPending;

  const mediaConclusaoDias = tempoResumo?.media_geral_dias ?? 0;
  const totalConcluidasPeriodo = tempoResumo?.total_concluidas ?? 0;

  const totalParadas = paradasResumo?.total_paradas ?? 0;
  const mediaDiasParadas = paradasResumo?.media_dias_paradas ?? 0;

  return (
    <div className="main-container">
      <Header />

      {/* TÍTULO */}
      <section className="dash-section" style={{ marginBottom: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            textAlign: "center",
            padding: "12px 0",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.45rem",
                fontWeight: 700,
              }}
            >
              Análise Geral de Solicitações
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                color: "#6b7280",
                fontSize: ".95rem",
              }}
            >
              Volume, status, desempenho e distribuição por setor e serviço
            </p>
          </div>
        </div>
      </section>

      {/* SELETOR PERIODO + FILTROS */}
      <section className="dash-section">
        <div className="period-buttons-center">
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => handleChangeInicio(e.target.value)}
            className="period-btn input-date"
          />
          <span>—</span>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => handleChangeFim(e.target.value)}
            className="period-btn input-date"
          />

          <select
            value={filtroSetor}
            onChange={(e) => handleChangeSetor(e.target.value)}
            className="period-btn input-select"
          >
            <option value="">Todos os setores</option>
            {setores.map((s) => (
              <option key={s.sector_id} value={s.sector_id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={filtroServico}
            onChange={(e) => handleChangeServico(e.target.value)}
            className="period-btn input-select"
          >
            <option value="">Todos os serviços</option>
            {servicos.map((sv) => (
              <option key={sv.service_id} value={sv.service_id}>
                {sv.name}
              </option>
            ))}
          </select>

          <button className="period-btn clear-btn" onClick={handleLimparFiltros}>
            Limpar
          </button>
        </div>
      </section>

      {/* CARDS RESUMO GERAL (contagens por status) */}
      <section className="dash-section">
        <div className="card-deck stats-cards">
          <div className="user-stat-card">
            <span className="kpi-title">Solicitações Recebidas</span>
            <strong className="kpi-value">
              {loadingResumo ? "—" : fmtNumero.format(total)}
            </strong>
            <div className="kpi__sub">{descricaoFiltroAplicado}</div>
          </div>

          <div
            className="user-stat-card"
            style={{ backgroundColor: "#DBEAFE" }}
          >
            <span className="kpi-title">Iniciadas</span>
            <strong className="kpi-value">
              {loadingResumo ? "—" : fmtNumero.format(iniciadas)}
            </strong>
            <div className="kpi__sub">
              {total ? `${pIniciadas.toFixed(2)}% do total` : "—"}
            </div>
          </div>

          <div
            className="user-stat-card"
            style={{ backgroundColor: "#FEF3C7" }}
          >
            <span className="kpi-title">Em Espera</span>
            <strong className="kpi-value">
              {loadingResumo ? "—" : fmtNumero.format(espera)}
            </strong>
            <div className="kpi__sub">
              {total ? `${pEspera.toFixed(2)}% do total` : "—"}
            </div>
          </div>

          <div
            className="user-stat-card"
            style={{ backgroundColor: "#DBEAFE" }}
          >
            <span className="kpi-title">Respondidas</span>
            <strong className="kpi-value">
              {loadingResumo ? "—" : fmtNumero.format(respondidas)}
            </strong>
            <div className="kpi__sub">
              {total ? `${pRespondidas.toFixed(2)}% do total` : "—"}
            </div>
          </div>

          <div
            className="user-stat-card"
            style={{ backgroundColor: "#D1FAE5" }}
          >
            <span className="kpi-title">Concluídas</span>
            <strong className="kpi-value">
              {loadingResumo ? "—" : fmtNumero.format(concluidas)}
            </strong>
            <div className="kpi__sub">
              {total ? `${pConcluidas.toFixed(2)}% do total` : "—"}
            </div>
          </div>
        </div>
      </section>



      {/* KPIs DE SLA (ABERTAS x CONCLUÍDAS) */}
      <section className="dash-section">
    <div className="section-title-wrapper">
      <TitleWithTooltip tooltip="Indicadores de desempenho operacional e tempo médio das solicitações, considerando o período e filtros selecionados.">
  <h3 className="section-title">
    Indicadores de SLA
  </h3>
</TitleWithTooltip>

<p className="section-subtitle">
  Tempos médios em dias • {descricaoFiltroAplicado}
</p>


          <div className="card-deck stats-cards" style={{ marginBottom: 4 }}>
            {/* Tempo médio em aberto */}
            <div className="user-stat-card">
              <span className="kpi-title">
                ⏱️     Tempo médio que {loadingParadas ? "—" : fmtNumero.format(totalParadas)} solicitações estão em aberto
              </span>
              <strong className="kpi-value">
                {loadingParadas
                  ? "—"
                  : `${fmtNumero.format(mediaDiasParadas)} dias`}
              </strong>
              <div className="kpi__sub">
             
              </div>
            </div>


            {/* Tempo médio de conclusão */}
            <div className="user-stat-card">
              <span className="kpi-title">⏳ Tempo médio para resolver {loadingTempo
                  ? "—"
                  : fmtNumero.format(totalConcluidasPeriodo)} solicitações</span>
              <strong className="kpi-value">
                {loadingTempo
                  ? "—"
                  : `${fmtNumero.format(mediaConclusaoDias)} dias`}
              </strong>
              <div className="kpi__sub">
        
              </div>
            </div>

            {/* Total concluídas */}
   
          </div>
        </div>
      </section>



      {/* STATUS x TOP SERVIÇOS */}
      <section className="dash-section">
        <div className="section-content-flex">
          <div className="ranking-box" style={{ flex: 1 }}>
            <TitleWithTooltip tooltip="Distribuição atual das solicitações por status, considerando os filtros aplicados.">
              Status das Solicitações
            </TitleWithTooltip>
            <p style={{ fontSize: ".9rem", color: "#6b7280" }}>
              Distribuição atual • {descricaoFiltroAplicado}
            </p>
            <div className="chart-container" style={{ height: 280 }}>
              <canvas ref={statusCanvasRef} />
            </div>
          </div>

          <div className="ranking-box" style={{ flex: 1 }}>
            <TitleWithTooltip tooltip="Serviços mais solicitados considerando os filtros de período, setor e serviço.">
              Top 5 Serviços
            </TitleWithTooltip>
            <p style={{ fontSize: ".9rem", color: "#6b7280" }}>
              Serviços mais demandados (com filtros aplicados)
            </p>
            <div className="chart-container" style={{ height: 280 }}>
              <canvas ref={topServCanvasRef} />
            </div>
          </div>
        </div>
      </section>

      {/* EVOLUÇÃO */}
      <section className="dash-section">
        <div className="section-title-wrapper">
         <TitleWithTooltip 
         tooltip="Evolução das solicitações abertas e concluídas, com granularidade ajustada automaticamente conforme o período selecionado."
            className="section-title-main">
    Evolução no período

</TitleWithTooltip>
 <p className="section-title-sub">
  Granularidade diária / semanal / mensal • {descricaoFiltroAplicado}
</p>

          <div className="chart-container" style={{ height: 500 }}>
            <canvas ref={evolucaoCanvasRef} />
          </div>
        </div>
      </section>

      {/* PROCESSOS EM ABERTO POR SETOR / SERVIÇO (TOP 5 + BOTÃO) */}
      <section className="dash-section">
     <div className="section-title-wrapper">
          <TitleWithTooltip tooltip="Distribuição das solicitações em aberto agrupadas por setor e por serviço, considerando apenas solicitações não concluídas ou transferidas.">
  <h3 className="section-title">
    Solicitações em aberto por setor e serviço
  </h3>
</TitleWithTooltip>

<p className="section-subtitle">
  {descricaoFiltroAplicado}
</p>


          <div className="section-content-flex">
            {/* TOP 5 SETORES */}
            <div className="ranking-box" style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <TitleWithTooltip tooltip="Setores com maior volume de solicitações em aberto (TOP 5). Clique em 'Ver todos' para abrir a lista completa.">
                  Em aberto por setor — Top 5
                </TitleWithTooltip>

                <button
                  type="button"
                  className="link-button"
                  onClick={() => setModalSetoresOpen(true)}
                  disabled={!paradasSetorOrdenado.length}
                >
                  Ver todos os setores
                </button>
              </div>

              <p style={{ fontSize: ".85rem", color: "#6b7280" }}>
                Mostrando apenas os 5 setores com mais solicitações em aberto.
              </p>

              <div className="chart-container" style={{ height: 260 }}>
                <canvas ref={paradasSetorCanvasRef} />
              </div>
            </div>

            {/* TOP 5 SERVIÇOS */}
            <div className="ranking-box" style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <TitleWithTooltip tooltip="Serviços com maior volume de solicitações em aberto (TOP 5). Clique em 'Ver todos' para abrir a lista completa.">
                  Em aberto por serviço — Top 5
                </TitleWithTooltip>

                <button
                  type="button"
                  className="link-button"
                  onClick={() => setModalServicosOpen(true)}
                  disabled={!paradasServicoOrdenado.length}
                >
                  Ver todos os serviços
                </button>
              </div>

              <p style={{ fontSize: ".85rem", color: "#6b7280" }}>
                Mostrando apenas os 5 serviços com mais solicitações em aberto.
              </p>

              <div className="chart-container" style={{ height: 260 }}>
                <canvas ref={paradasServicoCanvasRef} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TABELA */}
      <section className="dash-section">
        <div className="ranking-box" style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <h3>Detalhamento das Solicitações</h3>
            <div
              style={{
                fontSize: ".85rem",
                color: "#6b7280",
                textAlign: "center",
              }}
            >
              <div>
                Total encontrado:{" "}
                <strong>{fmtNumero.format(totalRegistros)}</strong>
              </div>
              <div>
                Página {page} de {totalPages}
              </div>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="period-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cidadão</th>
                  <th>Serviço</th>
                  <th>Setor</th>
                  <th>Status</th>
                  <th>Protocolo</th>
                </tr>
              </thead>
              <tbody>
                {isCarregandoTabela ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center" }}>
                      Carregando...
                    </td>
                  </tr>
                ) : lista.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ textAlign: "center", color: "#6b7280" }}
                    >
                      Nenhuma solicitação encontrada para os filtros
                      selecionados.
                    </td>
                  </tr>
                ) : (
                  lista.map((item, idx) => (
                    <tr key={`${item.id}-${idx}`}>
                      <td>{formatDateBR(item.created_at)}</td>
                      <td>{item.cidadao || "—"}</td>
                      <td>{item.servico || "—"}</td>
                      <td
                        style={
                          item.setor
                            ? {
                                cursor: "pointer",
                                textDecoration: "underline",
                              }
                            : {}
                        }
                        onClick={() => handleSetorClick(item)}
                        title={
                          item.setor
                            ? "Clique para ver detalhes do setor"
                            : undefined
                        }
                      >
                        {item.setor || "—"}
                      </td>
                      <td>{mapStatusLabel(item.status)}</td>
                      <td>{item.protocol || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* CONTROLES DE PAGINAÇÃO */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 12,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: ".85rem", color: "#6b7280" }}>
              Exibindo até {limit} registros por página.
            </span>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="period-btn"
                onClick={handlePaginaAnterior}
                disabled={page <= 1 || isCarregandoTabela}
              >
                Anterior
              </button>
              <button
                className="period-btn"
                onClick={handleProximaPagina}
                disabled={page >= totalPages || isCarregandoTabela}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Painel lateral */}
      <SectorSidePanel
        open={panelOpen}
        sectorId={panelSectorId}
        sectorName={panelSectorName}
        onClose={() => setPanelOpen(false)}
      />

      {/* MODAL — LISTA COMPLETA DE SETORES */}
      <SimpleModal
        open={modalSetoresOpen}
        onClose={() => setModalSetoresOpen(false)}
        title="Solicitações em aberto por setor"
        subtitle={descricaoFiltroAplicado}
      >
        <div className="table-wrapper">
          <table className="period-table">
            <thead>
              <tr>
                <th style={{ width: "55%" }}>Setor</th>
                <th style={{ width: "20%", textAlign: "right" }}>
                  Em aberto
                </th>
                <th style={{ width: "25%", textAlign: "right" }}>
                  Tempo médio parado (dias)
                </th>
              </tr>
            </thead>
            <tbody>
              {paradasSetorOrdenado.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    style={{ textAlign: "center", color: "#6b7280" }}
                  >
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                paradasSetorOrdenado.map((row, idx) => (
                  <tr key={`${row.setor || "setor"}-${idx}`}>
                    <td>{row.setor || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {fmtNumero.format(row.total_paradas || 0)}
                    </td>
                   <td style={{ textAlign: "right" }}>
  {fmtNumero.format(Number(row.media_dias_parado) || 0)}
</td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SimpleModal>

      {/* MODAL — LISTA COMPLETA DE SERVIÇOS */}
      <SimpleModal
        open={modalServicosOpen}
        onClose={() => setModalServicosOpen(false)}
        title="Solicitações em aberto por serviço"
        subtitle={descricaoFiltroAplicado}
      >
        <div className="table-wrapper">
          <table className="period-table">
            <thead>
              <tr>
                <th style={{ width: "55%" }}>Serviço</th>
                <th style={{ width: "20%", textAlign: "right" }}>
                  Em aberto
                </th>
                <th style={{ width: "25%", textAlign: "right" }}>
                  Tempo médio parado (dias)
                </th>
              </tr>
            </thead>
            <tbody>
              {paradasServicoOrdenado.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    style={{ textAlign: "center", color: "#6b7280" }}
                  >
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                paradasServicoOrdenado.map((row, idx) => (
                  <tr key={`${row.servico || "servico"}-${idx}`}>
                    <td>{row.servico || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {fmtNumero.format(row.total_paradas || 0)}
                    </td>
                   <td style={{ textAlign: "right" }}>
  {fmtNumero.format(Number(row.media_dias_parado) || 0)}
</td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SimpleModal>
    </div>
  );
};


export default Solicitacoes;
