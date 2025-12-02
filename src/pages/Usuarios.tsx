import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import Header from "../components/Header";
import TitleWithTooltip from "../components/TitleWithTooltip";
import { API_BASE_URL } from "../app";
import Chart from "chart.js/auto";

/* ============================================================
   TIPOS
============================================================ */

type UserDetail = {
  id: number;
  nome: string;
  secretaria: string | null;
  departamentos?: string | null;
  data_cadastro: string | null;
  ultimo_despacho: string | null;
  dias_sem_despacho: number | null;
  despachos_periodo: number;
  email?: string | null;
  phone?: string | null;
};

type LoginDistribuicaoResponse = {
  totalUsuarios: number;
  loginHoje: number;
  loginOntem: number;
  loginUltimos7: number;
  login7a15: number;
  login15a30: number;
  loginMais30: number;
  nuncaLogou: number;
};

type UsuariosKpis = {
  total_servidores: number;
  despacharam_24h: number;
  sem_despachar_30d: number;
  criados_30d: number;
};

type RankingItem = {
  nome: string;
  total: number;
};

type SortField =
  | "nome"
  | "secretaria"
  | "departamentos"
  | "data_cadastro"
  | "ultimo_despacho"
  | "dias_sem_despacho"
  | "despachos_periodo";

/* ============================================================
   HELPERS
============================================================ */

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function safeNumber(n: number | null | undefined): number {
  return typeof n === "number" && !Number.isNaN(n) ? n : 0;
}

function isoToBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Calcula início/fim (YYYY-MM-DD) para o período escolhido.
 */
function getPeriodoRange(periodo: string): {
  inicio: string | null;
  fim: string | null;
  label: string;
} {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let inicioDate: Date | null = new Date(hoje);

  switch (periodo) {
    case "7d":
      inicioDate = new Date(hoje.getTime() - 6 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      inicioDate = new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      inicioDate = new Date(hoje.getTime() - 89 * 24 * 60 * 60 * 1000);
      break;
    case "6m": {
      const d = new Date(hoje);
      d.setMonth(d.getMonth() - 6);
      inicioDate = d;
      break;
    }
    case "1y": {
      const d = new Date(hoje);
      d.setFullYear(d.getFullYear() - 1);
      inicioDate = d;
      break;
    }
    case "all":
    default:
      inicioDate = null;
      break;
  }

  if (!inicioDate) {
    return {
      inicio: null,
      fim: null,
      label: "Todo o histórico"
    };
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  const inicioIso = `${inicioDate.getFullYear()}-${pad(
    inicioDate.getMonth() + 1
  )}-${pad(inicioDate.getDate())}`;

  const fimIso = `${hoje.getFullYear()}-${pad(
    hoje.getMonth() + 1
  )}-${pad(hoje.getDate())}`;

  return {
    inicio: inicioIso,
    fim: fimIso,
    label: `${inicioIso.split("-").reverse().join("/")} a ${fimIso
      .split("-")
      .reverse()
      .join("/")}`
  };
}


/* ============================================================
   COMPONENTE PRINCIPAL
============================================================ */

const PAGE_SIZE = 50;

export default function Usuarios() {
  /* ----------------- Estado principal ----------------- */
  const [userRows, setUserRows] = useState<UserDetail[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [loginDist, setLoginDist] =
    useState<LoginDistribuicaoResponse | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [kpis, setKpis] = useState<UsuariosKpis | null>(null);
  const [kpisError, setKpisError] = useState<string | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);

  const [topRanking, setTopRanking] = useState<RankingItem[]>([]);
  const [rankingError, setRankingError] = useState<string | null>(null);

  const [sortField, setSortField] = useState<SortField>("ultimo_despacho");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // período selecionado (afeta: /usuarios/detalhes e /usuarios/ranking)
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "90d" | "6m" | "1y" | "all">("30d");

  const { inicio, fim, label: labelPeriodo } = useMemo(
    () => getPeriodoRange(periodo),
    [periodo]
  );

  /* ----------------- Lazy load na tabela ----------------- */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const endOfListRef = useRef<HTMLDivElement | null>(null);

  /* ----------------- Charts refs ----------------- */
  const loginChartRef = useRef<HTMLCanvasElement | null>(null);
  const loginChartInstance = useRef<Chart | null>(null);

  const topDispatchersChartRef = useRef<HTMLCanvasElement | null>(null);
  const topDispatchersChartInstance = useRef<Chart | null>(null);

  /* ============================================================
     1) CARREGAR KPIs (rota dedicada)
  ============================================================ */
  useEffect(() => {
    async function loadKpis() {
      try {
        setLoadingKpis(true);
        setKpisError(null);
        const r = await fetch(`${API_BASE_URL}/usuarios/kpis`);
        if (!r.ok) throw new Error("Erro ao carregar KPIs de usuários");
        const data: UsuariosKpis = await r.json();
        setKpis(data);
      } catch (e: any) {
        console.error(e);
        setKpisError("Não foi possível carregar os KPIs de usuários.");
      } finally {
        setLoadingKpis(false);
      }
    }
    loadKpis();
  }, []);

  /* ============================================================
     2) CARREGAR DADOS DE USUÁRIOS (DETALHES)
        Impactados pelo período selecionado
  ============================================================ */
  useEffect(() => {
    async function loadUsers() {
      try {
        setLoadingUsers(true);
        setUsersError(null);
        setVisibleCount(PAGE_SIZE); // resetar paginação sempre que trocar período

        let url = `${API_BASE_URL}/usuarios/detalhes`;
        const params: string[] = [];

        if (inicio && fim) {
          params.push(`inicio=${inicio}`, `fim=${fim}`);
        }

        if (params.length) {
          url += `?${params.join("&")}`;
        }

        const r = await fetch(url);
        if (!r.ok) throw new Error("Erro ao carregar usuários");
        const data = await r.json();

        setUserRows(data || []);
      } catch (e: any) {
        console.error(e);
        setUsersError("Não foi possível carregar os dados de usuários.");
      } finally {
        setLoadingUsers(false);
      }
    }
    loadUsers();
  }, [inicio, fim]);

  /* ============================================================
     3) CARREGAR DISTRIBUIÇÃO DE LOGIN (Mini gráfico 1)
  ============================================================ */
  useEffect(() => {
    async function loadLoginDist() {
      try {
        setLoginError(null);
        const r = await fetch(`${API_BASE_URL}/usuarios/login-distribuicao`);
        if (!r.ok) throw new Error("Erro ao carregar distribuição de login");
        const d: LoginDistribuicaoResponse = await r.json();
        setLoginDist(d);
      } catch (e: any) {
        console.error(e);
        setLoginError("Não foi possível carregar a distribuição de login.");
      }
    }
    loadLoginDist();
  }, []);

  /* ============================================================
     4) CARREGAR RANKING DE DESPACHOS (Mini gráfico 2)
        Usa o mesmo período da tabela.
  ============================================================ */
  useEffect(() => {
    async function loadRanking() {
      try {
        setRankingError(null);
        if (!inicio || !fim) {
          // Se for "all", podemos pegar um range maior, mas simples: último ano
          const { inicio: i, fim: f } = getPeriodoRange("1y");
          if (!i || !f) return;
        }

        const i = inicio;
        const f = fim;

        if (!i || !f) return;

        const url = `${API_BASE_URL}/usuarios/ranking?inicio=${i}&fim=${f}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error("Erro ao carregar ranking de despachos");
        const data: RankingItem[] = await r.json();
        setTopRanking(data || []);
      } catch (e: any) {
        console.error(e);
        setRankingError("Não foi possível carregar o ranking de despachos.");
      }
    }
    loadRanking();
  }, [inicio, fim]);

  /* ============================================================
     5) MINI GRÁFICO 1 – DISTRIBUIÇÃO DE LOGIN
  ============================================================ */
  useEffect(() => {
    if (!loginDist) return;
    if (!loginChartRef.current) return;

    const labels = [
      "Fez login hoje",
      "Fez login ontem",
      "Últimos 7 dias",
      "7 a 15 dias",
      "15 a 30 dias",
      "Mais de 30 dias",
      "Nunca logou"
    ];

    const valores = [
      safeNumber(loginDist.loginHoje),
      safeNumber(loginDist.loginOntem),
      safeNumber(loginDist.loginUltimos7),
      safeNumber(loginDist.login7a15),
      safeNumber(loginDist.login15a30),
      safeNumber(loginDist.loginMais30),
      safeNumber(loginDist.nuncaLogou)
    ];

    const total =
      safeNumber(loginDist.totalUsuarios) ||
      valores.reduce((a, b) => a + b, 0);
    const porcentagens = valores.map((v) =>
      total > 0 ? Number(((v / total) * 100).toFixed(1)) : 0
    );

    if (loginChartInstance.current) {
      loginChartInstance.current.destroy();
    }

    loginChartInstance.current = new Chart(loginChartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "% dos servidores",
            data: porcentagens
          }
        ]
      },
      options: {
        indexAxis: "y" as const,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const idx = ctx.dataIndex;
                const abs = valores[idx] ?? 0;
                const perc = porcentagens[idx] ?? 0;
                return `${abs} usuários (${perc.toFixed(1)}%)`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (value) => value + "%"
            }
          },
          y: {
            grid: { display: false }
          }
        }
      }
    });

    return () => {
      if (loginChartInstance.current) {
        loginChartInstance.current.destroy();
        loginChartInstance.current = null;
      }
    };
  }, [loginDist]);

  /* ============================================================
     6) MINI GRÁFICO 2 – TOP DESPACHANTES (via /usuarios/ranking)
  ============================================================ */
  useEffect(() => {
    if (!topDispatchersChartRef.current) return;

    const data = topRanking
      .filter((r) => safeNumber(r.total) > 0)
      .slice(0, 15);

    if (data.length === 0) {
      if (topDispatchersChartInstance.current) {
        topDispatchersChartInstance.current.destroy();
        topDispatchersChartInstance.current = null;
      }
      return;
    }

    const labels = data.map((u) => u.nome);
    const valores = data.map((u) => u.total);

    if (topDispatchersChartInstance.current) {
      topDispatchersChartInstance.current.destroy();
    }

    topDispatchersChartInstance.current = new Chart(
      topDispatchersChartRef.current,
      {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Despachos no período",
              data: valores
            }
          ]
        },
        options: {
          indexAxis: "y" as const,
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.parsed.x} despachos`
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true
            },
            y: {
              grid: { display: false }
            }
          }
        }
      }
    );

    return () => {
      if (topDispatchersChartInstance.current) {
        topDispatchersChartInstance.current.destroy();
        topDispatchersChartInstance.current = null;
      }
    };
  }, [topRanking]);

  /* ============================================================
     7) ORDENAÇÃO DA TABELA
  ============================================================ */

  const sortedUsers = useMemo(() => {
    const rows = [...userRows];

    rows.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      const getValue = (u: UserDetail): any => {
        switch (sortField) {
          case "nome":
            return u.nome?.toLowerCase() ?? "";
          case "secretaria":
            return u.secretaria?.toLowerCase() ?? "";
          case "departamentos":
            return u.departamentos?.toLowerCase() ?? "";
          case "data_cadastro":
            return u.data_cadastro
              ? new Date(u.data_cadastro).getTime()
              : 0;
          case "ultimo_despacho":
            return u.ultimo_despacho
              ? new Date(u.ultimo_despacho).getTime()
              : 0;
          case "dias_sem_despacho":
            return u.dias_sem_despacho ?? Number.POSITIVE_INFINITY;
          case "despachos_periodo":
            return u.despachos_periodo;
          default:
            return 0;
        }
      };

      const va = getValue(a);
      const vb = getValue(b);

      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    return rows;
  }, [userRows, sortField, sortDir]);

  function handleSort(field: SortField) {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevField;
      }
      setSortDir(field === "nome" ? "asc" : "desc");
      return field;
    });
  }
function sortIcon(field: SortField) {
  if (field !== sortField) return "";

  return sortDir === "asc" ? "asc" : "desc";
}



  /* ============================================================
     8) SCROLL INFINITO – observer no final da lista
  ============================================================ */
  useEffect(() => {
    if (!endOfListRef.current) return;
    if (sortedUsers.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (
        entry.isIntersecting &&
        !isLoadingMore &&
        visibleCount < sortedUsers.length
      ) {
        setIsLoadingMore(true);
        setTimeout(() => {
          setVisibleCount((prev) =>
            Math.min(prev + PAGE_SIZE, sortedUsers.length)
          );
          setIsLoadingMore(false);
        }, 300);
      }
    });

    observer.observe(endOfListRef.current);

    return () => {
      observer.disconnect();
    };
  }, [sortedUsers.length, visibleCount, isLoadingMore]);

  // sempre que trocar a lista, reseta o visível
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sortedUsers]);

  /* ============================================================
     RENDER
  ============================================================ */

  const k = kpis || {
    total_servidores: 0,
    despacharam_24h: 0,
    sem_despachar_30d: 0,
    criados_30d: 0
  };

  return (
    <main className="main-container">
      <Header />

      {/* TÍTULO */}
      <section className="dash-section" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            padding: "12px 0"
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.45rem",
                fontWeight: 700
              }}
            >
              Análise de Usuários (Servidores)
            </h2>
          </div>
        </div>
      </section>

      {/* CARDS SUPERIORES – mesmo estilo dos outros dashboards */}
      <section className="dash-section" style={{ marginBottom: 24 }}>
        <div
          className="kpi-row"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 16
          }}
        >
          <div className="kpi-card">
            <TitleWithTooltip
              tooltip="Total de usuários servidores ativos no sistema."
              className="kpi-title"
            >
              Total de servidores
            </TitleWithTooltip>
            <div className="kpi-value">
              {loadingKpis ? "…" : k.total_servidores}
            </div>
          </div>

          <div className="kpi-card">
            <TitleWithTooltip
              tooltip="Quantidade de servidores que realizaram ao menos um despacho nas últimas 24 horas."
              className="kpi-title"
            >
              Despacharam nas últimas 24h
            </TitleWithTooltip>
            <div className="kpi-value">
              {loadingKpis ? "…" : k.despacharam_24h}
            </div>
          </div>

          <div className="kpi-card">
            <TitleWithTooltip
              tooltip="Servidores que não realizam despachos há mais de 30 dias (ou que nunca despacharam)."
              className="kpi-title"
            >
              Sem despachar há &gt; 30 dias
            </TitleWithTooltip>
            <div className="kpi-value">
              {loadingKpis ? "…" : k.sem_despachar_30d}
            </div>
          </div>

          <div className="kpi-card">
            <TitleWithTooltip
              tooltip="Quantidade de usuários servidores criados nos últimos 30 dias."
              className="kpi-title"
            >
              Criados nos últimos 30 dias
            </TitleWithTooltip>
            <div className="kpi-value">
              {loadingKpis ? "…" : k.criados_30d}
            </div>
          </div>
        </div>
        {kpisError && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
            {kpisError}
          </div>
        )}
      </section>

      {/* MINI GRÁFICOS */}
      <section className="dash-section" style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 2fr",
            gap: 16
          }}
        >
          {/* MINI GRÁFICO 1 – Login */}
          <div className="card">
            <div className="grafico-titulo">Última vez que realizou login</div>
            {loginError && (
              <div style={{ color: "#b91c1c", fontSize: 12 }}>
                {loginError}
              </div>
            )}
            <div
              className="grafico-container"
              style={{ height: 280, paddingTop: 8 }}
            >
              <canvas ref={loginChartRef} />
            </div>
          </div>

          {/* MINI GRÁFICO 2 – Top despachantes */}
          <div className="card">
            <div className="grafico-titulo">
              Servidores que mais despacharam no período selecionado
            </div>
            {rankingError && (
              <div style={{ color: "#b91c1c", fontSize: 12 }}>
                {rankingError}
              </div>
            )}
            <div
              className="grafico-container"
              style={{ height: 280, paddingTop: 8 }}
            >
              <canvas ref={topDispatchersChartRef} />
            </div>
          </div>
        </div>
      </section>

      {/* TABELA DETALHADA DE USUÁRIOS */}
      <section className="dash-section">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 12,
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap"
          }}
        >
          <h3 style={{ margin: 0 }}>Lista detalhada de usuários</h3>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12
            }}
          >
            <span style={{ color: "#6b7280" }}>Período de despachos:</span>
            <strong style={{ fontSize: 12 }}>
              {inicio && fim ? labelPeriodo : "Todo o histórico"}
            </strong>
            <select
              value={periodo}
              onChange={(e) =>
                setPeriodo(e.target.value as typeof periodo)
              }
              style={{
                marginLeft: 8,
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 12,
                background: "#fff",
                cursor: "pointer"
              }}
            >
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="1y">Últimos 12 meses</option>
              <option value="all">Todo o histórico</option>
            </select>
          </div>
        </div>

        {loadingUsers ? (
          <div style={{ padding: 16, fontSize: 14 }}>
            Carregando usuários…
          </div>
        ) : usersError ? (
          <div style={{ padding: 16, color: "#b91c1c", fontSize: 14 }}>
            {usersError}
          </div>
        ) : (
          <>
            <div className="table-wrapper tabela-usuarios-wrapper">
         
 <table className="cc-table">

    <thead>
      <tr>
        <th
          className="sortable"
          onClick={() => handleSort("nome")}
        >
          Nome {sortIcon("nome")}
        </th>

        <th
          className="sortable"
          onClick={() => handleSort("secretaria")}
        >
          Secretaria {sortIcon("secretaria")}
        </th>

        <th
          className="sortable"
          onClick={() => handleSort("departamentos")}
        >
          Departamentos {sortIcon("departamentos")}
        </th>

        <th
          className="sortable"
          onClick={() => handleSort("data_cadastro")}
        >
          Data cadastro {sortIcon("data_cadastro")}
        </th>

        <th
          className="sortable"
          onClick={() => handleSort("ultimo_despacho")}
        >
          Último despacho {sortIcon("ultimo_despacho")}
        </th>

        <th
          className="sortable"
          onClick={() => handleSort("dias_sem_despacho")}
        >
          Dias sem despachar {sortIcon("dias_sem_despacho")}
        </th>

        <th
          className="sortable"
          onClick={() => handleSort("despachos_periodo")}
        >
          Despachos no período {sortIcon("despachos_periodo")}
        </th>
      </tr>
    </thead>

    <tbody>
     {sortedUsers.slice(0, visibleCount).map((u) => {

        const tooltipNome = [
          u.email ? `Email: ${u.email}` : null,
          u.phone ? `Telefone: ${u.phone}` : null
        ]
          .filter(Boolean)
          .join(" • ");

        return (
          <tr key={u.id}>
            <td>
  {tooltipNome ? (
    <span style={{ position: "relative", display: "inline-block" }}>
      <TitleWithTooltip tooltip={tooltipNome}>
        <span>{u.nome}</span>
      </TitleWithTooltip>
    </span>
  ) : (
    u.nome
  )}
</td>


            <td>{u.secretaria || "—"}</td>
            <td>{u.departamentos || "—"}</td>
            <td>{formatDate(u.data_cadastro)}</td>
            <td>{formatDateTime(u.ultimo_despacho)}</td>

            <td>
              {u.dias_sem_despacho == null
                ? "—"
                : `${u.dias_sem_despacho} dia${
                    u.dias_sem_despacho === 1 ? "" : "s"
                  }`}
            </td>

            <td>{u.despachos_periodo}</td>
          </tr>
        );
      })}
    </tbody>
  </table>


            </div>

            {/* Sentinel para scroll infinito + mensagens de feedback */}
            <div
              ref={endOfListRef}
              style={{
                padding: "8px 0",
                textAlign: "center",
                fontSize: 12,
                color: "#6b7280"
              }}
            >
              {sortedUsers.length > 0 && visibleCount < sortedUsers.length && !isLoadingMore && (
                <>Role até o final da tabela para carregar mais usuários…</>
              )}

              {sortedUsers.length > 0 && visibleCount < sortedUsers.length && isLoadingMore && (
                <>Carregando mais usuários…</>
              )}

              {sortedUsers.length > 0 && visibleCount >= sortedUsers.length && (
                <>Fim da lista de usuários.</>
              )}
            </div>
          </>
        )}
      </section>

      <footer
        style={{
          marginTop: 20,
          textAlign: "center",
          fontSize: 12,
          color: "#6b7280"
        }}
      >
        Cidade Conectada — BI Dashboard
      </footer>
    </main>
  );
}
