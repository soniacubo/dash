import { useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
import TitleWithTooltip from "../components/TitleWithTooltip";
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
          labels: ["1★", "2★", "3★", "4★", "5★"],
          datasets: [
            {
              data: [
                distribuicao.c1,
                distribuicao.c2,
                distribuicao.c3,
                distribuicao.c4,
                distribuicao.c5,
              ],
              backgroundColor: [
                "#dc2626",
                "#f97316",
                "#eab308",
                "#3b82f6",
                "#16a34a",
              ],
              borderRadius: 6,
            },
          ],
        },
        options: {
          plugins: { legend: { display: false } },
        },
      }
    );
  }, [distribuicao]);

  useEffect(() => {
    if (!evolucao.length) return;
    evoRef.current?.destroy();

    evoRef.current = new Chart(
      document.getElementById("evo") as HTMLCanvasElement,
      {
        type: "line",
        data: {
          labels: evolucao.map((e) => e.mes),
          datasets: [
            {
              data: evolucao.map((e) => Number(e.media)),
              borderColor: "#2563eb",
              backgroundColor: "rgba(37,99,235,.15)",
              fill: true,
              tension: 0.3,
            },
          ],
        },
        options: {
          plugins: { legend: { display: false } },
          scales: { y: { min: 0, max: 5 } },
        },
      }
    );
  }, [evolucao]);

  /* =========================================================
     DERIVADOS
  ========================================================= */

  const total = resumo?.total_avaliacoes || 0;
  const positivas =
    (distribuicao?.c4 || 0) + (distribuicao?.c5 || 0);
  const negativas =
    (distribuicao?.c1 || 0) + (distribuicao?.c2 || 0);

  const pct = (v: number) =>
    total ? `${((v / total) * 100).toFixed(1)}%` : "0%";

  const topSetores = rankingSetores.slice(0, 5);
  const worstSetores = [...rankingSetores]
    .reverse()
    .slice(0, 5);

  const topServicos = rankingServicos.slice(0, 5);
  const worstServicos = [...rankingServicos]
    .reverse()
    .slice(0, 5);

  const comentariosPos = comentarios.filter((c) => c.score >= 4).slice(0, 2);
  const comentariosNeg = comentarios.filter((c) => c.score <= 2).slice(0, 2);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <>
      <Header />

      <main className="main-container">
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
            <div className="kpi-card"><span>Total avaliações</span><strong>{fmt.format(total)}</strong></div>
            <div className="kpi-card"><span>Média geral</span><strong>{fmt.format(resumo?.media_geral || 0)}</strong></div>
            <div className="kpi-card"><span>% negativas</span><strong>{pct(negativas)}</strong></div>
            <div className="kpi-card"><span>% positivas</span><strong>{pct(positivas)}</strong></div>
          </div>
        </section>

        {/* GRÁFICOS */}
        <section className="dash-section section-content-flex">
          <div className="ranking-box"><h3>Distribuição das notas</h3><canvas id="dist" /></div>
          <div className="ranking-box"><h3>Evolução da média</h3><canvas id="evo" /></div>
        </section>

        {/* RANKINGS */}
        <section className="dash-section section-content-flex">
          <Ranking title="Melhores setores" items={topSetores} />
          <Ranking title="Piores setores" items={worstSetores} />
        </section>

        <section className="dash-section section-content-flex">
          <Ranking title="Melhores serviços" items={topServicos} />
          <Ranking title="Piores serviços" items={worstServicos} />
        </section>

        {/* COMENTÁRIOS */}
        <section className="dash-section">
          <h2 className="section-title">Comentários recentes</h2>
          <div className="comentarios-grid">
            {[...comentariosPos, ...comentariosNeg].map((c, i) => (
              <div key={i} className="comentario-card">
                <p>{c.comment}</p>
                <small>
                  {c.cidadao || "Anônimo"} • {c.servico} • {c.setores}
                </small>
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
          <li key={i} className="ranking-row">
            <span>{i + 1}</span>
            <span className="ranking-name">{r.setor || r.servico}</span>
            <span>★ {fmt.format(r.media)} ({r.total_votes})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
