const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
const corsOptions = {
  origin: function (origin, callback) {
    const isDev = process.env.NODE_ENV !== "production";
    if (!origin && isDev) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
};
app.use(cors(corsOptions));
app.use(helmet());
app.set("trust proxy", 1);
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));
app.use(express.json());
app.use(express.static(path.join(__dirname), { maxAge: process.env.STATIC_MAXAGE || "1d", etag: true }));

const logger = {
  info: (msg, meta) => console.log(JSON.stringify({ level: "info", msg, ...meta })),
  error: (msg, meta) => console.error(JSON.stringify({ level: "error", msg, ...meta }))
};

/* ============================================================
   🔥 CONEXÃO COM MYSQL
============================================================ */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// Converte data BR (dd/mm/aaaa) → MySQL (aaaa-mm-dd)
function brToMySQL(dateBR) {
    if (!dateBR) return null;
    const [dia, mes, ano] = dateBR.split("/");
    return `${ano}-${mes}-${dia}`;
}

function isISODate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

function validateDateRange(start, end) {
  if (!start || !end) return { ok: false, reason: "Missing dates" };
  if (!isISODate(start) || !isISODate(end)) return { ok: false, reason: "Invalid format" };
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T23:59:59`);
  if (isNaN(s) || isNaN(e)) return { ok: false, reason: "Invalid date" };
  if (s > e) return { ok: false, reason: "Start after end" };
  return { ok: true, start, end };
}


/* ============================================================
   1) ROTA PRINCIPAL → SETORES + SERVIÇOS
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

/* ============================================================
   2) ROTA RESUMO DE USUÁRIOS POR SETOR
============================================================ */
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

/* ============================================================
   3) ROTA LISTA COMPLETA DE USUÁRIOS POR SETOR
============================================================ */
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

/* ============================================================
   4) ROTA EFICIÊNCIA + ENGAJAMENTO
============================================================ */
app.get("/api/setores-eficiencia", async (req, res) => {
  try {
    const [rows] = await db.query(`
      WITH solicitacoes_por_setor AS (
        SELECT
          si.involvedable_id AS sector_id,
          COUNT(*) AS total_solicitacoes,
          COUNT(CASE WHEN si.status = 0 THEN 1 END) AS total_abertas,
          COUNT(CASE WHEN si.status = 1 THEN 1 END) AS total_concluidas,
          COUNT(CASE WHEN si.status = 2 THEN 1 END) AS total_respondidas
        FROM jp_conectada.solicitation_involved si
        JOIN jp_conectada.solicitations s
             ON s.id = si.solicitation_id
            AND s.tenant_id = 1
        WHERE si.tenant_id = 1
          AND si.involvedable_type = 'App\\\\Models\\\\Sector\\\\Sector'
        GROUP BY si.involvedable_id
      )

      SELECT
        sp.sector_id,
        sec.title AS sector_title,
        sp.total_solicitacoes,
        sp.total_abertas,
        (sp.total_solicitacoes - sp.total_abertas - sp.total_concluidas) AS total_andamento,
        sp.total_concluidas,
        sp.total_respondidas,
        CASE 
          WHEN sp.total_solicitacoes > 0 
            THEN ROUND((sp.total_concluidas / sp.total_solicitacoes) * 100, 2)
          ELSE 0
        END AS eficiencia_percentual,
        CASE 
          WHEN sp.total_solicitacoes > 0 
            THEN ROUND((sp.total_respondidas / sp.total_solicitacoes) * 100, 2)
          ELSE 0
        END AS engajamento_percentual
      FROM solicitacoes_por_setor sp
      JOIN jp_conectada.sectors sec
            ON sec.id = sp.sector_id
           AND sec.active = 1
           AND sec.tenant_id = 1
      ORDER BY sec.title;
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
          JOIN jp_conectada.services se
                 ON se.id = ss.service_id
          WHERE se.tenant_id = 1
          GROUP BY ss.sector_id
      ),
      solicitacoes_por_setor AS (
          SELECT
              ss.sector_id,
              COUNT(s.id) AS total_solicitacoes
          FROM jp_conectada.service_sector ss
          JOIN jp_conectada.services se ON se.id = ss.service_id
          LEFT JOIN jp_conectada.solicitations s
                 ON s.service_id = ss.service_id
                AND s.tenant_id = 1
          WHERE se.tenant_id = 1
          GROUP BY ss.sector_id
      )

      SELECT
          sec.id AS sector_id,
          sec.title AS setor,
          nps.nota_media,
          nps.total_avaliacoes,
          sp.total_solicitacoes,
          (nps.total_avaliacoes / NULLIF(sp.total_solicitacoes, 0)) * 100 AS percentual_avaliado
      FROM jp_conectada.sectors sec
      LEFT JOIN notas_por_setor nps ON nps.sector_id = sec.id
      LEFT JOIN solicitacoes_por_setor sp ON sp.sector_id = sec.id
      WHERE sec.active = 1
        AND sec.tenant_id = 1
      ORDER BY setor;
    `);

    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar qualidade dos setores" });
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

/* ============================================================
   INDICADOR — SERVIDORES POR SETOR (GRÁFICO FIXO)
============================================================ */
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
    const tenantId = 1;

    let dataIni = null;
    let dataFim = null;
    if (dataInicial && dataFinal) {
      const v = validateDateRange(dataInicial, dataFinal);
      if (!v.ok) {
        return res.status(400).json({ error: "Parâmetros de data inválidos" });
      }
      dataIni = `${v.start} 00:00:00`;
      dataFim = `${v.end} 23:59:59`;
    }

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
    logger.error("Erro ao carregar usuários detalhados", { error: String(err) });
    res.status(500).json({ error: "Erro ao consultar usuários" });
  }
});



/* ============================================================
   ROTA — Estatísticas de Usuários (cards do painel)
============================================================ */
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
    try {
        const tenantId = 1;

        let { dataInicial, dataFinal } = req.query;

        let filtro = "";
        let params = [];

        if (dataInicial && dataFinal) {
            const v = validateDateRange(dataInicial, dataFinal);
            if (!v.ok) {
              return res.status(400).json({ error: "Parâmetros de data inválidos" });
            }
            filtro = ` AND t.created_at BETWEEN ? AND ? `;
            params.push(v.start, v.end);
        } else {
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
        logger.error("Erro ranking", { error: String(error) });
        res.status(500).json({ error: "Erro ao carregar ranking de despachos" });
    }
});

/* ============================================================
   🌐 VISÃO GERAL — MÉTRICAS EXECUTIVAS (AGREGADO DO TENANT)
   GET /api/visao-geral
   GET /api/visao-geral/series?ano=2025 (time series mensal)
============================================================ */

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
        SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 11 MONTH), '%Y-%m-01') AS mes
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


/* ============================================================
   VISÃO GERAL — ROTAS (cole no seu server.js)
============================================================ */
const TENANT_ID = 1;

/**
 * 1) Contadores globais (KPIs)
 * - total de serviços (services)
 * - total de usuários (users)
 * - total de cidadãos (citizens)
 * - total de setores (sectors)
 * - eficiência global (ex.: concluidas/total em %)
 * - qualidade média (ex.: média geral das avaliações 1..5)
 *
 * Ajuste os SELECTs conforme os nomes reais das suas tabelas/colunas.
 */
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


/**
 * 2) Resumo de cidadãos: homens, mulheres, idade média
 * Ajuste as colunas de sexo/data_nascimento conforme seu schema.
 */
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
/* rota duplicada removida: /api/visao-geral/evolucao-uso */



/**
 * 4) Economia gerada — por ano/mês
 * - Query param: ?ano=2025
 * - Fórmula exemplo: economia = solicitacoes_mes * 0.65 (ajuste sua regra real!)
 */
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




















/* ============================================================
   🔥 INICIA SERVIDOR
============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info("Servidor iniciado", { port: PORT });
});
