import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../app";

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
};

export default function Setores(){
  const [treeRows, setTreeRows] = useState<SetorRow[]>([]);
  const [rankUsuarios, setRankUsuarios] = useState<any[]>([]);
  const [rankEficiencia, setRankEficiencia] = useState<any[]>([]);
  const [rankQualidade, setRankQualidade] = useState<any[]>([]);
  const fmt = useMemo(() => new Intl.NumberFormat("pt-BR"), []);
  const [expandedRoot, setExpandedRoot] = useState<Record<number, boolean>>({});
  const [openUsersSectorId, setOpenUsersSectorId] = useState<number | null>(null);
  const [usersLoading, setUsersLoading] = useState<boolean>(false);
  const [usersBySector, setUsersBySector] = useState<Record<number, any[]>>({});
  const cacheRef = useMemo(() => new Map<number, { data: any[]; ts: number }>(), []);
  const debounceRef = useMemo(() => ({ t: 0 as any }), []);

  useEffect(() => {
    async function loadTree(){
      const r = await fetch(`${API_BASE_URL}/setores`);
      const data = await r.json();
      setTreeRows(data || []);
      const exp: Record<number, boolean> = {};
      (data||[]).forEach((row: any) => {
        const p = String(row.path||"");
        const root = Number((p.split(",")[0]||"0"));
        if (!(root in exp)) exp[root] = true;
      });
      setExpandedRoot(exp);
    }
    async function loadUsuarios(){
      const r = await fetch(`${API_BASE_URL}/setores-usuarios-resumo`);
      const data = await r.json();
      // top 5 por total_geral_root ou usuarios_total
      const top = [...data].sort((a,b)=> (b.total_geral_root||b.usuarios_total||0) - (a.total_geral_root||a.usuarios_total||0)).slice(0,5);
      setRankUsuarios(top);
    }
    async function loadEficiencia(){
      const r = await fetch(`${API_BASE_URL}/setores-eficiencia`);
      const data = await r.json();
      const top = [...data].sort((a,b)=> (b.eficiencia_percentual||0) - (a.eficiencia_percentual||0)).slice(0,5);
      setRankEficiencia(top);
    }
    async function loadQualidade(){
      const r = await fetch(`${API_BASE_URL}/setores-qualidade`);
      const data = await r.json();
      const top = [...data].sort((a,b)=> (b.nota_media||0) - (a.nota_media||0)).slice(0,5);
      setRankQualidade(top);
    }
    loadTree();
    loadUsuarios();
    loadEficiencia();
    loadQualidade();
  }, []);

  function toggleRoot(rootId: number){
    setExpandedRoot(prev => ({ ...prev, [rootId]: !(prev[rootId] ?? true) }));
  }

  function showSectorUsers(id: number){
    if (debounceRef.t) clearTimeout(debounceRef.t);
    debounceRef.t = setTimeout(async () => {
      setOpenUsersSectorId(id);
      const cached = cacheRef.get(id);
      const fresh = cached && (Date.now() - cached.ts) < 5 * 60 * 1000;
      if (fresh) {
        setUsersBySector(prev => ({ ...prev, [id]: cached!.data }));
        setUsersLoading(false);
        return;
      }
      try {
        setUsersLoading(true);
        const r = await fetch(`${API_BASE_URL}/setores/${id}/usuarios`);
        const data = await r.json();
        cacheRef.set(id, { data, ts: Date.now() });
        setUsersBySector(prev => ({ ...prev, [id]: data }));
      } finally {
        setUsersLoading(false);
      }
    }, 250);
  }

  return (
    <main className="main-container">
      <header className="top-nav" role="banner">
        <div className="top-nav-left">
          <img src="/cc.png" className="top-logo" alt="Cidade Conectada" />
        </div>
        <nav className="top-nav-center" aria-label="Navegação principal">
          <div className="top-nav-items">
            <Link to="/visaogeral" className="nav-item">Visão Geral</Link>
            <Link to="/setores" className="nav-item active">Setores</Link>
            <Link to="/usuarios" className="nav-item">Usuários</Link>
          </div>
        </nav>
        <div className="top-nav-right" />
      </header>

      <section className="dash-section">
        <div className="dash-section-header"><h2>Rankings de Setores</h2></div>
        <div className="rankings-grid">
          <div className="ranking-card">
            <div className="ranking-card-header">
              <button className="info-tooltip" aria-label="Setores com maior número de servidores vinculados" data-tooltip="Setores com maior número de servidores vinculados">i</button>
              <strong>Setores com mais usuários</strong>
            </div>
            <ol className="ranking-list">
              {rankUsuarios.map((x, idx) => (
                <li className="ranking-item" key={x.sector_id || idx}>
                  <span className={`ranking-item-pos pos-${idx+1}`}>{idx+1}</span>
                  <span className="ranking-item-nome">{x.setor || x.sector_title || x.title || "—"}</span>
                  <span className="ranking-item-valor">{fmt.format(Number(x.total_geral_root||x.usuarios_total||0))}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="ranking-card">
            <div className="ranking-card-header">
              <button className="info-tooltip" aria-label="Percentual de solicitações concluídas por setor" data-tooltip="Percentual de solicitações concluídas por setor">i</button>
              <strong>Eficiência por setor</strong>
            </div>
            <ol className="ranking-list">
              {rankEficiencia.map((x, idx) => (
                <li className="ranking-item" key={x.sector_id || idx}>
                  <span className={`ranking-item-pos pos-${idx+1}`}>{idx+1}</span>
                  <span className="ranking-item-nome">{x.sector_title || x.setor || "—"}</span>
                  <span className="ranking-item-valor">{Number(x.eficiencia_percentual||0).toFixed(1)}%</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="ranking-card">
            <div className="ranking-card-header">
              <button className="info-tooltip" aria-label="Nota média das avaliações dos serviços associados a cada setor" data-tooltip="Nota média das avaliações dos serviços associados a cada setor">i</button>
              <strong>Qualidade média</strong>
            </div>
            <ol className="ranking-list">
              {rankQualidade.map((x, idx) => (
                <li className="ranking-item" key={x.sector_id || idx}>
                  <span className={`ranking-item-pos pos-${idx+1}`}>{idx+1}</span>
                  <span className="ranking-item-nome">{x.setor || "—"}</span>
                  <span className="ranking-item-valor">{Number(x.nota_media||0).toFixed(2)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="dash-section" id="secao-rankings-setores">
        <div className="dash-section-header"><h2>Serviços por Setor (hierarquia)</h2></div>
        <table id="tabela-setores">
          <thead>
            <tr>
              <th className="th-tooltip" tabIndex={0} scope="col">
                Setor
                <div className="th-tooltip-text">Hierarquia organizacional</div>
              </th>
              <th style={{textAlign:"center"}} scope="col">Serviços principais</th>
              <th style={{textAlign:"center"}} scope="col">Serviços participantes</th>
            </tr>
          </thead>
          <tbody>
            {treeRows.map((r) => {
              const isRoot = (r.nivel ?? 0) === 0;
              const indent = (r.nivel ?? 0) * 16;
              const principal = isRoot ? (r.servicos_principal_consolidado ?? 0) : (r.servicos_principal_individual ?? 0);
              const participante = isRoot ? (r.servicos_participante_consolidado ?? 0) : (r.servicos_participante_individual ?? 0);
              const rootId = Number(String(r.path||"").split(",")[0]||"0");
              const visible = isRoot || expandedRoot[rootId] === true;
              return (
                <>
                  <tr key={r.sector_id} className={(r.nivel ?? 0) === 0 ? "nivel-0" : ""} style={{ display: visible ? undefined : "none" }}>
                    <td>
                      {isRoot ? (
                        <button
                          className="toggle"
                          aria-expanded={(expandedRoot[rootId] ?? true) ? "true" : "false"}
                          onClick={()=>toggleRoot(rootId)}
                          title={expandedRoot[rootId] ? "Recolher" : "Expandir"}
                        >
                          {expandedRoot[rootId] ? "▼" : "▶"}
                        </button>
                      ) : null}
                      <span style={{marginLeft: indent}}>{r.setor}</span>
                      <button
                        className="info-tooltip"
                        aria-label="Ver usuários do setor"
                        onMouseEnter={()=>showSectorUsers(r.sector_id)}
                        onFocus={()=>showSectorUsers(r.sector_id)}
                        onClick={()=>showSectorUsers(r.sector_id)}
                        style={{ marginLeft: 8 }}
                      >i</button>
                    </td>
                    <td style={{textAlign:"center"}}>{fmt.format(Number(principal||0))}</td>
                    <td style={{textAlign:"center"}}>{fmt.format(Number(participante||0))}</td>
                  </tr>
                  {openUsersSectorId === r.sector_id && (
                    <tr key={`${r.sector_id}-users`} className="hidden-row" style={{ display: "table-row", background: "#f9fafb" }}>
                      <td colSpan={3}>
                        {usersLoading ? (
                          <div>Carregando usuários...</div>
                        ) : (
                          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                            {(usersBySector[r.sector_id] || []).map((u: any) => (
                              <li key={u.id} style={{ padding: "6px 0", borderBottom: "1px dashed #e5e7eb" }}>
                                <strong>{u.nome || "—"}</strong>
                                <span style={{ color: "#6b7280", marginLeft: 8 }}>{u.email || ""}</span>
                                {u.phone ? <span style={{ color: "#6b7280", marginLeft: 8 }}>{u.phone}</span> : null}
                              </li>
                            ))}
                            {!(usersBySector[r.sector_id] || []).length && (
                              <li style={{ color: "#6b7280" }}>Nenhum usuário vinculado.</li>
                            )}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </section>
      <footer style={{marginTop:20,textAlign:"center",fontSize:12,color:"#6b7280"}}>
        Cidade Conectada — BI Dashboard
      </footer>
    </main>
  );
}
