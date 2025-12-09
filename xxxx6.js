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
   CORS
============================================================ */
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://dash-lovat-alpha.vercel.app",
  "https://dash-backend-vhh1.onrender.com",
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

const corsOptions = {
  origin(origin, callback) {
    const isDev = process.env.NODE_ENV !== "production";

    // Permite tudo em dev
    if (isDev) return callback(null, true);

    // Health checks do Render NÃO enviam origin → liberar
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS block: " + origin));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.set("trust proxy", 1);
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));

/* ============================================================
   DB
============================================================ */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

/* ============================================================
   HELPERS GERAIS
============================================================ */
function brToMySQL(dateBR) {
  if (!dateBR) return null;
  const [d, m, y] = dateBR.split("/");
  return `${y}-${m}-${d}`;
}

function getPeriodoDates(periodoRaw) {
  const periodo = String(periodoRaw || "30d");
  const agora = new Date();

  const fim = new Date();
  let inicio = new Date();

  switch (periodo) {
    case "today":
      inicio = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate(),
        0,
        0,
        0,
      );
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
    Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1,
  );

  return { inicio, fim, diasPeriodo, periodo };
}

function getStartDateFromPeriod(periodKey) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const start = new Date(now);

  switch (periodKey) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "90d":
      start.setDate(start.getDate() - 90);
      break;
    case "6m":
      start.setMonth(start.getMonth() - 6);
      break;
    case "1y":
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }

  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")} 00:00:00`;
}

function dateRangeForYear(year) {
  const start = `${year}-01-01 00:00:00`;
  const end = `${year}-12-31 23:59:59`;
  return { start, end };
}

/* Cache simples em memória */
const _cache = new Map();
async function withCache(key, ttlMs, loader) {
  const now = Date.now();
  const entry = _cache.get(key);
  if (entry && now - entry.t < ttlMs) return entry.v;
  const v = await loader();
  _cache.set(key, { v, t: now });
  return v;
}

// (essa função não está sendo usada, mas deixei como estava)
async function loadSetores() {
  try {
    const r = await fetch(`${API_BASE_URL}/solicitacoes/setores`);
    if (!r.ok) throw new Error("Erro ao carregar setores");

    const data = await r.json();
    setSetores(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error(e);
    setSetores([]);
  }
}

/* ============================================================
   Helper para formatar duração (minutos → texto)
============================================================ */
function formatDurationFromMinutes(totalMinutes) {
  const min = Math.floor(Number(totalMinutes || 0));
  if (min <= 0) return "0 minuto";

  const minutosPorDia = 60 * 24;
  const dias = Math.floor(min / minutosPorDia);
  const horas = Math.floor((min % minutosPorDia) / 60);
  const minutos = min % 60;

  const partes = [];

  if (dias > 0) {
    partes.push(`${dias} dia${dias > 1 ? "s" : ""}`);
  }

  if (horas > 0) {
    partes.push(`${horas} hora${horas > 1 ? "s" : ""}`);
  }

  if (partes.length === 0 && minutos > 0) {
    partes.push(`${minutos} minuto${minutos > 1 ? "s" : ""}`);
  }

  return partes.join(" e ");
}

/* ============================================================
   ROTA DE TESTE / HEALTHCHECK
============================================================ */
app.get("/", (req, res) => {
  res.json({ status: "OK", message: "API funcionando 🚀" });
});

/* ============================================================
   VISÃO GERAL
============================================================ */
app.get("/api/visao-geral/series", async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();

    const [serie] = await db.query(
      `
      SELECT
          MONTH(s.created_at) AS mes,
          COUNT(*) AS geradas,
          SUM(CASE WHEN status = 1 THEN 1 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE tenant_id = ?
        AND YEAR(s.created_at) = ?
      GROUP BY MONTH(s.created_at)
      ORDER BY mes
      `,
      [TENANT_ID, ano],
    );

    const [logins] = await db.query(
      `
      SELECT
          MONTH(last_login_at) AS mes,
          COUNT(*) AS logins
      FROM jp_conectada.users
      WHERE tenant_id = ?
        AND YEAR(last_login_at) = ?
      GROUP BY MONTH(last_login_at)
      ORDER BY mes
      `,
      [TENANT_ID, ano],
    );

    res.json({ ano, solicitacoes: serie, logins });
  } catch (err) {
    console.error("Erro /series:", err);
    res.status(500).json({ error: "Erro ao carregar séries" });
  }
});

app.get("/api/visao-geral/economia", async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();

    const sql = `
      SELECT
        DATE_FORMAT(created_at, '%Y-%m-01') AS mes_iso,
        COUNT(*) AS solicitacoes_mes,
        COUNT(*) * 7.0 AS economia_estimativa
      FROM jp_conectada.solicitations
      WHERE tenant_id = ?
        AND YEAR(created_at) = ?
      GROUP BY mes_iso
      ORDER BY mes_iso
    `;

    const [rows] = await db.query(sql, [TENANT_ID, ano]);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(rows);
  } catch (err) {
    console.error("Erro /economia:", err);
    res.status(500).json({ error: "Falha ao carregar economia" });
  }
});

app.get("/api/visao-geral/cidadaos-resumo", async (req, res) => {
  try {
    const sql = `
      SELECT
        SUM(CASE WHEN LOWER(gender) IN ('m','masculino') THEN 1 END) AS homens,
        SUM(CASE WHEN LOWER(gender) IN ('f','feminino') THEN 1 END) AS mulheres,
        FLOOR(AVG(TIMESTAMPDIFF(YEAR, birthday, CURDATE()))) AS idade_media
      FROM jp_conectada.citizens
      WHERE tenant_id = ?
    `;

    const [[rows]] = await db.query(sql, [TENANT_ID]);

    res.json({
      homens: rows.homens || 0,
      mulheres: rows.mulheres || 0,
      idade_media: rows.idade_media || 0,
    });
  } catch (err) {
    console.error("Erro /cidadaos-resumo:", err);
    res.status(500).json({ error: "Falha ao carregar resumo de cidadãos" });
  }
});

app.get("/api/visao-geral/evolucao-uso", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m-01') AS mes_iso,
        (
          SELECT COUNT(*)
          FROM jp_conectada.solicitations s
          WHERE s.tenant_id = ?
            AND s.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m-01')
            AND s.created_at < DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n-1 MONTH), '%Y-%m-01')
        ) AS abertas,
        (
          SELECT COUNT(*)
          FROM jp_conectada.solicitations s2
          WHERE s2.tenant_id = ?
            AND s2.status = 1
            AND s2.updated_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m-01')
            AND s2.updated_at < DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n-1 MONTH), '%Y-%m-01')
        ) AS concluidas
      FROM (
        SELECT 11 AS n UNION ALL SELECT 10 UNION ALL SELECT 9 UNION ALL SELECT 8 UNION ALL
        SELECT 7 UNION ALL SELECT 6 UNION ALL SELECT 5 UNION ALL SELECT 4 UNION ALL
        SELECT 3 UNION ALL SELECT 2 UNION ALL SELECT 1 UNION ALL SELECT 0
      ) seq
      ORDER BY DATE(mes_iso)
      `,
      [TENANT_ID, TENANT_ID],
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro evolução-uso:", err);
    res.status(500).json({ error: "Erro ao carregar evolução" });
  }
});

app.get("/api/visao-geral/contadores", async (req, res) => {
  try {
    const sql = `
      SELECT
        /* serviços cadastrados */
        (SELECT COUNT(*) FROM jp_conectada.services s 
          WHERE s.tenant_id = ? AND s.active = 1) AS total_servicos,

        /* usuários (servidores) ativos */
        (SELECT COUNT(*) FROM jp_conectada.users u 
          WHERE u.tenant_id = ? AND u.active = 1) AS total_usuarios,

        /* cidadãos */
        (SELECT COUNT(*) FROM jp_conectada.citizens c 
          WHERE c.tenant_id = ? AND c.active = 1) AS total_cidadaos,

        /* setores */
        (SELECT COUNT(*) FROM jp_conectada.sectors se 
          WHERE se.tenant_id = ? AND se.active = 1) AS total_setores,

        /* eficiência global */
        (
          SELECT 
            IFNULL((SUM(CASE WHEN s.status = 1 THEN 1 END) / NULLIF(COUNT(*),0)) * 100, 0)
          FROM jp_conectada.solicitations s
          WHERE s.tenant_id = ?
        ) AS eficiencia_pct,

        /* qualidade média (exemplo) */
        (
          SELECT IFNULL(AVG(r.score), 0)
          FROM jp_conectada.ratings r
          WHERE r.tenant_id = ?
        ) AS qualidade_media
    `;

    const params = [TENANT_ID, TENANT_ID, TENANT_ID, TENANT_ID, TENANT_ID, TENANT_ID];
    const [rows] = await db.query(sql, params);

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(rows[0] || {});
  } catch (err) {
    console.error("KPIs erro:", err);
    res.status(500).json({ error: "Falha ao carregar contadores" });
  }
});

/* ============================================================
   RESUMO PERÍODO (ECONOMIA / NOTIFICAÇÕES / TRAMITAÇÕES)
============================================================ */
app.get("/api/resumo-periodo", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano) || new Date().getFullYear();
    const custoPagina = 0.35;

    const [rows] = await db.query(
      `
      WITH RECURSIVE meses AS (
          SELECT 1 AS mes
          UNION ALL SELECT mes + 1 FROM meses WHERE mes < 12
      ),

      sol AS (
          SELECT 
              MONTH(created_at) AS mes,
              COUNT(*) AS total_solicitacoes,
              COUNT(DISTINCT citizen_id) AS pessoas_atendidas
          FROM solicitations
          WHERE tenant_id = 1
            AND YEAR(created_at) = ?
            AND deleted_at IS NULL
          GROUP BY MONTH(created_at)
      ),

      tram AS (
          SELECT
              MONTH(t.created_at) AS mes,
              COUNT(*) AS total_tramitacoes
          FROM tramitations t
          JOIN solicitations s ON s.id = t.solicitation_id
          WHERE s.tenant_id = 1
            AND YEAR(t.created_at) = ?
          GROUP BY MONTH(t.created_at)
      ),

      notif AS (
          SELECT 
              MONTH(created_at) AS mes,
              COUNT(*) AS total_notificacoes
          FROM notifications
          WHERE tenant_id = 1
            AND YEAR(created_at) = ?
          GROUP BY MONTH(created_at)
      )

      SELECT
          m.mes,
          DATE_FORMAT(STR_TO_DATE(CONCAT(?, '-', m.mes, '-01'), '%Y-%m-%d'), '%b') AS mes_nome,

          COALESCE(sol.total_solicitacoes, 0) AS total_solicitacoes,
          COALESCE(sol.pessoas_atendidas, 0) AS pessoas_atendidas,
          COALESCE(tram.total_tramitacoes, 0) AS total_tramitacoes,
          COALESCE(notif.total_notificacoes, 0) AS total_notificacoes,

          (
            (COALESCE(sol.total_solicitacoes, 0) * 0.65) +
            (COALESCE(tram.total_tramitacoes, 0) * 0.20)
          ) AS folhas_economizadas,

          (
            (
              (COALESCE(sol.total_solicitacoes, 0) * 0.65) +
              (COALESCE(tram.total_tramitacoes, 0) * 0.20)
            ) * ?
          ) AS economia_gerada

      FROM meses m
      LEFT JOIN sol   ON sol.mes   = m.mes
      LEFT JOIN tram  ON tram.mes  = m.mes
      LEFT JOIN notif ON notif.mes = m.mes
      ORDER BY m.mes;
      `,
      [ano, ano, ano, ano, custoPagina],
    );

    const mesAtual = new Date().getMonth() + 1;

    const totalEconomia = rows
      .filter((r) => r.mes <= mesAtual)
      .reduce((sum, r) => sum + Number(r.economia_gerada || 0), 0);

    const totalFolhas = rows
      .filter((r) => r.mes <= mesAtual)
      .reduce((sum, r) => sum + Number(r.folhas_economizadas || 0), 0);

    const totalArvores = totalFolhas / 8000;

    res.json({
      ano,
      meses: rows,
      total: {
        folhas: Math.round(totalFolhas),
        arvores: Number(totalArvores.toFixed(3)),
        dinheiro: Number(totalEconomia.toFixed(2)),
        custo_pagina_usado: custoPagina,
      },
    });
  } catch (err) {
    console.error("Erro resumo período:", err);
    res.status(500).json({ error: "Erro ao buscar dados" });
  }
});

/* ============================================================
   SETORES
============================================================ */
app.get("/api/setores", async (req, res) => {
  try {
    const [rows] = await db.query(`
      WITH RECURSIVE setores_hierarquia AS (
        SELECT
          id AS sector_id,
          parent_id,
          title,
          0 AS nivel,
          CAST(id AS CHAR(500)) AS path,
          CAST(title AS CHAR(500)) AS hierarquia,
          id AS root_id
        FROM jp_conectada.sectors
        WHERE active = 1
          AND tenant_id = 1
          AND parent_id IS NULL

        UNION ALL

        SELECT
          s.id AS sector_id,
          s.parent_id,
          s.title,
          sh.nivel + 1 AS nivel,
          CONCAT(sh.path, ',', s.id) AS path,
          CONCAT(sh.hierarquia, ' > ', s.title) AS hierarquia,
          sh.root_id
        FROM jp_conectada.sectors s
        JOIN setores_hierarquia sh ON sh.sector_id = s.parent_id
        WHERE s.active = 1
          AND s.tenant_id = 1
      ),

      setores_unicos AS (
        SELECT *
        FROM (
          SELECT *,
                ROW_NUMBER() OVER (PARTITION BY sector_id ORDER BY nivel) AS rn
          FROM setores_hierarquia
        ) x
        WHERE rn = 1
      ),

      servicos_individuais AS (
        SELECT
          s.id AS sector_id,
          COUNT(DISTINCT CASE WHEN ss.\`primary\` = 1 THEN ss.service_id END) AS principal_individual,
          COUNT(DISTINCT CASE WHEN ss.\`primary\` = 0 THEN ss.service_id END) AS participante_individual
        FROM jp_conectada.sectors s
        LEFT JOIN jp_conectada.service_sector ss ON ss.sector_id = s.id
        LEFT JOIN jp_conectada.services se 
              ON se.id = ss.service_id
              AND se.active = 1
              AND se.tenant_id = 1
        WHERE s.active = 1
          AND s.tenant_id = 1
        GROUP BY s.id
      ),

      consolidados AS (
        SELECT
          root.root_id,
          SUM(si.principal_individual)    AS principal_consolidado,
          SUM(si.participante_individual) AS participante_consolidado
        FROM setores_unicos root
        JOIN setores_unicos child 
          ON FIND_IN_SET(root.sector_id, child.path) > 0
        JOIN servicos_individuais si 
          ON si.sector_id = child.sector_id
        WHERE root.nivel = 0
        GROUP BY root.root_id
      )

      SELECT
        su.sector_id,
        su.title AS setor,
        su.parent_id,
        su.nivel,
        su.hierarquia,
        si.principal_individual AS servicos_principal_individual,
        si.participante_individual AS servicos_participante_individual,
        CASE WHEN su.nivel = 0 
            THEN cn.principal_consolidado ELSE 0 END AS servicos_principal_consolidado,
        CASE WHEN su.nivel = 0 
            THEN cn.participante_consolidado ELSE 0 END AS servicos_participante_consolidado,
        su.path
      FROM setores_unicos su
      LEFT JOIN servicos_individuais si ON si.sector_id = su.sector_id
      LEFT JOIN consolidados cn ON cn.root_id = su.root_id
      ORDER BY su.path;
    `);

    res.json(rows);
  } catch (error) {
    console.error("Erro SQL:", error);
    res.status(500).json({ error: "Erro ao buscar setores" });
  }
});

app.get("/api/setores-usuarios-resumo", async (req, res) => {
  try {
    const sql = `
      SELECT
        s.title AS setor,
        COUNT(DISTINCT su.user_id) AS total_usuarios
      FROM jp_conectada.sector_user su
      JOIN jp_conectada.sectors s ON s.id = su.sector_id
      JOIN jp_conectada.users u ON u.id = su.user_id
      WHERE su.active = 1
        AND u.active = 1
        AND u.tenant_id = ?
      GROUP BY s.id
      ORDER BY total_usuarios DESC
      LIMIT 10
    `;

    const [rows] = await db.query(sql, [TENANT_ID]);
    res.json(rows);
  } catch (error) {
    console.error("Erro /setores-usuarios-resumo:", error);
    res.status(500).json({ error: "Erro ao carregar resumo" });
  }
});

app.get("/api/setores/:id/usuarios", async (req, res) => {
  try {
    const setorId = Number(req.params.id);

    const sql = `
      SELECT
        u.id AS user_id,
        CONCAT(u.first_name, " ", u.last_name) AS nome,
        u.email,
        u.phone,
        su.active AS ativo_no_setor
      FROM jp_conectada.sector_user su
      JOIN jp_conectada.users u ON u.id = su.user_id
      WHERE su.sector_id = ?
      ORDER BY nome
    `;

    const [rows] = await db.query(sql, [setorId]);
    res.json(rows);
  } catch (error) {
    console.error("Erro /setores/:id/usuarios:", error);
    res.status(500).json({ error: "Erro ao buscar usuários do setor" });
  }
});

app.get("/api/setores-eficiencia", async (req, res) => {
  try {
    const [rows] = await db.query(`
      WITH servicos_por_setor AS (
          SELECT 
              ss.sector_id,
              s.id AS solicitation_id,
              s.status
          FROM jp_conectada.service_sector ss
          JOIN jp_conectada.services se 
                ON se.id = ss.service_id
              AND se.tenant_id = 1
          JOIN jp_conectada.solicitations s 
                ON s.service_id = ss.service_id
              AND s.tenant_id = 1
      ),

      agrupado AS (
          SELECT 
              sector_id,
              COUNT(*) AS total_solicitacoes,
              COUNT(CASE WHEN status = 0 THEN 1 END) AS total_abertas,
              COUNT(CASE WHEN status = 1 THEN 1 END) AS total_concluidas,
              COUNT(CASE WHEN status = 2 THEN 1 END) AS total_respondidas
          FROM servicos_por_setor
          GROUP BY sector_id
      )

      SELECT
          sec.id AS sector_id,
          sec.title AS setor,
          a.total_solicitacoes,
          a.total_abertas,
          a.total_concluidas,
          a.total_respondidas,

          CASE WHEN a.total_solicitacoes > 0
              THEN ROUND((a.total_concluidas / a.total_solicitacoes) * 100, 2)
              ELSE NULL END AS eficiencia_percentual,

          CASE WHEN a.total_solicitacoes > 0
              THEN ROUND((a.total_respondidas / a.total_solicitacoes) * 100, 2)
              ELSE NULL END AS engajamento_percentual

      FROM jp_conectada.sectors sec
      LEFT JOIN agrupado a ON a.sector_id = sec.id
      WHERE sec.active = 1
        AND sec.tenant_id = 1
      ORDER BY setor;
    `);

    res.json(rows);
  } catch (error) {
    console.error("Erro SQL EFICIENCIA:", error);
    res.status(500).json({ error: "Erro ao buscar eficiência por setor" });
  }
});

app.get("/api/setores-qualidade", async (req, res) => {
  try {
    const [rows] = await db.query(`
      WITH notas_por_servico AS (
          SELECT
              a.evaluated_id AS service_id,
              a.score AS nota,
              a.total_votes
          FROM jp_conectada.averages a
          WHERE a.tenant_id = 1
            AND a.evaluated_type = 'App\\\\Models\\\\Service\\\\Service'
      ),

      notas_por_setor AS (
          SELECT
              ss.sector_id,
              AVG(nps.nota) AS nota_media,
              SUM(nps.total_votes) AS total_avaliacoes
          FROM jp_conectada.service_sector ss
          LEFT JOIN notas_por_servico nps 
                  ON nps.service_id = ss.service_id
          GROUP BY ss.sector_id
      )

      SELECT
          sec.id AS sector_id,
          sec.title AS setor,
          nps.nota_media,
          nps.total_avaliacoes
      FROM jp_conectada.sectors sec
      LEFT JOIN notas_por_setor nps ON nps.sector_id = sec.id
      WHERE sec.active = 1
        AND sec.tenant_id = 1
      ORDER BY setor;
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro SQL SETORES QUALIDADE:", err);
    res.status(500).json({ error: "Erro ao carregar qualidade dos setores" });
  }
});

app.get("/api/setores-consolidado", async (req, res) => {
  try {
    const sql = `
      SELECT
        s.id,
        s.title AS setor,
        COUNT(sol.id) AS total_solicitacoes,
        SUM(CASE WHEN sol.status = 1 THEN 1 END) AS concluidas,
        COUNT(DISTINCT su.user_id) AS total_usuarios
      FROM jp_conectada.sectors s
      LEFT JOIN jp_conectada.solicitations sol
            ON sol.sector_id = s.id
      LEFT JOIN jp_conectada.sector_user su
            ON su.sector_id = s.id
      WHERE s.tenant_id = ?
      GROUP BY s.id
      ORDER BY s.title
    `;

    const [rows] = await db.query(sql, [TENANT_ID]);

    res.json(rows);
  } catch (err) {
    console.error("Erro /setores-consolidado:", err);
    res.status(500).json({ error: "Erro ao carregar consolidado" });
  }
});

/* ============================================================
   USUÁRIOS
============================================================ */
app.get("/api/usuarios/lista", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);

    const sql = `
      SELECT 
        u.id,
        CONCAT(u.first_name, ' ', u.last_name) AS nome,
        u.email,
        u.phone,
        u.created_at,
        u.last_login_at,
        (
          SELECT MAX(t.created_at)
          FROM tramitations t
          JOIN solicitations s ON s.id = t.solicitation_id
          WHERE t.origem_user = CONCAT(u.first_name, ' ', u.last_name)
            AND s.tenant_id = 1
        ) AS ultimo_despacho
      FROM users u
      WHERE u.tenant_id = 1
        AND u.active = 1
      ORDER BY u.first_name, u.last_name
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.query(sql, [limit, offset]);

    res.json(rows);
  } catch (err) {
    console.error("Erro paginado:", err);
    res.status(500).json({ error: true });
  }
});
