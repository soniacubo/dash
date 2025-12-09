import { useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";
import TitleWithTooltip from "../components/TitleWithTooltip";

/* ============================================================
   1. UTIL: contador animado para KPIs
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
   2. FORMATADOR DE TEMPO (minutos -> texto amigável)
============================================================ */
export function formatarTempo(
  minutosTotais: number | null | undefined
): string {
  if (!minutosTotais || minutosTotais < 1) return "0 minutos";

  const dias = Math.floor(minutosTotais / 1440); // 1440 = 24 * 60
  const horas = Math.floor((minutosTotais % 1440) / 60);
  const minutos = Math.floor(minutosTotais % 60);

  // --- Caso: só minutos (< 60)
  if (minutosTotais < 60) {
    return `${minutosTotais} minuto${
      minutosTotais === 1 ? "" : "s"
    }`;
  }

  // --- Caso: menos de 1 dia (horas + minutos)
  if (dias === 0) {
    if (minutos === 0) return `${horas}h`;
    return `${horas}h e ${minutos} minuto${
      minutos === 1 ? "" : "s"
    }`;
  }

  // --- Caso: dias + horas (minutos não aparecem)
  return `${dias} dia${dias > 1 ? "s" : ""} e ${horas}h`;
}

/* ============================================================
   3. TIPAGEM DE PERÍODOS
============================================================ */
type Periodo =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "6m"
  | "1y"
  | "all"
  | "ano_passado";

/* ============================================================
   4. REGRAS DE COR DOS CARDS
============================================================ */
function getMediaClass(media: number) {
  // Média diária: azul por padrão, vermelho se passar de 25
  if (media > 25) return "card-red";
  return "card-blue";
}

function getTaxaClass(taxa: number) {
  // Taxa de resolução: >=70 verde, 45–69 laranja, <45 vermelho
  if (taxa >= 70) return "card-green";
  if (taxa >= 45) return "card-orange";
  return "card-red";
}

function getTaxaRespostaClass(p: number) {
  // Mesma lógica da taxa de resolução (não está sendo usada hoje,
  // mas mantive para compatibilidade se for usar depois)
  if (p >= 70) return "card-green";
  if (p >= 45) return "card-orange";
  return "card-red";
}

function getTempoClass(dias: number) {
  // Tempo médio: <=15 verde, 16–45 laranja, >45 vermelho
  if (dias <= 15) return "card-green";
  if (dias <= 45) return "card-orange";
  return "card-red";
}

/* ============================================================
   5. TIPAGENS
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

/* ============================================================
   6. COMPONENTE DE TÍTULO PADRÃO (.section-title*)
============================================================ */
type SectionTitleProps = {
  title: string;
  subtitle?: string;
  infoTooltip?: string;
};

const SectionTitle = ({
  title,
  subtitle,
  infoTooltip,
}: SectionTitleProps) => {
  return (
    <header className="section-title">
      <h2 className="section-title-main">
        {title}
        {infoTooltip && (
          <span
            className="section-title-info"
            title={infoTooltip}
          >
            ℹ️
          </span>
        )}
      </h2>

      {subtitle && (
        <p className="section-title-sub">{subtitle}</p>
      )}
    </header>
  );
};

/* ============================================================
   7. PÁGINA PRINCIPAL — VISÃO GERAL
============================================================ */
export default function Visaogeral() {
  /* ---------- Formatadores numéricos ---------- */
  const fmt = useMemo(
    () => new Intl.NumberFormat("pt-BR"),
    []
  );
  const fmtMoeda = useMemo(
    () =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
      }),
    []
  );

  /* ---------- REFS DE GRÁFICOS ---------- */
  const evolucaoRef =
    useRef<HTMLCanvasElement | null>(null);
  const evolucaoChartRef = useRef<Chart | null>(null);

  const perfilRef =
    useRef<HTMLCanvasElement | null>(null);
  const perfilChartRef = useRef<Chart | null>(null);

  const topBairrosRef =
    useRef<HTMLCanvasElement | null>(null);
  const topBairrosChartRef = useRef<Chart | null>(null);

  const miniServicesRef =
    useRef<HTMLCanvasElement | null>(null);
  const miniServicesChartRef = useRef<Chart | null>(null);

  const miniSectorsRef =
    useRef<HTMLCanvasElement | null>(null);
  const miniSectorsChartRef = useRef<Chart | null>(null);

  const stackedStatusRef =
    useRef<HTMLCanvasElement | null>(null);
  const stackedStatusChartRef = useRef<Chart | null>(null);

  /* ---------- ESTADOS GERAIS ---------- */
  const [anos, setAnos] = useState<number[]>([]);
  const [anoSel, setAnoSel] = useState<number>(
    new Date().getFullYear()
  );

  const [economiaResumo, setEconomiaResumo] = useState<
    EconomiaResumoRow[]
  >([]);
  const [economiaTotalAno, setEconomiaTotalAno] =
    useState<number>(0);

  const [ecoPeriodo, setEcoPeriodo] =
    useState<string>("este-mes");
  const [economometro, setEconomometro] =
    useState<EconomometroData | null>(null);

  const [periodoIndicadores, setPeriodoIndicadores] =
    useState<Periodo>("7d");

  const [taxaResolucaoCaixa, setTaxaResolucaoCaixa] =
    useState<{
      iniciadas: number;
      resolvidas: number;
      respondidas: number;
      taxa_respostas: number;
      taxa_resolucao: number;
      tempo_medio_conclusao_min: number;
    } | null>(null);

  const [indicadoresExtra, setIndicadoresExtra] =
    useState({
      mediaPorDia: 0,
      diasPeriodo: 0,
    });

  /* ---------- KPIs GLOBAIS ---------- */
  const [kpis, setKpis] = useState<{
    total_servicos?: number;
    total_usuarios?: number;
    total_cidadaos?: number;
    total_setores?: number;
    eficiencia_pct?: number;
    qualidade_media?: number;
  }>({});

  const countServicos = useCountUp(
    kpis.total_servicos
  );
  const countUsuarios = useCountUp(
    kpis.total_usuarios
  );
  const countCidadaos = useCountUp(
    kpis.total_cidadaos
  );
  const countSetores = useCountUp(
    kpis.total_setores
  );

  /* ============================================================
     8. ANOS DISPONÍVEIS
  ============================================================ */
  useEffect(() => {
    const y = new Date().getFullYear();
    setAnos([y, y - 1, y - 2, y - 3, y - 4]);
  }, []);

  /* ============================================================
     9. CARREGAR CONTADORES GLOBAIS
  ============================================================ */
  useEffect(() => {
    const ac = new AbortController();

    async function carregarContadores() {
      try {
        const r = await fetch(
          `${API_BASE_URL}/visao-geral/contadores`,
          { signal: ac.signal }
        );
        if (!r.ok) return;
        const k = await r.json();
        setKpis(k || {});
      } catch {
        // silencioso para não quebrar a tela
      }
    }

    carregarContadores();
    return () => ac.abort();
  }, []);

  /* ============================================================
     10. GRÁFICO: EVOLUÇÃO DE USO (12 MESES)
  ============================================================ */
  useEffect(() => {
    const ac = new AbortController();

    async function evolucao() {
      try {
        const r = await fetch(
          `${API_BASE_URL}/visao-geral/evolucao-uso`,
          { signal: ac.signal }
        );
        if (!r.ok) return;
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

        const abertas = data.map((d: any) =>
          Number(d.abertas || 0)
        );
        const concluidas = data.map((d: any) =>
          Number(d.concluidas || 0)
        );

        if (evolucaoChartRef.current)
          evolucaoChartRef.current.destroy();

        evolucaoChartRef.current = new Chart(
          evolucaoRef.current,
          {
            type: "line",
            data: {
              labels,
              datasets: [
                {
                  label: "Abertas",
                  data: abertas,
                  borderColor: "#2563eb",
                  backgroundColor:
                    "rgba(37,99,235,.12)",
                  borderWidth: 2,
                  pointRadius: 2,
                  tension: 0.25,
                },
                {
                  label: "Concluídas",
                  data: concluidas,
                  borderColor: "#10b981",
                  backgroundColor:
                    "rgba(16,185,129,.12)",
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
              plugins: {
                legend: { position: "bottom" },
              },
              scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true },
              },
            },
          }
        );
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Erro gráfico evolução:", err);
        }
      }
    }

    evolucao();
    return () => {
      if (evolucaoChartRef.current)
        evolucaoChartRef.current.destroy();
      ac.abort();
    };
  }, []);

  /* ============================================================
     11. ECONÔMETRO
  ============================================================ */
  useEffect(() => {
    const ac = new AbortController();

    async function carregarEconomometro() {
      try {
        const r = await fetch(
          `${API_BASE_URL}/economometro?periodo=${ecoPeriodo}`,
          { signal: ac.signal }
        );
        if (!r.ok) return;
        const data = await r.json();

        const folhas = Number(data.folhas || 0);
        const arvores = String(data.arvores || "0.000");
        const dinheiro = String(data.dinheiro || "0.00");

        setEconomometro({
          folhas: Math.round(folhas),
          arvores,
          dinheiro,
        });
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error(
            "Erro economometro:",
            err
          );
        }
      }
    }

    carregarEconomometro();
    return () => ac.abort();
  }, [ecoPeriodo]);

  /* ============================================================
     12. GRÁFICO TOP 5 BAIRROS
  ============================================================ */
  useEffect(() => {
    const ac = new AbortController();

    async function carregarTopBairros() {
      try {
        const r = await fetch(
          `${API_BASE_URL}/solicitacoes/bairros-top6`,
          { signal: ac.signal }
        );
        if (!r.ok) return;
        const { bairros, meses } = await r.json();

        if (!topBairrosRef.current) return;
        if (topBairrosChartRef.current)
          topBairrosChartRef.current.destroy();

        // manter só 5 bairros
        const listaBairros: string[] = (
          bairros || []
        )
          .slice(0, 5)
          .map((b: any) => b.bairro);

        // meses 1..12 fixos
        const mesesFixos = Array.from(
          { length: 12 },
          (_, i) => i + 1
        );

        const labels = mesesFixos.map((m) => {
          const dt = new Date(2025, m - 1, 1);
          return new Intl.DateTimeFormat(
            "pt-BR",
            { month: "short" }
          )
            .format(dt)
            .replace(".", "");
        });

        const cores = [
          "#2563eb",
          "#10b981",
          "#f59e0b",
          "#ec4899",
          "#8b5cf6",
        ];

        const datasets =
          listaBairros.length > 0
            ? listaBairros.map(
                (bairro, idx) => {
                  const data = mesesFixos.map(
                    (m) => {
                      const row = (
                        meses || []
                      ).find(
                        (r: any) =>
                          r.bairro === bairro &&
                          r.mes === m
                      );
                      return row
                        ? Number(
                            row.total || 0
                          )
                        : 0;
                    }
                  );

                  return {
                    label: bairro,
                    data,
                    borderColor:
                      cores[idx],
                    backgroundColor:
                      "transparent",
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.25,
                  };
                }
              )
            : [
                {
                  label: "Sem dados",
                  data: new Array(
                    labels.length
                  ).fill(0),
                  borderColor:
                    "#9ca3af",
                  backgroundColor:
                    "transparent",
                },
              ];

        topBairrosChartRef.current =
          new Chart(topBairrosRef.current, {
            type: "line",
            data: { labels, datasets },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "bottom",
                },
              },
              scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true },
              },
            },
          });
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.error(
            "Erro gráfico bairros:",
            err
          );
        }
      }
    }

    carregarTopBairros();
    return () => {
      if (topBairrosChartRef.current)
        topBairrosChartRef.current.destroy();
      ac.abort();
    };
  }, []);

  /* ============================================================
     13. INDICADORES POR PERÍODO (SERVIÇOS, SETORES, TAXAS, MÉDIA DIÁRIA)
  ============================================================ */
  useEffect(() => {
    async function carregarIndicadores() {
      try {
        const [
          rServ,
          rSet,
          rTaxaResolucao,
          rMediaDiaria,
        ] = await Promise.all([
          fetch(
            `${API_BASE_URL}/indicadores-periodo/servicos?period=${periodoIndicadores}`
          ),
          fetch(
            `${API_BASE_URL}/indicadores-periodo/setores?period=${periodoIndicadores}`
          ),
          fetch(
            `${API_BASE_URL}/indicadores/taxa-resolucao?periodo=${periodoIndicadores}`
          ),
          // NOVO: rota dedicada para média diária
          fetch(
            `${API_BASE_URL}/visao-geral/media-diaria?periodo=${periodoIndicadores}`
          ),
        ]);

        const servicos = await rServ.json();
        const setores = await rSet.json();
        const taxa = await rTaxaResolucao.json();
        const mediaData = await rMediaDiaria.json();

        // ================================
        // DIAS DO PERÍODO (backup, caso backend de média não envie)
        // ================================
        const inicio = taxa.inicio
          ? new Date(taxa.inicio)
          : null;
        const fim = taxa.fim
          ? new Date(taxa.fim)
          : null;

        let diasPeriodoCalculado = 1;
        if (inicio && fim) {
          diasPeriodoCalculado = Math.max(
            1,
            Math.floor(
              (fim.getTime() -
                inicio.getTime()) /
                (1000 * 60 * 60 * 24)
            ) + 1
          );
        }

        // ================================
        // SALVAR TAXAS E TEMPOS
        // ================================
        setTaxaResolucaoCaixa({
          iniciadas: taxa.iniciadas,
          resolvidas: taxa.resolvidas,
          respondidas: taxa.respondidas,
          taxa_respostas: taxa.taxa_respostas,
          taxa_resolucao: taxa.taxa_resolucao,
          tempo_medio_conclusao_min:
            taxa.tempo_medio_conclusao_min,
        });

        // ================================
        // MÉDIA DIÁRIA (CORRIGIDA)
        // usa valores da rota /visao-geral/media-diaria
        // e, se faltar algo, cai no cálculo local
        // ================================
        const mediaBackend =
          Number(mediaData.media_diaria || 0);
        const diasBackend = Number(
          mediaData.diasPeriodo || 0
        );

        setIndicadoresExtra({
          mediaPorDia: mediaBackend,
          diasPeriodo:
            diasBackend || diasPeriodoCalculado,
        });

        // ================================
        // GRÁFICO SERVIÇOS
        // ================================
        if (miniServicesRef.current) {
          if (miniServicesChartRef.current)
            miniServicesChartRef.current.destroy();

          const labels = servicos.map(
            (s: any) => s.service_name || "—"
          );
          const valores = servicos.map((s: any) =>
            Number(s.total || 0)
          );

          miniServicesChartRef.current = new Chart(
            miniServicesRef.current,
            {
              type: "bar",
              data: {
                labels,
                datasets: [
                  {
                    label: "Solicitações",
                    data: valores,
                    backgroundColor:
                      "rgba(37,99,235,0.6)",
                  },
                ],
              },
              options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                },
              },
            }
          );
        }

        // ================================
        // GRÁFICO SETORES
        // ================================
        if (miniSectorsRef.current) {
          if (miniSectorsChartRef.current)
            miniSectorsChartRef.current.destroy();

          const labels = setores.map(
            (s: any) => s.sector_name || "—"
          );
          const valores = setores.map((s: any) =>
            Number(s.total || 0)
          );

          miniSectorsChartRef.current = new Chart(
            miniSectorsRef.current,
            {
              type: "bar",
              data: {
                labels,
                datasets: [
                  {
                    label: "Solicitações",
                    data: valores,
                    backgroundColor:
                      "rgba(16,185,129,0.6)",
                  },
                ],
              },
              options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                },
              },
            }
          );
        }
      } catch (err) {
        console.error(
          "Erro carregarIndicadores:",
          err
        );
      }
    }

    carregarIndicadores();

    return () => {
      if (miniServicesChartRef.current)
        miniServicesChartRef.current.destroy();
      if (miniSectorsChartRef.current)
        miniSectorsChartRef.current.destroy();
    };
  }, [periodoIndicadores]);

  /* ============================================================
     14. RESUMO POR PERÍODO / ANO (TABELA)
  ============================================================ */
  useEffect(() => {
    async function carregarResumoPeriodo() {
      const r = await fetch(
        `${API_BASE_URL}/resumo-periodo?periodo=${periodoIndicadores}&ano=${anoSel}`
      );
      const data = await r.json();

      setEconomiaResumo(
        Array.isArray(data) ? data : data.meses || []
      );
      setEconomiaTotalAno(
        Number(data.total?.dinheiro || 0)
      );
    }

    carregarResumoPeriodo();
  }, [anoSel, periodoIndicadores]);

  /* ============================================================
     15. DERIVADOS PARA RENDERIZAÇÃO
  ============================================================ */
  const eficienciaFmt =
    kpis.eficiencia_pct != null
      ? `${Number(
          kpis.eficiencia_pct
        ).toFixed(1)}%`
      : "—%";

  const qualidadeFmt =
    kpis.qualidade_media != null &&
    Number(kpis.qualidade_media) > 0
      ? Number(
          kpis.qualidade_media
        ).toFixed(2)
      : "—";

  /* ============================================================
     16. RENDER
  ============================================================ */
  return (
    <main className="main-container">
      <Header />

      {/* TÍTULO GERAL */}
      <section
        className="dash-section"
        style={{ marginBottom: 20 }}
      >
        <SectionTitle
          title="Visão Geral do Município no Cidade Conectada"
          subtitle="Panorama consolidado de uso, qualidade e economia gerada pelo sistema"
        />
      </section>

      {/* KPIs PRINCIPAIS */}
      <section
        className="dash-section"
        aria-labelledby="kpi-title"
      >
        <SectionTitle
          title="Indicadores principais"
          subtitle="Indicadores gerais de serviços, usuários, cidadãos e setores"
        />

        <div
          className="card-deck"
          id="vg-kpis"
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(6, 1fr)",
            gap: 12,
            width: "100%",
          }}
        >
          <div className="user-stat-card">
            Eficiência média
            <strong id="vg-eficiencia">
              {eficienciaFmt}
            </strong>
          </div>

          <div className="user-stat-card">
            Qualidade média
            <strong id="vg-qualidade">
              {qualidadeFmt}
            </strong>
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
        />

        <div className="economometro-grid">
          <div className="eco-card">
            <div className="eco-icon">🌳</div>
            <h3 className="eco-title">
              Árvores Preservadas
            </h3>
            <div className="eco-value">
              {economometro
                ? economometro.arvores
                : "0"}
            </div>
            <p className="eco-desc">
              1 árvore ≈ 8.000 folhas
            </p>
          </div>

          <div className="eco-card">
            <div className="eco-icon">📄</div>
            <h3 className="eco-title">
              Folhas Economizadas
            </h3>
            <div className="eco-value">
              {economometro
                ? fmt.format(
                    economometro.folhas
                  )
                : "0"}
            </div>
            <p className="eco-desc">
              Inclui impressões internas e
              externas
            </p>
          </div>

          <div className="eco-card">
            <div
              className="eco-icon"
              title="A economia financeira é calculada multiplicando o total de folhas economizadas pelo custo médio de R$ 0,35 por página impressa."
              style={{ cursor: "help" }}
            >
              💰
            </div>

            <h3 className="eco-title">
              Economia Financeira
            </h3>
            <div className="eco-value">
              {economometro
                ? fmtMoeda.format(
                    Number(
                      economometro.dinheiro ||
                        "0"
                    )
                  )
                : "R$ 0,00"}
            </div>
            <p className="eco-desc">
              Baseado no custo médio por
              página
            </p>
          </div>
        </div>

        {/* seletor de período alinhado à direita */}
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
            onChange={(e) =>
              setEcoPeriodo(e.target.value)
            }
          >
            <option value="esta-semana">
              Esta semana
            </option>
            <option value="este-mes">
              Este mês
            </option>
            <option value="90d">
              Últimos 90 dias
            </option>
            <option value="6m">
              Últimos 6 meses
            </option>
            <option value="ano">
              Este ano
            </option>
          </select>
        </div>
      </section>

      {/* GRÁFICOS PRINCIPAIS: EVOLUÇÃO + BAIRROS */}
      <section
        className="dash-section"
        style={{ marginTop: 4 }}
      >
        <SectionTitle
          title="Indicadores mensais de uso e origem das solicitações"
          subtitle="Evolução do volume total de demanda e participação dos bairros ao longo dos meses"
        />

        <div
          className="section-content-flex"
          style={{ display: "flex", gap: 16 }}
        >
          <div
            className="ranking-box"
            style={{ flex: 1 }}
          >
            <h3 className="chart-title">
              Evolução de uso (últimos 12
              meses)
            </h3>
            <p className="chart-subtitle">
              Volume mensal de
              solicitações/processos
            </p>
            <div
              className="chart-container"
              style={{ height: 380 }}
            >
              <canvas ref={evolucaoRef}></canvas>
            </div>
          </div>

          <div
            className="ranking-box"
            style={{ flex: 1 }}
          >
            <h3 className="chart-title">
              Bairros que mais solicitam
            </h3>
            <p className="chart-subtitle">
              Evolução mensal por bairro
            </p>
            <div
              className="chart-container"
              style={{ height: 380 }}
            >
              <canvas
                ref={topBairrosRef}
              ></canvas>
            </div>
          </div>
        </div>
      </section>

      {/* INDICADORES POR PERÍODO */}
      <section className="dash-section dash-period-indicators">
        <div
          style={{
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          <SectionTitle
            title="Indicadores por Período"
            subtitle="Serviços, setores e desempenho operacional dentro do intervalo selecionado"
          />
        </div>

        {/* BOTÕES DE PERÍODO */}
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
            {
              label: "Últimos 7 dias",
              value: "7d",
            },
            {
              label: "Últimos 30 dias",
              value: "30d",
            },
            {
              label: "Últimos 90 dias",
              value: "90d",
            },
            {
              label: "Últimos 6 meses",
              value: "6m",
            },
            {
              label: "Este ano",
              value: "1y",
            },
            {
              label: "Ano passado",
              value: "ano_passado",
            },
            {
              label: "Todo período",
              value: "all",
            },
          ].map((p) => (
            <button
              key={p.value}
              className={`period-btn ${
                periodoIndicadores === p.value
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setPeriodoIndicadores(
                  p.value as Periodo
                )
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* DOIS GRÁFICOS LADO A LADO */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: 16,
            width: "100%",
            marginTop: 30,
          }}
        >
          {/* SERVIÇOS */}
          <article className="period-card">
            <header className="period-card-header">
              <h3>Serviços mais solicitados</h3>
              <span className="period-card-subtitle">
                Top 5 por volume
              </span>
            </header>
            <div className="period-card-body">
              <div
                className="mini-chart-wrapper"
                style={{ height: 260 }}
              >
                <canvas
                  ref={miniServicesRef}
                ></canvas>
              </div>
            </div>
          </article>

          {/* SETORES */}
          <article className="period-card">
            <header className="period-card-header">
              <h3>Setores mais solicitados</h3>
              <span className="period-card-subtitle">
                Top 5 por volume
              </span>
            </header>
            <div className="period-card-body">
              <div
                className="mini-chart-wrapper"
                style={{ height: 260 }}
              >
                <canvas
                  ref={miniSectorsRef}
                ></canvas>
              </div>
            </div>
          </article>
        </div>

        {/* KPIs DO PERÍODO */}
        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns:
              "repeat(4, 1fr)",
            gap: 16,
            width: "100%",
          }}
        >
          {/* 1) TAXA DE RESPOSTAS */}
          <div
            className={`kpi-card ${getTaxaClass(
              taxaResolucaoCaixa
                ?.taxa_respostas || 0
            )}`}
          >
            <TitleWithTooltip
              tooltip="Percentual de solicitações iniciadas que receberam ao menos uma resposta (inclui concluídas)."
              className="kpi-title"
            >
              Taxa de respostas
            </TitleWithTooltip>

            <div className="kpi-value">
              {Number(
                taxaResolucaoCaixa
                  ?.taxa_respostas ?? 0
              ).toFixed(1)}
              %
            </div>

            <div className="kpi-subtext">
              Iniciadas:{" "}
              {fmt.format(
                taxaResolucaoCaixa
                  ?.iniciadas || 0
              )}{" "}
              || Respondidas:{" "}
              {fmt.format(
                taxaResolucaoCaixa
                  ?.respondidas || 0
              )}
            </div>
          </div>

          {/* 3) TAXA DE RESOLUÇÃO */}
          <div
            className={`kpi-card ${getTaxaClass(
              taxaResolucaoCaixa
                ?.taxa_resolucao || 0
            )}`}
          >
            <TitleWithTooltip
              tooltip="Percentual de solicitações concluídas em relação às iniciadas no período selecionado."
              className="kpi-title"
            >
              Taxa de resolução
            </TitleWithTooltip>

            <div className="kpi-value">
              {Number(
                taxaResolucaoCaixa
                  ?.taxa_resolucao ?? 0
              ).toFixed(1)}
              %
            </div>

            <div className="kpi-subtext">
              Iniciadas:{" "}
              {fmt.format(
                taxaResolucaoCaixa
                  ?.iniciadas || 0
              )}{" "}
              - Concluídas:{" "}
              {fmt.format(
                taxaResolucaoCaixa
                  ?.resolvidas || 0
              )}
            </div>
          </div>

          {/* 2) MÉDIA DIÁRIA */}
          <div
            className={`kpi-card ${getMediaClass(
              indicadoresExtra.mediaPorDia
            )}`}
          >
            <TitleWithTooltip
              tooltip="Média diária = Total de solicitações abertas no período ÷ número de dias considerados."
              className="kpi-title"
            >
              Média diária de solicitações
            </TitleWithTooltip>

            <div className="kpi-value">
              {Number(
                indicadoresExtra.mediaPorDia
              ).toFixed(1)}
            </div>

            <div className="kpi-subtext">
              Dias: {indicadoresExtra.diasPeriodo}
            </div>
          </div>

          {/* 4) TEMPO MÉDIO DE CONCLUSÃO */}
          <div
            className={`kpi-card ${getTempoClass(
              Math.floor(
                (taxaResolucaoCaixa
                  ?.tempo_medio_conclusao_min ||
                  0) / 1440
              )
            )}`}
          >
            <TitleWithTooltip
              tooltip="Tempo médio entre a abertura e a conclusão das solicitações resolvidas no período."
              className="kpi-title"
            >
              Tempo médio de resolução
            </TitleWithTooltip>

            <div className="kpi-value">
              {formatarTempo(
                taxaResolucaoCaixa
                  ?.tempo_medio_conclusao_min || 0
              )}
            </div>
          </div>
        </div>
      </section>

      {/* TABELA FINAL: RESUMO DO ANO / PERÍODO */}
      <section className="dash-section period-section">
        <div
          style={{
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          <SectionTitle
            title="Dados do período por ano"
            subtitle="Consolidados mensais de solicitações, pessoas atendidas, notificações, tramitações e economia gerada"
          />

          {/* SELECT ANO ALINHADO À DIREITA */}
          <div
            style={{
              marginTop: 8,
              display: "flex",
              justifyContent: "flex-end",
              width: "100%",
            }}
          >
            <select
              id="vg-ano-select"
              className="eco-select"
              value={String(anoSel)}
              onChange={(e) =>
                setAnoSel(
                  Number(e.target.value)
                )
              }
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
                  <td>
                    {fmt.format(
                      row.total_solicitacoes ||
                        0
                    )}
                  </td>
                  <td>
                    {fmt.format(
                      row.pessoas_atendidas ||
                        0
                    )}
                  </td>
                  <td>
                    {fmt.format(
                      row.total_notificacoes ||
                        0
                    )}
                  </td>
                  <td>
                    {fmt.format(
                      row.total_tramitacoes ||
                        0
                    )}
                  </td>
                  <td>
                    {fmtMoeda.format(
                      row.economia_gerada || 0
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {economiaResumo.length >
                0 && (
                <tr>
                  <th>Total</th>
                  <th>
                    {fmt.format(
                      economiaResumo.reduce(
                        (s, r) =>
                          s +
                          (r.total_solicitacoes ||
                            0),
                        0
                      )
                    )}
                  </th>
                  <th>
                    {fmt.format(
                      economiaResumo.reduce(
                        (s, r) =>
                          s +
                          (r.pessoas_atendidas ||
                            0),
                        0
                      )
                    )}
                  </th>
                  <th>
                    {fmt.format(
                      economiaResumo.reduce(
                        (s, r) =>
                          s +
                          (r.total_notificacoes ||
                            0),
                        0
                      )
                    )}
                  </th>
                  <th>
                    {fmt.format(
                      economiaResumo.reduce(
                        (s, r) =>
                          s +
                          (r.total_tramitacoes ||
                            0),
                        0
                      )
                    )}
                  </th>
                  <th>
                    {fmtMoeda.format(
                      economiaTotalAno || 0
                    )}
                  </th>
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
