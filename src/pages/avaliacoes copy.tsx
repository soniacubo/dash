// src/pages/avaliacoes.tsx
import React, { useEffect, useRef, useState } from "react";
import Header from "../components/Header";
import TitleWithTooltip from "../components/TitleWithTooltip";
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";

/* ============================================================
   TIPOS
============================================================ */

type SetorOption = {
  id: number;
  title: string;
};

type ServicoOption = {
  id: number;
  title: string;
};

type Resumo = {
  total_avaliacoes: number;
  media_geral: number;
};

type MelhorPiorItem = {
  setor?: string;
  servico?: string;
  total_votes: number;
  media: number;
};

type MelhorPior = {
  best: MelhorPiorItem | null;
  worst: MelhorPiorItem | null;
};

type DistribuicaoNotas = {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
};

type Comentario = {
  comment: string;
  score: number;
  created_at: string;
  protocolo: string;
  servico: string;
  setores: string;
  cidadao: string | null;
};

/* ============================================================
   COMPONENTE
============================================================ */

export default function Avaliacoes() {
  const hoje = new Date();
  const inicio30 = new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000);

  const [inicio, setInicio] = useState(inicio30.toISOString().slice(0, 10));
  const [fim, setFim] = useState(hoje.toISOString().slice(0, 10));

  const [setores, setSetores] = useState<SetorOption[]>([]);
  const [servicos, setServicos] = useState<ServicoOption[]>([]);

  const [setorSel, setSetorSel] = useState<string>("");
  const [servicoSel, setServicoSel] = useState<string>("");

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [melhorPiorSetor, setMelhorPiorSetor] = useState<MelhorPior>({
    best: null,
    worst: null,
  });
  const [melhorPiorServico, setMelhorPiorServico] = useState<MelhorPior>({
    best: null,
    worst: null,
  });
  const [distNotas, setDistNotas] = useState<DistribuicaoNotas | null>(null);
  const [rankingSetores, setRankingSetores] = useState<MelhorPiorItem[]>([]);
  const [rankingServicos, setRankingServicos] = useState<MelhorPiorItem[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  /* ============================================================
     REFS PARA GRÁFICOS
  ============================================================= */

  const distCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const setoresCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const servicosCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const distChartRef = useRef<any>(null);
  const setoresChartRef = useRef<any>(null);
  const servicosChartRef = useRef<any>(null);

  /* ============================================================
     LOAD OPÇÕES
  ============================================================= */

  async function loadOpcoes() {
    try {
      const [resSet, resServ] = await Promise.all([
        fetch(`${API_BASE_URL}/setores/setores`),
        fetch(`${API_BASE_URL}/servicos/opcoes`),
      ]);

      const setoresJson = await resSet.json();
      const servicosJson = await resServ.json();

      setSetores(Array.isArray(setoresJson) ? setoresJson : []);
      setServicos(Array.isArray(servicosJson) ? servicosJson : []);
    } catch (err) {
      console.error("Erro ao carregar opções:", err);
      setSetores([]);
      setServicos([]);
    }
  }

  /* ============================================================
     LOAD AVALIAÇÕES
  ============================================================= */

  async function loadAvaliacoes() {
    setLoading(true);

    const params = new URLSearchParams();
    params.set("inicio", inicio);
    params.set("fim", fim);

    if (setorSel) params.set("setor", setorSel);
    if (servicoSel) params.set("servico", servicoSel);

    try {
      const [
        rResumo,
        rMelhorSetor,
        rMelhorServico,
        rDist,
        rRankSetor,
        rRankServico,
        rComentarios,
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/avaliacoes/resumo?` + params),
        fetch(`${API_BASE_URL}/avaliacoes/setores/melhor-pior?` + params),
        fetch(`${API_BASE_URL}/avaliacoes/servicos/melhor-pior?` + params),
        fetch(`${API_BASE_URL}/avaliacoes/distribuicao?` + params),
        fetch(`${API_BASE_URL}/avaliacoes/ranking-setores?` + params),
        fetch(`${API_BASE_URL}/avaliacoes/ranking-servicos?` + params),
        fetch(`${API_BASE_URL}/avaliacoes/comentarios?` + params),
      ]);

      setResumo(await rResumo.json());
      setMelhorPiorSetor(await rMelhorSetor.json());
      setMelhorPiorServico(await rMelhorServico.json());
      setDistNotas(await rDist.json());
      setRankingSetores(await rRankSetor.json());
      setRankingServicos(await rRankServico.json());
      setComentarios(await rComentarios.json());
    } catch (err) {
      console.error("Erro ao carregar avaliações:", err);
    }

    setLoading(false);
  }

  /* ============================================================
     CHART: DISTRIBUIÇÃO DE NOTAS
  ============================================================= */

  useEffect(() => {
    if (!distNotas) return;
    const canvas = distCanvasRef.current;
    if (!canvas) return;

    if (distChartRef.current) {
      distChartRef.current.destroy();
    }

    distChartRef.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["1 ★", "2 ★", "3 ★", "4 ★", "5 ★"],
        datasets: [
          {
            label: "Quantidade de avaliações",
            data: [
              distNotas.c1,
              distNotas.c2,
              distNotas.c3,
              distNotas.c4,
              distNotas.c5,
            ],
            backgroundColor: [
              "#ef4444",
              "#f97316",
              "#eab308",
              "#16a34a",
              "#0ea5e9",
            ],
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const valor = ctx.raw as number;
                return `${valor} avaliação${valor === 1 ? "" : "es"}`;
              },
            },
          },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }, [distNotas]);

  /* ============================================================
     CHART: TOP 6 SETORES
  ============================================================= */

  useEffect(() => {
    const data = rankingSetores.slice(0, 6);
    const canvas = setoresCanvasRef.current;
    if (!canvas || data.length === 0) return;

    if (setoresChartRef.current) {
      setoresChartRef.current.destroy();
    }

    const labels = data.map((item) => item.setor ?? "");
    const medias = data.map((item) => item.media);
    const votos = data.map((item) => item.total_votes);

    setoresChartRef.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Média das notas",
            data: medias,
            backgroundColor: "#2563eb",
            borderRadius: 8,
          } as any,
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const idx = ctx.dataIndex;
                const media = medias[idx] ?? 0;
                const total = votos[idx] ?? 0;
                return `Média ${media.toFixed(
                  2
                )} • ${total} avaliação${total === 1 ? "" : "es"}`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 5,
          },
        },
      },
    });
  }, [rankingSetores]);

  /* ============================================================
     CHART: TOP 6 SERVIÇOS
  ============================================================= */

  useEffect(() => {
    const data = rankingServicos.slice(0, 6);
    const canvas = servicosCanvasRef.current;
    if (!canvas || data.length === 0) return;

    if (servicosChartRef.current) {
      servicosChartRef.current.destroy();
    }

    const labels = data.map((item) => item.servico ?? "");
    const medias = data.map((item) => item.media);
    const votos = data.map((item) => item.total_votes);

    servicosChartRef.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Média das notas",
            data: medias,
            backgroundColor: "#22c55e",
            borderRadius: 8,
          } as any,
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const idx = ctx.dataIndex;
                const media = medias[idx] ?? 0;
                const total = votos[idx] ?? 0;
                return `Média ${media.toFixed(
                  2
                )} • ${total} avaliação${total === 1 ? "" : "es"}`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 5,
          },
        },
      },
    });
  }, [rankingServicos]);

  /* ============================================================
     EFFECTS GERAIS
  ============================================================= */

  useEffect(() => {
    loadOpcoes();
  }, []);

  useEffect(() => {
    loadAvaliacoes();
  }, [inicio, fim, setorSel, servicoSel]);

  /* ============================================================
     HELPERS
  ============================================================= */

  const fmt = (n: any) => Number(n ?? 0).toFixed(2);

  /* ============================================================
     RENDER
  ============================================================= */

  return (
    <>
      <Header />

      <main className="painel-container">
        <h1 className="page-title">Avaliações</h1>

        {/* ====================== FILTROS ====================== */}
        <section className="dash-section filtros-wrapper">
          <div className="filtros-section">
            <div>
              <label>Início</label>
              <input
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>

            <div>
              <label>Fim</label>
              <input
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
              />
            </div>

            <div>
              <label>Setor</label>
              <select
                value={setorSel}
                onChange={(e) => setSetorSel(e.target.value)}
              >
                <option value="">Todos</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Serviço</label>
              <select
                value={servicoSel}
                onChange={(e) => setServicoSel(e.target.value)}
              >
                <option value="">Todos</option>
                {servicos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ====================== KPIS ====================== */}
        <section className="dash-section">
          <div className="kpi-grid kpi-6cols">
            {/* TOTAL DE AVALIAÇÕES */}
            <div className="kpi-card kpi-blue">
              <span className="kpi-label">Total de Avaliações</span>
              <strong className="kpi-value">
                {resumo?.total_avaliacoes ?? 0}
              </strong>
              <div className="kpi-icon">📝</div>
            </div>

            {/* MÉDIA GERAL */}
            <div className="kpi-card kpi-green">
              <span className="kpi-label">Média Geral</span>
              <strong className="kpi-value">
                {fmt(resumo?.media_geral ?? 0)}
              </strong>
              <div className="kpi-icon">⭐</div>
            </div>

            {/* MELHOR SETOR */}
            <div className="kpi-card kpi-purple">
              <span className="kpi-label">Melhor Setor</span>
              <strong className="kpi-value">
                {melhorPiorSetor.best?.setor ?? "-"}
              </strong>
              <div className="kpi-sub">
                ⭐ {fmt(melhorPiorSetor.best?.media ?? 0)} •{" "}
                {melhorPiorSetor.best?.total_votes ?? 0} avaliações
              </div>
            </div>

            {/* PIOR SETOR */}
            <div className="kpi-card kpi-red">
              <span className="kpi-label">Pior Setor</span>
              <strong className="kpi-value">
                {melhorPiorSetor.worst?.setor ?? "-"}
              </strong>
              <div className="kpi-sub">
                ⭐ {fmt(melhorPiorSetor.worst?.media ?? 0)} •{" "}
                {melhorPiorSetor.worst?.total_votes ?? 0} avaliações
              </div>
            </div>

            {/* MELHOR SERVIÇO */}
            <div className="kpi-card kpi-orange">
              <span className="kpi-label">Melhor Serviço</span>
              <strong className="kpi-value">
                {melhorPiorServico.best?.servico ?? "-"}
              </strong>
              <div className="kpi-sub">
                ⭐ {fmt(melhorPiorServico.best?.media ?? 0)} •{" "}
                {melhorPiorServico.best?.total_votes ?? 0} avaliações
              </div>
            </div>

            {/* PIOR SERVIÇO */}
            <div className="kpi-card kpi-gray">
              <span className="kpi-label">Pior Serviço</span>
              <strong className="kpi-value">
                {melhorPiorServico.worst?.servico ?? "-"}
              </strong>
              <div className="kpi-sub">
                ⭐ {fmt(melhorPiorServico.worst?.media ?? 0)} •{" "}
                {melhorPiorServico.worst?.total_votes ?? 0} avaliações
              </div>
            </div>
          </div>
        </section>

        {/* ====================== DISTRIBUIÇÃO DE NOTAS ====================== */}
        <section className="dash-section">
          <TitleWithTooltip
            title="Distribuição de notas"
            tooltip="Quantidade de avaliações recebidas em cada nota, dentro do período e filtros selecionados."
          />

          <div className="chart-wrapper">
            <canvas ref={distCanvasRef} />
          </div>
        </section>

        {/* ====================== RANKINGS (GRÁFICOS) ====================== */}
        <section className="dash-section">
          <div className="section-title-wrapper">
            <h2 className="section-title-main">Ranking de notas</h2>
            <p className="section-title-sub">
              Top 6 setores e serviços com melhores médias no período filtrado.
            </p>
          </div>

          <div className="ranking-charts-section">
            {/* TOP SETORES */}
            <div className="ranking-chart-wrapper">
              <div className="chart-container">
                <h3 className="chart-title">Setores — média das notas</h3>
                <p className="chart-subtitle">
                  Top 6 setores por média ponderada (mínimo 1 avaliação).
                </p>
                <canvas ref={setoresCanvasRef} />
              </div>
            </div>

            {/* TOP SERVIÇOS */}
            <div className="ranking-chart-wrapper">
              <div className="chart-container">
                <h3 className="chart-title">Serviços — média das notas</h3>
                <p className="chart-subtitle">
                  Top 6 serviços por média ponderada (mínimo 1 avaliação).
                </p>
                <canvas ref={servicosCanvasRef} />
              </div>
            </div>
          </div>
        </section>

        {/* ====================== COMENTÁRIOS ====================== */}
        <section className="dash-section">
          <TitleWithTooltip
            title="Últimos comentários"
            tooltip="Comentários deixados pelos cidadãos nas avaliações."
          />

          {comentarios.length === 0 && (
            <p>Nenhum comentário encontrado neste período.</p>
          )}

          <div className="comentarios-grid">
            {comentarios.map((c, idx) => (
              <div key={idx} className="comentario-card">
                <div className="comentario-texto">
                  <span className="aspas">“</span>
                  <p>{c.comment}</p>
                </div>

                <div className="comentario-footer">
                  <div className="cidadao-area">
                    <strong>{c.cidadao ?? "Anônimo"}</strong>
                    <span className="estrelas">
                      {"★".repeat(c.score)}
                      {"☆".repeat(5 - c.score)}
                    </span>
                  </div>

                  <div className="comentario-meta">
                    <span>
                      <strong>Serviço:</strong> {c.servico}
                    </span>
                    <span>
                      <strong>Setores:</strong> {c.setores}
                    </span>
                    <span>
                      <strong>Protocolo:</strong> {c.protocolo}
                    </span>
                    <span>
                      <strong>Data:</strong>{" "}
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {loading && <p>Carregando dados...</p>}
      </main>
    </>
  );
}
