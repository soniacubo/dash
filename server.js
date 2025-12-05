const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();
const app = express();
const TENANT_ID = 1;

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://dash-lovat-alpha.vercel.app",
  "https://dash-backend-vhh1.onrender.com",
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
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
  credentials: true
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.set("trust proxy", 1);
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));


const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

 //  🔥 ROTA DE TESTE (AGORA EXISTE)
app.get("/", (req, res) => {
  res.json({ status: "OK", message: "API funcionando 🚀" });
});

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
function dateRangeForYear(year) {
  const start = `${year}-01-01 00:00:00`;
  const end = `${year}-12-31 23:59:59`;
  return { start, end };
}
const _cache = new Map();
async function withCache(key, ttlMs, loader) {
  const now = Date.now();
  const entry = _cache.get(key);
  if (entry && (now - entry.t) < ttlMs) return entry.v;
  const v = await loader();
  _cache.set(key, { v, t: now });
  return v;
}

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
      [TENANT_ID, ano]
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
      [TENANT_ID, ano]
    );

    res.json({ ano, solicitacoes: serie, logins });

  } catch (err) {
    console.error("Erro /series:", err);
    res.status(500).json({ error: "Erro ao carregar séries" });
  }
});

// app.get("/api/visao-geral/evolucao-uso", async (req, res) => {
//   try {
//     const sql = `
//       SELECT
//         DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m-01') AS mes_iso,

//         (
//           SELECT COUNT(*)
//           FROM jp_conectada.solicitations s
//           WHERE tenant_id = ?
//             AND s.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m-01')
//             AND s.created_at <  DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n-1 MONTH), '%Y-%m-01')
//         ) AS abertas,

//         (
//           SELECT COUNT(*)
//           FROM jp_conectada.solicitations s2
//           WHERE s2.tenant_id = ?
//             AND s2.status = 1
//             AND s2.updated_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m-01')
//             AND s2.updated_at <  DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n-1 MONTH), '%Y-%m-01')
//         ) AS concluidas

//       FROM (
//         SELECT 11 AS n UNION ALL SELECT 10 UNION ALL SELECT 9 UNION ALL SELECT 8 UNION ALL
//         SELECT 7 UNION ALL SELECT 6 UNION ALL SELECT 5 UNION ALL SELECT 4 UNION ALL
//         SELECT 3 UNION ALL SELECT 2 UNION ALL SELECT 1 UNION ALL SELECT 0
//       ) seq
//       ORDER BY mes_iso
//     `;

//     const [rows] = await db.query(sql, [TENANT_ID, TENANT_ID]);
//     res.json(rows);

//   } catch (err) {
//     console.error("Erro /evolucao-uso:", err);
//     res.status(500).json({ error: "Falha ao carregar evolução de uso" });
//   }
// });


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
      idade_media: rows.idade_media || 0
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
      [TENANT_ID, TENANT_ID]
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
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(rows[0] || {});

  } catch (err) {
    console.error("KPIs erro:", err);
    res.status(500).json({ error: "Falha ao carregar contadores" });
  }
});

app.get("/api/resumo-periodo", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano) || new Date().getFullYear();

    // mesmo custo usado no economômetro
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

          -- ✅ folhas economizadas — MESMO cálculo do economômetro
          (
            (COALESCE(sol.total_solicitacoes, 0) * 0.65) +
            (COALESCE(tram.total_tramitacoes, 0) * 0.20)
          ) AS folhas_economizadas,

          -- ✅ economia financeira
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
      [ano, ano, ano, ano, custoPagina]
    );

    const mesAtual = new Date().getMonth() + 1;

    const totalEconomia = rows
      .filter(r => r.mes <= mesAtual)
      .reduce((sum, r) => sum + Number(r.economia_gerada || 0), 0);

    const totalFolhas = rows
      .filter(r => r.mes <= mesAtual)
      .reduce((sum, r) => sum + Number(r.folhas_economizadas || 0), 0);

    const totalArvores = totalFolhas / 8000;

    res.json({
      ano,
      meses: rows,
      total: {
        folhas: Math.round(totalFolhas),
        arvores: Number(totalArvores.toFixed(3)),
        dinheiro: Number(totalEconomia.toFixed(2)),
        custo_pagina_usado: custoPagina
      }
    });

  } catch (err) {
    console.error("Erro resumo período:", err);
    res.status(500).json({ error: "Erro ao buscar dados" });
  }
});

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

        (SELECT MAX(t.created_at)
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

app.get("/api/usuarios/kpis", async (req, res) => {
  try {
    const hoje = new Date();
    const inicio30 = new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000);

    const inicio30_str = inicio30.toISOString().slice(0, 10);
    const fim_str = hoje.toISOString().slice(0, 10);

    /* 1) Total de servidores ativos */
    const [[totalServidores]] = await db.query(
      `SELECT COUNT(*) AS total
         FROM jp_conectada.users
        WHERE tenant_id = ?
          AND active = 1
          AND email NOT LIKE '%@cubotecnologiabr.com.br%'`,
      [TENANT_ID]
    );

    /* 2) Despacharam nas últimas 24h */
    const [[desp24]] = await db.query(
      `
      SELECT COUNT(DISTINCT t.origem_user) AS total
        FROM jp_conectada.tramitations t
        JOIN jp_conectada.solicitations s ON s.id = t.solicitation_id
       WHERE s.tenant_id = ?
         AND t.created_at >= NOW() - INTERVAL 24 HOUR
      `,
      [TENANT_ID]
    );

    /* 3) Sem despachar há +30 dias (ou nunca despacharam) */
    const [[semDesp30]] = await db.query(
      `
      WITH ultimos AS (
        SELECT
            u.id,
            CONCAT(u.first_name, ' ', u.last_name) AS nome,
            (
              SELECT MAX(t.created_at)
                FROM jp_conectada.tramitations t
                JOIN jp_conectada.solicitations s2 ON s2.id = t.solicitation_id
               WHERE s2.tenant_id = ?
                 AND t.origem_user = CONCAT(u.first_name, ' ', u.last_name)
            ) AS ultimo
        FROM jp_conectada.users u
        WHERE u.tenant_id = ?
          AND u.active = 1
          AND u.email NOT LIKE '%@cubotecnologiabr.com.br%'
      )
      SELECT COUNT(*) AS total
        FROM ultimos
       WHERE ultimo IS NULL
          OR ultimo < (NOW() - INTERVAL 30 DAY)
      `,
      [TENANT_ID, TENANT_ID]
    );

    /* 4) Criados nos últimos 30 dias */
    const [[criados30]] = await db.query(
      `
      SELECT COUNT(*) AS total
        FROM jp_conectada.users
       WHERE tenant_id = ?
         AND active = 1
         AND email NOT LIKE '%@cubotecnologiabr.com.br%'
         AND DATE(created_at) BETWEEN ? AND ?
      `,
      [TENANT_ID, inicio30_str, fim_str]
    );

    res.json({
      total_servidores: totalServidores.total,
      despacharam_24h: desp24.total,
      sem_despachar_30d: semDesp30.total,
      criados_30d: criados30.total
    });

  } catch (err) {
    console.error("Erro /usuarios/kpis:", err);
    res.status(500).json({ error: true });
  }
});

app.get("/api/usuarios/login-distribuicao", async (req, res) => {
  try {
    const [[r]] = await db.query(
      `
      SELECT
        COUNT(*) AS totalUsuarios,
        SUM(CASE WHEN last_login_at >= CURDATE() THEN 1 END) AS loginHoje,
        SUM(CASE WHEN last_login_at >= CURDATE() - INTERVAL 1 DAY
                   AND last_login_at < CURDATE()
            THEN 1 END) AS loginOntem,
        SUM(CASE WHEN last_login_at >= NOW() - INTERVAL 7 DAY THEN 1 END) AS loginUltimos7,
        SUM(CASE WHEN last_login_at >= NOW() - INTERVAL 15 DAY
                   AND last_login_at < NOW() - INTERVAL 7 DAY
            THEN 1 END) AS login7a15,
        SUM(CASE WHEN last_login_at >= NOW() - INTERVAL 30 DAY
                   AND last_login_at < NOW() - INTERVAL 15 DAY
            THEN 1 END) AS login15a30,
        SUM(CASE WHEN last_login_at < NOW() - INTERVAL 30 DAY THEN 1 END) AS loginMais30,
        SUM(CASE WHEN last_login_at IS NULL THEN 1 END) AS nuncaLogou
      FROM jp_conectada.users
      WHERE tenant_id = ?
        AND active = 1
        AND email NOT LIKE '%@cubotecnologiabr.com.br%'
      `,
      [TENANT_ID]
    );

    res.json(r);

  } catch (err) {
    console.error("Erro /usuarios/login-distribuicao:", err);
    res.status(500).json({ error: true });
  }
});

app.get("/api/usuarios/ranking", async (req, res) => {
  try {
    const { inicio, fim } = req.query;

    const [rows] = await db.query(
      `
      SELECT
        t.origem_user AS nome,
        COUNT(*) AS total
      FROM jp_conectada.tramitations t
      JOIN jp_conectada.solicitations s ON s.id = t.solicitation_id
      WHERE s.tenant_id = ?
        AND t.created_at BETWEEN ? AND ?
      GROUP BY t.origem_user
      ORDER BY total DESC
      LIMIT 10
      `,
      [TENANT_ID, `${inicio} 00:00:00`, `${fim} 23:59:59`]
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /usuarios/ranking:", err);
    res.status(500).json({ error: true });
  }
});

app.get("/api/usuarios/detalhes", async (req, res) => {
  try {
    const inicio = req.query.inicio || null;
    const fim = req.query.fim || null;

    let filtroPeriodo = "";
    const params = [];

    // validação
    if (inicio && fim) {
      filtroPeriodo = ` AND t.created_at BETWEEN ? AND ? `;
      params.push(`${inicio} 00:00:00`);
      params.push(`${fim} 23:59:59`);
    }

    const [rows] = await db.query(
      `
WITH usuario_setor AS (
    SELECT DISTINCT 
        su.user_id,
        s.title AS setor_nome,
        (
          SELECT GROUP_CONCAT(s2.title SEPARATOR ', ')
          FROM sector_user su2
          JOIN sectors s2 ON s2.id = su2.sector_id
          WHERE su2.user_id = su.user_id AND su2.active = 1
        ) AS setores_filhos
    FROM sector_user su
    LEFT JOIN sectors s ON s.id = su.sector_id
    WHERE su.active = 1
),

ultimos_despachos AS (
    SELECT 
        t.origem_user AS nome_usuario,
        MAX(t.created_at) AS ultimo_despacho
    FROM tramitations t
    JOIN solicitations s ON s.id = t.solicitation_id
    WHERE s.tenant_id = 1 AND s.deleted_at IS NULL
    GROUP BY t.origem_user
),

despachos_periodo AS (
    SELECT
        t.origem_user AS nome_usuario,
        COUNT(*) AS total_despachos_periodo
    FROM tramitations t
    JOIN solicitations s ON s.id = t.solicitation_id
    WHERE s.tenant_id = 1
      AND s.deleted_at IS NULL
      ${filtroPeriodo}
    GROUP BY t.origem_user
)

SELECT
    u.id,
    CONCAT(u.first_name, ' ', u.last_name) AS nome,
    us.setor_nome AS secretaria,
    us.setores_filhos AS departamentos,
    u.phone,
    u.email,
    u.created_at AS data_cadastro,
    ud.ultimo_despacho,
    CASE 
        WHEN ud.ultimo_despacho IS NULL THEN NULL
        ELSE DATEDIFF(CURDATE(), DATE(ud.ultimo_despacho))
    END AS dias_sem_despacho,
    COALESCE(dp.total_despachos_periodo, 0) AS despachos_periodo

FROM users u
LEFT JOIN usuario_setor us ON us.user_id = u.id
LEFT JOIN ultimos_despachos ud ON ud.nome_usuario = CONCAT(u.first_name, ' ', u.last_name)
LEFT JOIN despachos_periodo dp ON dp.nome_usuario = CONCAT(u.first_name, ' ', u.last_name)

WHERE 
    u.tenant_id = 1
    AND u.active = 1

GROUP BY
    u.id,
    nome,
    us.setor_nome,
    us.setores_filhos,
    u.phone,
    u.email,
    u.created_at,
    ud.ultimo_despacho,
    dp.total_despachos_periodo

ORDER BY ud.ultimo_despacho DESC
      `,
      params
    );

    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao gerar relatório de usuários" });
  }
});

app.get("/api/solicitacoes/resumo", async (req, res) => {
  try {
    let { inicio, fim, setor, servico } = req.query;

    let where = `s.tenant_id = 1 AND s.deleted_at IS NULL`;
    const params = [];

    // Período
    if (inicio && fim) {
      where += " AND DATE(s.created_at) BETWEEN ? AND ?";
      params.push(inicio, fim);
    }

    // Filtrar setor
    if (setor) {
      where += `
        AND EXISTS (
          SELECT 1 
            FROM jp_conectada.service_sector ss 
           WHERE ss.service_id = s.service_id
             AND ss.sector_id = ?
        )`;
      params.push(setor);
    }

    // Filtrar serviço
    if (servico) {
      where += " AND s.service_id = ?";
      params.push(servico);
    }

    const [rows] = await db.query(
      `
   SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN s.status = 0 THEN 1 ELSE 0 END) AS iniciadas,
        SUM(CASE WHEN s.status = 2 THEN 1 ELSE 0 END) AS espera,
        SUM(CASE WHEN s.status = 3 THEN 1 ELSE 0 END) AS respondidas,
        -- Concluídas + Transferidas (status 1 e 4)
        SUM(CASE WHEN s.status IN (1,4) THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      `,
      params
    );

    res.json(rows[0]);

  } catch (err) {
    console.error("Erro /solicitacoes/resumo:", err);
    res.status(500).json({ error: "Erro ao buscar resumo" });
  }
});

app.get("/api/solicitacoes/resumo", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req);

    const [rows] = await db.execute(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN s.status = 0 THEN 1 ELSE 0 END) AS iniciadas,
        SUM(CASE WHEN s.status = 2 THEN 1 ELSE 0 END) AS espera,
        SUM(CASE WHEN s.status = 3 THEN 1 ELSE 0 END) AS respondidas,
        SUM(CASE WHEN s.status = 1 THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
    `,
      params
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro no resumo:", err);
    res.status(500).json({ error: "Erro ao carregar resumo" });
  }
});


app.get("/api/solicitacoes/setores", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        s.id AS sector_id,
        s.title AS name,

        -- serviços primários vinculados ao setor
        (
          SELECT COUNT(*)
          FROM jp_conectada.service_sector ss
          WHERE ss.sector_id = s.id
            AND ss.primary = 1
        ) AS total_servicos,

        -- solicitações associadas ao setor (via serviço primário)
        (
          SELECT COUNT(*)
          FROM jp_conectada.solicitations sol
          JOIN jp_conectada.service_sector ss2 
               ON ss2.service_id = sol.service_id
              AND ss2.primary = 1
          WHERE ss2.sector_id = s.id
            AND sol.tenant_id = 1
            AND sol.deleted_at IS NULL
        ) AS total_solicitacoes

      FROM jp_conectada.sectors s
      WHERE s.tenant_id = 1
        AND s.active = 1
      ORDER BY s.title
    `);

    // Filtra setores inválidos no backend (rápido e evita lógica extra no front)
    const filtrados = rows.filter(
      r => (r.total_servicos ?? 0) > 0 || (r.total_solicitacoes ?? 0) > 0
    );

    res.json(filtrados);

  } catch (err) {
    console.error("Erro ao carregar setores filtrados:", err);
    res.status(500).json({ error: "Erro ao carregar setores" });
  }
});

app.get("/api/solicitacoes/setores-filtrados", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().toLowerCase().trim();

    /* -----------------------------------------------
       1) Buscar setores que têm serviços primários
    ----------------------------------------------- */
    const [setoresServicos] = await db.query(
      `
      SELECT DISTINCT 
        s.id AS sector_id,
        s.title AS name
      FROM jp_conectada.sectors s
      JOIN jp_conectada.service_sector ss 
           ON ss.sector_id = s.id 
          AND ss.primary = 1
      JOIN jp_conectada.services sv 
           ON sv.id = ss.service_id 
          AND sv.active = 1
      WHERE s.tenant_id = 1
        AND s.active = 1
      ORDER BY s.title
      `
    );

    /* -----------------------------------------------
       2) Buscar setores que têm solicitações ativas
    ----------------------------------------------- */
    const [setoresSolicitacoes] = await db.query(
      `
      SELECT DISTINCT 
        s.id AS sector_id,
        s.title AS name
      FROM jp_conectada.solicitations sol
      JOIN jp_conectada.service_sector ss 
           ON ss.service_id = sol.service_id 
          AND ss.primary = 1
      JOIN jp_conectada.sectors s 
           ON s.id = ss.sector_id
      WHERE sol.tenant_id = 1
        AND sol.deleted_at IS NULL
        AND s.active = 1
      ORDER BY s.title
      `
    );

    /* -----------------------------------------------
       3) Unificar e remover duplicados
    ----------------------------------------------- */
    const mapa = new Map();

    [...setoresServicos, ...setoresSolicitacoes].forEach(s => {
      mapa.set(s.sector_id, s);
    });

    let listaFinal = Array.from(mapa.values());

    /* -----------------------------------------------
       4) Aplicar filtro de texto (opcional)
    ----------------------------------------------- */
    if (q.length > 0) {
      listaFinal = listaFinal.filter(s =>
        s.name.toLowerCase().includes(q)
      );
    }

    res.json(listaFinal);

  } catch (err) {
    console.error("Erro /solicitacoes/setores-filtrados:", err);
    res.status(500).json({ error: "Erro ao buscar setores filtrados" });
  }
});

app.get("/api/solicitacoes/lista-paginada", async (req, res) => {
  try {
    const {
      offset = 0,
      limit = 50,
      setor = "",
      servico = "",
      inicio = "",
      fim = ""
    } = req.query;

    const params = [];
    let where = `
      s.tenant_id = 1
      AND s.deleted_at IS NULL
    `;

    // Período
    if (inicio && fim) {
      where += ` AND DATE(s.created_at) BETWEEN ? AND ?`;
      params.push(inicio, fim);
    }

    // Filtro por setor (considera serviço primário)
    if (setor) {
      where += `
        AND EXISTS (
          SELECT 1
          FROM jp_conectada.service_sector ss
          WHERE ss.service_id = s.service_id
            AND ss.sector_id = ?
            AND ss.primary = 1
        )
      `;
      params.push(setor);
    }

    // Filtro por serviço
    if (servico) {
      where += ` AND s.service_id = ?`;
      params.push(servico);
    }

    // Consulta paginada
    const [rows] = await db.execute(
      `
      SELECT
        s.id,
        s.created_at,
        s.protocol,
        s.status,
        s.citizen_name AS cidadao,

        sv.name AS servico,

        sec.title AS setor,
        sec.id AS sector_id

      FROM jp_conectada.solicitations s
      LEFT JOIN jp_conectada.services sv ON sv.id = s.service_id
      LEFT JOIN jp_conectada.service_sector ss2 
             ON ss2.service_id = s.service_id 
            AND ss2.primary = 1
      LEFT JOIN jp_conectada.sectors sec ON sec.id = ss2.sector_id

      WHERE ${where}

      ORDER BY s.created_at DESC
      LIMIT ?, ?
      `,
      [...params, Number(offset), Number(limit)]
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro ao carregar lista paginada:", err);
    res.status(500).json({ error: "Erro ao carregar lista paginada" });
  }
});

app.get("/api/solicitacoes/servicos", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT id AS service_id, title as name
      FROM jp_conectada.services
      WHERE tenant_id = 1
      and active =  1 
      ORDER BY title
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro ao carregar serviços:", err);
    res.status(500).json({ error: "Erro ao carregar serviços" });
  }
});

function buildSolicitacoesWhere(req) {
  let where = `s.tenant_id = 1 AND s.deleted_at IS NULL`;
  const params = [];
  const { inicio, fim, setor, servico } = req.query;

  if (inicio && fim) {
    where += " AND DATE(s.created_at) BETWEEN ? AND ?";
    params.push(inicio, fim);
  }

  if (setor) {
    where += `
      AND EXISTS (
        SELECT 1 FROM jp_conectada.service_sector ss
        WHERE ss.service_id = s.service_id AND ss.sector_id = ?
      )
    `;
    params.push(setor);
  }

  if (servico) {
    where += " AND s.service_id = ?";
    params.push(servico);
  }

  return { where, params };
}

app.get("/api/solicitacoes/lista", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req);

    const [rows] = await db.execute(
      `
      SELECT
        s.id,
        s.created_at,
        s.protocol,
        s.status,
        c.name AS cidadao,
        sv.name AS servico,
        sec.name AS setor,
        sec.id AS sector_id
      FROM jp_conectada.solicitations s
      LEFT JOIN jp_conectada.citizens c ON c.id = s.citizen_id
      LEFT JOIN jp_conectada.services sv ON sv.id = s.service_id
      LEFT JOIN jp_conectada.service_sector ss ON ss.service_id = s.service_id
      LEFT JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      WHERE ${where}
      ORDER BY s.created_at DESC
    `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro lista de solicitações:", err);
    res.status(500).json({ error: "Erro ao carregar lista" });
  }
});

app.get("/api/solicitacoes/evolucao", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req);

    const [rows] = await db.execute(
      `
        SELECT 
        DATE(s.created_at) AS data_ref,
        COUNT(*) AS abertas,
        -- Concluídas + Transferidas (status 1 e 4)
        SUM(CASE WHEN s.status IN (1,4) THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      GROUP BY DATE(s.created_at)
      ORDER BY DATE(s.created_at)

    `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro evolução solicitações:", err);
    res.status(500).json({ error: "Erro ao carregar evolução" });
  }
});

app.get("/api/solicitacoes/setores", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        id AS sector_id,
        title AS name
      FROM jp_conectada.sectors
      WHERE tenant_id = 1
      ORDER BY title
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro ao carregar setores:", err);
    res.status(500).json({ error: "Erro ao carregar setores" });
  }
});

app.get("/api/solicitacoes/servicos", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        id AS service_id,
        title AS name
      FROM jp_conectada.services
      WHERE tenant_id = 1
      AND ACTIVE = 1 
      ORDER BY title
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro ao carregar serviços:", err);
    res.status(500).json({ error: "Erro ao carregar serviçosxxxx" });
  }
});


function buildSolicitacoesWhere(req) {
  let where = `s.tenant_id = 1 AND s.deleted_at IS NULL`;
  const params = [];
  const { inicio, fim, setor, servico } = req.query;

  if (inicio && fim) {
    where += " AND DATE(s.created_at) BETWEEN ? AND ?";
    params.push(inicio, fim);
  }

  if (setor) {
    where += `
      AND EXISTS (
        SELECT 1 FROM jp_conectada.service_sector ss
        WHERE ss.service_id = s.service_id AND ss.sector_id = ?
      )
    `;
    params.push(setor);
  }

  if (servico) {
    where += " AND s.service_id = ?";
    params.push(servico);
  }

  return { where, params };
}


//
// 4) RESUMO DAS SOLICITAÇÕES
//


/* ============================================================
   🔧 HELPER — WHERE unificado para TODAS as rotas
============================================================ */
function buildSolicitacoesWhere(req) {
  let where = `s.tenant_id = 1 AND s.deleted_at IS NULL`;
  const params = [];
  const { inicio, fim, setor, servico } = req.query;

  // Período
  if (inicio && fim) {
    where += " AND DATE(s.created_at) BETWEEN ? AND ?";
    params.push(inicio, fim);
  }

  // Setor (qualquer serviço vinculado ao setor)
  if (setor) {
    where += `
      AND EXISTS (
        SELECT 1 FROM jp_conectada.service_sector ss
        WHERE ss.service_id = s.service_id
          AND ss.sector_id = ?
      )
    `;
    params.push(setor);
  }

  // Serviço
  if (servico) {
    where += " AND s.service_id = ?";
    params.push(servico);
  }

  return { where, params };
}

/* ============================================================
   1) RESUMO (KPIs)
============================================================ */
app.get("/api/solicitacoes/resumo", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req);

    const [rows] = await db.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN s.status = 0 THEN 1 ELSE 0 END) AS iniciadas,
        SUM(CASE WHEN s.status = 2 THEN 1 ELSE 0 END) AS espera,
        SUM(CASE WHEN s.status = 3 THEN 1 ELSE 0 END) AS respondidas,
        /* concluídas + transferidas */
        SUM(CASE WHEN s.status IN (1,4) THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      `,
      params
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro resumo solicitações:", err);
    res.status(500).json({ error: "Erro ao carregar resumo" });
  }
});


/* ============================================================
   2) LISTA DETALHADA
============================================================ */
app.get("/api/solicitacoes/lista", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req);

    const [rows] = await db.query(
      `
      SELECT
        s.id,
        s.created_at,
        s.protocol,
        s.status,
        c.name AS cidadao,
        sv.title AS servico,
        sec.title AS setor,
        sec.id AS sector_id
      FROM jp_conectada.solicitations s
      LEFT JOIN jp_conectada.citizens c ON c.id = s.citizen_id
      LEFT JOIN jp_conectada.services sv ON sv.id = s.service_id
      /* SOMENTE O SETOR PRIMÁRIO */
      LEFT JOIN jp_conectada.service_sector ss ON ss.service_id = s.service_id AND ss.primary = 1
      LEFT JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      WHERE ${where}
      ORDER BY s.created_at DESC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro lista solicitações:", err);
    res.status(500).json({ error: "Erro ao buscar lista" });
  }
});


/* ============================================================
   3) EVOLUÇÃO — Abertas x Concluídas
============================================================ */
app.get("/api/solicitacoes/evolucao", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req);

    const [rows] = await db.query(
      `
      SELECT
        DATE(s.created_at) AS data_ref,
        COUNT(*) AS abertas,
        SUM(CASE WHEN s.status IN (1,4) THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      GROUP BY DATE(s.created_at)
      ORDER BY DATE(s.created_at)
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro evolução solicitações:", err);
    res.status(500).json({ error: "Erro ao carregar evolução" });
  }
});


/* ============================================================
   4) SETORES PARA FILTRO
============================================================ */
app.get("/api/solicitacoes/setores", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id AS sector_id, title AS name
      FROM jp_conectada.sectors
      WHERE tenant_id = 1 AND active = 1
      ORDER BY title
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro carregar setores:", err);
    res.status(500).json({ error: "Erro ao carregar setores" });
  }
});


/* ============================================================
   5) SERVIÇOS PARA FILTRO
============================================================ */
app.get("/api/solicitacoes/servicos", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id AS service_id, title AS name
      FROM jp_conectada.services
      WHERE tenant_id = 1 AND active = 1
      ORDER BY title
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro carregar serviços:", err);
    res.status(500).json({ error: "Erro ao carregar serviços" });
  }
});


/* ============================================================
   6) SERVIÇOS POR SETOR
============================================================ */
app.get("/api/solicitacoes/servicos-por-setor", async (req, res) => {
  try {
    const setor = req.query.setor;
    if (!setor) return res.json([]);

    const [rows] = await db.query(
      `
      SELECT DISTINCT s.id AS service_id, s.title AS name
      FROM jp_conectada.services s
      JOIN jp_conectada.service_sector ss ON ss.service_id = s.id
      WHERE ss.sector_id = ?
      ORDER BY s.title
      `,
      [setor]
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro serviços por setor:", err);
    res.status(500).json({ error: "Erro ao carregar lista de serviços" });
  }
});



//
// 5) LISTA DAS SOLICITAÇÕES
//
app.get("/api/solicitacoes/lista", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req);

    const [rows] = await db.execute(
      `
      SELECT
        s.id,
        s.created_at,
        s.protocol,
        s.status,
        c.name AS cidadao,
        sv.title AS servico,
        sec.title AS setor,
        sec.id AS sector_id
      FROM jp_conectada.solicitations s
      LEFT JOIN jp_conectada.citizens c ON c.id = s.citizen_id
      LEFT JOIN jp_conectada.services sv ON sv.id = s.service_id
      LEFT JOIN jp_conectada.service_sector ss ON ss.service_id = s.service_id
      LEFT JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      WHERE ${where}
      ORDER BY s.created_at DESC
    `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro na lista:", err);
    res.status(500).json({ error: "Erro ao carregar lista" });
  }
});


//
// 6) GRÁFICO DE EVOLUÇÃO (Abertas x Concluídas)
//
app.get("/api/solicitacoes/evolucao", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req);

    const [rows] = await db.execute(
      `
      SELECT 
        DATE(s.created_at) AS data_ref,
        COUNT(*) AS abertas,
        SUM(CASE WHEN s.status = 1 THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      GROUP BY DATE(s.created_at)
      ORDER BY DATE(s.created_at)
    `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro na evolução:", err);
    res.status(500).json({ error: "Erro ao carregar evolução" });
  }
});











/* ============================================================
   📌 ROTA — Novos usuários nos últimos 12 meses
   Retorna todos os meses, mesmo sem resultados.
============================================================ */
app.get("/api/usuarios/novos-12m", async (req, res) => {
  try {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1; // 1–12

    // Lista dos últimos 12 meses
    const meses = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ano = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, "0");

      meses.push({
        chave: `${ano}-${mes}`,
        ano,
        mes
      });
    }

    const [rows] = await db.query(
      `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') AS ym,
        COUNT(*) AS total
      FROM jp_conectada.users
      WHERE tenant_id = ?
        AND active = 1
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY ym
      ORDER BY ym
      `,
      [TENANT_ID]
    );

    const mapa = {};
    rows.forEach(r => (mapa[r.ym] = r.total));

    const resultado = meses.map(m => ({
      mes: m.chave,
      total: mapa[m.chave] ?? 0
    }));

    res.json(resultado);
  } catch (err) {
    console.error("Erro /usuarios/novos-12m:", err);
    res.status(500).json({ error: true });
  }
});

/* ============================================================
   📌 ROTA — Novos usuários nos últimos 12 meses
   Retorna todos os meses, mesmo sem resultados.
============================================================ */
app.get("/api/usuarios/novos-12m", async (req, res) => {
  try {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1; // 1–12

    // Lista dos últimos 12 meses
    const meses = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ano = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, "0");

      meses.push({
        chave: `${ano}-${mes}`,
        ano,
        mes
      });
    }

    const [rows] = await db.query(
      `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') AS ym,
        COUNT(*) AS total
      FROM jp_conectada.users
      WHERE tenant_id = ?
        AND active = 1
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY ym
      ORDER BY ym
      `,
      [TENANT_ID]
    );

    const mapa = {};
    rows.forEach(r => (mapa[r.ym] = r.total));

    const resultado = meses.map(m => ({
      mes: m.chave,
      total: mapa[m.chave] ?? 0
    }));

    res.json(resultado);
  } catch (err) {
    console.error("Erro /usuarios/novos-12m:", err);
    res.status(500).json({ error: true });
  }
});


app.get("/api/solicitacoes/bairros-top6", async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const { start, end } = dateRangeForYear(ano);
    const key = `bairros-top6:${ano}`;
    const payload = await withCache(key, 60000, async () => {
      const [top] = await db.query(
        `
        SELECT neighborhood AS bairro, COUNT(*) AS total
        FROM jp_conectada.solicitations
        WHERE tenant_id = ?
          AND neighborhood IS NOT NULL
          AND created_at BETWEEN ? AND ?
        GROUP BY bairro
        ORDER BY total DESC
        LIMIT 6
        `,
        [TENANT_ID, start, end]
      );

      if (top.length === 0) return [];
      const bairros = top.map(b => b.bairro);
      const [evolucao] = await db.query(
        `
        SELECT neighborhood AS bairro,
               MONTH(created_at) AS mes,
               COUNT(*) AS total
        FROM jp_conectada.solicitations
        WHERE tenant_id = ?
          AND neighborhood IN (?)
          AND created_at BETWEEN ? AND ?
        GROUP BY bairro, mes
        ORDER BY mes ASC
        `,
        [TENANT_ID, bairros, start, end]
      );
      return { bairros: top, meses: evolucao };
    });

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(payload);

  } catch (err) {
    console.error("Erro bairros top6:", err);
    res.status(500).json({ error: "Erro ao buscar bairros" });
  }
});


app.get("/api/solicitacoes/evolucao", async (req, res) => {
  try {
    let { inicio, fim, setor, servico } = req.query;

    let where = `s.tenant_id = 1 AND s.deleted_at IS NULL`;
    const params = [];

    // FILTRO PERÍODO
    if (inicio && fim) {
      where += " AND DATE(s.created_at) BETWEEN ? AND ? ";
      params.push(inicio, fim);
    }

    // FILTRO SETOR
    if (setor) {
      where += `
        AND EXISTS (
          SELECT 1 
            FROM jp_conectada.service_sector ss 
           WHERE ss.service_id = s.service_id
             AND ss.sector_id = ?
        )`;
      params.push(setor);
    }

    // FILTRO SERVIÇO
    if (servico) {
      where += " AND s.service_id = ?";
      params.push(servico);
    }

    const [rows] = await db.query(
      `
      SELECT
          DATE(s.created_at) AS data_ref,
          COUNT(*) AS abertas,
          SUM(CASE WHEN s.status = 1 THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      GROUP BY DATE(s.created_at)
      ORDER BY DATE(s.created_at) ASC
      `,
      params
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /solicitacoes/evolucao:", err);
    res.status(500).json({ error: "Erro ao buscar evolução" });
  }
});

app.get("/api/solicitacoes/setor/evolucao", async (req, res) => {
  try {
    let { setor, inicio, fim } = req.query;

    if (!setor) {
      return res.status(400).json({ error: "setor é obrigatório" });
    }

    let where = `
      s.tenant_id = 1
      AND s.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM jp_conectada.service_sector ss
        WHERE ss.service_id = s.service_id
          AND ss.sector_id = ?
      )
    `;
    const params = [setor];

    if (inicio && fim) {
      where += " AND DATE(s.created_at) BETWEEN ? AND ? ";
      params.push(inicio, fim);
    }

    const [rows] = await db.query(
      `
      SELECT
        MONTH(s.created_at) AS mes,
        COUNT(*) AS abertas,
        SUM(CASE WHEN s.status = 1 THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      GROUP BY MONTH(s.created_at)
      ORDER BY mes ASC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/setor/evolucao:", err);
    res.status(500).json({ error: "Erro ao buscar evolução do setor" });
  }
});

app.get("/api/solicitacoes/setor/status", async (req, res) => {
  try {
    let { setor, inicio, fim } = req.query;

    if (!setor) {
      return res.status(400).json({ error: "setor é obrigatório" });
    }

    let where = `
      s.tenant_id = 1
      AND s.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM jp_conectada.service_sector ss
        WHERE ss.service_id = s.service_id
          AND ss.sector_id = ?
      )
    `;
    const params = [setor];

    if (inicio && fim) {
      where += " AND DATE(s.created_at) BETWEEN ? AND ? ";
      params.push(inicio, fim);
    }

    const [rows] = await db.query(
      `
      SELECT
        SUM(CASE WHEN s.status = 0 THEN 1 ELSE 0 END) AS iniciadas,
        SUM(CASE WHEN s.status = 2 THEN 1 ELSE 0 END) AS espera,
        SUM(CASE WHEN s.status = 3 THEN 1 ELSE 0 END) AS respondidas,
        SUM(CASE WHEN s.status = 1 THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      `,
      params
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro /solicitacoes/setor/status:", err);
    res.status(500).json({ error: "Erro ao buscar status do setor" });
  }
});


app.get("/api/solicitacoes/setor/top-servicos", async (req, res) => {
  try {
    let { setor, inicio, fim } = req.query;

    if (!setor) {
      return res.status(400).json({ error: "setor é obrigatório" });
    }

    let where = `
      s.tenant_id = 1
      AND s.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM jp_conectada.service_sector ss
        WHERE ss.service_id = s.service_id
          AND ss.sector_id = ?
      )
    `;
    const params = [setor];

    if (inicio && fim) {
      where += " AND DATE(s.created_at) BETWEEN ? AND ? ";
      params.push(inicio, fim);
    }

    const [rows] = await db.query(
      `
      SELECT
        sv.title AS servico,
        COUNT(*) AS total
      FROM jp_conectada.solicitations s
      LEFT JOIN jp_conectada.services sv ON sv.id = s.service_id
      WHERE ${where}
      GROUP BY sv.title
      ORDER BY total DESC
      LIMIT 10
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/setor/top-servicos:", err);
    res.status(500).json({ error: "Erro ao buscar serviços por setor" });
  }
});



app.get("/api/indicadores-periodo/servicos", async (req, res) => {
  try {
    const period = req.query.period || "30d";
    const start = getStartDateFromPeriod(period);

    const [rows] = await db.query(
      `
      SELECT
          sv.id AS service_id,
          sv.title AS service_name,
          COUNT(*) AS total
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.services sv ON sv.id = s.service_id
      WHERE s.tenant_id = ?
        AND s.created_at >= ?
        AND s.deleted_at IS NULL
      GROUP BY sv.id, sv.title
      ORDER BY total DESC
      LIMIT 5
      `,
      [TENANT_ID, start]
    );

    res.json(rows);

  } catch (error) {
    console.error("Erro serviços top5:", error);
    res.status(500).json({ error: "Erro ao carregar serviços" });
  }
});

app.get("/api/indicadores-periodo/setores", async (req, res) => {
  try {
    const period = req.query.period || "30d";
    const start = getStartDateFromPeriod(period);

    const [rows] = await db.query(
      `
      SELECT
          st.id AS sector_id,
          st.title AS sector_name,
          COUNT(*) AS total
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.service_sector ss ON ss.service_id = s.service_id AND ss.primary = 1
      JOIN jp_conectada.sectors st ON st.id = ss.sector_id
      WHERE
          s.tenant_id = ?
          AND s.created_at >= ?
          AND s.deleted_at IS NULL
      GROUP BY st.id, st.title
      ORDER BY total DESC
      LIMIT 5
      `,
      [TENANT_ID, start]
    );

    res.json(rows);

  } catch (error) {
    console.error("Erro setores top5:", error);
    res.status(500).json({ error: "Erro ao buscar setores" });
  }
});

app.get("/api/indicadores/taxa-resolucao", async (req, res) => {
  try {
    const periodo = req.query.periodo || "30d";
    const { inicio, fim } = getPeriodoDates(periodo);

    /* 1) iniciadas */
    const [[{ iniciadas }]] = await db.query(
      `
      SELECT COUNT(*) AS iniciadas
      FROM jp_conectada.solicitations
      WHERE tenant_id = ?
        AND deleted_at IS NULL
        AND created_at BETWEEN ? AND ?
      `,
      [TENANT_ID, inicio, fim]
    );

    /* 2) Respondidas */
    const [[{ respondidas }]] = await db.query(
      `
      SELECT COUNT(DISTINCT s.id) AS respondidas
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.tramitations t 
            ON t.solicitation_id = s.id
           AND t.origem_user <> 'Cidadão'
      WHERE s.tenant_id = ?
        AND s.deleted_at IS NULL
        AND t.created_at BETWEEN ? AND ?
      `,
      [TENANT_ID, inicio, fim]
    );

    /* 3) Concluídas */
    const [resolvidasRows] = await db.query(
      `
      SELECT created_at, updated_at
      FROM jp_conectada.solicitations
      WHERE tenant_id = ?
        AND deleted_at IS NULL
        AND status = 1
        AND updated_at BETWEEN ? AND ?
      `,
      [TENANT_ID, inicio, fim]
    );

    const resolvidas = resolvidasRows.length;

    /* 4) tempo médio */
    let totalMinutos = 0;
    for (const r of resolvidasRows) {
      totalMinutos += Math.floor((new Date(r.updated_at) - new Date(r.created_at)) / 60000);
    }

    const tempo_medio = resolvidas > 0
      ? Math.floor(totalMinutos / resolvidas)
      : 0;

    /* 5) taxas finais */
    const taxa_respostas =
      iniciadas > 0 ? Number(((respondidas / iniciadas) * 100).toFixed(1)) : 0;

    const taxa_resolucao =
      iniciadas > 0 ? Number(((resolvidas / iniciadas) * 100).toFixed(1)) : 0;

    res.json({
      periodo,
      inicio,
      fim,
      iniciadas,
      respondidas,
      resolvidas,
      taxa_respostas,
      taxa_resolucao,
      tempo_medio_conclusao_min: tempo_medio
    });

  } catch (err) {
    console.error("Erro taxa-resolucao:", err);
    res.status(500).json({ error: "Erro ao calcular indicadores" });
  }
});


app.get("/api/economometro", async (req, res) => {
  try {
    const periodo = req.query.periodo || "ano";
    const key = `economometro:${periodo}`;
    const data = await withCache(key, 60000, async () => {

    const hoje = new Date();
    let inicio = new Date(hoje);

    switch (periodo) {
      case "esta-semana": inicio.setDate(hoje.getDate() - hoje.getDay()); break;
      case "este-mes": inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1); break;
      case "90d": inicio.setDate(hoje.getDate() - 90); break;
      case "6m": inicio.setMonth(hoje.getMonth() - 6); break;
      case "ano":
      default: inicio = new Date(hoje.getFullYear(), 0, 1); break;
    }

    const inicioISO = inicio.toISOString().slice(0, 19).replace("T", " ");
    const fimISO = hoje.toISOString().slice(0, 19).replace("T", " ");

    const [[sol]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM jp_conectada.solicitations
      WHERE tenant_id = 1
        AND created_at BETWEEN ? AND ?
        AND deleted_at IS NULL
      `,
      [inicioISO, fimISO]
    );

    const [[tram]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM jp_conectada.tramitations t
      JOIN jp_conectada.solicitations s ON s.id = t.solicitation_id
      WHERE s.tenant_id = 1
        AND t.created_at BETWEEN ? AND ?
      `,
      [inicioISO, fimISO]
    );

    const totalSolic = sol.total || 0;
    const totalTram = tram.total || 0;

    const custoPagina = 0.35;
    const folhas = (totalSolic * 0.65) + (totalTram * 0.20);
    const arvores = folhas / 8000;

    const result = {
      periodo,
      intervalo: { inicio: inicioISO, fim: fimISO },
      solicitacoes: totalSolic,
      tramitacoes: totalTram,
      folhas: Math.round(folhas),
      arvores: arvores.toFixed(3),
      dinheiro: (folhas * custoPagina).toFixed(2)
    };
    return result;
    });

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(data);

  } catch (err) {
    console.error("Erro economometro:", err);
    res.status(500).json({ error: "Erro ao gerar economômetro" });
  }
});

app.get("/api/setor/:id/servicos", async (req, res) => {
  try {
    const setorId = req.params.id;

    const [rows] = await db.query(
      `
      SELECT 
          sv.id AS servico_id,
          sv.title AS servico,
          COUNT(s.id) AS total
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.services sv ON sv.id = s.service_id
      JOIN jp_conectada.service_sector ss ON ss.service_id = sv.id
      WHERE ss.sector_id = ?
        AND s.tenant_id = 1
        AND s.deleted_at IS NULL
      GROUP BY sv.id, sv.title
      ORDER BY total DESC
      `,
      [setorId]
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /setor/servicos:", err);
    res.status(500).json({ error: "Erro ao buscar serviços do setor" });
  }
});

app.get("/api/setor/:id/evolucao", async (req, res) => {
  try {
    const setorId = req.params.id;
    const ano = parseInt(req.query.ano, 10) || new Date().getFullYear();

    const [rows] = await db.query(
      `
      WITH meses AS (
          SELECT 1 mes UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION 
          SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION 
          SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12
      )
      SELECT
          m.mes,
          DATE_FORMAT(STR_TO_DATE(CONCAT(?, '-', m.mes, '-01'), '%Y-%m-%d'), '%b') AS mes_nome,
          COALESCE((
              SELECT COUNT(*)
              FROM jp_conectada.solicitations s
              JOIN jp_conectada.service_sector ss ON ss.service_id = s.service_id
              WHERE ss.sector_id = ?
                AND s.tenant_id = 1
                AND YEAR(s.created_at) = ?
                AND MONTH(s.created_at) = m.mes
                AND s.deleted_at IS NULL
          ),0) AS total
      FROM meses m
      ORDER BY m.mes
      `,
      [ano, setorId, ano]
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /setor/evolucao:", err);
    res.status(500).json({ error: "Erro ao carregar evolução do setor" });
  }
});

app.get("/api/setor/:id/status", async (req, res) => {
  try {
    const setorId = req.params.id;

    const [rows] = await db.query(
      `
      SELECT 
          s.status,
          CASE 
              WHEN s.status = 0 THEN 'Iniciadas'
              WHEN s.status = 2 THEN 'Em espera'
              WHEN s.status = 3 THEN 'Respondidas'
              WHEN s.status = 1 THEN 'Concluídas'
              WHEN s.status = 4 THEN 'Transferidas'
              ELSE 'Outros'
          END AS status_nome,
          COUNT(*) AS total
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.service_sector ss ON ss.service_id = s.service_id
      WHERE ss.sector_id = ?
        AND s.tenant_id = 1
        AND s.deleted_at IS NULL
      GROUP BY s.status
      ORDER BY total DESC
      `,
      [setorId]
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /setor/status:", err);
    res.status(500).json({ error: "Erro ao carregar status do setor" });
  }
});

/* -------------------------------------------------------
   404
------------------------------------------------------- */
/* -------------------------------------------------------
   GLOBAL ERROR HANDLER
------------------------------------------------------- */
app.use((err, req, res, next) => {
  console.error("Erro:", err);
  res.status(500).json({ error: "Erro interno" });
});



// =========================================================
// 🚀 START SERVER
// =========================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`, {
    env: process.env.NODE_ENV || "development"
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});
