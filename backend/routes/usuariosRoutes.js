// routes/usuariosRoutes.js
const express = require("express");
const db = require("../db");
const { TENANT_ID } = require("../utils/constants");


const router = express.Router();

/* Lista paginada simples (não é a tabela principal detalhada) */
router.get("/usuarios/lista", async (req, res) => {
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
    console.error("Erro /usuarios/lista:", err);
    res.status(500).json({ error: true });
  }
});

router.get("/usuarios/kpis", async (req, res) => {
  try {
    const hoje = new Date();
    const inicio30 = new Date(hoje.getTime() - 29 * 86400000);

    const inicio30_str = inicio30.toISOString().slice(0, 10);
    const fim_str = hoje.toISOString().slice(0, 10);

    const [[totalServidores]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM jp_conectada.users
      WHERE tenant_id = ?
        AND active = 1
        AND email NOT LIKE '%@cubotecnologiabr.com.br%'
      `,
      [TENANT_ID]
    );

    const [ultimos] = await db.query(
      `
      SELECT 
          t.origem_user AS nome,
          MAX(t.created_at) AS ultimo
      FROM jp_conectada.tramitations t
      JOIN jp_conectada.solicitations s ON s.id = t.solicitation_id
      WHERE s.tenant_id = ?
      GROUP BY t.origem_user
      `,
      [TENANT_ID]
    );

    const desp24 = ultimos.filter((u) => {
      if (!u.ultimo) return false;
      const diff = Date.now() - new Date(u.ultimo).getTime();
      return diff <= 24 * 60 * 60 * 1000;
    }).length;

    const limite30dias = Date.now() - 30 * 86400000;
    const semDesp30 = ultimos.filter((u) => {
      if (!u.ultimo) return true;
      return new Date(u.ultimo).getTime() < limite30dias;
    }).length;

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
      despacharam_24h: desp24,
      sem_despachar_30d: semDesp30,
      criados_30d: criados30.total,
    });
  } catch (err) {
    console.error("Erro /usuarios/kpis:", err);
    res.status(500).json({ error: true });
  }
});

router.get("/usuarios/detalhes", async (req, res) => {
  try {
    const inicio = req.query.inicio || null;
    const fim = req.query.fim || null;

    let filtroPeriodo = "";
    const params = [];

    if (inicio && fim) {
      filtroPeriodo = ` AND t.created_at BETWEEN ? AND ? `;
      params.push(`${inicio} 00:00:00`);
      params.push(`${fim} 23:59:59`);
    }

    const [rows] = await db.query(
      `
      WITH setores AS (
        SELECT 
            su.user_id,
            GROUP_CONCAT(s.title SEPARATOR ', ') AS setores
        FROM sector_user su
        JOIN sectors s ON s.id = su.sector_id
        WHERE su.active = 1
        GROUP BY su.user_id
      ),
      ultimos AS (
        SELECT 
            t.origem_user AS nome,
            MAX(t.created_at) AS ultimo
        FROM tramitations t
        JOIN solicitations s ON s.id = t.solicitation_id
        WHERE s.tenant_id = ?
        GROUP BY t.origem_user
      ),
      periodo AS (
        SELECT 
            t.origem_user AS nome,
            COUNT(*) AS total
        FROM tramitations t
        JOIN solicitations s ON s.id = t.solicitation_id
        WHERE s.tenant_id = ?
          ${filtroPeriodo}
        GROUP BY t.origem_user
      )
      SELECT
          u.id,
          CONCAT(u.first_name, ' ', u.last_name) AS nome,
          st.setores AS secretaria,
          u.email,
          u.phone,
          u.created_at AS data_cadastro,
          ul.ultimo AS ultimo_despacho,
          CASE 
              WHEN ul.ultimo IS NULL THEN NULL
              ELSE DATEDIFF(CURDATE(), DATE(ul.ultimo))
          END AS dias_sem_despacho,
          COALESCE(pe.total, 0) AS despachos_periodo
      FROM users u
      LEFT JOIN setores st ON st.user_id = u.id
      LEFT JOIN ultimos ul ON ul.nome = CONCAT(u.first_name, ' ', u.last_name)
      LEFT JOIN periodo pe ON pe.nome = CONCAT(u.first_name, ' ', u.last_name)
      WHERE u.tenant_id = ?
        AND u.active = 1
      ORDER BY ul.ultimo DESC
      `,
      [TENANT_ID, TENANT_ID, ...params, TENANT_ID]
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro /usuarios/detalhes:", err);
    res.status(500).json({ erro: "Erro ao gerar relatório de usuários" });
  }
});

router.get("/usuarios/login-distribuicao", async (req, res) => {
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

router.get("/usuarios/ranking", async (req, res) => {
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

router.get("/usuarios/novos-12m", async (req, res) => {
  try {
    const hoje = new Date();

    const meses = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ano = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, "0");

      meses.push({
        chave: `${ano}-${mes}`,
        ano,
        mes,
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
    rows.forEach((r) => (mapa[r.ym] = r.total));

    const resultado = meses.map((m) => ({
      mes: m.chave,
      total: mapa[m.chave] ?? 0,
    }));

    res.json(resultado);
  } catch (err) {
    console.error("Erro /usuarios/novos-12m:", err);
    res.status(500).json({ error: true });
  }
});

module.exports = router;
