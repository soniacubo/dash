import { useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
import SectionTitle from "../components/SectionTitle";
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";

/* =========================================================
   TIPOS
========================================================= */

type SetorOption = {
  sector_id: number;
  name: string;
};

type ServicoOption = {
  service_id: number;
  name: string;
};

type Resumo = {
  total_avaliacoes: number;
  media_geral: number;
};

type Distribuicao = {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
};

type EvolucaoItem = {
  mes: string;
  media: number;
};

type RankingItem = {
  setor?: string;
  servico?: string;
  media: number;
  total_votes: number;
  score_ponderado: number;
};


type Comentario = {
  comment: string;
  score: number;
  created_at: string;
  servico: string;
  setores: string;
  cidadao: string | null;
};

/* =========================================================
   HELPERS (IGUAIS AO SOLICITAÇÕES)
========================================================= */

function buildQuery(params: Record<string, any>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
  });
  return q.toString() ? `?${q.toString()}` : "";
}

function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}


const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/* =========================================================
   COMPONENTE
========================================================= */

export default function Avaliacoes() {
  /* ================= FILTROS ================= */
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("");
  const [filtroServico, setFiltroServico] = useState("");

  const [setores, setSetores] = useState<SetorOption[]>([]);
  const [servicos, setServicos] = useState<ServicoOption[]>([]);

  /* ================= DADOS ================= */
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [distribuicao, setDistribuicao] = useState<Distribuicao | null>(null);
  const [evolucao, setEvolucao] = useState<EvolucaoItem[]>([]);
  const [rankingSetores, setRankingSetores] = useState<RankingItem[]>([]);
  const [rankingServicos, setRankingServicos] = useState<RankingItem[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);

  /* ================= CHARTS ================= */
  const distRef = useRef<Chart | null>(null);
  const evoRef = useRef<Chart | null>(null);

  /* =========================================================
     QUERY STRING
  ========================================================= */
  const qs = useMemo(
    () =>
      buildQuery({
        inicio: dataInicio,
        fim: dataFim,
        setor: filtroSetor,
        servico: filtroServico,
      }),
    [dataInicio, dataFim, filtroSetor, filtroServico]
  );

  const debouncedQs = useDebounce(qs);

  /* =========================================================
     LOAD FILTROS (IGUAL SOLICITAÇÕES)
  ========================================================= */

  useEffect(() => {
    fetch(`${API_BASE_URL}/avaliacoes/setores`)
      .then((r) => r.json())
      .then(setSetores)
      .catch(() => setSetores([]));
  }, []);

  useEffect(() => {
    const url = filtroSetor
      ? `${API_BASE_URL}/avaliacoes/servicos-por-setor?setor=${filtroSetor}`
      : `${API_BASE_URL}/avaliacoes/servicos`;

    fetch(url)
      .then((r) => r.json())
      .then(setServicos)
      .catch(() => setServicos([]));
  }, [filtroSetor]);

  /* =========================================================
     LOAD DADOS
  ========================================================= */

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/avaliacoes/resumo${debouncedQs}`),
      fetch(`${API_BASE_URL}/avaliacoes/distribuicao${debouncedQs}`),
      fetch(`${API_BASE_URL}/avaliacoes/evolucao${debouncedQs}`),
      fetch(`${API_BASE_URL}/avaliacoes/ranking-setores${debouncedQs}`),
      fetch(`${API_BASE_URL}/avaliacoes/ranking-servicos${debouncedQs}`),
      fetch(`${API_BASE_URL}/avaliacoes/comentarios${debouncedQs}`),
    ]).then(async ([r1, r2, r3, r4, r5, r6]) => {
      setResumo(await r1.json());
      setDistribuicao(await r2.json());
      setEvolucao(await r3.json());
      setRankingSetores(await r4.json());
      setRankingServicos(await r5.json());
      setComentarios(await r6.json());
    });
  }, [debouncedQs]);

  /* =========================================================
     GRÁFICOS
  ========================================================= */

useEffect(() => {
  if (!distribuicao) return;
  distRef.current?.destroy();

  distRef.current = new Chart(
    document.getElementById("dist") as HTMLCanvasElement,
    {
      type: "bar",
      data: {
        labels: ["5★", "4★", "3★", "2★", "1★"],
        datasets: [
          {
            data: [
              distribuicao.c5,
              distribuicao.c4,
              distribuicao.c3,
              distribuicao.c2,
              distribuicao.c1,
            ],
            backgroundColor: [
              "#16a34a", // verde
              "#3b82f6", // azul
              "#eab308", // amarelo
              "#f97316", // laranja
              "#dc2626", // vermelho
            ],
            borderRadius: 6,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
        },
      },
    }
  );
}, [distribuicao]);


  // useEffect(() => {
  //   if (!evolucao.length) return;
  //   evoRef.current?.destroy();

  //   evoRef.current = new Chart(
  //     document.getElementById("evo") as HTMLCanvasElement,
  //     {
  //       type: "line",
  //       data: {
  //         labels: evolucao.map((e) => e.mes),
  //         datasets: [
  //           {
  //             data: evolucao.map((e) => Number(e.media)),
  //             borderColor: "#2563eb",
  //             backgroundColor: "rgba(37,99,235,.15)",
  //             fill: true,
  //             tension: 0.3,
  //           },
  //         ],
  //       },
  //       options: {
  //         plugins: { legend: { display: false } },
  //         scales: { y: { min: 0, max: 5 } },
  //       },
  //     }
  //   );
  // }, [evolucao]);
useEffect(() => {
  evoRef.current?.destroy();

  const hasEvolucao = evolucao && evolucao.length > 0;

  const labels = hasEvolucao
    ? evolucao.map((e) => e.mes)
    : ["Período selecionado"];

  const data = hasEvolucao
    ? evolucao.map((e) => Number(e.media))
    : [Number(resumo?.media_geral || 0)];

  evoRef.current = new Chart(
    document.getElementById("evo") as HTMLCanvasElement,
    {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data,
            borderColor: "#2563eb",
            backgroundColor: "rgba(37,99,235,.15)",
            fill: true,
            tension: 0.3,
            pointRadius: hasEvolucao ? 4 : 6,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `Média: ${fmt.format(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          y: {
            min: 0,
            max: 5,
            ticks: {
              stepSize: 1,
            },
          },
        },
      },
    }
  );
}, [evolucao, resumo]);

  /* =========================================================
     DERIVADOS
  ========================================================= */

  const total = resumo?.total_avaliacoes || 0;
  const positivas =
    (distribuicao?.c4 || 0) + (distribuicao?.c5 || 0);
  const negativas =
    (distribuicao?.c1 || 0) + (distribuicao?.c2 || 0);
const neutras = distribuicao?.c3 || 0;

  const pct = (v: number) =>
    total ? `${((v / total) * 100).toFixed(1)}%` : "0%";


const rankingSetoresOrdenado = [...rankingSetores].sort(
  (a, b) => b.score_ponderado - a.score_ponderado
);

const rankingServicosOrdenado = [...rankingServicos].sort(
  (a, b) => b.score_ponderado - a.score_ponderado
);



const comentariosPos = comentarios
  .filter((c) => c.score >= 4)
  .slice(0, 4);

const comentariosNeg = comentarios
  .filter((c) => c.score <= 2)
  .slice(0, 4);





// function RankingExpandivel({
//   title,
//   items,
//   limit = 5,
// }: {
//   title: string;
//   items: RankingItem[];
//   limit?: number;
// }) {
//   const [showAll, setShowAll] = useState(false);
//   const [modo, setModo] = useState<"melhores" | "piores">("melhores");

//   const ordenados = [...items].sort((a, b) => {
//     if (modo === "piores") {
//       return a.score_ponderado - b.score_ponderado;
//     }
//     return b.score_ponderado - a.score_ponderado;
//   });

//   const visibleItems = showAll
//     ? ordenados
//     : ordenados.slice(0, limit);

//   return (
//     <div className="ranking-card">
//       <div className="ranking-header">
//         <h3 className="ranking-title">{title}</h3>

//         <div className="ranking-filters">
//           <button
//             type="button"
//             className={modo === "melhores" ? "active" : ""}
//             onClick={() => setModo("melhores")}
//           >
//             Melhores
//           </button>

//           <button
//             type="button"
//             className={modo === "piores" ? "active" : ""}
//             onClick={() => setModo("piores")}
//           >
//             Piores
//           </button>
//         </div>
//       </div>

//       <ul className="ranking-list">
//         {visibleItems.map((r, i) => (
//           <li key={i} className="ranking-row">
//             <span className={`ranking-pos pos-${i + 1}`}>
//               {i + 1}
//             </span>

//             <span className="ranking-name">
//               {r.setor || r.servico}
//             </span>

//             <span className="ranking-score">
//               ★ {fmt.format(r.media)}
//               <small>
//                 ({r.total_votes})
//                 {Number.isFinite(r.score_ponderado) && (
//                   <> • índice {fmt.format(r.score_ponderado)}</>
//                 )}
//               </small>
//             </span>
//           </li>
//         ))}
//       </ul>

//       {ordenados.length > limit && (
//         <button
//           className="ranking-toggle"
//           onClick={() => setShowAll(v => !v)}
//         >
//           {showAll ? "Mostrar menos" : "Mostrar todos"}
//         </button>
//       )}
//     </div>
//   );
// }

function RankingExpandivel({
  title,
  items,
  limit = 5,
}: {
  title: string;
  items: RankingItem[];
  limit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const [modo, setModo] = useState<"melhores" | "piores">("melhores");

  const ordenados = [...items].sort((a, b) => {
    if (modo === "piores") return a.score_ponderado - b.score_ponderado;
    return b.score_ponderado - a.score_ponderado;
  });

  const visibleItems = showAll ? ordenados : ordenados.slice(0, limit);

  return (
    <div className="ranking-card">
      <div className="ranking-header">
        <h3 className="ranking-title">{title}</h3>

        <div className="ranking-filters">
          <button
            type="button"
            className={`ranking-btn ${
              modo === "melhores" ? "active positive" : ""
            }`}
            onClick={() => setModo("melhores")}
          >
            ▲ Melhores
          </button>

          <button
            type="button"
            className={`ranking-btn ${
              modo === "piores" ? "active negative" : ""
            }`}
            onClick={() => setModo("piores")}
          >
            ▼ Piores
          </button>
        </div>
      </div>

      <ul className="ranking-list">
        {visibleItems.map((r, i) => {
          const posicao =
            modo === "piores"
              ? ordenados.length - i
              : i + 1;

          const isCritico = r.media < 3;

          return (
            <li
              key={i}
              className={`ranking-row ${
                modo === "melhores"
                  ? "ranking-positive"
                  : "ranking-negative"
              }`}
            >
              <span className={`ranking-pos pos-${posicao}`}>
                {posicao}
              </span>

              <span className="ranking-name">
                {r.setor || r.servico}
                {isCritico && (
                  <span className="ranking-badge">Crítico</span>
                )}
              </span>

              <span className="ranking-score">
                ★ {fmt.format(r.media)}
                <small>
                  ({r.total_votes})
                  {Number.isFinite(r.score_ponderado) && (
                    <> • índice {fmt.format(r.score_ponderado)}</>
                  )}
                </small>
              </span>
            </li>
          );
        })}
      </ul>

      {ordenados.length > limit && (
        <button
          className="ranking-toggle"
          onClick={() => setShowAll(v => !v)}
        >
          {showAll ? "Mostrar menos" : "Mostrar todos"}
        </button>
      )}
    </div>
  );
}

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <>
      <main className="main-container">
      <Header />

   
        {/* CABEÇALHO */}
        <section className="dash-section section-title-wrapper">
          <h1 className="section-title-main">Avaliações</h1>
          <p className="section-title-sub">
            Satisfação dos cidadãos por setor e serviço
          </p>
        </section>

        {/* FILTROS */}
        <section className="dash-section">
          <div className="period-buttons-center">
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            <span>—</span>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />

            <select value={filtroSetor} onChange={e => { setFiltroSetor(e.target.value); setFiltroServico(""); }}>
              <option value="">Todos os setores</option>
              {setores.map(s => (
                <option key={s.sector_id} value={s.sector_id}>{s.name}</option>
              ))}
            </select>

            <select value={filtroServico} onChange={e => setFiltroServico(e.target.value)}>
              <option value="">Todos os serviços</option>
              {servicos.map(s => (
                <option key={s.service_id} value={s.service_id}>{s.name}</option>
              ))}
            </select>

            <button onClick={() => {
              setDataInicio(""); setDataFim(""); setFiltroSetor(""); setFiltroServico("");
            }}>
              Limpar
            </button>
          </div>
        </section>

{/* KPIs */}
<section className="dash-section">
  <div className="kpi-grid">
    {/* TOTAL */}
    <div className="kpi-card kpi-blue">
      <span className="kpi-label">Total de avaliações</span>
      <div className="kpi-value">{fmt.format(total)}</div>
      <span className="kpi-sub">Avaliações registradas</span>
      <span className="kpi-icon">📝</span>
    </div>

    {/* MÉDIA */}
    <div className="kpi-card kpi-purple">
      <span className="kpi-label">Média geral</span>
      <div className="kpi-value">
        {fmt.format(resumo?.media_geral || 0)}
      </div>
      <span className="kpi-sub">Escala de 1 a 5</span>
      <span className="kpi-icon">⭐</span>
    </div>

    {/* POSITIVAS */}
    <div className="kpi-card kpi-green">
      <span className="kpi-label">Avaliações positivas</span>
      <div className="kpi-value">{pct(positivas)}</div>
      <span className="kpi-sub">Notas 4 e 5</span>
      <span className="kpi-icon">😊</span>
    </div>

    {/* NEUTRAS */}
    <div className="kpi-card kpi-orange">
      <span className="kpi-label">Avaliações neutras</span>
      <div className="kpi-value">{pct(neutras)}</div>
      <span className="kpi-sub">Nota 3</span>
      <span className="kpi-icon">😐</span>
    </div>

    {/* NEGATIVAS */}
    <div className="kpi-card kpi-red">
      <span className="kpi-label">Avaliações negativas</span>
      <div className="kpi-value">{pct(negativas)}</div>
      <span className="kpi-sub">Notas 1 e 2</span>
      <span className="kpi-icon">😡</span>
    </div>
  </div>
</section>


   <section className="dash-section">
          <SectionTitle
            title="Ranking de Satisfação dos Cidadãos"
            subtitle="Avaliação de satisfação pelos serviços prestados"
          />
  <div className="ranking-grid-2">
    <RankingExpandivel
      title="Secretarias"
      items={rankingSetoresOrdenado}
    />

    <RankingExpandivel
      title="Serviços"
      items={rankingServicosOrdenado}
    />
  </div>
</section>

{/* GRÁFICOS */}
<section className="dash-section">
  <div className="ranking-box full-width">
    {/* TÍTULO DO BLOCO */}
    <SectionTitle
      title="Distribuição das Notas e Evolução das Médias"
      subtitle="Análise do volume de avaliações e da evolução temporal"
    />

    {/* GRÁFICOS */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        marginTop: 16,
      }}
    >
      <div>
        <h3>Distribuição das notas</h3>
        <canvas id="dist" />
      </div>

      <div>
        <h3>Evolução da média</h3>
        <canvas id="evo" />
      </div>
    </div>
  </div>
</section>



        {/* COMENTÁRIOS */}
        <section className="dash-section">
          <h2 className="section-title">Comentários recentes</h2>
          <div className="comentarios-grid">
            {[...comentariosPos, ...comentariosNeg].map((c, i) => (
    <div
  key={i}
  className={`comentario-card ${
    c.score >= 4
      ? "comentario-positive"
      : c.score <= 2
      ? "comentario-negative"
      : "comentario-neutral"
  }`}
>
  {/* TOPO: SERVIÇO + NOTA */}
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    }}
  >
    <h4 className="comentario-servico">{c.servico}</h4>

    <div
      style={{
        fontSize: "0.85rem",
        fontWeight: 700,
        color: "#111827",
        whiteSpace: "nowrap",
      }}
    >
      ★ {c.score.toFixed(1)}
    </div>
  </div>

  {/* SETOR */}
  <div className="comentario-setor">{c.setores}</div>

  {/* TEXTO */}
  <p className="comentario-texto">{c.comment}</p>

  {/* AUTOR */}
<div className="comentario-autor">
  Avaliado por <strong>{ c. cidadao || "Anônimo"}</strong>
  <span style={{ margin: "0 6px", opacity: 0.5 }}>•</span>
  {new Date(c.created_at).toLocaleDateString("pt-BR")}
</div>

</div>


            ))}
          </div>
        </section>
      </main>
    </>
  );
}

/* =========================================================
   COMPONENTE RANKING
========================================================= */

function Ranking({ title, items }: { title: string; items: RankingItem[] }) {
  return (
    <div className="ranking-card">
      <h3>{title}</h3>
      <ul>
        {items.map((r, i) => (
       <li
  key={i}
  className={`ranking-row ${
    modo === "melhores" ? "ranking-positive" : "ranking-negative"
  }`}
>

            <span>{i + 1}</span>
            <span className="ranking-name">{r.setor || r.servico}</span>
            <span>★ {fmt.format(r.media)} ({r.total_votes})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
