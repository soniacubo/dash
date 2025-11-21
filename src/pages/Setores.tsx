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

  return (
    <div className="main-container">
      <div className="top-nav">
        <div className="top-nav-left">
          <img src="/cc.png" className="top-logo" alt="Cidade Conectada" />
        </div>
        <div className="top-nav-center">
          <div className="top-nav-items">
            <Link to="/visaogeral" className="nav-item">Visão Geral</Link>
            <Link to="/setores" className="nav-item active">Setores</Link>
            <Link to="/usuarios" className="nav-item">Usuários</Link>
          </div>
        </div>
        <div className="top-nav-right" />
      </div>

      <section className="dash-section">
        <div className="dash-section-header"><h2>Rankings de Setores</h2></div>
        <div className="rankings-grid">
          <div className="ranking-card">
            <div className="ranking-card-header">
              <button className="info-tooltip" data-tooltip="Setores com maior número de servidores vinculados">i</button>
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
              <button className="info-tooltip" data-tooltip="Percentual de solicitações concluídas por setor">i</button>
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
              <button className="info-tooltip" data-tooltip="Nota média das avaliações dos serviços associados a cada setor">i</button>
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
              <th className="th-tooltip">
                Setor
                <div className="th-tooltip-text">Hierarquia organizacional</div>
              </th>
              <th style={{textAlign:"center"}}>Serviços principais</th>
              <th style={{textAlign:"center"}}>Serviços participantes</th>
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
                <tr key={r.sector_id} className={(r.nivel ?? 0) === 0 ? "nivel-0" : ""} style={{ display: visible ? undefined : "none" }}>
                  <td>
                    {isRoot ? (
                      <span className="toggle" onClick={()=>setExpandedRoot(prev=>({ ...prev, [rootId]: !(prev[rootId] ?? true) }))}>
                        {expandedRoot[rootId] ? "▾" : "▸"}
                      </span>
                    ) : null}
                    <span style={{marginLeft: indent}}>{r.setor}</span>
                  </td>
                  <td style={{textAlign:"center"}}>{fmt.format(Number(principal||0))}</td>
                  <td style={{textAlign:"center"}}>{fmt.format(Number(participante||0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
