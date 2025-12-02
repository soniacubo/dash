// =========================================================
// 🌐 IMPORTS / CONFIGURAÇÕES
// =========================================================
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const app = express();
const TENANT_ID = 1;


// =========================================================
// 🔐 CORS — VERCEL + RENDER + LOCALHOST
// =========================================================
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


// =========================================================
// 🗄 MYSQL POOL
// =========================================================
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

/* -------------------------------------------------------
   🔥 ROTA DE TESTE (AGORA EXISTE)
------------------------------------------------------- */
app.get("/", (req, res) => {
  res.json({ status: "OK", message: "API funcionando 🚀" });
});

/* ============================================================
   🛠️ HELPERS
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

// app.get("/api/visao-geral/totais", async (req, res) => {
//   try {
//     const tenantId = TENANT_ID;

//     /* ---------------------- SERVIÇOS ---------------------- */
//     const [[serv]] = await db.query(
//       `SELECT COUNT(*) AS total FROM jp_conectada.services WHERE tenant_id = ? AND active = 1`,
//       [tenantId]
//     );

//     /* ---------------------- SETORES ----------------------- */
//     const [[secs]] = await db.query(
//       `SELECT COUNT(*) AS total FROM jp_conectada.sectors WHERE tenant_id = ? AND active = 1`,
//       [tenantId]
//     );

//     /* ---------------------- USUÁRIOS ---------------------- */
//     const [[users]] = await db.query(
//       `
//       SELECT COUNT(DISTINCT u.id) AS total
//       FROM jp_conectada.users u
//       LEFT JOIN jp_conectada.sector_user su ON su.user_id = u.id
//       WHERE u.tenant_id = ? AND u.active = 1
//       `,
//       [tenantId]
//     );

//     /* ---------------------- CIDADÃOS ---------------------- */
//     let totalCid = 0;
//     try {
//       const [[cid]] = await db.query(
//         `SELECT COUNT(*) AS total FROM jp_conectada.citizens WHERE tenant_id = ?`,
//         [tenantId]
//       );
//       totalCid = cid.total;
//     } catch {
//       totalCid = 0;
//     }

//     /* ---------------------- EFICIÊNCIA ---------------------- */
//     const [[ef]] = await db.query(
//       `
//       SELECT
//         COUNT(*) AS total,
//         SUM(CASE WHEN s.status = 1 THEN 1 END) AS concluidas,
//         SUM(CASE WHEN s.status = 2 THEN 1 END) AS respondidas
//       FROM jp_conectada.solicitations s
//       WHERE s.tenant_id = ?
//       `,
//       [tenantId]
//     );

//     const totalSol = ef.total || 0;
//     const concluidas = ef.concluidas || 0;
//     const respondidas = ef.respondidas || 0;

//     const eficienciaPct = totalSol > 0 ? (concluidas / totalSol) * 100 : 0;

//     const abertasNaoConcl = Math.max(totalSol - concluidas, 0);
//     let respondidasNaoConcl = Math.max(respondidas - concluidas, 0);

//     const engajamentoPct = abertasNaoConcl > 0
//       ? (respondidasNaoConcl / abertasNaoConcl) * 100
//       : 0;

//     /* ---------------------- QUALIDADE ---------------------- */
//     let qualidadeMedia = 0, totalAvaliacoes = 0;

//     try {
//       const [[qual]] = await db.query(
//         `
//         SELECT AVG(av.score) AS nota_media, COUNT(*) AS total
//         FROM jp_conectada.service_evaluations av
//         JOIN jp_conectada.solicitations s ON s.id = av.solicitation_id
//         WHERE s.tenant_id = ?
//         `,
//         [tenantId]
//       );

//       qualidadeMedia = qual.nota_media || 0;
//       totalAvaliacoes = qual.total || 0;

//     } catch (err) {
//       qualidadeMedia = 0;
//       totalAvaliacoes = 0;
//     }

//     /* ---------------------- ECONOMIA ---------------------- */
//     const P_PAGINAS = 4;
//     const C_PAGINA = 0.35;
//     const C_MANUSEIO = 0.80;

//     const economiaRS = totalSol * (P_PAGINAS * C_PAGINA + C_MANUSEIO);

//     res.json({
//       totais: {
//         servicos: serv.total,
//         setores: secs.total,
//         usuarios: users.total,
//         cidadaos: totalCid
//       },
//       desempenho: {
//         eficiencia_pct: Number(eficienciaPct.toFixed(1)),
//         engajamento_pct: Number(engajamentoPct.toFixed(1)),
//         qualidade_media: Number(qualidadeMedia.toFixed(2)),
//         total_avaliacoes: totalAvaliacoes
//       },
//       economia: {
//         estimada_rs: Number(economiaRS.toFixed(2)),
//         parametros: { P_PAGINAS, C_PAGINA, C_MANUSEIO }
//       }
//     });

//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ error: "Erro ao carregar visão geral" });
//   }
// });


// app.get("/api/visao-geral/totais", async (req, res) => {
//   try {
//     const tenant = TENANT_ID;

//     // -------------------------- Totais --------------------------
//     const [[totalServicos]] = await db.query(
//       `SELECT COUNT(*) AS total FROM jp_conectada.services WHERE tenant_id = ? AND active = 1`,
//       [tenant]
//     );

//     const [[totalSetores]] = await db.query(
//       `SELECT COUNT(*) AS total FROM jp_conectada.sectors WHERE tenant_id = ? AND active = 1`,
//       [tenant]
//     );

//     const [[totalUsuarios]] = await db.query(
//       `SELECT COUNT(DISTINCT u.id) AS total
//          FROM jp_conectada.users u
//          LEFT JOIN jp_conectada.sector_user su ON su.user_id = u.id
//        WHERE u.tenant_id = ? AND u.active = 1`,
//       [tenant]
//     );

//     const [[totalCidadaos]] = await db.query(
//       `SELECT COUNT(*) AS total FROM jp_conectada.citizens WHERE tenant_id = ?`,
//       [tenant]
//     ).catch(() => [{ total: 0 }]);

//     // -------------------------- Eficiência / Engajamento --------------------------
//     const [[dadosEf]] = await db.query(
//       `
//       SELECT
//           COUNT(*) AS total,
//           SUM(CASE WHEN status = 1 THEN 1 END) AS concluidas,
//           SUM(CASE WHEN status = 2 OR status = 3 THEN 1 END) AS respondidas
//       FROM jp_conectada.solicitations
//       WHERE tenant_id = ?`,
//       [tenant]
//     );

//     const total = Number(dadosEf.total || 0);
//     const concl = Number(dadosEf.concluidas || 0);
//     const resp  = Number(dadosEf.respondidas || 0);

//     const eficiencia_pct = total > 0 ? Number(((concl / total) * 100).toFixed(1)) : 0;
//     const engajamento_pct = (total - concl) > 0
//       ? Number(((resp / (total - concl)) * 100).toFixed(1))
//       : 0;

//     // -------------------------- Qualidade média --------------------------
//     const [[qual]] = await db.query(
//       `
//       SELECT
//           AVG(a.score) AS nota_media,
//           SUM(a.total_votes) AS total_avaliacoes
//       FROM jp_conectada.averages a
//       WHERE a.evaluated_type = 'App\\\\Models\\\\Service\\\\Service'
//       `,
//     ).catch(() => [{ nota_media: 0, total_avaliacoes: 0 }]);

//     // -------------------------- Economia estimada --------------------------
//     const CUSTO_PAGINA = 0.35;
//     const P_PAGINAS    = 4;
//     const C_MANUSEIO   = 0.80;

//     const economia = total * (P_PAGINAS * CUSTO_PAGINA + C_MANUSEIO);

//     res.json({
//       totais: {
//         servicos: totalServicos.total,
//         setores: totalSetores.total,
//         usuarios: totalUsuarios.total,
//         cidadaos: totalCidadaos.total
//       },
//       desempenho: {
//         eficiência_pct: eficiencia_pct,
//         engajamento_pct: engajamento_pct,
//         qualidade_media: Number((qual.nota_media || 0).toFixed(2)),
//         total_avaliacoes: qual.total_avaliacoes || 0
//       },
//       economia: {
//         estimada_rs: Number(economia.toFixed(2)),
//         parametros: { P_PAGINAS, CUSTO_PAGINA, C_MANUSEIO }
//       }
//     });

//   } catch (err) {
//     console.error("Erro /api/visao-geral:", err);
//     res.status(500).json({ error: "Erro ao carregar visão geral" });
//   }
// });


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
          SUM(CASE WHEN s.status = 1 THEN 1 ELSE 0 END) AS concluidas
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

app.get("/api/solicitacoes/lista", async (req, res) => {
  try {
    let { inicio, fim, setor, servico } = req.query;

    let where = `s.tenant_id = 1 AND s.deleted_at IS NULL`;
    const params = [];

    if (inicio && fim) {
      where += " AND DATE(s.created_at) BETWEEN ? AND ?";
      params.push(inicio, fim);
    }

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

    if (servico) {
      where += " AND s.service_id = ?";
      params.push(servico);
    }

    const [rows] = await db.query(
      `
      SELECT
        s.id,
        s.created_at,
        s.protocol,
        s.status,
        c.name AS cidadao,
        sv.title AS servico,
        sec.title AS setor
      FROM jp_conectada.solicitations s
      LEFT JOIN jp_conectada.citizens c ON c.id = s.citizen_id
      LEFT JOIN jp_conectada.services sv ON sv.id = s.service_id
      LEFT JOIN jp_conectada.service_sector ss 
             ON ss.service_id = s.service_id AND ss.primary = 1
      LEFT JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      WHERE ${where}
      ORDER BY s.created_at DESC
      `,
      params
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro /solicitacoes/lista:", err);
    res.status(500).json({ error: "Erro ao buscar lista" });
  }
});


app.get("/api/solicitacoes/bairros-top6", async (req, res) => {
  try {
    const ano = req.query.ano || new Date().getFullYear();

    const [top] = await db.query(
      `
      SELECT neighborhood AS bairro, COUNT(*) AS total
      FROM jp_conectada.solicitations
      WHERE tenant_id = ?
        AND neighborhood IS NOT NULL
        AND YEAR(created_at) = ?
      GROUP BY bairro
      ORDER BY total DESC
      LIMIT 6
      `,
      [TENANT_ID, ano]
    );

    if (top.length === 0) return res.json([]);

    const bairros = top.map(b => b.bairro);

    const [evolucao] = await db.query(
      `
      SELECT neighborhood AS bairro,
             MONTH(created_at) AS mes,
             COUNT(*) AS total
      FROM jp_conectada.solicitations
      WHERE tenant_id = ?
        AND neighborhood IN (?)
        AND YEAR(created_at) = ?
      GROUP BY bairro, mes
      ORDER BY mes ASC
      `,
      [TENANT_ID, bairros, ano]
    );

    res.json({ bairros: top, meses: evolucao });

  } catch (err) {
    console.error("Erro bairros top6:", err);
    res.status(500).json({ error: "Erro ao buscar bairros" });
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

    res.json({
      periodo,
      intervalo: { inicio: inicioISO, fim: fimISO },
      solicitacoes: totalSolic,
      tramitacoes: totalTram,
      folhas: Math.round(folhas),
      arvores: arvores.toFixed(3),
      dinheiro: (folhas * custoPagina).toFixed(2)
    });

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
app.get("*", (req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
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