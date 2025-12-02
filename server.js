/**
 * ============================================================
 *  SERVER PRINCIPAL — ORGANIZADO POR SEÇÕES
 * ============================================================
 */

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const app = express();
const TENANT_ID = 1;

/* ============================================================
   🔐 CORS CONFIG
============================================================ */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    const isDev = process.env.NODE_ENV !== "production";

    if (isDev) {
      return callback(null, true);
    }

    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.set("trust proxy", 1);
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));

/* ============================================================
   📦 LOGGER
============================================================ */
const logger = {
  info: (msg, meta) => console.log(JSON.stringify({ level: "info", msg, ...meta })),
  error: (msg, meta) => console.error(JSON.stringify({ level: "error", msg, ...meta }))
};

/* ============================================================
   🗄️ MYSQL — POOL ÚNICO
============================================================ */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

/* ============================================================
   🛠️ HELPERS
============================================================ */

function brToMySQL(dateBR) {
  if (!dateBR) return null;
  const [d, m, y] = dateBR.split("/");
  return `${y}-${m}-${d}`;
}

/**
 * Converte o período (today, 7d, 30d, 6m, 1y, etc.)
 * para datas de início e fim.
 */
function getPeriodoDates(periodoRaw) {
  const periodo = String(periodoRaw || "30d");
  const agora = new Date();

  const fim = new Date();
  let inicio = new Date();

  switch (periodo) {
    case "today":
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
      break;
    case "7d":
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 6);
      inicio.setHours(0, 0, 0, 0);
      break;
    case "30d":
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 29);
      inicio.setHours(0, 0, 0, 0);
      break;
    case "90d":
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 89);
      inicio.setHours(0, 0, 0, 0);
      break;
    case "6m":
      inicio = new Date(agora);
      inicio.setMonth(inicio.getMonth() - 6);
      inicio.setHours(0, 0, 0, 0);
      break;
    case "1y":
      inicio = new Date(agora.getFullYear(), 0, 1, 0, 0, 0);
      break;
    case "ano_passado":
      inicio = new Date(agora.getFullYear() - 1, 0, 1);
      fim.setFullYear(agora.getFullYear() - 1, 11, 31);
      fim.setHours(23, 59, 59, 999);
      break;
    case "all":
      inicio = new Date("2000-01-01T00:00:00Z");
      break;
    default:
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 29);
      inicio.setHours(0, 0, 0, 0);
      break;
  }

  const diasPeriodo = Math.max(
    1,
    Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1
  );

  return { inicio, fim, diasPeriodo, periodo };
}

/**
 * Para filtros tipo: 7d, 30d, 6m, 1y
 */
function getStartDateFromPeriod(periodKey) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const start = new Date(now);

  switch (periodKey) {
    case "today": start.setHours(0, 0, 0, 0); break;
    case "7d": start.setDate(start.getDate() - 7); break;
    case "30d": start.setDate(start.getDate() - 30); break;
    case "90d": start.setDate(start.getDate() - 90); break;
    case "6m": start.setMonth(start.getMonth() - 6); break;
    case "1y": start.setFullYear(start.getFullYear() - 1); break;
    default: start.setDate(start.getDate() - 30);
  }

  return `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}-${String(start.getDate()).padStart(2,"0")} 00:00:00`;
}

/* ============================================================
   🧱 A PARTIR DAQUI COMEÇAM AS ROTAS (PARTE 2)
============================================================ */
/* ============================================================
   📊 VISÃO GERAL — VERSÕES ANTERIORES (A e B1) — COMENTADAS
============================================================ */

/**
 * ------------------------------------------------------------
 * 🔵 VERSÃO A (COMENTADA)
 * ------------------------------------------------------------
 * Mantida apenas como histórico. NÃO está ativa.
 */
/*
app.get("/api/visao-geral", async (req, res) => {
  try {
    const tenant = TENANT_ID;

    const [[totalServicos]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.services WHERE tenant_id = ? AND active = 1`,
      [tenant]
    );

    const [[totalSetores]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.sectors WHERE tenant_id = ?`,
      [tenant]
    );

    const [[totalUsuarios]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.users WHERE tenant_id = ?`,
      [tenant]
    );

    const [[totalCidadaos]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.citizens WHERE tenant_id = ?`,
      [tenant]
    );

    const [[avaliacoes]] = await db.query(
      `SELECT AVG(grade) AS media FROM jp_conectada.averages WHERE tenant_id = ?`,
      [tenant]
    );

    const [[eficiencia]] = await db.query(
      `SELECT 
         SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS concluidas,
         COUNT(*) AS total
       FROM jp_conectada.solicitations
       WHERE tenant_id = ?
         AND deleted_at IS NULL`,
      [tenant]
    );

    const conclu = Number(eficiencia.concluidas || 0);
    const tot = Number(eficiencia.total || 0);
    const eficienciaPct = tot > 0 ? ((conclu / tot) * 100).toFixed(1) : 0;

    res.json({
      totais: {
        servicos: totalServicos.total,
        setores: totalSetores.total,
        usuarios: totalUsuarios.total,
        cidadaos: totalCidadaos.total
      },
      desempenho: {
        eficiencia: eficienciaPct,
        qualidade: Number(avaliacoes.media || 0).toFixed(1)
      }
    });

  } catch (err) {
    console.error("Erro /api/visao-geral (A):", err);
    res.status(500).json({ error: "Erro ao carregar visão geral" });
  }
});
*/

/**
 * ------------------------------------------------------------
 * 🔵 VERSÃO B1 (COMENTADA)
 * ------------------------------------------------------------
 * Mantida apenas como histórico. NÃO está ativa.
 */
/*
app.get("/api/visao-geral", async (req, res) => {
  try {
    const tenant = TENANT_ID;

    const [[serv]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.services WHERE tenant_id = ? AND active = 1`,
      [tenant]
    );

    const [[usuarios]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.users WHERE tenant_id = ?`,
      [tenant]
    );

    const [[setores]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.sectors WHERE tenant_id = ?`,
      [tenant]
    );

    const [[sol]] = await db.query(
      `SELECT 
         COUNT(*) AS total,
         SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS concluidas
       FROM jp_conectada.solicitations
       WHERE tenant_id = ?
         AND deleted_at IS NULL`,
      [tenant]
    );

    const total = Number(sol.total || 0);
    const concluidas = Number(sol.concluidas || 0);
    const eficiencia = total > 0 ? ((concluidas / total) * 100).toFixed(1) : 0;

    res.json({
      totais: {
        servicos: serv.total,
        usuarios: usuarios.total,
        setores: setores.total,
        solicitacoes: total
      },
      desempenho: {
        eficiencia: eficiencia
      }
    });

  } catch (err) {
    console.error("Erro /api/visao-geral (B1):", err);
    res.status(500).json({ error: "Erro ao carregar visão geral" });
  }
});
*/

/* ============================================================
   ✅ 📊 VISÃO GERAL — VERSÃO B2 (ATIVA)
============================================================ */
app.get("/api/visao-geral", async (req, res) => {
  try {
    const tenantId = TENANT_ID;

    /* ================================
       TOTALIZAÇÕES BÁSICAS
    ================================= */
    const [[servicos]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.services WHERE tenant_id = ? AND active = 1`,
      [tenantId]
    );

    const [[setores]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.sectors WHERE tenant_id = ?`,
      [tenantId]
    );

    const [[usuarios]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.users WHERE tenant_id = ?`,
      [tenantId]
    );

    const [[cidadaos]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.citizens WHERE tenant_id = ?`,
      [tenantId]
    );

    /* ================================
       SOLICITAÇÕES — EFICIÊNCIA
    ================================= */
    const [[sol]] = await db.query(
      `SELECT 
          COUNT(*) AS total,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS concluidas,
          SUM(CASE WHEN status <> 1 THEN 1 ELSE 0 END) AS nao_concluidas
       FROM jp_conectada.solicitations
       WHERE tenant_id = ?
         AND deleted_at IS NULL`,
      [tenantId]
    );

    const total = sol.total || 0;
    const concluidas = sol.concluidas || 0;
    const naoConcluidas = sol.nao_concluidas || 0;
    const eficiencia = total > 0 ? ((concluidas / total) * 100).toFixed(1) : "0.0";

    /* ================================
       ENGAJAMENTO
    ================================= */
    const [[engaj]] = await db.query(
      `SELECT 
          COUNT(DISTINCT solicitation_id) AS respondidas
       FROM jp_conectada.tramitations t
       JOIN jp_conectada.solicitations s ON s.id = t.solicitation_id
       WHERE s.tenant_id = ?
         AND t.origem_user <> 'Cidadão'`,
      [tenantId]
    );

    const respondidas = engaj.respondidas || 0;
    const engajamento = naoConcluidas > 0
      ? ((respondidas / naoConcluidas) * 100).toFixed(1)
      : "0.0";

    /* ================================
       QUALIDADE (service_evaluations)
    ================================= */
    const [[qualidade]] = await db.query(
      `SELECT AVG(grade) AS media 
       FROM jp_conectada.service_evaluations 
       WHERE tenant_id = ?`,
      [tenantId]
    );

    const qualidadeMedia = qualidade.media
      ? Number(qualidade.media).toFixed(1)
      : "0.0";

    /* ================================
       ECONOMIA
    ================================= */
    const custoPagina = 0.35;
    const custoManuseio = 0.80;

    const [[econom]] = await db.query(
      `SELECT 
          SUM(CASE WHEN origem = 'online' THEN 1 ELSE 0 END) AS online,
          SUM(CASE WHEN origem = 'presencial' THEN 1 ELSE 0 END) AS presencial
       FROM jp_conectada.solicitations
       WHERE tenant_id = ?
         AND deleted_at IS NULL`,
      [tenantId]
    );

    const totalOnline = Number(econom.online || 0);
    const totalPresencial = Number(econom.presencial || 0);

    const economiaTotal =
      totalOnline * (custoPagina + custoManuseio);

    /* ================================
       RESPOSTA FINAL
    ================================= */
    res.json({
      totais: {
        servicos: servicos.total,
        setores: setores.total,
        usuarios: usuarios.total,
        cidadaos: cidadaos.total,
        solicitacoes: total
      },
      desempenho: {
        eficiencia: eficiencia,
        engajamento: engajamento,
        qualidade: qualidadeMedia
      },
      economia: {
        online: totalOnline,
        presencial: totalPresencial,
        economia_total: Number(economiaTotal.toFixed(2))
      }
    });

  } catch (err) {
    console.error("Erro /api/visao-geral (B2):", err);
    res.status(500).json({ error: "Erro ao carregar visão geral" });
  }
});

/* ============================================================
   📈 VISÃO GERAL — SERIES
============================================================ */
app.get("/api/visao-geral/series", async (req, res) => {
  try {
    const tenantId = TENANT_ID;

    const [[abertasHoje]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.solicitations 
       WHERE tenant_id = ?
         AND DATE(created_at) = CURDATE()`,
      [tenantId]
    );

    const [[concluidasHoje]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.solicitations 
       WHERE tenant_id = ?
         AND status = 1
         AND DATE(updated_at) = CURDATE()`,
      [tenantId]
    );

    res.json({
      abertasHoje: abertasHoje.total,
      concluidasHoje: concluidasHoje.total
    });

  } catch (err) {
    console.error("Erro /api/visao-geral/series:", err);
    res.status(500).json({ error: "Erro ao carregar séries" });
  }
});

/* ============================================================
   📊 VISÃO GERAL — EVOLUÇÃO DE USO
============================================================ */
app.get("/api/visao-geral/evolucao-uso", async (req, res) => {
  try {
    const tenantId = TENANT_ID;

    const [[r]] = await db.query(
      `SELECT 
          COUNT(*) AS total,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) AS ultimos30
       FROM jp_conectada.solicitations
       WHERE tenant_id = ?`,
      [tenantId]
    );

    res.json({
      total: r.total,
      ultimos30: r.ultimos30
    });

  } catch (err) {
    console.error("Erro /api/visao-geral/evolucao-uso:", err);
    res.status(500).json({ error: "Erro ao carregar evolução" });
  }
});

/* ============================================================
   🔮 VISÃO GERAL — TENDÊNCIA
============================================================ */
app.get("/api/visao-geral/tendencia", async (req, res) => {
  try {
    const tenantId = TENANT_ID;

    const [rows] = await db.query(
      `SELECT 
          DATE(created_at) AS dia,
          COUNT(*) AS total
       FROM jp_conectada.solicitations
       WHERE tenant_id = ?
       GROUP BY DATE(created_at)
       ORDER BY dia ASC`,
      [tenantId]
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /api/visao-geral/tendencia:", err);
    res.status(500).json({ error: "Erro ao carregar tendência" });
  }
});

/* ============================================================
   👉 FIM DA PARTE 2 — ABAIXO COMEÇAM SETORES (PARTE 3)
============================================================ */
/* ============================================================
   📁 SETORES — ÁRVORE / LISTAGEM
============================================================ */
app.get("/api/setores", async (req, res) => {
  try {
    const tenantId = TENANT_ID;

    const [rows] = await db.query(
      `SELECT 
          id,
          name,
          path,
          parent_id,
          total_services,
          total_users,
          eficiencia,
          qualidade,
          engajamento
       FROM jp_conectada.sectors
       WHERE tenant_id = ?
       ORDER BY path ASC`,
      [tenantId]
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /api/setores:", err);
    res.status(500).json({ error: "Erro ao carregar setores" });
  }
});

/* ============================================================
   🏆 SETORES — RANKING DE EFICIÊNCIA
============================================================ */
app.get("/api/setores/eficiencia", async (req, res) => {
  try {
    const tenantId = TENANT_ID;

    const [rows] = await db.query(
      `SELECT 
          s.id,
          s.name,
          s.eficiencia
       FROM jp_conectada.sectors s
       WHERE s.tenant_id = ?
       ORDER BY s.eficiencia DESC
       LIMIT 10`,
      [tenantId]
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /api/setores/eficiencia:", err);
    res.status(500).json({ error: "Erro ao carregar ranking" });
  }
});

/* ============================================================
   📑 SETORES — DETALHE COMPLETO DO SETOR
============================================================ */
app.get("/api/setor/:id", async (req, res) => {
  try {
    const tenantId = TENANT_ID;
    const setorId = req.params.id;

    const [[setor]] = await db.query(
      `SELECT *
       FROM jp_conectada.sectors
       WHERE tenant_id = ? AND id = ?`,
      [tenantId, setorId]
    );

    if (!setor) {
      return res.status(404).json({ error: "Setor não encontrado" });
    }

    const [servicos] = await db.query(
      `SELECT id, name, active
       FROM jp_conectada.services
       WHERE tenant_id = ? AND sector_id = ?`,
      [tenantId, setorId]
    );

    const [usuarios] = await db.query(
      `SELECT id, name, email
       FROM jp_conectada.users
       WHERE tenant_id = ? AND sector_id = ?`,
      [tenantId, setorId]
    );

    res.json({
      setor,
      servicos,
      usuarios
    });

  } catch (err) {
    console.error("Erro /api/setor/:id:", err);
    res.status(500).json({ error: "Erro ao carregar detalhes do setor" });
  }
});

/* ============================================================
   👤 USUÁRIOS — KPIs
============================================================ */
app.get("/api/usuarios/kpis", async (req, res) => {
  try {
    const tenantId = TENANT_ID;

    const [[total]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.users WHERE tenant_id = ?`,
      [tenantId]
    );

    const [[ativosHoje]] = await db.query(
      `SELECT COUNT(*) AS total 
       FROM jp_conectada.users 
       WHERE tenant_id = ?
         AND DATE(last_login) = CURDATE()`,
      [tenantId]
    );

    const [[ativos7]] = await db.query(
      `SELECT COUNT(*) AS total 
       FROM jp_conectada.users 
       WHERE tenant_id = ?
         AND last_login >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      [tenantId]
    );

    const [[ativos30]] = await db.query(
      `SELECT COUNT(*) AS total 
       FROM jp_conectada.users 
       WHERE tenant_id = ?
         AND last_login >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [tenantId]
    );

    res.json({
      total: total.total,
      loginHoje: ativosHoje.total,
      login7d: ativos7.total,
      login30d: ativos30.total
    });

  } catch (err) {
    console.error("Erro /api/usuarios/kpis:", err);
    res.status(500).json({ error: "Erro ao carregar KPIs de usuários" });
  }
});

/* ============================================================
   👤 USUÁRIOS — LISTAGEM COMPLETA
============================================================ */
app.get("/api/usuarios/lista", async (req, res) => {
  try {
    const tenantId = TENANT_ID;

    const [rows] = await db.query(
      `SELECT 
          u.id,
          u.name,
          u.email,
          u.phone,
          u.secretary,
          u.departments,
          DATE_FORMAT(u.created_at, "%Y-%m-%d") AS data_cadastro,
          DATE_FORMAT(u.last_dispatch, "%Y-%m-%d") AS ultimo_despacho,
          u.dispatches_last_30 AS despachos_periodo,
          u.days_no_dispatch AS dias_sem_despacho
       FROM jp_conectada.users u
       WHERE u.tenant_id = ?`,
      [tenantId]
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /api/usuarios/lista:", err);
    res.status(500).json({ error: "Erro ao carregar lista de usuários" });
  }
});

/* ============================================================
   📄 SOLICITAÇÕES — LISTAGEM RESUMIDA
============================================================ */
app.get("/api/solicitacoes/resumo", async (req, res) => {
  try {
    const tenantId = TENANT_ID;
    const periodo = req.query.periodo || "30d";

    const { inicio, fim } = getPeriodoDates(periodo);

    const [[totais]] = await db.query(
      `SELECT 
          COUNT(*) AS iniciadas,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS concluidas
       FROM jp_conectada.solicitations
       WHERE tenant_id = ?
         AND deleted_at IS NULL
         AND created_at BETWEEN ? AND ?`,
      [tenantId, inicio, fim]
    );

    res.json({
      periodo,
      inicio,
      fim,
      iniciadas: totais.iniciadas || 0,
      concluidas: totais.concluidas || 0,
      taxa_resolucao:
        totais.iniciadas > 0
          ? Number((totais.concluidas / totais.iniciadas) * 100).toFixed(1)
          : "0.0"
    });

  } catch (err) {
    console.error("Erro /api/solicitacoes/resumo:", err);
    res.status(500).json({ error: "Erro ao carregar resumo" });
  }
});

/* ============================================================
   📄 SOLICITAÇÕES — TEMPO MÉDIO PRIMEIRA RESPOSTA
============================================================ */
app.get("/api/solicitacoes/primeira-resposta", async (req, res) => {
  try {
    const tenantId = TENANT_ID;

    const [rows] = await db.query(
      `SELECT 
          s.id,
          TIMESTAMPDIFF(MINUTE, s.created_at, MIN(t.created_at)) AS minutos
       FROM jp_conectada.solicitations s
       JOIN jp_conectada.tramitations t ON t.solicitation_id = s.id
       WHERE s.tenant_id = ?
         AND t.origem_user <> 'Cidadão'
       GROUP BY s.id`,
      [tenantId]
    );

    const tempos = rows.map(r => r.minutos || 0);
    const media = tempos.length
      ? tempos.reduce((a, b) => a + b, 0) / tempos.length
      : 0;

    const horas = Math.floor(media / 60);
    const minutos = Math.round(media % 60);
    const dias = Math.floor(horas / 24);

    res.json({
      dias,
      horas: horas % 24,
      minutos
    });

  } catch (err) {
    console.error("Erro /api/solicitacoes/primeira-resposta:", err);
    res.status(500).json({ error: "Erro ao calcular tempo médio" });
  }
});

/* ============================================================
   👉 FIM PARTE 3 — ABAIXO COMEÇA PARTE 4 (INDICADORES, 404, SERVER)
============================================================ */
/* ============================================================
   📈 INDICADORES — TAXA DE RESOLUÇÃO
============================================================ */
app.get("/api/indicadores/taxa-resolucao", async (req, res) => {
  try {
    const tenantId = TENANT_ID;
    const periodo = req.query.periodo || "30d";

    const { inicio, fim } = getPeriodoDates(periodo);

    const [[dados]] = await db.query(
      `SELECT
          COUNT(s.id) AS iniciadas,
          COUNT(DISTINCT t.solicitation_id) AS respondidas
       FROM jp_conectada.solicitations s
       LEFT JOIN jp_conectada.tramitations t
              ON t.solicitation_id = s.id
             AND t.origem_user <> 'Cidadão'
       WHERE s.tenant_id = ?
         AND s.deleted_at IS NULL
         AND s.created_at BETWEEN ? AND ?`,
      [tenantId, inicio, fim]
    );

    const taxa =
      dados.iniciadas > 0
        ? Number((dados.respondidas / dados.iniciadas) * 100).toFixed(1)
        : "0.0";

    res.json({
      periodo,
      inicio,
      fim,
      iniciadas: dados.iniciadas,
      respondidas: dados.respondidas,
      taxa
    });

  } catch (err) {
    console.error("Erro /api/indicadores/taxa-resolucao:", err);
    res.status(500).json({ error: "Erro ao calcular taxa de resolução" });
  }
});

/* ============================================================
   📆 RESUMO DO PERÍODO (ECONOMÔMETRO + SOLICITAÇÕES)
============================================================ */
app.get("/api/resumo-periodo", async (req, res) => {
  try {
    const tenantId = TENANT_ID;
    const ano = parseInt(req.query.ano) || new Date().getFullYear();

    const [sol] = await db.query(
      `SELECT 
          MONTH(created_at) AS mes,
          COUNT(*) AS total_solicitacoes,
          COUNT(DISTINCT citizen_id) AS pessoas_atendidas
       FROM jp_conectada.solicitations
       WHERE tenant_id = ?
         AND YEAR(created_at) = ?
         AND deleted_at IS NULL
       GROUP BY MONTH(created_at)
       ORDER BY mes ASC`,
      [tenantId, ano]
    );

    const [tram] = await db.query(
      `SELECT
          MONTH(t.created_at) AS mes,
          COUNT(*) AS total_tramitacoes
       FROM jp_conectada.tramitations t
       JOIN jp_conectada.solicitations s ON s.id = t.solicitation_id
       WHERE s.tenant_id = ?
         AND YEAR(t.created_at) = ?
       GROUP BY MONTH(t.created_at)
       ORDER BY mes ASC`,
      [tenantId, ano]
    );

    const custoPagina = 0.35;
    const custoManuseio = 0.80;

    const economia = sol.reduce((acc, item) => {
      return acc + item.total_solicitacoes * (custoPagina + custoManuseio);
    }, 0);

    res.json({
      ano,
      solicitacoes: sol,
      tramitacoes: tram,
      economia_total: Number(economia.toFixed(2))
    });

  } catch (err) {
    console.error("Erro /api/resumo-periodo:", err);
    res.status(500).json({ error: "Erro ao carregar resumo do período" });
  }
});

/* ============================================================
   📉 TENDÊNCIAS DE DEMANDA
============================================================ */
app.get("/api/tendencias/demanda", async (req, res) => {
  try {
    const tenantId = TENANT_ID;

    const [rows] = await db.query(
      `SELECT 
          DATE(created_at) AS dia,
          COUNT(*) AS total
       FROM jp_conectada.solicitations
       WHERE tenant_id = ?
       GROUP BY DATE(created_at)
       ORDER BY dia ASC`,
      [tenantId]
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /api/tendencias/demanda:", err);
    res.status(500).json({ error: "Erro ao carregar tendências" });
  }
});

/* ============================================================
   ❌ 404 — ROTA NÃO ENCONTRADA
============================================================ */
app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

/* ============================================================
   🚨 ERRO GLOBAL
============================================================ */
app.use((err, req, res, next) => {
  console.error("Erro interno:", err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

/* ============================================================
   🚀 START SERVER (RENDER + LOCAL)
============================================================ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  logger.info(`🚀 Servidor rodando na porta ${PORT}`, {
    env: process.env.NODE_ENV || "development"
  });
});
