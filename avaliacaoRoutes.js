const express = require("express");
const router = express.Router();
const mysql = require("mysql2/promise");

const TENANT_ID = 1;
const MIN_AVALIACOES = 5;

/* ============================================================
   DATABASE POOL
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
   HELPERS
============================================================ */
function buildAvaliacaoWhereFromAverages(query) {
  const { inicio, fim, setor, servico } = query;

  const params = [];
  let where = `a.tenant_id = ${TENANT_ID}`;

  if (inicio && fim) {
    where += ` AND DATE(a.updated_at) BETWEEN ? AND ? `;
    params.push(inicio, fim);
  }

  if (setor) {
    where += `
      AND EXISTS (
        SELECT 1 FROM jp_conectada.service_sector ss
        WHERE ss.service_id = a.evaluated_id
          AND ss.sector_id = ?
      )
    `;
    params.push(setor);
  }

  if (servico) {
    where += ` AND a.evaluated_id = ? `;
    params.push(servico);
  }

  return { where, params };
}

function buildAvaliacaoWhereFromRatings(query) {
  const { inicio, fim, setor, servico } = query;

  const params = [];
  let where = `
    r.tenant_id = ${TENANT_ID}
    AND r.comment IS NOT NULL
    AND r.comment <> ''
  `;

  if (inicio && fim) {
    where += ` AND DATE(r.created_at) BETWEEN ? AND ? `;
    params.push(inicio, fim);
  }

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

  if (servico) {
    where += ` AND s.service_id = ? `;
    params.push(servico);
  }

  return { where, params };
}

/* ============================================================
   TODAS AS ROTAS DE AVALIAÇÕES
============================================================ */

// Resumo geral
router.get("/resumo", async (req, res) => {
  try {
    const { where, params } = buildAvaliacaoWhereFromAverages(req.query);

    const [rows] = await db.query(
      `
      SELECT
        SUM(a.total_votes) AS total_avaliacoes,
        ROUND(
          (
            SUM(
              1*a.count_1 +
              2*a.count_2 +
              3*a.count_3 +
              4*a.count_4 +
              5*a.count_5
            ) / NULLIF(SUM(a.total_votes), 0)
          ), 2
        ) AS media_geral
      FROM jp_conectada.averages a
      WHERE ${where}
      `,
      params
    );

    res.json(rows[0] || { total_avaliacoes: 0, media_geral: 0 });

  } catch (err) {
    console.error("Erro /avaliacoes/resumo:", err);
    res.status(500).json({ error: true });
  }
});

// Distribuição (somatório)
router.get("/distribuicao", async (req, res) => {
  try {
    const { where, params } = buildAvaliacaoWhereFromAverages(req.query);

    const [[row]] = await db.query(
      `
      SELECT 
        SUM(a.count_1) AS c1,
        SUM(a.count_2) AS c2,
        SUM(a.count_3) AS c3,
        SUM(a.count_4) AS c4,
        SUM(a.count_5) AS c5
      FROM jp_conectada.averages a
      WHERE ${where}
    `,
      params
    );

    res.json({
      c1: Number(row?.c1 ?? 0),
      c2: Number(row?.c2 ?? 0),
      c3: Number(row?.c3 ?? 0),
      c4: Number(row?.c4 ?? 0),
      c5: Number(row?.c5 ?? 0),
    });
  } catch (err) {
    console.error("Erro distribuicao:", err);
    res.status(500).json({ error: true });
  }
});

// Ranking de setores
router.get("/ranking-setores", async (req, res) => {
  try {
    const { where, params } = buildAvaliacaoWhereFromAverages(req.query);

    const sql = `
      SELECT
        ss.sector_id,
        sec.title AS setor,
        a.total_votes,
        ROUND(
          (1*a.count_1 + 2*a.count_2 + 3*a.count_3 + 4*a.count_4 + 5*a.count_5) / a.total_votes,
        2) AS media
      FROM jp_conectada.averages a
      JOIN jp_conectada.service_sector ss ON ss.service_id = a.evaluated_id
      JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      WHERE ${where}
        AND a.total_votes > 0
      ORDER BY media DESC
    `;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true });
  }
});

// Ranking de serviços
router.get("/ranking-servicos", async (req, res) => {
  try {
    const { where, params } = buildAvaliacaoWhereFromAverages(req.query);

    const sql = `
      SELECT
        sv.id AS service_id,
        sv.title AS servico,
        a.total_votes,
        ROUND(
          (1*a.count_1 + 2*a.count_2 + 3*a.count_3 + 4*a.count_4 + 5*a.count_5) / a.total_votes,
        2) AS media
      FROM jp_conectada.averages a
      JOIN jp_conectada.services sv ON sv.id = a.evaluated_id
      WHERE ${where}
        AND a.total_votes > 0
      ORDER BY media DESC
    `;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true });
  }
});

// Comentários
router.get("/comentarios", async (req, res) => {
  try {
    const { where, params } = buildAvaliacaoWhereFromRatings(req.query);

    const sql = `
      SELECT 
        r.comment,
        r.score,
        r.created_at,
        s.protocol AS protocolo,
        sv.title AS servico,
        GROUP_CONCAT(DISTINCT sec.title ORDER BY sec.title SEPARATOR ', ') AS setores,
        c.name AS cidadao
      FROM jp_conectada.ratings r
      JOIN jp_conectada.solicitations s ON s.id = r.vote_origin_id
      JOIN jp_conectada.services sv ON sv.id = s.service_id
      JOIN jp_conectada.service_sector ss ON ss.service_id = sv.id
      JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      LEFT JOIN jp_conectada.citizens c ON c.id = s.citizen_id
      WHERE ${where}
      GROUP BY 
        r.id,
        s.protocol,
        sv.title,
        c.name,
        r.score,
        r.comment,
        r.created_at
      ORDER BY r.created_at DESC
      LIMIT 50
    `;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true });
  }
});




function buildAvaliacaoWhereFromAverages(query) {
  const { inicio, fim, setor, servico } = query;

  const params = [];
  let where = `a.tenant_id = ${TENANT_ID}`;

  // Período
  if (inicio && fim) {
    where += ` AND DATE(a.updated_at) BETWEEN ? AND ? `;
    params.push(inicio, fim);
  }

  // Filtro por setor
  if (setor) {
    where += `
      AND EXISTS (
        SELECT 1
        FROM jp_conectada.service_sector ss
        WHERE ss.service_id = a.evaluated_id
          AND ss.sector_id = ?
      )
    `;
    params.push(setor);
  }

  // Filtro por serviço
  if (servico) {
    where += ` AND a.evaluated_id = ? `;
    params.push(servico);
  }

  return { where, params };
}
function buildAvaliacaoWhereFromRatings(query) {
  const { inicio, fim, setor, servico } = query;

  const params = [];
  let where = `
    r.tenant_id = ${TENANT_ID}
    AND r.comment IS NOT NULL
    AND r.comment <> ''
  `;

  // Período
  if (inicio && fim) {
    where += ` AND DATE(r.created_at) BETWEEN ? AND ? `;
    params.push(inicio, fim);
  }

  // Filtro por setor
  if (setor) {
    where += `
      AND EXISTS (
        SELECT 1
        FROM jp_conectada.service_sector ss
        WHERE ss.service_id = s.service_id
          AND ss.sector_id = ?
      )
    `;
    params.push(setor);
  }

  // Filtro por serviço
  if (servico) {
    where += ` AND s.service_id = ? `;
    params.push(servico);
  }

  return { where, params };
}


app.get("/api/avaliacoes/setores/melhor-pior", async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: "Período não informado" });

    const { where, params } = buildAvaliacaoWhereFromAverages(req.query);

    const sql = `
      SELECT
        ss.sector_id,
        sec.title AS setor,
        a.total_votes,
        ROUND(
          (1*a.count_1 + 2*a.count_2 + 3*a.count_3 + 4*a.count_4 + 5*a.count_5) / a.total_votes,
        2) AS media
      FROM jp_conectada.averages a
      JOIN jp_conectada.service_sector ss ON ss.service_id = a.evaluated_id
      JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      WHERE ${where}
        AND a.total_votes > 0
      ORDER BY media DESC
    `;

    const [rows] = await db.query(sql, params);

    if (!rows.length) return res.json({ best: null, worst: null });

    res.json({ best: rows[0], worst: rows[rows.length - 1] });
  } catch (err) {
    console.error("Erro melhor-pior setor:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});
app.get("/api/avaliacoes/servicos/melhor-pior", async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: "Período não informado" });

    const { where, params } = buildAvaliacaoWhereFromAverages(req.query);

    const sql = `
      SELECT
        sv.id AS service_id,
        sv.title AS servico,
        a.total_votes,
        ROUND(
          (1*a.count_1 + 2*a.count_2 + 3*a.count_3 + 4*a.count_4 + 5*a.count_5) / a.total_votes,
        2) AS media
      FROM jp_conectada.averages a
      JOIN jp_conectada.services sv ON sv.id = a.evaluated_id
      WHERE ${where}
        AND a.total_votes > 0
      ORDER BY media DESC
    `;

    const [rows] = await db.query(sql, params);

    if (!rows.length) return res.json({ best: null, worst: null });

    res.json({ best: rows[0], worst: rows[rows.length - 1] });
  } catch (err) {
    console.error("Erro melhor-pior serviços:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});
app.get("/api/avaliacoes/distribuicao", async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: "Período não informado" });

    const { where, params } = buildAvaliacaoWhereFromAverages(req.query);

    const sql = `
      SELECT 
        SUM(a.count_1) AS c1,
        SUM(a.count_2) AS c2,
        SUM(a.count_3) AS c3,
        SUM(a.count_4) AS c4,
        SUM(a.count_5) AS c5
      FROM jp_conectada.averages a
      WHERE ${where}
    `;

    const [[row]] = await db.query(sql, params);

    res.json({
      c1: Number(row?.c1 ?? 0),
      c2: Number(row?.c2 ?? 0),
      c3: Number(row?.c3 ?? 0),
      c4: Number(row?.c4 ?? 0),
      c5: Number(row?.c5 ?? 0),
    });
  } catch (err) {
    console.error("Erro distribuicao:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});
app.get("/api/avaliacoes/ranking-setores", async (req, res) => {
  try {
    const { where, params } = buildAvaliacaoWhereFromAverages(req.query);

    const sql = `
      SELECT
        ss.sector_id,
        sec.title AS setor,
        a.total_votes,
        ROUND(
          (1*a.count_1 + 2*a.count_2 + 3*a.count_3 + 4*a.count_4 + 5*a.count_5) / a.total_votes,
        2) AS media
      FROM jp_conectada.averages a
      JOIN jp_conectada.service_sector ss ON ss.service_id = a.evaluated_id
      JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      WHERE ${where}
        AND a.total_votes > 0
      ORDER BY media DESC
    `;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Erro ranking-setores:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});
app.get("/api/avaliacoes/ranking-servicos", async (req, res) => {
  try {
    const { where, params } = buildAvaliacaoWhereFromAverages(req.query);

    const sql = `
      SELECT
        sv.id AS service_id,
        sv.title AS servico,
        a.total_votes,
        ROUND(
          (1*a.count_1 + 2*a.count_2 + 3*a.count_3 + 4*a.count_4 + 5*a.count_5) / a.total_votes,
        2) AS media
      FROM jp_conectada.averages a
      JOIN jp_conectada.services sv ON sv.id = a.evaluated_id
      WHERE ${where}
        AND a.total_votes > 0
      ORDER BY media DESC
    `;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Erro ranking-servicos:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});
app.get("/api/avaliacoes/comentarios", async (req, res) => {
  try {
    const { where, params } = buildAvaliacaoWhereFromRatings(req.query);

    const sql = `
      SELECT 
        r.comment,
        r.score,
        r.created_at,
        s.protocol AS protocolo,
        sv.title AS servico,
        GROUP_CONCAT(DISTINCT sec.title ORDER BY sec.title SEPARATOR ', ') AS setores,
        c.name AS cidadao
      FROM jp_conectada.ratings r
      JOIN jp_conectada.solicitations s ON s.id = r.vote_origin_id
      JOIN jp_conectada.services sv ON sv.id = s.service_id
      JOIN jp_conectada.service_sector ss ON ss.service_id = sv.id
      JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      LEFT JOIN jp_conectada.citizens c ON c.id = s.citizen_id
      WHERE ${where}
      GROUP BY 
        r.id,
        s.protocol,
        sv.title,
        c.name,
        r.score,
        r.comment,
        r.created_at
      ORDER BY r.created_at DESC
      LIMIT 50
    `;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Erro comentarios:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});
app.get("/api/setores/setores", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, title 
      FROM jp_conectada.sectors
      WHERE tenant_id = ?
      ORDER BY title ASC
    `, [TENANT_ID]);

    res.json(rows);

  } catch (err) {
    console.error("Erro ao listar setores:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});
app.get("/api/servicos/opcoes", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, title
      FROM jp_conectada.services
      WHERE tenant_id = ?
      ORDER BY title ASC
    `, [TENANT_ID]);

    res.json(rows);

  } catch (err) {
    console.error("Erro ao listar serviços:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});
app.get("/api/avaliacoes/resumo", async (req, res) => {
  try {
    const { where, params } = buildAvaliacaoWhereFromAverages(req.query);

    const [rows] = await db.query(
      `
      SELECT
        SUM(a.total_votes) AS total_avaliacoes,
        ROUND(
          (
            SUM(
              1*a.count_1 +
              2*a.count_2 +
              3*a.count_3 +
              4*a.count_4 +
              5*a.count_5
            ) / NULLIF(SUM(a.total_votes), 0)
          ), 2
        ) AS media_geral
      FROM jp_conectada.averages a
      WHERE ${where}
      `,
      params
    );

    res.json(rows[0] || { total_avaliacoes: 0, media_geral: 0 });

  } catch (err) {
    console.error("Erro /avaliacoes/resumo:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

module.exports = router;
