const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const app = express();

/* =============================
   ✅ CORS CONFIG
============================= */
/* =============================
   ✅ CORS CONFIG (fix completo)
============================= */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    const isDev = process.env.NODE_ENV !== "production";

    // 🔥 Permitir qualquer origem no desenvolvimento
    if (isDev) {
      return callback(null, true);
    }

    // 🔒 Em produção, só o que estiver no .env
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
};


app.use(cors(corsOptions));
app.use(helmet());
app.set("trust proxy", 1);
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));
app.use(express.json());

/* =============================
   ✅ STATIC FILES
============================= */
app.use(
  express.static(path.join(__dirname), {
    maxAge: process.env.STATIC_MAXAGE || "1d",
    etag: true
  })
);

/* =============================
   ✅ LOGGER
============================= */
const logger = {
  info: (msg, meta) => console.log(JSON.stringify({ level: "info", msg, ...meta })),
  error: (msg, meta) => console.error(JSON.stringify({ level: "error", msg, ...meta }))
};

/* =============================
   ✅ MYSQL POOL (ÚNICO)
============================= */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

/* =============================
   ✅ HELPERS
============================= */




// function getPeriodoDates(Periodo) {
//   const agora = new Date();

//   // Fim SEMPRE agora, exceto quando ano_passado
//   const fim = new Date();

//   let inicio = new Date();

//   switch (periodo) {

//     case "today":
//       // Hoje = início do dia até agora
//       inicio = new Date(
//         agora.getFullYear(),
//         agora.getMonth(),
//         agora.getDate(),
//         0, 0, 0
//       );
//       break;

//     case "7d":
//       inicio = new Date(agora.getTime() - 7 * 86400000);
//       break;

//     case "30d":
//       inicio = new Date(agora.getTime() - 30 * 86400000);
//       break;

//     case "90d":
//       inicio = new Date(agora.getTime() - 90 * 86400000);
//       break;

//     case "6m":
//       inicio = new Date(agora);
//       inicio.setMonth(inicio.getMonth() - 6);
//       break;

//     case "1y":
//       inicio = new Date(agora);
//       inicio.setFullYear(agora.getFullYear() - 1);
//       break;

//     case "ano_passado":
//       // Ano fechado: 1/jan → 31/dez
//       inicio = new Date(agora.getFullYear() - 1, 0, 1, 0, 0, 0, 0);

//       fim.setFullYear(agora.getFullYear() - 1, 11, 31);
//       fim.setHours(23, 59, 59, 999);
//       break;

//     case "all":
//       // Depois vamos substituir isso pela menor created_at do banco
//       inicio = new Date("2015-01-01T00:00:00Z");
//       break;

//     default:
//       inicio = new Date(agora.getTime() - 30 * 86400000);
//       break;
//   }

//   return { inicio, fim };
// }

// mapeie *exatamente* estes valores do front:
// "today" | "7d" | "30d" | "90d" | "6m" | "1y" | "all" | "ano_passado"

function getPeriodoDates(periodoRaw) {
  const periodo = String(periodoRaw || "30d");
  const agora = new Date();

  // fim sempre "agora", exceto ano_passado (ajustamos pro último dia do ano anterior)
  const fim = new Date();
  let inicio = new Date();

  switch (periodo) {
    case "today":
      // HOJE: da meia-noite até agora
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
      break;

    case "7d":
      // últimos 7 dias (hoje + 6 dias pra trás)
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 6);
      inicio.setHours(0, 0, 0, 0);
      break;

    case "30d":
      // últimos 30 dias (hoje + 29 dias pra trás)
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 29);
      inicio.setHours(0, 0, 0, 0);
      break;

    case "90d":
      // últimos 90 dias (hoje + 89 dias pra trás)
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 89);
      inicio.setHours(0, 0, 0, 0);
      break;

    case "6m":
      // últimos 6 meses (data de hoje - 6 meses)
      inicio = new Date(agora);
      inicio.setMonth(inicio.getMonth() - 6);
      inicio.setHours(0, 0, 0, 0);
      break;

    case "1y":
      // ESTE ANO: de 01/jan do ano atual até agora
      inicio = new Date(agora.getFullYear(), 0, 1, 0, 0, 0);
      break;

    case "ano_passado":
      // ANO PASSADO: de 01/jan do ano anterior até 31/dez do ano anterior
      inicio = new Date(agora.getFullYear() - 1, 0, 1, 0, 0, 0);

      fim.setFullYear(agora.getFullYear() - 1, 11, 31);
      fim.setHours(23, 59, 59, 999);
      break;

    case "all":
      // TODO PERÍODO – aqui você pode ajustar para a menor data real do sistema
      inicio = new Date("2000-01-01T00:00:00Z");
      inicio.setHours(0, 0, 0, 0);
      break;

    default:
      // fallback → últimos 30 dias
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 29);
      inicio.setHours(0, 0, 0, 0);
      break;
  }

  // ---- DIAS DO PERÍODO (para a média diária) ----
  let diasPeriodo;
  if (periodo === "today") diasPeriodo = 1;
  else if (periodo === "7d") diasPeriodo = 7;
  else if (periodo === "30d") diasPeriodo = 30;
  else if (periodo === "90d") diasPeriodo = 90;
  else {
    // para 6m, 1y, ano_passado e all calculamos pelo intervalo real
    const diffMs = fim.getTime() - inicio.getTime();
    diasPeriodo = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
  }

  return { inicio, fim, diasPeriodo, periodo };
}


function brToMySQL(dateBR) {
  if (!dateBR) return null;
  const [d, m, y] = dateBR.split("/");
  return `${y}-${m}-${d}`;
}

function getStartDateFromPeriod(periodKey) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const start = new Date(now);

  switch (periodKey) {
    case "today": start.setHours(0,0,0,0); break;
    case "7d": start.setDate(start.getDate() - 7); break;
    case "30d": start.setDate(start.getDate() - 30); break;
    case "90d": start.setDate(start.getDate() - 90); break;
    case "6m": start.setMonth(start.getMonth() - 6); break;
    case "1y": start.setFullYear(start.getFullYear() - 1); break;
    default: start.setDate(start.getDate() - 30);
  }

  return `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}-${String(start.getDate()).padStart(2,"0")} 00:00:00`;
}

const TENANT_ID = 1;

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
    const [rows] = await db.query(`
      WITH RECURSIVE sector_hierarchy AS (
        SELECT
          id,
          parent_id,
          title,
          0 AS nivel,
          id AS root_id
        FROM jp_conectada.sectors
        WHERE active = 1 AND tenant_id = 1 AND parent_id IS NULL

        UNION ALL

        SELECT
          s.id,
          s.parent_id,
          s.title,
          sh.nivel + 1,
          sh.root_id
        FROM jp_conectada.sectors s
        JOIN sector_hierarchy sh ON s.parent_id = sh.id
        WHERE s.active = 1 AND s.tenant_id = 1
      ),

      usuarios_por_setor AS (
        SELECT
          sh.id AS sector_id,
          sh.root_id,
          sh.nivel,
          COUNT(DISTINCT CASE WHEN u.active = 1 THEN u.id END) AS usuarios_ativos,
          COUNT(DISTINCT CASE WHEN u.active = 0 THEN u.id END) AS usuarios_inativos,
          COUNT(DISTINCT u.id) AS usuarios_total
        FROM sector_hierarchy sh
        LEFT JOIN jp_conectada.sector_user su ON su.sector_id = sh.id AND su.active = 1
        LEFT JOIN jp_conectada.users u ON u.id = su.user_id AND u.tenant_id = 1
        GROUP BY sh.id, sh.root_id, sh.nivel
      ),

      totais_root AS (
        SELECT
          root_id,
          SUM(usuarios_total) AS total_geral_root
        FROM usuarios_por_setor
        GROUP BY root_id
      )

      SELECT
        ups.*,
        tr.total_geral_root
      FROM usuarios_por_setor ups
      LEFT JOIN totais_root tr ON tr.root_id = ups.root_id;
    `);

    res.json(rows);

  } catch (error) {
    console.error("Erro SQL RESUMO:", error);
    res.status(500).json({ error: "Erro ao buscar resumo de usuários" });
  }
});

app.get("/api/setores/:id/usuarios", async (req, res) => {
  try {
    const sectorId = Number(req.params.id);

    const [rows] = await db.query(
      `
        SELECT DISTINCT
          u.id,
          CONCAT(u.first_name, ' ', u.last_name) AS nome,
          u.email,
          u.phone,
          u.active
        FROM jp_conectada.sector_user su
        JOIN jp_conectada.users u ON u.id = su.user_id
        WHERE su.sector_id = ?
          AND su.active = 1
          AND u.tenant_id = 1
        ORDER BY u.first_name, u.last_name;
      `,
      [sectorId]
    );

    res.json(rows);

  } catch (error) {
    console.error("Erro SQL LISTA USUÁRIOS:", error);
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
    const [rows] = await db.query(
      `
      WITH RECURSIVE arvore AS (
          SELECT 
              s.id AS sector_id,
              s.parent_id,
              s.title,
              s.id AS root_id
          FROM jp_conectada.sectors s
          WHERE s.parent_id IS NULL
            AND s.active = 1
            AND s.tenant_id = 1

          UNION ALL

          SELECT
              f.id AS sector_id,
              f.parent_id,
              f.title,
              a.root_id
          FROM jp_conectada.sectors f
          JOIN arvore a ON a.sector_id = f.parent_id
          WHERE f.active = 1
            AND f.tenant_id = 1
      ),

      servicos AS (
          SELECT
              ss.sector_id,
              COUNT(CASE WHEN se.type = 'principal' THEN 1 END) AS servicos_principal,
              COUNT(CASE WHEN se.type <> 'principal' THEN 1 END) AS servicos_participante
          FROM jp_conectada.service_sector ss
          JOIN jp_conectada.services se ON se.id = ss.service_id
          WHERE se.tenant_id = 1
          GROUP BY ss.sector_id
      ),

      solics AS (
          SELECT
              si.involvedable_id AS sector_id,
              COUNT(*) AS total_solic,
              COUNT(CASE WHEN s.status = 1 THEN 1 END) AS concluidas,
              COUNT(CASE WHEN s.status = 2 THEN 1 END) AS respondidas
          FROM jp_conectada.solicitation_involved si
          JOIN jp_conectada.solicitations s ON s.id = si.solicitation_id
          WHERE si.involvedable_type = 'App\\\\Models\\\\Sector\\\\Sector'
            AND si.tenant_id = 1
            AND s.tenant_id = 1
          GROUP BY si.involvedable_id
      ),

      qualidade AS (
          SELECT
              ss.sector_id,
              AVG(a.score) AS nota_media,
              SUM(a.total_votes) AS votos
          FROM jp_conectada.service_sector ss
          JOIN jp_conectada.averages a 
               ON a.evaluated_id = ss.service_id
              AND a.evaluated_type = 'App\\\\Models\\\\Service\\\\Service'
          GROUP BY ss.sector_id
      ),

      usuarios AS (
          SELECT 
              su.sector_id,
              COUNT(DISTINCT su.user_id) AS total_usuarios
          FROM jp_conectada.sector_user su
          JOIN jp_conectada.users u ON u.id = su.user_id
          WHERE su.active = 1
            AND u.tenant_id = 1
          GROUP BY su.sector_id
      )

      SELECT 
          a.root_id,
          p.title AS setor_pai,

          SUM(COALESCE(u.total_usuarios, 0)) AS usuarios_total,

          SUM(COALESCE(sv.servicos_principal, 0)) AS servicos_principal_consolidado,
          SUM(COALESCE(sv.servicos_participante, 0)) AS servicos_participante_consolidado,

          SUM(COALESCE(sl.total_solic, 0)) AS solicitacoes_total,
          SUM(COALESCE(sl.concluidas, 0)) AS concluidas_total,
          SUM(COALESCE(sl.respondidas, 0)) AS respondidas_total,

          CASE WHEN SUM(COALESCE(sl.total_solic, 0)) > 0
               THEN ROUND(
                       SUM(COALESCE(sl.concluidas, 0)) 
                       / SUM(COALESCE(sl.total_solic, 0)) * 100, 2)
               ELSE NULL END AS eficiencia_percentual,

          CASE WHEN SUM(COALESCE(sl.total_solic, 0)) > 0
               THEN ROUND(
                       SUM(COALESCE(sl.respondidas, 0)) 
                       / SUM(COALESCE(sl.total_solic, 0)) * 100, 2)
               ELSE NULL END AS engajamento_percentual,

          ROUND(AVG(COALESCE(q.nota_media, 0)), 2) AS qualidade_media

      FROM arvore a
      LEFT JOIN servicos sv ON sv.sector_id = a.sector_id
      LEFT JOIN solics sl ON sl.sector_id = a.sector_id
      LEFT JOIN qualidade q ON q.sector_id = a.sector_id
      LEFT JOIN usuarios u ON u.sector_id = a.sector_id
      LEFT JOIN jp_conectada.sectors p ON p.id = a.root_id
      GROUP BY a.root_id, p.title
      ORDER BY p.title;
      `
    );

    // Mapa root_id → consolidado (melhor formato para o tooltip)
    const map = {};
    rows.forEach((row) => {
      map[row.root_id] = row;
    });

    res.json({
      total: rows.length,
      rows,
      map
    });

  } catch (error) {
    console.error("Erro SQL SETORES CONSOLIDADO:", error);
    res.status(500).json({
      error: "Erro ao carregar dados consolidados dos setores",
      details: error.message
    });
  }
});


app.get("/api/indicadores/servidores-por-setor", async (req, res) => {
  try {
    const [rows] = await db.query(`
        SELECT 
            su.sector_id,
            s.title AS setor,
            COUNT(DISTINCT su.user_id) AS total_usuarios
        FROM jp_conectada.sector_user su
        JOIN jp_conectada.sectors s ON s.id = su.sector_id
        JOIN jp_conectada.users u ON u.id = su.user_id
        WHERE su.active = 1
          AND u.tenant_id = 1
          AND s.active = 1
          AND s.tenant_id = 1
        GROUP BY su.sector_id, s.title
        ORDER BY total_usuarios DESC;
    `);

    res.json(rows);

  } catch (err) {
    console.error("Erro indicador servidores por setor:", err);
    res.status(500).json({ error: "Erro ao carregar servidores por setor" });
  }
});

app.get("/api/usuarios/detalhado", async (req, res) => {
  try {
    const { dataInicial, dataFinal } = req.query;
    const tenantId = 1; // AJUSTE SE NECESSÁRIO

    // Normaliza datas para o formato completo
    const dataIni = dataInicial ? `${dataInicial} 00:00:00` : null;
    const dataFim = dataFinal ? `${dataFinal} 23:59:59` : null;

    const sql = `
WITH RECURSIVE sector_hierarchy AS (

    SELECT
        id,
        title,
        parent_id,
        title AS full_path,
        id AS root_id,
        title AS root_title
    FROM jp_conectada.sectors
    WHERE parent_id IS NULL

    UNION ALL

    SELECT
        s.id,
        s.title,
        s.parent_id,
        CONCAT(sh.full_path, ' > ', s.title),
        sh.root_id,
        sh.root_title
    FROM jp_conectada.sectors s
    JOIN sector_hierarchy sh ON sh.id = s.parent_id
),

despachos AS (
    SELECT 
        t.origem_user,
        COUNT(*) AS total
    FROM jp_conectada.tramitations t
    WHERE (? IS NULL OR ? IS NULL)
       OR (t.created_at BETWEEN ? AND ?)
    GROUP BY t.origem_user
)

SELECT
    u.id,
    CONCAT(u.first_name, ' ', u.last_name) AS nome,
    GROUP_CONCAT(DISTINCT sh.root_title ORDER BY sh.root_title) AS secretaria,
    GROUP_CONCAT(DISTINCT s.title ORDER BY s.title) AS setores,
    u.created_at,
    
    CASE 
        WHEN ? IS NOT NULL AND ? IS NOT NULL AND u.created_at BETWEEN ? AND ?
        THEN 1
        ELSE 0
    END AS cadastrado_no_periodo,

    u.last_login_at,
    DATE_FORMAT(u.last_login_at, '%d/%m/%Y %H:%i') AS ultimo_login_formatado,

    CASE
        WHEN u.last_login_at IS NULL THEN NULL
        ELSE DATEDIFF(NOW(), u.last_login_at)
    END AS dias_sem_login,

    COALESCE(d.total, 0) AS despachos_periodo

FROM jp_conectada.users u
LEFT JOIN jp_conectada.sector_user su ON su.user_id = u.id
LEFT JOIN jp_conectada.sectors s ON s.id = su.sector_id
LEFT JOIN sector_hierarchy sh ON sh.id = s.id

LEFT JOIN despachos d 
       ON d.origem_user = CONCAT(u.first_name, ' ', u.last_name)

WHERE u.tenant_id = ?
AND u.active = 1

GROUP BY u.id

ORDER BY u.first_name, u.last_name;
`;

    const params = [
      dataIni, dataFim, dataIni, dataFim, // filtro despachos
      dataIni, dataFim, dataIni, dataFim, // filtro cadastro
      tenantId                            // tenant
    ];

    const [rows] = await db.query(sql, params);
    res.json(rows);

  } catch (err) {
    console.error("Erro ao carregar usuários detalhados:", err);
    res.status(500).json({ error: "Erro ao consultar usuários" });
  }
});
app.get("/usuarios/detalhes", async (req, res) => {
  try {
    const inicio = req.query.inicio || "2025-11-01";
    const fim = req.query.fim || "2025-12-31";

    const [rows] = await db.query(
      `
WITH usuario_setor AS (
    SELECT 
        su.user_id,
        s.title AS setor_nome
    FROM sector_user su
    LEFT JOIN sectors s ON s.id = su.sector_id
    WHERE su.active = 1
),

usuario_setores AS (
    SELECT
        su.user_id,
        GROUP_CONCAT(s.title ORDER BY s.title SEPARATOR ', ') AS setores_filhos
    FROM sector_user su
    JOIN sectors s ON s.id = su.sector_id
    WHERE su.active = 1
    GROUP BY su.user_id
),

ultimos_despachos AS (
    SELECT 
        t.origem_user AS nome_usuario,
        MAX(t.created_at) AS ultimo_despacho
    FROM tramitations t
    JOIN solicitations s 
          ON s.id = t.solicitation_id
    WHERE s.tenant_id = 1
      AND s.deleted_at IS NULL
    GROUP BY t.origem_user
),

despachos_periodo AS (
    SELECT
        t.origem_user AS nome_usuario,
        COUNT(*) AS total_despachos_periodo
    FROM tramitations t
    JOIN solicitations s 
          ON s.id = t.solicitation_id
    WHERE s.tenant_id = 1
      AND s.deleted_at IS NULL
      AND t.created_at >= ?
      AND t.created_at < DATE_ADD(?, INTERVAL 1 DAY)
    GROUP BY t.origem_user
)

SELECT
    u.id,
    CONCAT(u.first_name, ' ', u.last_name) AS nome,
    u.email,
    u.phone,

    us.setor_nome AS secretaria,
    COALESCE(us2.setores_filhos, '') AS departamentos,

    u.created_at AS data_cadastro,

    ud.ultimo_despacho,

    CASE 
        WHEN ud.ultimo_despacho IS NULL THEN NULL
        WHEN ud.ultimo_despacho >= NOW() - INTERVAL 24 HOUR THEN 0
        ELSE DATEDIFF(CURDATE(), DATE(ud.ultimo_despacho))
    END AS dias_sem_despacho,

    COALESCE(dp.total_despachos_periodo, 0) AS despachos_periodo

FROM users u

LEFT JOIN usuario_setor us 
       ON us.user_id = u.id

LEFT JOIN usuario_setores us2
       ON us2.user_id = u.id

LEFT JOIN ultimos_despachos ud 
       ON ud.nome_usuario = CONCAT(u.first_name, ' ', u.last_name)

LEFT JOIN despachos_periodo dp
       ON dp.nome_usuario = CONCAT(u.first_name, ' ', u.last_name)

WHERE 
    u.tenant_id = 1
    AND u.active = 1

GROUP BY
    u.id,
    nome,
    u.email,
    u.phone,
    us.setor_nome,
    us2.setores_filhos,
    u.created_at,
    ud.ultimo_despacho,
    dp.total_despachos_periodo

ORDER BY 
    ud.ultimo_despacho DESC;
      `,
      [inicio, fim]
    );

    res.json(rows);

  } catch (e) {
    console.error("Erro rota /usuarios/detalhes:", e);
    res.status(500).json({ error: true });
  }
});



app.get("/api/usuarios/estatisticas", async (req, res) => {
  try {
    const sql = `
      SELECT
          /* 1) Total de servidores ativos */
          (SELECT COUNT(*) 
           FROM jp_conectada.users 
           WHERE tenant_id = 1 AND active = 1) AS total_servidores,

          /* 2) Ativos últimas 24h */
          (SELECT COUNT(*) 
           FROM jp_conectada.users 
           WHERE tenant_id = 1 
             AND active = 1
             AND last_login_at >= NOW() - INTERVAL 1 DAY
          ) AS ativos_24h,

          /* 3) Inativos há mais de 30 dias */
          (SELECT COUNT(*)
           FROM jp_conectada.users
           WHERE tenant_id = 1
             AND active = 1
             AND (last_login_at IS NULL 
                  OR last_login_at < NOW() - INTERVAL 30 DAY)
          ) AS inativos_30d,

          /* 4) Online agora (últimos 60 minutos) */
          (SELECT COUNT(*)
           FROM jp_conectada.users
           WHERE tenant_id = 1
             AND active = 1
             AND last_login_at >= NOW() - INTERVAL 60 MINUTE
          ) AS online_agora,

          /* 5) Criados no último mês */
          (SELECT COUNT(*)
           FROM jp_conectada.users
           WHERE tenant_id = 1
             AND created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
          ) AS criados_ultimo_mes
    `;

    const [rows] = await db.query(sql);
    res.json(rows[0]); // só uma linha com todos os números

  } catch (err) {
    console.error("Erro ao carregar estatísticas de usuários:", err);
    res.status(500).json({ error: "Erro ao carregar estatísticas" });
  }
});

app.get("/api/ranking-despachos", async (req, res) => {

      console.log("Datas recebidas:", req.query);   // <<< AQUI
    try {
        const tenantId = 1;

        let { dataInicial, dataFinal } = req.query;

        let filtro = "";
        let params = [];

        // Se recebeu datas
        if (dataInicial && dataFinal) {
            filtro = ` AND t.created_at BETWEEN ? AND ? `;
            params.push(dataInicial, dataFinal);
        } else {
            // Últimos 30 dias
            filtro = ` AND t.created_at >= NOW() - INTERVAL 30 DAY `;
        }

        const sql = `
            SELECT 
                t.origem_user AS nome,
                COUNT(*) AS total
            FROM jp_conectada.tramitations t
            WHERE t.origem_user IS NOT NULL
              AND t.origem_user <> ''
              AND LOWER(t.origem_user) NOT LIKE '%cidad%'
              ${filtro}
            GROUP BY t.origem_user
            ORDER BY total DESC
            LIMIT 10;
        `;

        const [rows] = await db.query(sql, params);

        res.json(rows);

    } catch (error) {
        console.error("Erro ranking:", error);
        res.status(500).json({ error: "Erro ao carregar ranking de despachos" });
    }
});

app.get("/api/visao-geral", async (req, res) => {
  try {
    const tenantId = 1;

    // ---------- 1) Totais institucionais ----------
    const [[totServ]]   = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.services s WHERE tenant_id = ? AND s.active = 1`, [tenantId]
    );

    const [[totSetores]] = await db.query(
      `SELECT COUNT(*) AS total FROM jp_conectada.sectors ss WHERE tenant_id = 1 AND ss.active = 1`, [tenantId]
    );

    // Usuários ativos: vinculados a algum setor e active=1
    const [[totUsers]] = await db.query(
      `SELECT COUNT(DISTINCT u.id) AS total
         FROM jp_conectada.users u
         LEFT JOIN jp_conectada.sector_user su ON su.user_id = u.id
        WHERE u.tenant_id = ? AND u.active = 1`, [tenantId]
    );

    // Cidadãos (ajuste a tabela se for "citizens", "people" etc.)
    // 🔧 Se você usa outra, troque abaixo. Caso não tenha, retorne 0.
    const [[totCidadaos]] = await db.query(
      `SELECT COUNT(*) AS total
         FROM jp_conectada.citizens
        WHERE tenant_id = 1`, [tenantId]
    ).catch(() => [[{ total: 0 }]]); // fallback seguro

    // ---------- 2) Eficiência / Engajamento / Qualidade ----------
    // Mesma regra que você usa por setor:
    // eficiência = concluidas / total_solicitacoes
    // engajamento = (respondidas não concluídas) / (abertas não concluídas)
    const [[ef]] = await db.query(
      `SELECT
          COUNT(*)                                 AS total_solicitacoes,
          SUM(CASE WHEN s.status IN ('concluida','concluído','concluida_ok', 'CONCLUIDA') THEN 1 ELSE 0 END) AS total_concluidas,
          SUM(CASE WHEN s.status IN ('respondida','respondido','em_andamento','RESPONDIDA') THEN 1 ELSE 0 END) AS total_respondidas
        FROM jp_conectada.solicitations s
        WHERE s.tenant_id = ?`, [tenantId]
    ).catch(() => [[{
      total_solicitacoes: 0, total_concluidas: 0, total_respondidas: 0
    }]]);

    const totalSolic = Number(ef.total_solicitacoes || 0);
    const totalConcl = Number(ef.total_concluidas || 0);
    const totalResp  = Number(ef.total_respondidas || 0);

    const eficienciaPct = totalSolic > 0 ? (totalConcl / totalSolic) * 100 : 0;

    const abertasNaoConcl = Math.max(totalSolic - totalConcl, 0);
    let respondidasNaoConcl = totalResp - totalConcl;
    if (respondidasNaoConcl < 0) respondidasNaoConcl = 0;

    const engajamentoPct = abertasNaoConcl > 0
      ? (respondidasNaoConcl / abertasNaoConcl) * 100
      : 0;

    // Qualidade (média ponderada): média das notas ponderada pelo nº de avaliações
    // Ajuste a tabela/colunas de avaliações se necessário.
    const [[qual]] = await db.query(
      `SELECT
          AVG(av.score)      AS nota_media,
          COUNT(*)           AS total_avaliacoes
         FROM jp_conectada.service_evaluations av
         JOIN jp_conectada.solicitations s ON s.id = av.solicitation_id
        WHERE s.tenant_id = ?`, [tenantId]
    ).catch(() => [[{ nota_media: 0, total_avaliacoes: 0 }]]);

    // ---------- 3) Economia estimada ----------
    // Modelo simples (ajustável):
    //   p = páginas evitadas por solicitação (média)  ->  p = 4
    //   c = custo por página (papel+ impressão)       ->  c = 0.35 (R$)
    //   h = custo de manuseio/processo por doc físico ->  h = 0.80 (R$)
    //   economia = totalSolic * (p*c + h)
    const P_PAGINAS = 4;
    
    const C_PAGINA  = 0.35;
    const C_MANUSEIO= 0.80;

    const economiaRS = totalSolic * (P_PAGINAS * C_PAGINA + C_MANUSEIO);

    res.json({
      totais: {
        servicos:  totServ.total,
        setores:   totSetores.total,
        usuarios:  totUsers.total,
        cidadaos:  totCidadaos.total
      },
      desempenho: {
        eficiencia_pct:  Number(eficienciaPct.toFixed(1)),
        engajamento_pct: Number(engajamentoPct.toFixed(1)),
        qualidade_media: Number((qual.nota_media || 0).toFixed(2)),
        total_avaliacoes: Number(qual.total_avaliacoes || 0)
      },
      economia: {
        estimada_rs: Number(economiaRS.toFixed(2)),
        parametros: { P_PAGINAS, C_PAGINA, C_MANUSEIO }
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar visão geral" });
  }
});

app.get("/api/visao-geral/series", async (req, res) => {
  try {
    const tenantId = 1;
    const ano = Number(req.query.ano) || new Date().getFullYear();

    // Série mensal de solicitações (geradas e concluídas)
    const [serie] = await db.query(
      `SELECT
          MONTH(s.created_at) AS mes,
          COUNT(*)            AS geradas,
          SUM(CASE WHEN s.status IN ('concluida','concluído','concluida_ok','CONCLUIDA') THEN 1 ELSE 0 END) AS concluidas
        FROM jp_conectada.solicitations s
       WHERE s.tenant_id = ? AND YEAR(s.created_at) = ?
       GROUP BY MONTH(s.created_at)
       ORDER BY mes`, [tenantId, ano]
    );

    // Série mensal de logins (último login por usuário no mês) — opcional
    const [logins] = await db.query(
      `SELECT
          MONTH(u.last_login_at) AS mes,
          COUNT(*)               AS logins
         FROM jp_conectada.users u
        WHERE u.tenant_id = ? AND YEAR(u.last_login_at) = ?
        GROUP BY MONTH(u.last_login_at)
        ORDER BY mes`, [tenantId, ano]
    );

    res.json({ ano, solicitacoes: serie, logins });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar séries" });
  }
});

app.get("/api/visao-geral/evolucao-uso", async (req, res) => {
  try {
    const sql = `
      WITH RECURSIVE meses AS (
        SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 6 MONTH), '%Y-%m-01') AS mes
        UNION ALL
        SELECT DATE_FORMAT(DATE_ADD(mes, INTERVAL 1 MONTH), '%Y-%m-01')
        FROM meses
        WHERE mes < DATE_FORMAT(CURDATE(), '%Y-%m-01')
      ),
      abertas AS (
        SELECT DATE_FORMAT(s.created_at, '%Y-%m-01') AS mes, COUNT(*) AS qtd
        FROM jp_conectada.solicitations s
        WHERE s.tenant_id = 1
        GROUP BY 1
      ),
      conclusao_por_solicitacao AS (
        SELECT s.id, MIN(t.created_at) AS dt_conclusao
        FROM jp_conectada.solicitations s
        JOIN jp_conectada.tramitations t
          ON t.solicitation_id = s.id
        WHERE s.tenant_id = 1
          AND t.status = 1
        GROUP BY s.id
      ),
      concluidas AS (
        SELECT DATE_FORMAT(c.dt_conclusao, '%Y-%m-01') AS mes, COUNT(*) AS qtd
        FROM conclusao_por_solicitacao c
        GROUP BY 1
      )
      SELECT
        m.mes AS mes_iso,
        COALESCE(a.qtd, 0) AS abertas,
        COALESCE(c.qtd, 0) AS concluidas
      FROM meses m
      LEFT JOIN abertas   a ON a.mes = m.mes
      LEFT JOIN concluidas c ON c.mes = m.mes
      ORDER BY m.mes;
    `;
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (err) {
    console.error("Erro evolução-uso:", err);
    res.status(500).json({ error: "Falha ao carregar evolução de uso" });
  }
});

app.get("/api/solicitacoes/bairros-top6", async (req, res) => {
  try {
    const ano = req.query.ano || new Date().getFullYear();
    const tenant = 1;

    // Buscar os 6 bairros mais solicitantes no ano
    const [topBairros] = await db.query(
      `
      SELECT 
          s.neighborhood AS bairro,
          COUNT(*) AS total
      FROM solicitations s
      WHERE s.tenant_id = ?
        AND s.neighborhood IS NOT NULL
        AND YEAR(s.created_at) = ?
      GROUP BY s.neighborhood
      ORDER BY total DESC
      LIMIT 6
      `,
      [tenant, ano]
    );

    if (topBairros.length === 0) {
      return res.json([]);
    }

    const nomes = topBairros.map(b => b.bairro);

    // Buscar evolução mensal de cada um dos 6 bairros
    const [evolucao] = await db.query(
      `
      SELECT 
          s.neighborhood AS bairro,
          MONTH(s.created_at) AS mes,
          COUNT(*) AS total
      FROM solicitations s
      WHERE s.tenant_id = ?
        AND s.neighborhood IN (?)
        AND YEAR(s.created_at) = ?
      GROUP BY bairro, mes
      ORDER BY mes ASC
      `,
      [tenant, nomes, ano]
    );

    res.json({ bairros: topBairros, meses: evolucao });

  } catch (e) {
    console.error("Erro /bairros-top6:", e);
    res.status(500).json({ error: "Erro ao buscar bairros" });
  }
});

app.get("/api/indicadores/servicos-top5", async (req, res) => {
  try {
    const periodo = String(req.query.periodo || "90d");
    const inicio = getStartDateFromPeriod(periodo);
    const sql = `
      SELECT se.title AS servico, COUNT(*) AS total
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.services se ON se.id = s.service_id
      WHERE s.tenant_id = 1
        AND s.created_at BETWEEN ? AND NOW()
      GROUP BY se.title
      ORDER BY total DESC
      LIMIT 5`;
    const [rows] = await db.query(sql, [inicio]);
    res.json(rows);
  } catch (err) {
    logger.error("servicos-top5 erro", { error: String(err) });
    res.status(500).json({ error: "Falha ao carregar serviços top5" });
  }
});

app.get("/api/indicadores/setores-top5", async (req, res) => {
  try {
    const periodo = String(req.query.periodo || "90d");
    const inicio = getStartDateFromPeriod(periodo);
    const sql = `
      SELECT sec.title AS setor, COUNT(*) AS total
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.service_sector ss ON ss.service_id = s.service_id
      JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      WHERE s.tenant_id = 1
        AND sec.active = 1 AND sec.tenant_id = 1
        AND s.created_at BETWEEN ? AND NOW()
      GROUP BY sec.title
      ORDER BY total DESC
      LIMIT 5`;
    const [rows] = await db.query(sql, [inicio]);
    res.json(rows);
  } catch (err) {
    logger.error("setores-top5 erro", { error: String(err) });
    res.status(500).json({ error: "Falha ao carregar setores top5" });
  }
});

app.get("/api/indicadores/login-distribuicao", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                COUNT(*) AS total_usuarios,

                SUM(CASE 
                    WHEN last_login_at >= CURDATE() 
                    THEN 1 END) AS login_hoje,

                SUM(CASE 
                    WHEN last_login_at >= CURDATE() - INTERVAL 1 DAY
                     AND last_login_at < CURDATE()
                    THEN 1 END) AS login_ontem,

                SUM(CASE 
                    WHEN last_login_at >= NOW() - INTERVAL 7 DAY
                     AND last_login_at < CURDATE() - INTERVAL 1 DAY
                    THEN 1 END) AS login_ultimos_7_dias,

                SUM(CASE 
                    WHEN last_login_at >= NOW() - INTERVAL 15 DAY
                     AND last_login_at < NOW() - INTERVAL 7 DAY
                    THEN 1 END) AS login_7a15,

                SUM(CASE 
                    WHEN last_login_at >= NOW() - INTERVAL 30 DAY
                     AND last_login_at < NOW() - INTERVAL 15 DAY
                    THEN 1 END) AS login_15a30,

                SUM(CASE 
                    WHEN last_login_at < NOW() - INTERVAL 30 DAY
                    THEN 1 END) AS login_mais30,

                SUM(CASE WHEN last_login_at IS NULL THEN 1 END) AS nunca_logou

            FROM jp_conectada.users
            WHERE tenant_id = 1
              AND active = 1;
        `);

        const r = rows[0];

        res.json({
            totalUsuarios: r.total_usuarios || 0,
            loginHoje: r.login_hoje || 0,
            loginOntem: r.login_ontem || 0,
            loginUltimos7: r.login_ultimos_7_dias || 0,
            login7a15: r.login_7a15 || 0,
            login15a30: r.login_15a30 || 0,
            loginMais30: r.login_mais30 || 0,
            nuncaLogou: r.nunca_logou || 0
        });

    } catch (err) {
        console.error("Erro SQL login-distribuicao:", err);
        res.status(500).json({ error: "Erro ao carregar distribuição de login" });
    }
});



app.get("/usuarios/kpis", async (req, res) => {
  try {
    const hoje = new Date();
    const inicio30 = new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000);
    const inicio30_str = inicio30.toISOString().slice(0, 10);
    const fim30_str = hoje.toISOString().slice(0, 10);

    /* ============================================================
       1) TOTAL DE SERVIDORES ATIVOS
    ============================================================ */
    const [totalServidoresRows] = await db.query(
      `
        SELECT COUNT(*) AS total
        FROM users
        WHERE tenant_id = 1
          AND active = 1
      `
    );
    const total_servidores = totalServidoresRows[0]?.total || 0;

    /* ============================================================
       2) QUEM DESPACHOU NAS ÚLTIMAS 24H
    ============================================================ */
    const [despacharam24Rows] = await db.query(
      `
        SELECT COUNT(DISTINCT t.origem_user) AS total
        FROM tramitations t
        JOIN solicitations s ON s.id = t.solicitation_id
        WHERE s.tenant_id = 1
          AND s.deleted_at IS NULL
          AND t.created_at >= NOW() - INTERVAL 24 HOUR
      `
    );
    const despacharam_24h = despacharam24Rows[0]?.total || 0;

    /* ============================================================
       3) QUEM ESTÁ SEM DESPACHAR > 30 DIAS
         (ou nunca despachou)
    ============================================================ */
    const [semDespachar30Rows] = await db.query(
      `
      WITH ultimos AS (
          SELECT 
              u.id,
              CONCAT(u.first_name, ' ', u.last_name) AS nome,
              (
                  SELECT MAX(t.created_at)
                  FROM tramitations t
                  JOIN solicitations s ON s.id = t.solicitation_id
                  WHERE s.tenant_id = 1
                    AND s.deleted_at IS NULL
                    AND t.origem_user = CONCAT(u.first_name, ' ', u.last_name)
              ) AS ultimo
          FROM users u
          WHERE u.tenant_id = 1
            AND u.active = 1
      )
      SELECT COUNT(*) AS total
      FROM ultimos
      WHERE ultimo IS NULL
         OR ultimo < (NOW() - INTERVAL 30 DAY)
      `
    );

    const sem_despachar_30d = semDespachar30Rows[0]?.total || 0;

    /* ============================================================
       4) CRIADOS NOS ÚLTIMOS 30 DIAS
    ============================================================ */
    const [criados30Rows] = await db.query(
      `
        SELECT COUNT(*) AS total
        FROM users
        WHERE tenant_id = 1
          AND active = 1
          AND DATE(created_at) BETWEEN ? AND ?
      `,
      [inicio30_str, fim30_str]
    );

    const criados_30d = criados30Rows[0]?.total || 0;

    /* ============================================================
       RESPOSTA FINAL
    ============================================================ */

    res.json({
      total_servidores,
      despacharam_24h,
      sem_despachar_30d,
      criados_30d
    });

  } catch (err) {
    console.error("Erro na rota /usuarios/kpis:", err);
    res.status(500).json({ error: true });
  }
});



app.get("/api/visao-geral/contadores", async (req, res) => {
  try {
    const sql = `
      SELECT
        /* serviços cadastrados */
        (SELECT COUNT(*) FROM jp_conectada.services s WHERE s.tenant_id = ? AND s.active = 1) AS total_servicos,

        /* usuários (servidores) ativos */
        (SELECT COUNT(*) FROM jp_conectada.users u WHERE u.tenant_id = ? AND u.active = 1) AS total_usuarios,

        /* cidadãos (contas de portal) */
        (SELECT COUNT(*) FROM jp_conectada.citizens c WHERE c.tenant_id = 1 AND c.active = 1) AS total_cidadaos,

        /* setores */
        (SELECT COUNT(*) FROM jp_conectada.sectors se WHERE se.tenant_id = ? AND se.active = 1) AS total_setores,

        /* eficiência global (exemplo): concluidas / total * 100
           Ajuste para sua regra real: aqui usamos tabela 'solicitations' com status.
        */
        (
          SELECT 
            IFNULL( (SUM(CASE WHEN s.status = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)) * 100, 0)
          FROM jp_conectada.solicitations s
          WHERE s.tenant_id = 1
        ) AS eficiencia_pct,

        /* qualidade média (exemplo): média de nota 1..5 de uma tabela 'ratings' */
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

app.get("/api/visao-geral/cidadaos-resumo", async (req, res) => {
  try {
    const sql = `
      SELECT
        SUM(CASE WHEN LOWER(c.gender) IN ('m','masculino') THEN 1 ELSE 0 END) AS homens,
        SUM(CASE WHEN LOWER(c.gender) IN ('f','feminino') THEN 1 ELSE 0 END) AS mulheres,
        FLOOR(AVG(TIMESTAMPDIFF(YEAR, c.birthday, CURDATE()))) AS idade_media
      FROM jp_conectada.citizens c
      WHERE c.tenant_id = 1
    `;
    const [rows] = await db.query(sql, [TENANT_ID]);
    res.json({
      homens: rows[0]?.homens || 0,
      mulheres: rows[0]?.mulheres || 0,
      idade_media: rows[0]?.idade_media || 0
    });
  } catch (err) {
    console.error("Cidadaos resumo erro:", err);
    res.status(500).json({ error: "Falha ao carregar resumo de cidadãos" });
  }
});
app.get("/api/visao-geral/evolucao-uso", async (req, res) => {
  try {
    const sql = `
      SELECT
        DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m-01') AS mes_iso,

        /* Abertas no mês pela created_at */
        (
          SELECT COUNT(*)
          FROM jp_conectada.solicitations s
          WHERE s.tenant_id = ?
            AND s.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m-01')
            AND s.created_at <  DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n-1 MONTH), '%Y-%m-01')
        ) AS abertas,

        /* Concluídas no mês pela updated_at com status = 1  */
        (
          SELECT COUNT(*)
          FROM jp_conectada.solicitations s2
          WHERE s2.tenant_id = 1
            AND s2.status = 1
            AND s2.updated_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n MONTH), '%Y-%m-01')
            AND s2.updated_at <  DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL seq.n-1 MONTH), '%Y-%m-01')
        ) AS concluidas
      FROM (
        SELECT 11 AS n UNION ALL SELECT 10 UNION ALL SELECT 9 UNION ALL SELECT 8 UNION ALL
        SELECT 7 UNION ALL SELECT 6 UNION ALL SELECT 5 UNION ALL SELECT 4 UNION ALL
        SELECT 3 UNION ALL SELECT 2 UNION ALL SELECT 1 UNION ALL SELECT 0
      ) seq
      ORDER BY DATE(mes_iso);
    `;

    const [rows] = await db.query(sql, [TENANT_ID, TENANT_ID]);
    res.json(rows);
  } catch (err) {
    console.error("Evolução erro:", err);
    res.status(500).json({ error: "Falha ao carregar evolução de uso" });
  }
});

app.get("/api/visao-geral/economia", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano, 10) || new Date().getFullYear();

    const sql = `
      SELECT
        DATE_FORMAT(s.created_at, '%Y-%m-01') AS mes_iso,
        COUNT(*) AS solicitacoes_mes,
        /* Exemplo: R$ 2,50 de papel + R$ 1,00 de impressão + R$ 3,50 de logística = R$ 7,00 por processo */
        COUNT(*) * 7.00 AS economia_estimativa
      FROM jp_conectada.solicitations s
      WHERE s.tenant_id = 1
        AND YEAR(s.created_at) = ?
      GROUP BY mes_iso
      ORDER BY mes_iso;
    `;

    const [rows] = await db.query(sql, [TENANT_ID, ano]);
    res.json(rows);
  } catch (err) {
    console.error("Economia erro:", err);
    res.status(500).json({ error: "Falha ao carregar economia" });
  }
});

app.get("/api/grafico-top3-bairros", async (req, res) => {
  try {
    const [rows] = await db.query(`
      WITH total_bairros AS (
          SELECT 
              n.id AS bairro_id,
              n.title AS bairro,
              COUNT(*) AS total
          FROM jp_conectada.solicitations s
          JOIN jp_conectada.neighborhoods n ON n.id = s.lives_at
          WHERE s.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
          GROUP BY n.id, n.title
          ORDER BY total DESC
          LIMIT 5
      )
      SELECT
          DATE_FORMAT(s.created_at, '%Y-%m') AS mes,
          n.id AS bairro_id,
          n.title AS bairro,
          COUNT(*) AS total
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.neighborhoods n ON n.id = s.lives_at
      JOIN total_bairros t ON t.bairro_id = n.id
      WHERE s.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY mes, bairro
      ORDER BY mes ASC, bairro ASC;
    `);

    res.json(rows);

  } catch (err) {
    console.error("Erro ao gerar gráfico top3 bairros:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.get('/api/indicadores-periodo/servicos', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const startDate = getStartDateFromPeriod(period);

    const [rows] = await db.query(
      `
      SELECT
        sv.id AS service_id,
        sv.title AS service_name,
        COUNT(*) AS total
      FROM solicitations s
      JOIN services sv ON sv.id = s.service_id
      WHERE
        s.tenant_id = ?
        AND s.created_at >= ?
        AND s.deleted_at IS NULL
      GROUP BY sv.id, sv.title
      ORDER BY total DESC
      LIMIT 5;
      `,
      [TENANT_ID, startDate]
    );

    res.json(rows);
  } catch (error) {
    console.error('Erro ao carregar serviços mais solicitados:', error);
    res.status(500).json({ error: 'Erro ao carregar dados' });
  }
});

app.get('/api/indicadores-periodo/setores', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const startDate = getStartDateFromPeriod(period);

    const [rows] = await db.query(
      `
      SELECT
          st.id AS sector_id,
          st.title AS sector_name,
          COUNT(*) AS total
      FROM solicitations s
      JOIN service_sector ss 
          ON ss.service_id = s.service_id
          AND ss.\`primary\` = 1
      JOIN sectors st 
          ON st.id = ss.sector_id
      WHERE
          s.tenant_id = 1
          AND s.created_at >= ?
          AND s.deleted_at IS NULL
      GROUP BY st.id, st.title
      ORDER BY total DESC
      LIMIT 5;
      `,
      [startDate]
    );

    res.json(rows);
  } catch (error) {
    console.error("Erro ao carregar setores mais solicitados:", error);
    res.status(500).json({ error: "Erro ao buscar dados" });
  }
});


app.get("/api/indicadores/taxa-resolucao", async (req, res) => {
  try {
    const periodo = req.query.periodo || "30d";
    const { inicio, fim } = getPeriodoDates(periodo);

    /* ============================================================
       1) TOTAL INICIADAS (criadas no período)
    ============================================================ */
    const [rowsIniciadas] = await db.query(
      `
      SELECT COUNT(*) AS iniciadas
      FROM jp_conectada.solicitations
      WHERE tenant_id = 1
        AND deleted_at IS NULL
        AND created_at BETWEEN ? AND ?;
      `,
      [inicio, fim]
    );

    const iniciadas = Number(rowsIniciadas[0].iniciadas || 0);

    /* ============================================================
       2) RESPONDIDAS = 1ª movimentação (exclui cidadão)
          INCLUI também as concluídas, pois elas obviamente foram respondidas
          Conta respostas do PERÍODO
    ============================================================ */
    const [rowsRespondidas] = await db.query(
      `
      SELECT COUNT(DISTINCT s.id) AS respondidas
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.tramitations t 
            ON t.solicitation_id = s.id
           AND t.origem_user <> 'Cidadão'
      WHERE s.tenant_id = 1
        AND s.deleted_at IS NULL
        AND t.created_at BETWEEN ? AND ?;
      `,
      [inicio, fim]
    );

    const respondidas = Number(rowsRespondidas[0].respondidas || 0);

    /* ============================================================
       3) CONCLUÍDAS NO PERÍODO (status = 1)
    ============================================================ */
    const [rowsResolvidas] = await db.query(
      `
      SELECT created_at, updated_at
      FROM jp_conectada.solicitations
      WHERE tenant_id = 1
        AND deleted_at IS NULL
        AND status = 1
        AND updated_at BETWEEN ? AND ?;
      `,
      [inicio, fim]
    );

    const resolvidas = rowsResolvidas.length;

    /* ============================================================
       4) TEMPO MÉDIO (em minutos)
    ============================================================ */
    let totalMinutos = 0;

    for (const s of rowsResolvidas) {
      const abertura = new Date(s.created_at);
      const fechamento = new Date(s.updated_at);

      totalMinutos += Math.floor((fechamento - abertura) / 60000);
    }

    const tempo_medio_conclusao_min =
      resolvidas > 0 ? Math.floor(totalMinutos / resolvidas) : 0;

    /* ============================================================
       5) TAXAS
    ============================================================ */

    const taxa_respostas =
      iniciadas > 0 ? Number(((respondidas / iniciadas) * 100).toFixed(1)) : 0;

    const taxa_resolucao =
      iniciadas > 0 ? Number(((resolvidas / iniciadas) * 100).toFixed(1)) : 0;

    /* ============================================================
       6) MÉDIA DIÁRIA
    ============================================================ */
    const diasPeriodo = Math.max(
      1,
      Math.floor((new Date(fim) - new Date(inicio)) / 86400000) + 1
    );

    const media_diaria = iniciadas > 0 ? iniciadas / diasPeriodo : 0;

    /* ============================================================
       7) RETORNO FINAL — COMPATÍVEL COM O FRONT
    ============================================================ */
    res.json({
      periodo,
      inicio,
      fim,

      iniciadas,
      respondidas,
      resolvidas,

      taxa_respostas,
      taxa_resolucao,

      media_diaria,
      dias_periodo: diasPeriodo,

      tempo_medio_conclusao_min
    });

  } catch (err) {
    console.error("Erro ao calcular indicadores:", err);
    res.status(500).json({ error: "Erro interno no servidor" });
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

app.get("/api/economometro", async (req, res) => {
  try {
    const periodo = req.query.periodo || "ano";

    // ============================================================
    // 1) Definir intervalo de datas
    // ============================================================
    const hoje = new Date();
    let inicio = new Date(hoje);

    switch (periodo) {
      case "esta-semana":
        inicio.setDate(hoje.getDate() - hoje.getDay());
        break;

      case "este-mes":
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        break;

      case "90d":
        inicio.setDate(hoje.getDate() - 90);
        break;

      case "6m":
        inicio.setMonth(hoje.getMonth() - 6);
        break;

      case "ano":
      default:
        inicio = new Date(hoje.getFullYear(), 0, 1);
        break;
    }

    const inicioISO = inicio.toISOString().slice(0, 19).replace("T", " ");
    const fimISO    = hoje.toISOString().slice(0, 19).replace("T", " ");

    // ============================================================
    // 2) Consultas SQL reais
    // ============================================================

    // 2.1 — Solicitações criadas
    const [solRows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM solicitations
      WHERE tenant_id = 1
        AND created_at BETWEEN ? AND ?
        AND deleted_at IS NULL
      `,
      [inicioISO, fimISO]
    );

    // 2.2 — Tramitações realizadas
    // (Sua tabela NÃO possui tenant_id, ajustado!)
const [tramRows] = await db.query(
  `
  SELECT COUNT(*) AS total
  FROM tramitations t
  JOIN solicitations s ON s.id = t.solicitation_id
  WHERE s.tenant_id = 1
    AND t.created_at BETWEEN ? AND ?
  `,
  [inicioISO, fimISO]
);


    // NOTA: Notificações não entram no economômetro, mas podem entrar se quiser.

    const totalSolic = solRows[0].total || 0;
    const totalTram = tramRows[0].total || 0;

    // ============================================================
    // 3) Cálculo REAL da economia
    // ============================================================

    // 🔹 CUSTO MÉDIO POR PÁGINA
    const custoPagina = 0.35; // R$ 0,35 — você pode ajustar

    // 🔹 Folhas economizadas:
    // 1 solicitação => média 0.65 páginas economizadas
    // 1 tramitação  => média 0.20 páginas economizadas
    const folhas = (totalSolic * 0.65) + (totalTram * 0.20);

    // 🔹 Árvores preservadas:
    const arvores = folhas / 8000;



    // ============================================================
    // 4) Retornar resultado
    // ============================================================
res.json({
  periodo,
  intervalo: { inicio: inicioISO, fim: fimISO },

  solicitacoes: totalSolic,
  tramitacoes: totalTram,

  folhas: Math.round(folhas),
  arvores: (folhas / 8000).toFixed(3),
  dinheiro: (folhas * custoPagina).toFixed(2),

  custo_pagina_usado: custoPagina
});


  } catch (err) {
    console.error("Erro no economômetro:", err);
    res.status(500).json({ error: "Erro ao gerar economômetro" });
  }
});

app.get("/api/solicitacoes/setores", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT 
          s.id AS sector_id,
          s.title AS name
      FROM sectors s
      JOIN service_sector ss ON ss.sector_id = s.id
      WHERE s.tenant_id = 1
      and active = 1 
      ORDER BY s.title;
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/setores:", err);
    res.status(500).json({ error: "Erro ao carregar setores" });
  }
});


app.get("/api/solicitacoes/servicos", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT 
          sv.id AS service_id,
          sv.title AS name
      FROM services sv
      JOIN service_sector ss ON ss.service_id = sv.id
      WHERE sv.tenant_id = 1
      ORDER BY sv.title;
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/servicos:", err);
    res.status(500).json({ error: "Erro ao buscar serviços" });
  }
});

app.get("/api/solicitacoes/servicos-por-setor", async (req, res) => {
  try {
    const setorId = req.query.setor;
    if (!setorId) return res.json([]);

    const [rows] = await db.query(`
      SELECT DISTINCT 
          sv.id AS service_id,
          sv.title AS name
      FROM services sv
      JOIN service_sector ss ON ss.service_id = sv.id
      WHERE ss.sector_id = ?
      ORDER BY sv.title;
    `, [setorId]);

    res.json(rows);

  } catch (err) {
    console.error("Erro /solicitacoes/servicos-por-setor:", err);
    res.status(500).json({ error: "Erro ao buscar serviços por setor" });
  }
});


/* ============================================================
   RESUMO DOS CARDS — TOTAL | INICIADAS | ESPERA | RESPONDIDAS | CONCLUÍDAS
============================================================ */
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

    // Filtrar setor → via tabela service_sector
    if (setor) {
      where += " AND EXISTS (SELECT 1 FROM service_sector ss WHERE ss.service_id = s.service_id AND ss.sector_id = ?)";
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
      FROM solicitations s
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
          FROM service_sector ss 
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
      FROM solicitations s
      LEFT JOIN citizens c ON c.id = s.citizen_id
      LEFT JOIN services sv ON sv.id = s.service_id
      LEFT JOIN service_sector ss ON ss.service_id = s.service_id AND ss.primary = 1
      LEFT JOIN sectors sec ON sec.id = ss.sector_id
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



async function carregarEvolucaoSetor(id) {
    const res = await fetch(`http://localhost:3000/api/setor/${id}/evolucao`);
    const dados = await res.json();

    const labels = dados.map(m => m.mes);
    const valores = dados.map(m => m.total);

    const ctx = document.getElementById("graficoEvolucaoSetor").getContext("2d");

    if (graficoEvolucaoSetor) graficoEvolucaoSetor.destroy();

    graficoEvolucaoSetor = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Solicitações",
                data: valores,
                borderWidth: 3,
                borderColor: "#2563eb",
                backgroundColor: "rgba(37,99,235,.15)",
                tension: .25
            }]
        },
        options: { responsive: true }
    });
}



async function carregarStatusSetor(id) {
    const res = await fetch(`http://localhost:3000/api/setor/${id}/status`);
    const dados = await res.json();

    const labels = dados.map(d => d.status_nome);
    const valores = dados.map(d => d.total);

    const ctx = document.getElementById("graficoStatusSetor").getContext("2d");

    if (graficoStatusSetor) graficoStatusSetor.destroy();

    graficoStatusSetor = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: valores,
                borderWidth: 0,
                backgroundColor: ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#6b7280"]
            }]
        }
    });
}
async function carregarServicosMaisSolicitados(id) {
    const res = await fetch(`http://localhost:3000/api/setor/${id}/servicos`);
    const dados = await res.json();

    const box = document.getElementById("listaServicosSetor");
    box.innerHTML = "";

    dados.forEach(s => {
        box.innerHTML += `
            <div>
                <span>${s.servico}</span>
                <strong>${s.total}</strong>
            </div>
        `;
    });
}


app.get("/api/setor/:id/servicos", async (req, res) => {
    try {
        const setorId = req.params.id;

        const [rows] = await db.query(
            `SELECT 
                sv.id AS servico_id,
                sv.title AS servico,
                COUNT(s.id) AS total
            FROM solicitations s
            JOIN services sv ON sv.id = s.service_id
            JOIN service_sector ss ON ss.service_id = sv.id
            WHERE ss.sector_id = ?
              AND s.tenant_id = 1
              AND s.deleted_at IS NULL
            GROUP BY sv.id, sv.title
            ORDER BY total DESC`,
            [setorId]
        );

        res.json(rows);

    } catch (e) {
        console.error("Erro /setor/servicos:", e);
        res.status(500).json({ error: "Erro ao buscar serviços do setor" });
    }
});


app.get("/api/setor/:id/evolucao", async (req, res) => {
    try {
        const setorId = req.params.id;
        const ano = parseInt(req.query.ano) || new Date().getFullYear();

        const [rows] = await db.query(
            `WITH meses AS (
                SELECT 1 mes UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION
                SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION
                SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12
            )
            SELECT
                m.mes,
                DATE_FORMAT(STR_TO_DATE(CONCAT(?, '-', m.mes, '-01'), '%Y-%m-%d'), '%b') AS mes_nome,
                COALESCE((
                    SELECT COUNT(*)
                    FROM solicitations s
                    JOIN service_sector ss ON ss.service_id = s.service_id
                    WHERE ss.sector_id = ?
                      AND s.tenant_id = 1
                      AND YEAR(s.created_at) = ?
                      AND MONTH(s.created_at) = m.mes
                      AND s.deleted_at IS NULL
                ),0) AS total
            FROM meses m
            ORDER BY m.mes`,
            [ano, setorId, ano]
        );

        res.json(rows);

    } catch (e) {
        console.error("Erro /setor/evolucao:", e);
        res.status(500).json({ error: "Erro ao carregar evolução do setor" });
    }
});
app.get("/api/setor/:id/status", async (req, res) => {
    try {
        const setorId = req.params.id;

        const [rows] = await db.query(
            `SELECT 
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
            FROM solicitations s
            JOIN service_sector ss ON ss.service_id = s.service_id
            WHERE ss.sector_id = ?
              AND s.tenant_id = 1
              AND s.deleted_at IS NULL
            GROUP BY s.status
            ORDER BY total DESC`,
            [setorId]
        );

        res.json(rows);


    } catch (e) {
        console.error("Erro /setor/status:", e);
        res.status(500).json({ error: "Erro ao carregar status do setor" });
    }
});



app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "index.html"), err => {
    if (err) next();
  });
});


/* =============================
   ✅ 404 Handler
============================= */
app.use((req, res) => {
  logger.error("rota não encontrada", { path: req.originalUrl });
  res.status(404).json({ error: "Rota não encontrada" });
});


/* =============================
   ✅ Error Handler Global
============================= */
app.use((err, req, res, next) => {
  logger.error("erro interno", { err });
  res.status(500).json({ error: "Erro interno no servidor" });
});


/* =============================
   ✅ START SERVER
============================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`✅ Servidor rodando na porta ${PORT}`, {
    env: process.env.NODE_ENV || "development"
  });
});
