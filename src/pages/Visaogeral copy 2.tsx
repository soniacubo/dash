import { useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
//import SectionTitle from "../components/SectionTitle";
// removed conflicting import – local SectionTitle component is used below
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";

/* ============================================================
   UTIL: contador animado para KPIs
============================================================ */
function useCountUp(value: number | undefined, duration = 800) {
  const [display, setDisplay] = useState(0);



  useEffect(() => {
    if (value == null) return;
    const start = 0;
    const end = Number(value);
    const stepTime = 16; // ~60fps
    const totalSteps = duration / stepTime;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      const progress = currentStep / totalSteps;
      const eased = progress < 1 ? progress * progress : 1;
      const nextValue = start + (end - start) * eased;

      setDisplay(nextValue);

      if (progress === 1) clearInterval(timer);
    }, stepTime);

    return () => clearInterval(timer);
  }, [value, duration]);

  return display;
}

/* ============================================================
   TIPAGENS
============================================================ */
type EconomiaResumoRow = {
  mes: number;
  mes_nome: string;
  total_solicitacoes: number;
  pessoas_atendidas: number;
  total_notificacoes: number;
  total_tramitacoes: number;
  economia_gerada: number;
};

type EconomometroData = {
  folhas: number;
  arvores: string;
  dinheiro: string;
};

type Periodo = "today" | "7d" | "30d" | "90d" | "6m" | "1y" | "all";

/* ============================================================
   COMPONENTE DE TÍTULO PADRÃO
============================================================ */
type SectionTitleProps = {
  title: string;
  subtitle?: string;
  infoTooltip?: string;
};

const SectionTitle = ({ title, subtitle, infoTooltip }: SectionTitleProps) => {
  return (
    <header style={{ textAlign: "center", marginBottom: 16 }}>
      <h2
        style={{
          margin: 0,
          fontSize: "1.05rem",
          fontWeight: 600,
          color: "#111827",
        }}
      >
        {title}
        {infoTooltip && (
          <span
            title={infoTooltip}
            style={{ fontSize: 12, marginLeft: 6, cursor: "help" }}
          >
            ℹ️
          </span>
        )}
      </h2>
      {subtitle && (
        <p
          style={{
            margin: "4px 0 0",
            color: "#6b7280",
            fontSize: 12,
          }}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
};

/* ============================================================
   PÁGINA
============================================================ */
export default function Visaogeral() {
  const fmt = useMemo(() => new Intl.NumberFormat("pt-BR"), []);


  const fmtMoeda = useMemo(
    () =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
      }),
    []
  );

  /** ----------------- REFS DE GRÁFICOS ----------------- */
  const evolucaoRef = useRef<HTMLCanvasElement | null>(null);
  const evolucaoChartRef = useRef<Chart | null>(null);

  const perfilRef = useRef<HTMLCanvasElement | null>(null);
  const perfilChartRef = useRef<Chart | null>(null);

  const topBairrosRef = useRef<HTMLCanvasElement | null>(null);
  const topBairrosChartRef = useRef<Chart | null>(null);

  const miniServicesRef = useRef<HTMLCanvasElement | null>(null);
  const miniServicesChartRef = useRef<Chart | null>(null);

  const miniSectorsRef = useRef<HTMLCanvasElement | null>(null);
  const miniSectorsChartRef = useRef<Chart | null>(null);

  const miniResolutionRef = useRef<HTMLCanvasElement | null>(null);
  const miniResolutionChartRef = useRef<Chart | null>(null);

  const stackedStatusRef = useRef<HTMLCanvasElement | null>(null);
const stackedStatusChartRef = useRef<Chart | null>(null);


  /** ----------------- ESTADOS GERAIS ----------------- */
  const [anos, setAnos] = useState<number[]>([]);
  const [anoSel, setAnoSel] = useState<number>(new Date().getFullYear());
  const [economiaResumo, setEconomiaResumo] = useState<EconomiaResumoRow[]>([]);
  const [economiaTotalAno, setEconomiaTotalAno] = useState<number>(0);

  const [statusPeriodo, setStatusPeriodo] = useState<any[]>([]);


  const [ecoPeriodo, setEcoPeriodo] = useState<string>("este-mes");
  const [economometro, setEconomometro] = useState<EconomometroData | null>(
    null
  );

  const [periodoIndicadores, setPeriodoIndicadores] =
    useState<Periodo>("7d");
  const [taxaResolucaoMedia, setTaxaResolucaoMedia] = useState<number | null>(
    null
  );

  const [taxaDetalhada, setTaxaDetalhada] = useState<{
  abertas: number;
  andamento: number;
  concluidas: number;
  respondidas: number;
} | null>(null);

  /** ----------------- KPIs (contadores globais) ----------------- */
  const [kpis, setKpis] = useState<{
    total_servicos?: number;
    total_usuarios?: number;
    total_cidadaos?: number;
    total_setores?: number;
    eficiencia_pct?: number;
    qualidade_media?: number;
  }>({});
  const countServicos = useCountUp(kpis.total_servicos);
  const countUsuarios = useCountUp(kpis.total_usuarios);
  const countCidadaos = useCountUp(kpis.total_cidadaos);
  const countSetores = useCountUp(kpis.total_setores);

  const [cidadaosResumo, setCidadaosResumo] = useState<{
    homens?: number;
    mulheres?: number;
    idade_media?: number;
  }>({});

  useEffect(() => {
    const y = new Date().getFullYear();
    setAnos([y, y - 1, y - 2, y - 3, y - 4]);
  }, []);

  /** ----------------- CARREGAR CONTADORES & CIDADAOS ----------------- */
  useEffect(() => {
    async function carregarContadores() {
      const r = await fetch(`${API_BASE_URL}/visao-geral/contadores`);
      const k = await r.json();
      setKpis(k || {});
    }
    async function carregarCidadaos() {
      const r = await fetch(`${API_BASE_URL}/visao-geral/cidadaos-resumo`);
      const c = await r.json();
      setCidadaosResumo(c || {});
    }
    carregarContadores();
    carregarCidadaos();
  }, []);

  /** ----------------- GRÁFICO: EVOLUÇÃO DE USO ----------------- */
  useEffect(() => {
    async function evolucao() {
      const r = await fetch(`${API_BASE_URL}/visao-geral/evolucao-uso`);
      const data = await r.json();

      if (!evolucaoRef.current) return;

      const labels = data.map((d: any) => {
        const dt = new Date(`${d.mes_iso}T00:00:00`);
        return new Intl.DateTimeFormat("pt-BR", {
          month: "short",
        })
          .format(dt)
          .replace(".", "");
      });

      const abertas = data.map((d: any) => Number(d.abertas || 0));
      const concluidas = data.map((d: any) => Number(d.concluidas || 0));

      if (evolucaoChartRef.current) evolucaoChartRef.current.destroy();

      evolucaoChartRef.current = new Chart(evolucaoRef.current, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Abertas",
              data: abertas,
              borderColor: "#2563eb",
              backgroundColor: "rgba(37,99,235,.12)",
              borderWidth: 2,
              pointRadius: 2,
              tension: 0.25,
            },
            {
              label: "Concluídas",
              data: concluidas,
              borderColor: "#10b981",
              backgroundColor: "rgba(16,185,129,.12)",
              borderWidth: 2,
              pointRadius: 2,
              tension: 0.25,
              hidden: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true },
          },
        },
      });
    }
    evolucao();
    return () => {
      if (evolucaoChartRef.current) evolucaoChartRef.current.destroy();
    };
  }, []);

  /** ----------------- GRÁFICO: PERFIL (SERVIDORES x CIDADÃOS x REPRESENTANTES) ----------------- */
  useEffect(() => {
    async function perfis() {
      const r = await fetch(`${API_BASE_URL}/visao-geral/contadores`);
      const k = await r.json();
      if (!perfilRef.current) return;

      const servidores = Number(k.total_usuarios || 0);
      const cidadaos = Number(k.total_cidadaos || 0);
      const representantes = 45000; // mock temporário

      const raw = [servidores, cidadaos, representantes];
      const display = raw.map((v) => Math.sqrt(Math.max(1, v)));

      if (perfilChartRef.current) perfilChartRef.current.destroy();

      perfilChartRef.current = new Chart(perfilRef.current, {
        type: "doughnut",
        data: {
          labels: ["Servidores", "Cidadãos", "Representantes"],
          datasets: [
            {
              data: display,
              backgroundColor: ["#2563eb", "#60a5fa", "#93c5fd"],
              borderColor: "#ffffff",
              borderWidth: 2,
              offset: display.map((_, i) => (i === 0 ? 8 : 0)),
              hoverOffset: 10,
            },
          ],
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
                  return `${ctx.label}: ${fmt.format(Number(val || 0))}`;
                },
              },
            },
          },
        },
      });
    }

    perfis();
    return () => {
      if (perfilChartRef.current) perfilChartRef.current.destroy();
    };
  }, [fmt]);


  /** ----------------- ECONÔMETRO ----------------- */
 useEffect(() => {
  async function carregarEconomometro() {
    try {
      let url = `${API_BASE_URL}/economometro`;

      // ✅ quando for "este-ano" envia ?ano=2025
      if (ecoPeriodo.includes("ano")) {
        url += `?ano=${anoSel}`;
      } else {
        url += `?periodo=${ecoPeriodo}`;
      }

      const r = await fetch(url);
      const data = await r.json();

      setEconomometro({
        folhas: Math.round(Number(data.folhas || 0)),
        arvores: Number(data.arvores || 0).toFixed(3),
        dinheiro: Number(data.dinheiro || 0).toFixed(2),
      });

    } catch (err) {
      console.error("Erro ao carregar economometro:", err);
    }
  }

  carregarEconomometro();
}, [ecoPeriodo, anoSel]);



  /** ----------------- GRÁFICO TOP 5 BAIRROS ----------------- */
  useEffect(() => {
    async function carregarTopBairros() {
      try {
        const r = await fetch(`${API_BASE_URL}/solicitacoes/bairros-top6`);
        const { bairros, meses } = await r.json();

        if (!topBairrosRef.current) return;
        if (topBairrosChartRef.current) topBairrosChartRef.current.destroy();

        // manter só 5 bairros
        const listaBairros: string[] = (bairros || [])
          .slice(0, 5)
          .map((b: any) => b.bairro);

        // meses 1..12 fixos
        const mesesFixos = Array.from({ length: 12 }, (_, i) => i + 1);

        const labels = mesesFixos.map((m) => {
          const dt = new Date(2025, m - 1, 1);
          return new Intl.DateTimeFormat("pt-BR", { month: "short" })
            .format(dt)
            .replace(".", "");
        });

        const cores = ["#2563eb", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

        const datasets =
          listaBairros.length > 0
            ? listaBairros.map((bairro, idx) => {
              const data = mesesFixos.map((m) => {
                const row = (meses || []).find(
                  (r: any) => r.bairro === bairro && r.mes === m
                );
                return row ? Number(row.total || 0) : 0;
              });

              return {
                label: bairro,
                data,
                borderColor: cores[idx],
                backgroundColor: "transparent",
                borderWidth: 2,
                pointRadius: 3,
                tension: 0.25,
              };
            })
            : [
              {
                label: "Sem dados",
                data: new Array(labels.length).fill(0),
                borderColor: "#9ca3af",
                backgroundColor: "transparent",
              },
            ];

        topBairrosChartRef.current = new Chart(topBairrosRef.current, {
          type: "line",
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true },
            },
          },
        });
      } catch (err) {
        console.error("Erro gráfico bairros:", err);
      }
    }

    carregarTopBairros();
    return () => {
      if (topBairrosChartRef.current) topBairrosChartRef.current.destroy();
    };
  }, []);

  /** ----------------- INDICADORES POR PERÍODO (3 MINI-CHARTS) ----------------- */
  useEffect(() => {
    async function carregarIndicadores() {
      const [rServ, rSet, rTaxa] = await Promise.all([
        fetch(
          `${API_BASE_URL}/indicadores/servicos-top5?periodo=${periodoIndicadores}`
        ),
        fetch(
          `${API_BASE_URL}/indicadores/setores-top5?periodo=${periodoIndicadores}`
        ),
        fetch(
          `${API_BASE_URL}/indicadores/taxa-resolucao?periodo=${periodoIndicadores}`
        ),
      ]);

      const [servicos, setores, taxa] = await Promise.all([
        rServ.json(),
        rSet.json(),
        rTaxa.json(),
      ]);

      /** Mini gráfico: serviços mais solicitados */
      if (miniServicesRef.current) {
        if (miniServicesChartRef.current)
          miniServicesChartRef.current.destroy();

        const labels = servicos.map((s: any) => s.servico || "—");
        const valores = servicos.map((s: any) => Number(s.total || 0));

        miniServicesChartRef.current = new Chart(miniServicesRef.current, {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                label: "Solicitações",
                data: valores,
                backgroundColor: "rgba(37,99,235,0.6)",
              },
            ],
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true },
              y: { ticks: { autoSkip: false, maxRotation: 0, minRotation: 0 } },
            },
          },
        });
      }

      /** Mini gráfico: setores mais solicitados */
      if (miniSectorsRef.current) {
        if (miniSectorsChartRef.current) miniSectorsChartRef.current.destroy();

        const labels = setores.map((s: any) => s.setor || "—");
        const valores = setores.map((s: any) => Number(s.total || 0));

        miniSectorsChartRef.current = new Chart(miniSectorsRef.current, {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                label: "Solicitações",
                data: valores,
                backgroundColor: "rgba(16,185,129,0.6)",
              },
            ],
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true },
              y: { ticks: { autoSkip: false, maxRotation: 0, minRotation: 0 } },
            },
          },
        });
      }

      /** Mini gráfico: taxa de resolução */
      if (miniResolutionRef.current) {
        if (miniResolutionChartRef.current)
          miniResolutionChartRef.current.destroy();

        const abertas = Number(taxa?.abertas || 0);
        const andamento = Number(taxa?.andamento || 0);
        const concluidas = Number(taxa?.concluidas || 0);
        const respondidas = Number(taxa?.respondidas || 0);
        // expõe valores globalmente para usar no componente da barra
        ; (window as any).__taxa_abertas = abertas;
        ; (window as any).__taxa_andamento = andamento;
        ; (window as any).__taxa_respondidas = respondidas;
        ; (window as any).__taxa_concluidas = concluidas;

        const total = abertas + andamento + concluidas + respondidas;
        const media = total > 0 ? (concluidas / total) * 100 : 0;
        setTaxaResolucaoMedia(media);
setTaxaDetalhada({
  abertas,
  andamento,
  concluidas,
  respondidas,
});

        const labels = ["Abertas", "Em andamento", "Concluídas", "Respondidas"];
        const valores = [abertas, andamento, concluidas, respondidas];

        miniResolutionChartRef.current = new Chart(miniResolutionRef.current, {
          type: "doughnut",
          data: {
            labels,
            datasets: [
              {
                data: valores,
                backgroundColor: ["#f59e0b", "#60a5fa", "#10b981", "#93c5fd"],
                borderColor: "#ffffff",
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
          },
        });
      }
    }

    carregarIndicadores();

    return () => {
      if (miniServicesChartRef.current) miniServicesChartRef.current.destroy();
      if (miniSectorsChartRef.current) miniSectorsChartRef.current.destroy();
      if (miniResolutionChartRef.current)
        miniResolutionChartRef.current.destroy();
    };
  }, [periodoIndicadores]);

useEffect(() => {
  if (!stackedStatusRef.current || !taxaDetalhada) return;

  const { abertas, andamento, concluidas, respondidas } = taxaDetalhada;
  const total = abertas + andamento + concluidas + respondidas;

  const pct = (v: number) =>
    total > 0 ? Number(((v / total) * 100).toFixed(1)) : 0;

  if (stackedStatusChartRef.current)
    stackedStatusChartRef.current.destroy();

  stackedStatusChartRef.current = new Chart(stackedStatusRef.current, {
    type: "bar",
    data: {
      labels: [""],
      datasets: [
        {
          label: "Iniciadas",
          data: [pct(abertas)],
          backgroundColor: "#CCFCE3",
        },
        {
          label: "Em espera",
          data: [pct(andamento)],
          backgroundColor: "#FFEFC2",
        },
        {
          label: "Respondidas",
          data: [pct(respondidas)],
          backgroundColor: "#CFE4FF",
        },
        {
          label: "Concluídas",
          data: [pct(concluidas)],
          backgroundColor: "#1B7F52",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: {
          position: "bottom",
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${ctx.parsed.x}%`,
          },
        },
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          stacked: true,
          ticks: { callback: (v) => `${v}%` },
        },
        y: { stacked: true },
      },
    },
  });

  return () => {
    if (stackedStatusChartRef.current)
      stackedStatusChartRef.current.destroy();
  };
}, [taxaDetalhada]);




  /** ----------------- RESUMO POR ANO (TABELA + ECONOMIA TOTAL) ----------------- */
  useEffect(() => {
    async function carregarResumoAno() {
      const r = await fetch(`${API_BASE_URL}/resumo-periodo?ano=${anoSel}`);
      const rows: EconomiaResumoRow[] = await r.json();

      setEconomiaResumo(rows || []);

      const totalEco = rows.reduce(
        (sum, row) => sum + Number(row.economia_gerada || 0),
        0
      );
      setEconomiaTotalAno(totalEco);
    }
    carregarResumoAno();
  }, [anoSel]);

  /** ----------------- DERIVADOS PARA RENDERIZAÇÃO ----------------- */
  const eficienciaFmt =
    kpis.eficiencia_pct != null
      ? `${Number(kpis.eficiencia_pct).toFixed(1)}%`
      : "—%";

  const qualidadeFmt =
    kpis.qualidade_media != null && Number(kpis.qualidade_media) > 0
      ? Number(kpis.qualidade_media).toFixed(2)
      : "—";

  const taxaResolucaoMediaFmt =
    taxaResolucaoMedia != null ? `${taxaResolucaoMedia.toFixed(1)}%` : "--%";

  /** ----------------- RENDER ----------------- */
  return (
    <main className="main-container">
      <Header />

      {/* TÍTULO GERAL */}
      <section className="dash-section" style={{ marginBottom: 20 }}>
        <SectionTitle
          title="Visão Geral do Município no Cidade Conectada"
          subtitle="Panorama consolidado de uso, qualidade e economia gerada pelo sistema"
        />
      </section>

      {/* KPIs PRINCIPAIS */}
      <section className="dash-section" aria-labelledby="kpi-title">
        <SectionTitle
          title="Indicadores principais"
          subtitle="Indicadores gerais de serviços, usuários, cidadãos e setores"
        />

        <div
          className="card-deck"
          id="vg-kpis"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 12,
            width: "100%",
          }}
        >
          <div className="user-stat-card">
            Eficiência média
            <strong id="vg-eficiencia">{eficienciaFmt}</strong>
          </div>

          <div className="user-stat-card">
            Qualidade média
            <strong id="vg-qualidade">{qualidadeFmt}</strong>
          </div>

          <div className="user-stat-card">
            Serviços cadastrados
            <strong id="vg-servicos">
              {fmt.format(countServicos || 0)}
            </strong>
          </div>

          <div className="user-stat-card">
            Usuários (servidores)
            <strong id="vg-usuarios">
              {fmt.format(countUsuarios || 0)}
            </strong>
          </div>

          <div className="user-stat-card kpi-cidadaos">
            Cidadãos (contas)
            <strong id="vg-cidadaos-total">
              {fmt.format(countCidadaos || 0)}
            </strong>
          </div>

          <div className="user-stat-card">
            Setores
            <strong id="vg-setores">
              {fmt.format(countSetores || 0)}
            </strong>
          </div>
        </div>
      </section>

      {/* ECONÔMETRO */}
      <section className="dash-section econometro-section">
        <SectionTitle
          title="🌱 Economômetro"
          subtitle="Impacto ambiental e financeiro gerado pelo uso do sistema"
          infoTooltip="Cálculo baseado em economia média por solicitação e tramitação digital."
        />

        <div className="economometro-grid">
          <div className="eco-card">
            <div className="eco-icon">🌳</div>
            <h3 className="eco-title">Árvores Preservadas</h3>
            <div className="eco-value">
              {economometro ? economometro.arvores : "0"}
            </div>
            <p className="eco-desc">1 árvore ≈ 8.000 folhas</p>
          </div>

          <div className="eco-card">
            <div className="eco-icon">📄</div>
            <h3 className="eco-title">Folhas Economizadas</h3>
            <div className="eco-value">
              {economometro ? fmt.format(economometro.folhas) : "0"}
            </div>
            <p className="eco-desc">Inclui impressões internas e externas</p>
          </div>

          <div className="eco-card">
            <div className="eco-icon">💰</div>
            <h3 className="eco-title">Economia Financeira</h3>
            <div className="eco-value">
              {economometro
                ? fmtMoeda.format(Number(economometro.dinheiro || "0"))
                : "R$ 0,00"}
            </div>
            <p className="eco-desc">Baseado no custo médio por página</p>
          </div>
        </div>

        {/* seletor de período alinhado à direita, logo abaixo dos cards */}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <select
            id="eco-periodo-select"
            className="eco-select"
            value={ecoPeriodo}
            onChange={(e) => setEcoPeriodo(e.target.value)}
          >
            <option value="esta-semana">Esta semana</option>
            <option value="este-mes">Este mês</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="6m">Últimos 6 meses</option>
            <option value="ano">Este ano</option>
          </select>
        </div>
      </section>

      {/* GRÁFICOS PRINCIPAIS: EVOLUÇÃO + BAIRROS */}
      <section className="dash-section" style={{ marginTop: 4 }}>
        <SectionTitle
          title="Indicadores mensais de uso e origem das solicitações"
          subtitle="Evolução do volume total de demanda e participação dos bairros ao longo dos meses"
        />

        <div className="section-content-flex" style={{ display: "flex", gap: 16 }}>
          <div className="ranking-box" style={{ flex: 1 }}>
            <h3 className="chart-title">Evolução de uso (últimos 12 meses)</h3>
            <p className="chart-subtitle">Volume mensal de solicitações/processos</p>
            <div className="chart-container" style={{ height: 330 }}>
              <canvas ref={evolucaoRef}></canvas>
            </div>
          </div>

          <div className="ranking-box" style={{ flex: 1 }}>
            <h3 className="chart-title">Bairros que mais solicitam</h3>
            <p className="chart-subtitle">Evolução mensal por bairro</p>
            <div className="chart-container" style={{ height: 330 }}>
              <canvas ref={topBairrosRef}></canvas>
            </div>
          </div>
        </div>
      </section>

      <section className="dash-section dash-period-indicators">

        {/* TÍTULO CENTRALIZADO */}
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <SectionTitle
            title="Indicadores por Período"
            subtitle="Serviços e setores mais demandados no intervalo selecionado"
          />

          {/* BOTÕES ABAIXO DO TÍTULO */}
          <div
            className="period-filter"
            style={{
              marginTop: 8,
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {[
              { label: "Hoje", value: "today" },
              { label: "Últimos 7 dias", value: "7d" },
              { label: "Últimos 30 dias", value: "30d" },
              { label: "Últimos 90 dias", value: "90d" },
              { label: "Últimos 6 meses", value: "6m" },
              { label: "Último ano", value: "1y" },
              { label: "Todo período", value: "all" },
            ].map((p) => (
              <button
                key={p.value}
                className={`period-btn ${periodoIndicadores === p.value ? "active" : ""
                  }`}
                onClick={() => setPeriodoIndicadores(p.value as Periodo)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* DOIS GRÁFICOS LADO A LADO E MAIORES */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            width: "100%",
            marginTop: 20,
          }}
        >
          {/* SERVIÇOS */}
          <article className="period-card" style={{ height: 340 }}>
            <header className="period-card-header">
              <h3>Serviços mais solicitados</h3>
              <span className="period-card-subtitle">Top 5 por volume</span>
            </header>
            <div className="period-card-body">
              <div className="mini-chart-wrapper" style={{ height: "100%" }}>
                <canvas ref={miniServicesRef}></canvas>
              </div>
            </div>
          </article>

          {/* SETORES */}
          <article className="period-card" style={{ height: 340 }}>
            <header className="period-card-header">
              <h3>Setores mais solicitados</h3>
              <span className="period-card-subtitle">Top 5 por volume</span>
            </header>
            <div className="period-card-body">
              <div className="mini-chart-wrapper" style={{ height: "100%" }}>
                <canvas ref={miniSectorsRef}></canvas>
              </div>
            </div>
          </article>
        </div>
'

<div
  style={{
    width: "100%",
    height: 160,
    marginTop: 24,
  }}
>
  <canvas ref={stackedStatusRef}></canvas>
</div>
'
        {/* KPI CENTRALIZADO EMBAIXO */}
       {/* KPI CENTRALIZADO EMBAIXO */}
  <div
    style={{
      marginTop: 32,
      textAlign: "center",
    }}
  >
    <span
      className="kpi-value"
      style={{
        fontSize: "2.6rem",
        fontWeight: 700,
        color: "#111827",
      }}
    >
      {taxaResolucaoMediaFmt}
    </span>
    <div
      className="kpi-label"
      style={{ fontSize: ".95rem", color: "#6b7280", marginTop: 4 }}
    >
      taxa média de resolução no período
    </div>
  </div>

      </section>


      {/* TABELA FINAL: RESUMO DO ANO */}
     <section className="dash-section period-section">

  {/* TÍTULO CENTRALIZADO + SELECT LINHA ABAIXO, IGUAL AO PADRÃO */}
  <div style={{ textAlign: "center", marginBottom: 16 }}>
    <SectionTitle
      title="Dados do período por ano"
      subtitle="Consolidados mensais de solicitações, pessoas atendidas, notificações, tramitações e economia gerada"
    />

    {/* SELECT ALINHADO À DIREITA, COMO NO ECONÔMETRO */}
    <div
      style={{
        marginTop: 8,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <select
        id="vg-ano-select"
        className="eco-select"
        value={String(anoSel)}
        onChange={(e) => setAnoSel(Number(e.target.value))}
      >
        {anos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  </div>


        <div className="table-wrapper">
          <table className="period-table">
            <thead>
              <tr>
                <th>Período</th>
                <th>
                  Solicitações
                  <br />
                  <span>Geradas</span>
                </th>
                <th>
                  Pessoas Atendidas
                  <br />
                  <span>Únicas</span>
                </th>
                <th>
                  Notificações
                  <br />
                  <span>Total</span>
                </th>
                <th>
                  Tramitações
                  <br />
                  <span>Total</span>
                </th>
                <th>
                  💰 Economia Gerada
                  <br />
                  <span>Total</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {economiaResumo.map((row) => (
                <tr key={row.mes}>
                  <td>{row.mes_nome}</td>
                  <td>{fmt.format(row.total_solicitacoes || 0)}</td>
                  <td>{fmt.format(row.pessoas_atendidas || 0)}</td>
                  <td>{fmt.format(row.total_notificacoes || 0)}</td>
                  <td>{fmt.format(row.total_tramitacoes || 0)}</td>
                  <td>{fmtMoeda.format(row.economia_gerada || 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {economiaResumo.length > 0 && (
                <tr>
                  <th>Total</th>
                  <th>
                    {fmt.format(
                      economiaResumo.reduce(
                        (s, r) => s + (r.total_solicitacoes || 0),
                        0
                      )
                    )}
                  </th>
                  <th>
                    {fmt.format(
                      economiaResumo.reduce(
                        (s, r) => s + (r.pessoas_atendidas || 0),
                        0
                      )
                    )}
                  </th>
                  <th>
                    {fmt.format(
                      economiaResumo.reduce(
                        (s, r) => s + (r.total_notificacoes || 0),
                        0
                      )
                    )}
                  </th>
                  <th>
                    {fmt.format(
                      economiaResumo.reduce(
                        (s, r) => s + (r.total_tramitacoes || 0),
                        0
                      )
                    )}
                  </th>
                  <th>{fmtMoeda.format(economiaTotalAno || 0)}</th>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </section>

      <footer
        style={{
          marginTop: 20,
          textAlign: "center",
          fontSize: 12,
          color: "#6b7280",
        }}
      >
        Cidade Conectada — BI Dashboard
      </footer>
    </main>
  );
}
