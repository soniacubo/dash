import React, { useEffect, useMemo, useState } from "react";
import Header from "../components/Header";
import { API_BASE_URL } from "../app";

/* ============================================================
   SAFE HELPERS
============================================================ */
function safeNumber(value: any, decimals = 2) {
  const num = Number(value);
  if (isNaN(num)) return "—";
  return num.toFixed(decimals);
}

function safePercent(numerator: any, denominator: any) {
  const a = Number(numerator);
  const b = Number(denominator);
  if (isNaN(a) || isNaN(b) || b === 0) return "—";
  return ((a / b) * 100).toFixed(1) + "%";
}

/* ============================================================
   TYPES
============================================================ */
type SetorRow = {
  sector_id: number;
  setor: string;
  usuarios_total: number;
  eficiencia_percentual: number;
  qualidade_media: number;
  parent_id?: number | null;
  nivel?: number;
  hierarquia?: string;
  servicos_principal_individual?: number;
  servicos_participante_individual?: number;
  servicos_principal_consolidado?: number;
  servicos_participante_consolidado?: number;
  path?: string;
  solicitacoes_total?: number;
  solicitacoes_concluidas?: number;
  solicitacoes_respondidas?: number;
  qualidade_total_avaliacoes?: number;
};

/* ============================================================
   COMPONENTE PRINCIPAL
============================================================ */
export default function Setores() {
  const [treeRows, setTreeRows] = useState<SetorRow[]>([]);

  const [rankUsuarios, setRankUsuarios] = useState<any[]>([]);
  const [rankEficiencia, setRankEficiencia] = useState<any[]>([]);
  const [rankQualidade, setRankQualidade] = useState<any[]>([]);
  const [rankServicos, setRankServicos] = useState<any[]>([]);

  const fmt = useMemo(() => new Intl.NumberFormat("pt-BR"), []);

  const [expandedRoot, setExpandedRoot] = useState<Record<number, boolean>>({});
  const [openUsersSectorId, setOpenUsersSectorId] = useState<number | null>(null);
  const [usersLoading, setUsersLoading] = useState<boolean>(false);
  const [usersBySector, setUsersBySector] = useState<Record<number, any[]>>({});

  const cacheRef = useMemo(() => new Map<number, { data: any[]; ts: number }>(), []);
  const debounceRef = useMemo(() => ({ t: 0 as any }), []);
  const [hoveredRootId, setHoveredRootId] = useState<number | null>(null);

  /* ============================================================
     CARREGAMENTO
  ============================================================ */
  useEffect(() => {
    async function loadTree() {
      const r = await fetch(`${API_BASE_URL}/setores`);
      const data = await r.json();
      setTreeRows(data || []);

      const exp: Record<number, boolean> = {};
      (data || []).forEach((row: any) => {
        const root = Number(String(row.path || "").split(",")[0] || "0");
        if (!(root in exp)) exp[root] = true;
      });
      setExpandedRoot(exp);
    }

    async function loadUsuarios() {
      const r = await fetch(`${API_BASE_URL}/setores-usuarios-resumo`);
      const data = await r.json();
      const top = [...data]
        .sort(
          (a, b) =>
            Number(b.total_geral_root || b.usuarios_total || 0) -
            Number(a.total_geral_root || a.usuarios_total || 0)
        )
        .slice(0, 5);
      setRankUsuarios(top);
    }

    async function loadEficiencia() {
      const r = await fetch(`${API_BASE_URL}/setores-eficiencia`);
      const data = await r.json();
      const top = [...data]
        .sort(
          (a, b) =>
            Number(b.eficiencia_percentual || 0) -
            Number(a.eficiencia_percentual || 0)
        )
        .slice(0, 5);
      setRankEficiencia(top);
    }

    async function loadQualidade() {
      const r = await fetch(`${API_BASE_URL}/setores-qualidade`);
      const data = await r.json();
      const top = [...data]
        .sort((a, b) => Number(b.nota_media || 0) - Number(a.nota_media || 0))
        .slice(0, 5);
      setRankQualidade(top);
    }

    loadTree();
    loadUsuarios();
    loadEficiencia();
    loadQualidade();
  }, [API_BASE_URL]);

  /* ============================================================
     RANKING SERVIÇOS
  ============================================================ */
  useEffect(() => {
    const roots = treeRows.filter((r) => (r.nivel ?? 0) === 0);
    const agreg = roots.map((r) => ({
      sector_id: r.sector_id,
      setor: r.setor,
      total_servicos:
        Number(r.servicos_principal_consolidado || 0) +
        Number(r.servicos_participante_consolidado || 0),
    }));

    const top = agreg.sort((a, b) => b.total_servicos - a.total_servicos).slice(0, 5);
    setRankServicos(top);
  }, [treeRows]);

  /* ============================================================
     FUNÇÕES
  ============================================================ */
  function toggleRoot(rootId: number) {
    setExpandedRoot((prev) => ({ ...prev, [rootId]: !prev[rootId] }));
  }

  const allRootsExpanded = useMemo(() => {
    const roots = treeRows.filter((r) => (r.nivel ?? 0) === 0);
    if (!roots.length) return true;
    return roots.every((r) => {
      const root = Number(String(r.path || "").split(",")[0] || r.sector_id);
      return expandedRoot[root] !== false;
    });
  }, [expandedRoot, treeRows]);

  function toggleAllRoots() {
    const newState: Record<number, boolean> = {};
    const roots = treeRows.filter((r) => (r.nivel ?? 0) === 0);
    const expand = !allRootsExpanded;

    roots.forEach((r) => {
      const root = Number(String(r.path || "").split(",")[0] || r.sector_id);
      newState[root] = expand;
    });

    setExpandedRoot(newState);
  }

  function showSectorUsers(id: number) {
    if (debounceRef.t) clearTimeout(debounceRef.t);

    debounceRef.t = setTimeout(async () => {
      setOpenUsersSectorId(id);

      const cached = cacheRef.get(id);
      const fresh = cached && Date.now() - cached.ts < 5 * 60 * 1000;
      if (fresh) {
        setUsersBySector((prev) => ({ ...prev, [id]: cached!.data }));
        setUsersLoading(false);
        return;
      }

      try {
        setUsersLoading(true);
        const r = await fetch(`${API_BASE_URL}/setores/${id}/usuarios`);
        const data = await r.json();
        cacheRef.set(id, { data, ts: Date.now() });
        setUsersBySector((prev) => ({ ...prev, [id]: data }));
      } finally {
        setUsersLoading(false);
      }
    }, 220);
  }

  function hideSectorUsers(id: number) {
    if (debounceRef.t) clearTimeout(debounceRef.t);
    setOpenUsersSectorId((prev) => (prev === id ? null : prev));
  }

  /* ============================================================
     RENDER
  ============================================================ */
  const bestEficiencia = rankEficiencia[0];
  const bestQualidade = rankQualidade[0];
  const bestUsuarios = rankUsuarios[0];
  const bestServicos = rankServicos[0];

  const nomeSetorEfic = bestEficiencia?.setor || "—";
  const valorEfic = safePercent(
    bestEficiencia?.solicitacoes_concluidas,
    bestEficiencia?.solicitacoes_total
  );

  const nomeSetorQual = bestQualidade?.setor || "—";
  const valorQual = safeNumber(bestQualidade?.nota_media, 2);

  const nomeSetorUsuarios =
    bestUsuarios?.setor || bestUsuarios?.sector_title || "—";
  const valorUsuarios = fmt.format(
    Number(bestUsuarios?.total_geral_root || bestUsuarios?.usuarios_total || 0)
  );

  const nomeSetorServicos = bestServicos?.setor || "—";
  const valorServicos = fmt.format(Number(bestServicos?.total_servicos || 0));

  return (
    <main className="main-container">
      <Header />

      {/* ================================================================
          1) INDICADORES + GRÁFICOS TOP 5 (NOVO)
      ================================================================ */}
      <section className="dash-section">
        <div className="section-title-wrapper">
          <h2 className="section-title-main">Indicadores por setor</h2>
          <p className="section-title-sub">
            Resumo consolidado de desempenho, serviços e usuários dos setores.
          </p>
        </div>

        {/* CARDS PRINCIPAIS */}
        <div className="setores-kpi-grid">
          <div className="setor-kpi-card">
            <div className="setor-kpi-icon lightning">⚡</div>
            <div className="setor-kpi-label">Setor mais eficiente</div>
            <div className="setor-kpi-value">{valorEfic}</div>
            <div className="setor-kpi-sector">{nomeSetorEfic}</div>
          </div>

          <div className="setor-kpi-card">
            <div className="setor-kpi-icon star">⭐</div>
            <div className="setor-kpi-label">Melhor qualidade</div>
            <div className="setor-kpi-value">{valorQual}</div>
            <div className="setor-kpi-sector">{nomeSetorQual}</div>
          </div>

          <div className="setor-kpi-card">
            <div className="setor-kpi-icon users">👥</div>
            <div className="setor-kpi-label">Setor com mais usuários</div>
            <div className="setor-kpi-value">{valorUsuarios}</div>
            <div className="setor-kpi-sector">{nomeSetorUsuarios}</div>
          </div>

          <div className="setor-kpi-card">
            <div className="setor-kpi-icon trophy">🏆</div>
            <div className="setor-kpi-label">Setor com mais serviços</div>
            <div className="setor-kpi-value">{valorServicos}</div>
            <div className="setor-kpi-sector">{nomeSetorServicos}</div>
          </div>
        </div>

        {/* =====================================================================
            NOVO BLOCO — GRÁFICOS TOP 5 EM ESTILO VISÃO GERAL
        ===================================================================== */}
        <div className="setores-duo-charts">

          {/* 🔵 GRÁFICO 1 — TOP SERVIÇOS */}
          <div className="vg-chart-card">
            <h3 className="vg-chart-title">Serviços mais cadastrados</h3>
            <p className="vg-chart-sub">Top 5 por volume</p>

            <ul className="vg-chart-list">
              {rankServicos.slice(0, 5).map((r, i) => {
                const pct =
                  (r.total_servicos /
                    (rankServicos[0]?.total_servicos || 1)) *
                  100;

                return (
                  <li key={r.sector_id} className="vg-chart-item">
                    <span className={`vg-rank-badge rank-${i + 1}`}>
                      {i + 1}
                    </span>

                    <span className="vg-label">{r.setor}</span>

                    <div className="vg-bar">
                      <div
                        className="vg-bar-fill"
                        style={{ width: `${pct}%` }}
                      >
                        <span className="vg-value">
                          {fmt.format(r.total_servicos)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 🟢 GRÁFICO 2 — TOP EFICIÊNCIA */}
          <div className="vg-chart-card">
            <h3 className="vg-chart-title">Setores mais eficientes</h3>
            <p className="vg-chart-sub">Top 5 por eficiência</p>

            <ul className="vg-chart-list">
              {rankEficiencia.slice(0, 5).map((r, i) => {
                const ef = Number(r.eficiencia_percentual || 0);
                const pct =
                  (ef /
                    (rankEficiencia[0]?.eficiencia_percentual || 1)) *
                  100;

                return (
                  <li key={r.sector_id} className="vg-chart-item">
                    <span className={`vg-rank-badge rank-${i + 1}`}>
                      {i + 1}
                    </span>

                    <span className="vg-label">{r.setor}</span>

                    <div className="vg-bar">
                      <div
                        className="vg-bar-fill vg-bar-green"
                        style={{ width: `${pct}%` }}
                      >
                        <span className="vg-value">
                          {ef.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

        </div>
      </section>

      {/* ================================================================
          2) TABELA HIERÁRQUICA
      ================================================================ */}
      <section className="dash-section" id="secao-rankings-setores">
        <div className="dash-section-header dash-section-header-table">
          <div>
            <h2>Visão consolidada de serviços por setor</h2>
            <p className="dash-section-subtitle">
              Cada linha representa um setor e, para os setores de nível 0,
              os valores já consideram todos os subsetores vinculados.
            </p>
          </div>

          <button
            type="button"
            className="btn-toggle-all"
            onClick={toggleAllRoots}
          >
            {allRootsExpanded ? "Recolher subsetores" : "Expandir subsetores"}
          </button>
        </div>

        <table id="tabela-setores">
          <thead>
            <tr>
              <th className="col-setor">Setor</th>
              <th className="col-usuarios">Usuários</th>
              <th className="col-servicos">Serviços</th>
              <th>Eficiência</th>
              <th>Engajamento</th>
              <th>Qualidade</th>
            </tr>
          </thead>

          <tbody>
            {treeRows.map((r) => {
              const isRoot = (r.nivel ?? 0) === 0;
              const indent = (r.nivel ?? 0) * 18;

              const principal = isRoot
                ? Number(r.servicos_principal_consolidado || 0)
                : Number(r.servicos_principal_individual || 0);

              const participante = isRoot
                ? Number(r.servicos_participante_consolidado || 0)
                : Number(r.servicos_participante_individual || 0);

              const rootId = Number(
                String(r.path || "").split(",")[0] || r.sector_id
              );
              const visible = isRoot || expandedRoot[rootId] !== false;

              const abertas = Number(r.solicitacoes_total || 0);
              const concl = Number(r.solicitacoes_concluidas || 0);
              const resp = Number(r.solicitacoes_respondidas || 0);

              const eficiencia = safePercent(concl, abertas);
              const eng = safePercent(resp, abertas);
              const qualidadeVal = safeNumber(r.qualidade_media, 2);
              const usuarios = fmt.format(Number(r.usuarios_total || 0));

              const isHovered = isRoot && hoveredRootId === r.sector_id;

              return (
                <React.Fragment key={r.sector_id}>
                  <tr
                    className={[
                      isRoot ? "nivel-0" : "",
                      isHovered ? "row-hover" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ display: visible ? "" : "none" }}
                  >
                    <td className="td-setor">
                      <div
                        className="td-setor-inner"
                        style={{ marginLeft: indent }}
                        onMouseEnter={() =>
                          isRoot && setHoveredRootId(r.sector_id)
                        }
                        onMouseLeave={() =>
                          isRoot &&
                          setHoveredRootId((prev) =>
                            prev === r.sector_id ? null : prev
                          )
                        }
                      >
                        {isRoot && (
                          <button
                            className="toggle"
                            aria-label={
                              expandedRoot[rootId] !== false
                                ? "Recolher subsetores"
                                : "Expandir subsetores"
                            }
                            onClick={() => toggleRoot(rootId)}
                          >
                            {expandedRoot[rootId] !== false ? "▼" : "▶"}
                          </button>
                        )}

                        <span className="td-setor-nome">{r.setor}</span>

                        {isRoot && isHovered && (
                          <div className="tooltip-consolidado">
                            <h4>Resumo consolidado</h4>

                            <div className="tooltip-grid">
                              <span>Usuários:</span>
                              <strong>{usuarios}</strong>

                              <span>Serviços:</span>
                              <strong>
                                {fmt.format(principal)} /{" "}
                                {fmt.format(participante)}
                              </strong>

                              <span>Eficiência:</span>
                              <strong>{eficiencia}</strong>

                              <span>Engajamento:</span>
                              <strong>{eng}</strong>

                              <span>Qualidade média:</span>
                              <strong>{qualidadeVal}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="td-usuarios">
                      <div
                        className="usuarios-wrapper"
                        onMouseEnter={() => showSectorUsers(r.sector_id)}
                        onMouseLeave={() => hideSectorUsers(r.sector_id)}
                      >
                        <span className="usuarios-quantidade">
                          {usuarios}
                        </span>

                        {openUsersSectorId === r.sector_id && (
                          <div className="tooltip-usuarios">
                            {usersLoading ? (
                              <div className="tooltip-loading">
                                Carregando usuários...
                              </div>
                            ) : (
                              <ul>
                                {(usersBySector[r.sector_id] || []).map(
                                  (u: any) => (
                                    <li key={u.id}>{u.nome || "—"}</li>
                                  )
                                )}

                                {!(usersBySector[r.sector_id] || []).length && (
                                  <li className="tooltip-empty">
                                    Nenhum usuário vinculado.
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    <td style={{ textAlign: "center" }}>
                      {principal || participante
                        ? `${fmt.format(principal)} / ${fmt.format(
                            participante
                          )}`
                        : "—"}
                    </td>

                    <td style={{ textAlign: "center" }}>{eficiencia}</td>
                    <td style={{ textAlign: "center" }}>{eng}</td>
                    <td style={{ textAlign: "center" }}>{qualidadeVal}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
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
