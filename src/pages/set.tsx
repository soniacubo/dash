import React, { useEffect, useMemo, useState } from "react";
import Header from "../components/Header";
import { API_BASE_URL } from "../app";

/* ============================================================
   HELPERS
============================================================ */
function safeNumber(value: any, decimals = 2) {
  const num = Number(value);
  if (isNaN(num)) return "—";
  return num.toFixed(decimals);
}

function safePercent(a: any, b: any) {
  const n1 = Number(a);
  const n2 = Number(b);
  if (isNaN(n1) || isNaN(n2) || n2 === 0) return "—";
  return ((n1 / n2) * 100).toFixed(1) + "%";
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
  path?: string;
  servicos_principal_individual?: number;
  servicos_participante_individual?: number;
  servicos_principal_consolidado?: number;
  servicos_participante_consolidado?: number;
  solicitacoes_total?: number;
  solicitacoes_concluidas?: number;
  solicitacoes_respondidas?: number;
};

/* ============================================================
   COMPONENTE PRINCIPAL
============================================================ */
export default function Setores() {
  const [treeRows, setTreeRows] = useState<SetorRow[]>([]);

  // USERS TOOLTIP
  const [openUsersSectorId, setOpenUsersSectorId] = useState<number | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersBySector, setUsersBySector] = useState<Record<number, any[]>>({});
  const cacheRef = useMemo(() => new Map(), []);
  const debounceRef = useMemo(() => ({ t: 0 as any }), []);

  // EXPAND / COLLAPSE
  const [expandedRoot, setExpandedRoot] = useState<Record<number, boolean>>({});
  const [hoveredRootId, setHoveredRootId] = useState<number | null>(null);

  const fmt = useMemo(() => new Intl.NumberFormat("pt-BR"), []);

  /* ============================================================
     LOAD TREE
  ============================================================= */
  useEffect(() => {
    async function loadTree() {
      const r = await fetch(`${API_BASE_URL}/setores`);
      const data = await r.json();
      setTreeRows(data || []);

      // inicia expandido
      const exp: Record<number, boolean> = {};
      (data || []).forEach((row: any) => {
        const root = Number(String(row.path || "").split(",")[0] || row.sector_id);
        exp[root] = true;
      });
      setExpandedRoot(exp);
    }

    loadTree();
  }, [API_BASE_URL]);

  /* ============================================================
     USERS TOOLTIP
  ============================================================= */
  function showSectorUsers(id: number) {
    if (debounceRef.t) clearTimeout(debounceRef.t);

    debounceRef.t = setTimeout(async () => {
      setOpenUsersSectorId(id);

      const cached = cacheRef.get(id);
      const fresh = cached && Date.now() - cached.ts < 5 * 60 * 1000;
      if (fresh) {
        setUsersBySector((p) => ({ ...p, [id]: cached.data }));
        setUsersLoading(false);
        return;
      }

      try {
        setUsersLoading(true);
        const r = await fetch(`${API_BASE_URL}/setores/${id}/usuarios`);
        const data = await r.json();

        cacheRef.set(id, { data, ts: Date.now() });
        setUsersBySector((p) => ({ ...p, [id]: data }));
      } finally {
        setUsersLoading(false);
      }
    }, 230);
  }

  function hideSectorUsers(id: number) {
    if (debounceRef.t) clearTimeout(debounceRef.t);
    setOpenUsersSectorId((prev) => (prev === id ? null : prev));
  }

  /* ============================================================
     GRÁFICO 1 — SERVIÇOS PRINCIPAL / PARTICIPANTE
  ============================================================= */
  const grafServicos = useMemo(() => {
    return treeRows
      .filter((r) => (r.nivel ?? 0) === 0)
      .map((r) => ({
        setor: r.setor,
        principal: Number(r.servicos_principal_consolidado || 0),
        participante: Number(r.servicos_participante_consolidado || 0),
        total:
          Number(r.servicos_principal_consolidado || 0) +
          Number(r.servicos_participante_consolidado || 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [treeRows]);

  const maxServicos = Math.max(...grafServicos.map((r) => r.total), 1);

  /* ============================================================
     GRÁFICO 2 — EFICIÊNCIA DOS SETORES
  ============================================================= */
  const grafEficiencia = useMemo(() => {
    return treeRows
      .filter((r) => (r.nivel ?? 0) === 0)
      .map((r) => {
        const total = Number(r.solicitacoes_total || 0);
        const concl = Number(r.solicitacoes_concluidas || 0);
        const pct = total > 0 ? (concl / total) * 100 : 0;
        return {
          setor: r.setor,
          eficiencia: pct,
        };
      })
      .sort((a, b) => b.eficiencia - a.eficiencia)
      .slice(0, 10);
  }, [treeRows]);

  const maxEfic = Math.max(...grafEficiencia.map((r) => r.eficiencia), 1);

  /* ============================================================
     EXPANDIR / RECOLHER TODOS
  ============================================================= */
  const allExpanded = useMemo(() => {
    const roots = treeRows.filter((r) => (r.nivel ?? 0) === 0);
    return roots.every((r) => {
      const root = Number(String(r.path || "").split(",")[0] || r.sector_id);
      return expandedRoot[root] !== false;
    });
  }, [expandedRoot, treeRows]);

  function toggleAll() {
    const next: Record<number, boolean> = {};
    const expand = !allExpanded;

    treeRows
      .filter((r) => (r.nivel ?? 0) === 0)
      .forEach((r) => {
        const root = Number(String(r.path || "").split(",")[0] || r.sector_id);
        next[root] = expand;
      });

    setExpandedRoot(next);
  }

  /* ============================================================
     RENDER
  ============================================================= */
  return (
    <main className="main-container">
      <Header />

      {/* ============================================================
         INDICADORES
      ============================================================= */}
      <section className="dash-section">
        <h2 className="section-title-main">Indicadores por setor</h2>
        <p className="section-title-sub">
          Visão geral de desempenho, serviços e uso dos setores.
        </p>
      </section>

      {/* ============================================================
         GRÁFICOS
      ============================================================= */}
      <section className="dash-section">
        <h2 className="section-title-main">Rankings de setores</h2>

        <div className="charts-2col">
          {/* GRÁFICO A */}
          <div className="chart-card">
            <h3>Serviços cadastrados por setor</h3>
            <p className="chart-subtitle">Principal × Participante</p>

            <ul className="mini-chart-list">
              {grafServicos.map((s) => {
                const pct = (s.total / maxServicos) * 100;

                return (
                  <li key={s.setor} className="mini-chart-item">
                    <span className="mini-chart-label">{s.setor}</span>

                    <div className="mini-chart-bar-wrapper">
                      <div
                        className="mini-chart-bar"
                        style={{ width: `${pct}%` }}
                      >
                        <span className="mini-chart-bar-value">
                          {fmt.format(s.principal)} / {fmt.format(s.participante)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* GRÁFICO B */}
          <div className="chart-card">
            <h3>Eficiência dos setores (%)</h3>
            <p className="chart-subtitle">Top 10 setores</p>

            <ul className="mini-chart-list">
              {grafEficiencia.map((s) => {
                const pct = (s.eficiencia / maxEfic) * 100;

                return (
                  <li key={s.setor} className="mini-chart-item">
                    <span className="mini-chart-label">{s.setor}</span>

                    <div className="mini-chart-bar-wrapper">
                      <div
                        className="mini-chart-bar mini-chart-bar-secondary"
                        style={{ width: `${pct}%` }}
                      >
                        <span className="mini-chart-bar-value">
                          {safeNumber(s.eficiencia, 1)}%
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

      {/* ============================================================
         TABELA HIERÁRQUICA
      ============================================================= */}
      <section className="dash-section">
        <div className="dash-section-header dash-section-header-table">
          <h2>Visão consolidada de serviços por setor</h2>

          <button type="button" className="btn-toggle-all" onClick={toggleAll}>
            {allExpanded ? "Recolher subsetores" : "Expandir subsetores"}
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

              const total = Number(r.solicitacoes_total || 0);
              const concl = Number(r.solicitacoes_concluidas || 0);
              const resp = Number(r.solicitacoes_respondidas || 0);

              const eficiencia = safePercent(concl, total);
              const eng = safePercent(resp, total);
              const qualidadeVal = safeNumber(r.qualidade_media, 2);
              const usuarios = fmt.format(Number(r.usuarios_total || 0));

              const isHovered = isRoot && hoveredRootId === r.sector_id;

              return (
                <tr
                  key={r.sector_id}
                  style={{ display: visible ? "" : "none" }}
                  className={isHovered ? "row-hover" : ""}
                >
                  {/* SETOR */}
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
                          onClick={() =>
                            setExpandedRoot((p) => ({
                              ...p,
                              [rootId]: !p[rootId],
                            }))
                          }
                        >
                          {expandedRoot[rootId] !== false ? "▼" : "▶"}
                        </button>
                      )}

                      <span className="td-setor-nome">{r.setor}</span>

                      {/* TOOLTIP CONSOLIDADO */}
                      {isRoot && isHovered && (
                        <div className="tooltip-consolidado">
                          <h4>Resumo consolidado</h4>

                          <div className="tooltip-grid">
                            <span>Usuários:</span>
                            <strong>{usuarios}</strong>

                            <span>Serviços:</span>
                            <strong>
                              {fmt.format(principal)} / {fmt.format(participante)}
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

                  {/* USUÁRIOS */}
                  <td className="td-usuarios">
                    <div
                      className="usuarios-wrapper"
                      onMouseEnter={() => showSectorUsers(r.sector_id)}
                      onMouseLeave={() => hideSectorUsers(r.sector_id)}
                    >
                      <span className="usuarios-quantidade">{usuarios}</span>

                      {openUsersSectorId === r.sector_id && (
                        <div className="tooltip-usuarios">
                          {usersLoading ? (
                            <div className="tooltip-loading">
                              Carregando usuários...
                            </div>
                          ) : (
                            <ul>
                              {(usersBySector[r.sector_id] || []).map((u: any) => (
                                <li key={u.id}>{u.nome || "—"}</li>
                              ))}

                              {!usersBySector[r.sector_id]?.length && (
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

                  {/* SERVIÇOS */}
                  <td style={{ textAlign: "center" }}>
                    {principal || participante
                      ? `${fmt.format(principal)} / ${fmt.format(participante)}`
                      : "—"}
                  </td>

                  {/* EFICIÊNCIA */}
                  <td style={{ textAlign: "center" }}>{eficiencia}</td>

                  {/* ENGAJAMENTO */}
                  <td style={{ textAlign: "center" }}>{eng}</td>

                  {/* QUALidade */}
                  <td style={{ textAlign: "center" }}>{qualidadeVal}</td>
                </tr>
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
