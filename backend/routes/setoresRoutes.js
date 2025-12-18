// routes/setoresRoutes.js
const express = require("express");
const db = require("../db");
const { TENANT_ID } = require("../utils/constants");

const router = express.Router();

router.get("/setores", async (req, res) => {
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
    console.error("Erro /setores:", error);
    res.status(500).json({ error: "Erro ao buscar setores" });
  }
});
router.get("/setores-usuarios-resumo", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
          s.id AS sector_id,
          s.title AS setor,
          COUNT(DISTINCT su.user_id) AS total_usuarios
      FROM jp_conectada.sectors s
      LEFT JOIN jp_conectada.sector_user su 
             ON su.sector_id = s.id
      LEFT JOIN jp_conectada.users u 
             ON u.id = su.user_id
            AND u.active = 1
            AND u.email NOT LIKE '%@cubotecnologiabr.com.br%'
      WHERE s.tenant_id = ?
      GROUP BY s.id, s.title
      ORDER BY total_usuarios DESC;
      `,
      [TENANT_ID]
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro /setores-usuarios-resumo:", err);
    res.status(500).json({ error: "Erro ao carregar resumo de usuários" });
  }
});

router.get("/setores/:id/usuarios", async (req, res) => {
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

router.get("/setores-eficiencia", async (req, res) => {
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
    console.error("Erro /setores-eficiencia:", error);
    res.status(500).json({ error: "Erro ao buscar eficiência por setor" });
  }
});


// Ranking de serviços ÚNICOS por secretaria (nível 0)
router.get("/setores-ranking-servicos", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      WITH RECURSIVE setores_hierarquia AS (
        SELECT
          id AS sector_id,
          parent_id,
          title,
          0 AS nivel,
          CAST(id AS CHAR(500)) AS path,
          id AS root_id,
          title AS root_title
        FROM jp_conectada.sectors
        WHERE active = 1
          AND tenant_id = ?
          AND parent_id IS NULL

        UNION ALL

        SELECT
          s.id AS sector_id,
          s.parent_id,
          s.title,
          sh.nivel + 1 AS nivel,
          CONCAT(sh.path, ',', s.id) AS path,
          sh.root_id,
          sh.root_title
        FROM jp_conectada.sectors s
        JOIN setores_hierarquia sh ON sh.sector_id = s.parent_id
        WHERE s.active = 1
          AND s.tenant_id = ?
      )
      SELECT
        sh.root_id AS sector_id,
        sh.root_title AS setor,
        COUNT(DISTINCT ss.service_id) AS total_servicos
      FROM setores_hierarquia sh
      JOIN jp_conectada.service_sector ss
        ON ss.sector_id = sh.sector_id
      JOIN jp_conectada.services se
        ON se.id = ss.service_id
       AND se.active = 1
       AND se.tenant_id = ?
      GROUP BY sh.root_id, sh.root_title
      ORDER BY total_servicos DESC, setor ASC;
      `,
      [TENANT_ID, TENANT_ID, TENANT_ID]
    );

    res.json(rows);
  } catch (error) {
    console.error("Erro /setores-ranking-servicos:", error);
    res.status(500).json({ error: "Erro ao buscar ranking de serviços" });
  }
});



router.get("/setores-qualidade", async (req, res) => {
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
    console.error("Erro /setores-qualidade:", err);
    res.status(500).json({ error: "Erro ao carregar qualidade dos setores" });
  }
});

router.get("/setores-consolidado", async (req, res) => {
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

router.get("/setores/setores", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT id, title 
      FROM jp_conectada.sectors
      WHERE tenant_id = ?
      ORDER BY title ASC
      `,
      [TENANT_ID]
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro /setores/setores:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/servicos/opcoes", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT id, title
      FROM jp_conectada.services
      WHERE tenant_id = ?
      ORDER BY title ASC
      `,
      [TENANT_ID]
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro /servicos/opcoes:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});


router.get("/setor/:id/servicos", async (req, res) => {
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
    console.error("Erro /setor/:id/servicos:", err);
    res.status(500).json({ error: "Erro ao buscar serviços do setor" });
  }
});

router.get("/setor/:id/evolucao", async (req, res) => {
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
    console.error("Erro /setor/:id/evolucao:", err);
    res.status(500).json({ error: "Erro ao carregar evolução do setor" });
  }
});

router.get("/setor/:id/status", async (req, res) => {
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
    console.error("Erro /setor/:id/status:", err);
    res.status(500).json({ error: "Erro ao carregar status do setor" });
  }
});

module.exports = router;
