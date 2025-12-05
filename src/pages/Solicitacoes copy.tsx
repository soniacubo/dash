import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  MouseEvent,
} from "react";
import Header from "../components/Header";
import TitleWithTooltip from "../components/TitleWithTooltip";
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";

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

/* ============================================================
   HELPERS
============================================================ */

const fmtNumero = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

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
 * Agrupa os pontos da evolução em:
 * - diário
 * - semanal (seg–dom)
 * - mensal
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
      // semana começando na segunda
      const diaSemana = d.getDay(); // 0 dom, 1 seg...
      const offset = (diaSemana + 6) % 7; // qtde de dias até segunda
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
      // monthly
      const ano = d.getFullYear();
      const mes = d.getMonth(); // 0–11
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
   COMPONENTE: Painel Lateral de Setor (placeholder)
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

  /* Dados */
  const [resumo, setResumo] = useState<ResumoSolicitacoes | null>(null);
  const [lista, setLista] = useState<SolicitacaoRow[]>([]);
  const [setores, setSetores] = useState<SetorOption[]>([]);
  const [servicos, setServicos] = useState<ServicoOption[]>([]);

  const [loadingResumo, setLoadingResumo] = useState(false);
  const [loadingTabela, setLoadingTabela] = useState(false);

  /* Charts */
  const statusCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusChartRef = useRef<Chart | null>(null);

  const evolucaoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const evolucaoChartRef = useRef<Chart | null>(null);

  const topServCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const topServChartRef = useRef<Chart | null>(null);

  /* Painel lateral setor */
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelSectorId, setPanelSectorId] = useState<number | null>(null);
  const [panelSectorName, setPanelSectorName] = useState<string | null>(null);

  /* Query string de filtros */
  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (dataInicio && dataFim) {
      params.append("inicio", dataInicio);
      params.append("fim", dataFim);
    }

    if (filtroSetor) {
      params.append("setor", filtroSetor);
    }

    if (filtroServico) {
      params.append("servico", filtroServico);
    }

    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [dataInicio, dataFim, filtroSetor, filtroServico]);

  /* Nome do setor/serviço selecionados para exibição nos títulos */
  const setorSelecionado = useMemo(() => {
    if (!filtroSetor) return "";
    const s = setores.find(
      (x) => String(x.sector_id) === String(filtroSetor)
    );
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

  /* TOP 5 SERVIÇOS a partir da lista já carregada */
  const topServicos: TopServico[] = useMemo(() => {
    if (!lista || lista.length === 0) return [];
    const mapa = new Map<string, number>();

    for (const row of lista) {
      const nome = row.servico || "Não informado";
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1);
    }

    return Array.from(mapa.entries())
      .map(([servico, total]) => ({ servico, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [lista]);

  /* ============================================================
     1) Load inicial filtros
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
     3) Atualizar resumo + tabela sempre que filtros mudam
  ============================================================ */

  useEffect(() => {
    atualizarResumoESyncVisual();
    carregarTabelaSolicitacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  /* ============================================================
     Resumo + Gráficos
  ============================================================ */

  async function atualizarResumoESyncVisual() {
    setLoadingResumo(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/solicitacoes/resumo${queryString}`
      );
      if (!res.ok) {
        throw new Error("Erro ao buscar resumo de solicitações");
      }
      const dados = (await res.json()) as ResumoSolicitacoes;

      const total = Number(dados.total || 0);
      const iniciadas = Number(dados.iniciadas || 0);
      const espera = Number(dados.espera || 0);
      const respondidas = Number(dados.respondidas || 0);
      const concluidas = Number(dados.concluidas || 0); // já inclui transferidas

      setResumo({ total, iniciadas, espera, respondidas, concluidas });

      atualizarGraficoStatus({ iniciadas, espera, respondidas, concluidas });
      carregarGraficoEvolucao();
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
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const label = ctx.label || "";
                const value = ctx.raw as number;
                const total =
                  values.reduce((acc, v) => acc + v, 0) || 0;
                const pct = calcPercent(value || 0, total);
                return `${label}: ${fmtNumero.format(
                  value || 0
                )} (${pct.toFixed(1)}%)`;
              },
            },
          },
        },
      },
    });
  }

  async function carregarGraficoEvolucao() {
    const canvas = evolucaoCanvasRef.current;
    if (!canvas) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/solicitacoes/evolucao${queryString}`
      );
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

      // Determinar tamanho do período em dias
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

      const agrupado = agruparEvolucaoPorGranularidade(
        dados,
        granularidade
      );

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
          plugins: {
            legend: {
              display: false, // ✅ sem labels (legend) visíveis
            },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  `${ctx.dataset.label}: ${fmtNumero.format(
                    ctx.parsed.y || 0
                  )}`,
              },
            },
            // Se tiver plugin global de datalabels, desligamos:
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

  /* ============================================================
     Gráfico Top 5 Serviços (a partir da lista)
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
        indexAxis: "y", // barras horizontais
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.label}: ${fmtNumero.format(ctx.parsed.x || 0)} solicitações`,
            },
          },
          // @ts-ignore
          datalabels: {
            display: false,
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
    atualizarGraficoTopServicos(topServicos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topServicos]);

  /* ============================================================
     Tabela de solicitações
  ============================================================ */

  async function carregarTabelaSolicitacoes() {
    setLoadingTabela(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/solicitacoes/lista${queryString}`
      );
      if (!res.ok) {
        throw new Error("Erro ao buscar lista de solicitações");
      }
      const data: SolicitacaoRow[] = await res.json();
      setLista(data || []);
    } catch (err) {
      console.error("Erro ao carregar tabela de solicitações:", err);
      setLista([]);
    } finally {
      setLoadingTabela(false);
    }
  }

  /* ============================================================
     Handlers filtros + painel
  ============================================================ */

  function handleLimparFiltros() {
    setDataInicio("");
    setDataFim("");
    setFiltroSetor("");
    setFiltroServico("");
  }

  function handleSetorClick(row: SolicitacaoRow) {
    if (!row.setor || !row.sector_id) return;
    setPanelSectorId(row.sector_id);
    setPanelSectorName(row.setor);
    setPanelOpen(true);
  }

  /* Cleanup charts */
  useEffect(() => {
    return () => {
      if (statusChartRef.current) {
        statusChartRef.current.destroy();
      }
      if (evolucaoChartRef.current) {
        evolucaoChartRef.current.destroy();
      }
      if (topServChartRef.current) {
        topServChartRef.current.destroy();
      }
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
            <p
              style={{
                margin: "6px 0 0",
                color: "#4b5563",
                fontSize: ".9rem",
                fontWeight: 500,
              }}
            >
         
            </p>
          </div>
        </div>
      </section>
     
      {/* SELETOR PERIODO */}
      <section className="dash-section">
        <div className="period-buttons-center">
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="period-btn input-date"
          />
          <span>—</span>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="period-btn input-date"
          />

          <select
            value={filtroSetor}
            onChange={(e) => setFiltroSetor(e.target.value)}
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
            onChange={(e) => setFiltroServico(e.target.value)}
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

      {/* CARDS RESUMO */}
      <section className="dash-section">
        <div className="card-deck stats-cards">
          {/* Total */}
          <div className="user-stat-card">
            <span className="kpi-title">Solicitações Recebidas</span>
            <strong className="kpi-value">
              {loadingResumo ? "—" : fmtNumero.format(total)}
            </strong>
          </div>

          {/* Iniciadas */}
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

          {/* Em espera */}
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

          {/* Respondidas */}
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

          {/* Concluídas (inclui transferidas) */}
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

      {/* STATUS x TOP SERVIÇOS – 50/50 */}
      <section className="dash-section">
        <div className="section-content-flex">
          {/* Status */}
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

          {/* Top serviços */}
          <div className="ranking-box" style={{ flex: 1 }}>
            <TitleWithTooltip tooltip="Serviços mais solicitados considerando os filtros de período, setor e serviço.">
              Top 5 Serviços
            </TitleWithTooltip>
            <p style={{ fontSize: ".9rem", color: "#6b7280" }}>
              Serviços mais demandados • {descricaoFiltroAplicado}
            </p>
            <div className="chart-container" style={{ height: 280 }}>
              <canvas ref={topServCanvasRef} />
            </div>
          </div>
        </div>
      </section>

      {/* EVOLUÇÃO – LINHA INTEIRA */}
      <section className="dash-section">
        <div className="ranking-box" style={{ width: "100%" }}>
          <TitleWithTooltip tooltip="Evolução das solicitações abertas e concluídas (incluindo transferidas), com granularidade ajustada ao tamanho do período.">
            Evolução no período
          </TitleWithTooltip>
          <p style={{ fontSize: ".9rem", color: "#6b7280" }}>
            Granularidade diária / semanal / mensal • {descricaoFiltroAplicado}
          </p>
          <div className="chart-container" style={{ height: 320 }}>
            <canvas ref={evolucaoCanvasRef} />
          </div>
        </div>
      </section>

      {/* TABELA – 100% ABAIXO */}
      <section className="dash-section">
        <div className="ranking-box" style={{ width: "100%" }}>
          <h3>Detalhamento das Solicitações</h3>
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
                {loadingTabela ? (
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
                  lista.map((item) => (
                    <tr key={item.id}>
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
        </div>
      </section>

      {/* Painel lateral */}
      <SectorSidePanel
        open={panelOpen}
        sectorId={panelSectorId}
        sectorName={panelSectorName}
        onClose={() => setPanelOpen(false)}
      />
    </div>
  );
};

export default Solicitacoes;
