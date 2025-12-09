import React, { useEffect, useState, useRef } from "react";
import Header from "../components/Header";
import TitleWithTooltip from "../components/TitleWithTooltip";
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";

/* ============================================
   TIPOS
============================================ */

type SetorOption = {
  id: number;
  title: string;
};

type ServicoOption = {
  id: number;
  title: string;
};

type Resumo = {
  total: number;
  media_geral: number;
};

type RankingItem = {
  id: number;
  title: string;
  media: number;
  total_votes: number;
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
  servico: string;
  setor: string;
  protocolo: string;
  cidadao: string | null;
};

type SetorDetalhes = {
  setor: string;
  media: number;
  total_votes: number;
  melhor_servico: RankingItem | null;
  pior_servico: RankingItem | null;
  ranking_servicos: RankingItem[];
  distribuicao: DistribuicaoNotas;
  comentarios: Comentario[];
};

type ServicoDetalhes = {
  servico: string;
  media: number;
  total_votes: number;
  media_geral: number;
  media_setor: number;
  distribuicao: DistribuicaoNotas;
  comentarios: Comentario[];
};

/* ============================================
   COMPONENTE
============================================ */

export default function Avaliacoes() {
  /* =======================
     Estados
  ======================= */

  const hoje = new Date();
  const inicio30 = new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000);

  const [inicio, setInicio] = useState(inicio30.toISOString().slice(0, 10));
  const [fim, setFim] = useState(hoje.toISOString().slice(0, 10));

  const [setores, setSetores] = useState<SetorOption[]>([]);
  const [servicos, setServicos] = useState<ServicoOption[]>([]);

  const [setorSel, setSetorSel] = useState<string>("");
  const [servicoSel, setServicoSel] = useState<string>("");

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [distribuicao, setDistribuicao] = useState<DistribuicaoNotas | null>(null);
  const [rankingSetores, setRankingSetores] = useState<RankingItem[]>([]);
  const [rankingServicos, setRankingServicos] = useState<RankingItem[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);

  /* MODO DETALHADO */
  const [setorDetalhes, setSetorDetalhes] = useState<SetorDetalhes | null>(null);
  const [servicoDetalhes, setServicoDetalhes] = useState<ServicoDetalhes | null>(null);

  const distRef = useRef<Chart | null>(null);

  /* ============================================
     CARREGAR OPÇÕES
  ============================================= */

  async function loadOpcoes() {
    try {
      const [rSet, rServ] = await Promise.all([
        fetch(`${API_BASE_URL}/setores/setores`),
        fetch(`${API_BASE_URL}/servicos/opcoes`)
      ]);

      const jSet = await rSet.json();
      const jServ = await rServ.json();

      setSetores(jSet || []);
      setServicos(jServ || []);
    } catch (err) {
      console.error("Erro carregando opções:", err);
    }
  }

  /* ============================================
     CARREGAR DADOS GERAIS
  ============================================= */

  async function loadAvaliacoes() {
    const params = new URLSearchParams();
    params.set("inicio", inicio);
    params.set("fim", fim);
    if (setorSel) params.set("setor", setorSel);
    if (servicoSel) params.set("servico", servicoSel);

    /* CARREGAR MODO DETALHADO */
    if (setorSel && !servicoSel) {
      await loadSetorDetalhes(params);
      return;
    }
    if (servicoSel) {
      await loadServicoDetalhes(params);
      return;
    }

    /* MODO GERAL */
    try {
      const [
        rResumo,
        rDist,
        rRankSetores,
        rRankServicos,
        rComentarios
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/avaliacoes/resumo?` + params),
        fetch(`${API_BASE_URL}/avaliacoes/distribuicao?` + params),
        fetch(`${API_BASE_URL}/avaliacoes/ranking-setores?` + params),
        fetch(`${API_BASE_URL}/avaliacoes/ranking-servicos?` + params),
        fetch(`${API_BASE_URL}/avaliacoes/comentarios?` + params)
      ]);

      setResumo(await rResumo.json());
      setDistribuicao(await rDist.json());
      setRankingSetores(await rRankSetores.json());
      setRankingServicos(await rRankServicos.json());
      setComentarios(await rComentarios.json());

      setSetorDetalhes(null);
      setServicoDetalhes(null);

    } catch (err) {
      console.error("Erro:", err);
    }
  }

  /* ============================
     CARREGAR DETALHES DE SETOR
  ============================ */

  async function loadSetorDetalhes(params: URLSearchParams) {
    try {
      const res = await fetch(`${API_BASE_URL}/avaliacoes/setor-detalhes?` + params);
      const json = await res.json();
      setSetorDetalhes(json);

      /* limpar modo serviço */
      setServicoDetalhes(null);
    } catch (err) {
      console.error("Erro:", err);
    }
  }

  /* ============================
     CARREGAR DETALHES DE SERVIÇO
  ============================ */

  async function loadServicoDetalhes(params: URLSearchParams) {
    try {
      const res = await fetch(`${API_BASE_URL}/avaliacoes/servico-detalhes?` + params);
      const json = await res.json();
      setServicoDetalhes(json);

      /* limpar modo setor */
      setSetorDetalhes(null);
    } catch (err) {
      console.error("Erro:", err);
    }
  }

  /* ============================================
     GRÁFICO DE DISTRIBUIÇÃO
  ============================================= */

  useEffect(() => {
    if (!distribuicao || !document.getElementById("grafico-distribuicao")) return;

    if (distRef.current) distRef.current.destroy();

    const ctx = document.getElementById("grafico-distribuicao") as HTMLCanvasElement;

    distRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["1 ★", "2 ★", "3 ★", "4 ★", "5 ★"],
        datasets: [{
          data: [
            distribuicao.c1,
            distribuicao.c2,
            distribuicao.c3,
            distribuicao.c4,
            distribuicao.c5
          ],
          backgroundColor: ["#ef4444", "#f97316", "#eab308", "#16a34a", "#0ea5e9"],
          borderRadius: 6
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        responsive: true,
        scales: { y: { beginAtZero: true } }
      }
    });
  }, [distribuicao]);

  /* ============================================
     EFFECTS
  ============================================= */

  useEffect(() => { loadOpcoes(); }, []);
  useEffect(() => { loadAvaliacoes(); }, [inicio, fim, setorSel, servicoSel]);

  /* ============================================
     SAFE FORMAT
  ============================================= */
  const fmt = (n: any) => Number(n ?? 0).toFixed(2);

  /* ============================================
     RENDER
  ============================================= */

  return (
    <>
      <Header />

      <main className="main-container">

        {/* TÍTULO */}
        <h1 className="page-title">Avaliações</h1>

        {/* =================== FILTROS =================== */}
        <section className="dash-section">
          <div className="filtros-section">
            <div>
              <label>Início</label>
              <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
            </div>

            <div>
              <label>Fim</label>
              <input type="date" value={fim} onChange={e => setFim(e.target.value)} />
            </div>

            <div>
              <label>Setor</label>
              <select value={setorSel} onChange={e => setSetorSel(e.target.value)}>
                <option value="">Todos</option>
                {setores.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Serviço</label>
              <select value={servicoSel} onChange={e => setServicoSel(e.target.value)}>
                <option value="">Todos</option>
                {servicos.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
          </div>
        </section>


        {/* ============================================
             SE SERVIÇO SELECIONADO → MODO SERVIÇO
        ============================================= */}

        {servicoDetalhes && (
          <>
            <section className="dash-section">

              <div className="section-title-wrapper">
                <h2>Desempenho do Serviço Selecionado</h2>
                <p className="section-subtitle">
                  Avaliações filtradas por período e setor correspondente.
                </p>
              </div>

              <div className="kpi-grid kpi-6cols">

                <div className="kpi-card kpi-blue">
                  <span className="kpi-label">
                    Média do serviço
                    <TitleWithTooltip tooltip="Média ponderada bayesiana considerando mínimo de 5 avaliações. R = média do serviço, v = nº de avaliações, C = média geral, m = 5." />
                  </span>
                  <strong className="kpi-value">{fmt(servicoDetalhes.media)}</strong>
                </div>

                <div className="kpi-card kpi-green">
                  <span className="kpi-label">Total de Avaliações</span>
                  <strong className="kpi-value">{servicoDetalhes.total_votes}</strong>
                </div>

                <div className="kpi-card kpi-purple">
                  <span className="kpi-label">Comparação Geral</span>
                  <strong className="kpi-value">{fmt(servicoDetalhes.media_geral)}</strong>
                  <div className="kpi-sub">Média municipal</div>
                </div>

                <div className="kpi-card kpi-orange">
                  <span className="kpi-label">Comparação dentro do setor</span>
                  <strong className="kpi-value">{fmt(servicoDetalhes.media_setor)}</strong>
                </div>

              </div>
            </section>

            {/* Distribuição */}
            <section className="dash-section">
              <TitleWithTooltip
                title="Distribuição das notas do serviço"
                tooltip="Quantidade de notas 1 a 5 atribuídas ao serviço no período filtrado."
              />
              <div className="chart-wrapper">
                <canvas id="grafico-distribuicao"></canvas>
              </div>
            </section>

            {/* Comentários */}
            <section className="dash-section">
              <TitleWithTooltip
                title="Comentários deste serviço"
                tooltip="Últimos comentários registrados para este serviço no período."
              />
              <div className="comentarios-grid">
                {servicoDetalhes.comentarios.map((c, i) => (
                  <div key={i} className="comentario-card">
                    <div className="comentario-texto">
                      <span className="aspas">“</span>
                      <p>{c.comment}</p>
                    </div>
                    <div className="comentario-footer">
                      <strong>{c.cidadao ?? "Anônimo"}</strong>
                      <span className="estrelas">
                        {"★".repeat(c.score)}{"☆".repeat(5 - c.score)}
                      </span>
                      <span><strong>Data:</strong> {new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </>
        )}

        {/* ============================================
             SE SETOR SELECIONADO → MODO SETOR
        ============================================= */}

        {setorDetalhes && (
          <>
            <section className="dash-section">

              <div className="section-title-wrapper">
                <h2>Análise do Setor Selecionado</h2>
                <p className="section-subtitle">
                  Avaliações filtradas dentro do setor e período informado.
                </p>
              </div>

              <div className="kpi-grid kpi-6cols">

                <div className="kpi-card kpi-green">
                  <span className="kpi-label">
                    Média do setor
                    <TitleWithTooltip tooltip="Média ponderada bayesiana do setor considerando mínimo de 5 avaliações. Fórmula: ((v/(v+5))·R) + ((5/(v+5))·C)" />
                  </span>
                  <strong className="kpi-value">{fmt(setorDetalhes.media)}</strong>
                </div>

                <div className="kpi-card kpi-blue">
                  <span className="kpi-label">Total de Avaliações</span>
                  <strong className="kpi-value">{setorDetalhes.total_votes}</strong>
                </div>

                {setorDetalhes.melhor_servico && (
                  <div className="kpi-card kpi-purple">
                    <span className="kpi-label">Melhor Serviço</span>
                    <strong className="kpi-value">{setorDetalhes.melhor_servico.title}</strong>
                    <div className="kpi-sub">⭐ {fmt(setorDetalhes.melhor_servico.media)}</div>
                  </div>
                )}

                {setorDetalhes.pior_servico && (
                  <div className="kpi-card kpi-red">
                    <span className="kpi-label">Pior Serviço</span>
                    <strong className="kpi-value">{setorDetalhes.pior_servico.title}</strong>
                    <div className="kpi-sub">⭐ {fmt(setorDetalhes.pior_servico.media)}</div>
                  </div>
                )}

              </div>
            </section>

            {/* Ranking dentro do setor */}
            <section className="dash-section">
              <TitleWithTooltip
                title="Ranking de serviços do setor"
                tooltip="Serviços ordenados pela média ponderada dentro do setor e período selecionado."
              />

              <div className="ranking-charts-section">
                <div className="ranking-chart-wrapper">
                  <TitleWithTooltip
                    title="Serviços — média ponderada"
                    tooltip="Somente serviços com 5+ notas no período. Fórmula bayesiana aplicada."
                  />
                  <ul className="vg-chart-list">
                    {setorDetalhes.ranking_servicos.map((r, i) => (
                      <li key={i} className="vg-chart-item">
                        <span className={`vg-rank-badge rank-${i + 1}`}>{i + 1}</span>
                        <div className="vg-bar">
                          <div className="vg-bar-fill" style={{ width: `${r.media * 20}%` }}>
                            {fmt(r.media)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* Distribuição */}
            <section className="dash-section">
              <TitleWithTooltip
                title="Distribuição das notas do setor"
                tooltip="Quantidade de notas 1 a 5 dentro deste setor no período filtrado."
              />
              <div className="chart-wrapper">
                <canvas id="grafico-distribuicao"></canvas>
              </div>
            </section>

            {/* Comentários */}
            <section className="dash-section">
              <TitleWithTooltip
                title="Comentários do setor"
                tooltip="Últimos comentários registrados para serviços pertencentes a este setor."
              />
              <div className="comentarios-grid">
                {setorDetalhes.comentarios.map((c, i) => (
                  <div key={i} className="comentario-card">
                    <div className="comentario-texto">
                      <span className="aspas">“</span>
                      <p>{c.comment}</p>
                    </div>

                    <div className="comentario-footer">
                      <strong>{c.cidadao ?? "Anônimo"}</strong>
                      <span className="estrelas">
                        {"★".repeat(c.score)}{"☆".repeat(5 - c.score)}
                      </span>
                      <span><strong>Serviço:</strong> {c.servico}</span>
                      <span><strong>Data:</strong> {new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </>
        )}

        {/* ============================================
             MODO GERAL (SEM SETOR E SEM SERVIÇO)
        ============================================= */}

        {!setorSel && !servicoSel && resumo && (
          <>
            {/* KPIs gerais */}
            <section className="dash-section">
              <div className="kpi-grid kpi-6cols">
                
                <div className="kpi-card kpi-blue">
                  <span className="kpi-label">Total de Avaliações</span>
                  <strong className="kpi-value">{resumo.total}</strong>
                </div>

                <div className="kpi-card kpi-green">
                  <span className="kpi-label">
                    Média Geral
                    <TitleWithTooltip tooltip="Média ponderada bayesiana do município no período selecionado." />
                  </span>
                  <strong className="kpi-value">{fmt(resumo.media_geral)}</strong>
                </div>

              </div>
            </section>

            {/* Distribuição geral */}
            <section className="dash-section">
              <TitleWithTooltip
                title="Distribuição Geral das Notas"
                tooltip="Quantidade total de avaliações com notas 1 a 5 dentro do período."
              />
              <div className="chart-wrapper">
                <canvas id="grafico-distribuicao"></canvas>
              </div>
            </section>

            {/* Ranking geral */}
            <section className="dash-section">
              <div className="section-title-wrapper">
                <h2>Ranking de notas</h2>
                <p className="section-subtitle">Setores e serviços com melhores médias ponderadas no período filtrado.</p>
              </div>

              <div className="ranking-charts-section">

                {/* Setores */}
                <div className="ranking-chart-wrapper">
                  <TitleWithTooltip
                    title="Setores — média ponderada"
                    tooltip="Só aparecem setores com pelo menos 5 avaliações no período. Fórmula bayesiana aplicada."
                  />

                  <ul className="vg-chart-list">
                    {rankingSetores.map((r, i) => (
                      <li key={i} className="vg-chart-item">
                        <span className={`vg-rank-badge rank-${i + 1}`}>{i + 1}</span>
                        <div className="vg-bar">
                          <div className="vg-bar-fill" style={{ width: `${r.media * 20}%` }}>
                            {fmt(r.media)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Serviços */}
                <div className="ranking-chart-wrapper">
                  <TitleWithTooltip
                    title="Serviços — média ponderada"
                    tooltip="Serviços com mínimo de 5 avaliações no período filtrado. Ordenados pela média ponderada bayesiana."
                  />

                  <ul className="vg-chart-list">
                    {rankingServicos.map((r, i) => (
                      <li key={i} className="vg-chart-item">
                        <span className={`vg-rank-badge rank-${i + 1}`}>{i + 1}</span>
                        <div className="vg-bar">
                          <div className="vg-bar-fill" style={{ width: `${r.media * 20}%` }}>
                            {fmt(r.media)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>
            </section>

            {/* Comentários gerais */}
            <section className="dash-section">
              <TitleWithTooltip
                title="Comentários Recentes"
                tooltip="Últimos comentários registrados dentro do período filtrado."
              />

              <div className="comentarios-grid">
                {comentarios.map((c, i) => (
                  <div key={i} className="comentario-card">
                    <div className="comentario-texto">
                      <span className="aspas">“</span>
                      <p>{c.comment}</p>
                    </div>

                    <div className="comentario-footer">
                      <strong>{c.cidadao ?? "Anônimo"}</strong>
                      <span className="estrelas">
                        {"★".repeat(c.score)}{"☆".repeat(5 - c.score)}
                      </span>
                      <span><strong>Serviço:</strong> {c.servico}</span>
                      <span><strong>Setor:</strong> {c.setor}</span>
                      <span><strong>Data:</strong> {new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                ))}
              </div>

            </section>
          </>
        )}

      </main>
    </>
  );
}
