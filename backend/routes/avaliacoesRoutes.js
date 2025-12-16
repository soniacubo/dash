const express = require("express");
const db = require("../db");
const { TENANT_ID } = require("../utils/constants");

const router = express.Router();

/* =========================================================
   HELPERS
========================================================= */

function buildWhereAverages(query) {
  const { inicio, fim, setor, servico } = query;
  let where = `a.tenant_id = ${TENANT_ID}`;
  const params = [];

  if (inicio && fim) {
    where += " AND DATE(a.updated_at) BETWEEN ? AND ?";
    params.push(inicio, fim);
  }

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

  if (servico) {
    where += " AND a.evaluated_id = ?";
    params.push(servico);
  }

  return { where, params };
}

function buildWhereRatings(query) {
  const { inicio, fim, setor, servico } = query;
  let where = `
    r.tenant_id = ${TENANT_ID}
    AND r.comment IS NOT NULL
    AND r.comment <> ''
  `;
  const params = [];

  if (inicio && fim) {
    where += " AND DATE(r.created_at) BETWEEN ? AND ?";
    params.push(inicio, fim);
  }

  if (setor) {
    where += `
      AND EXISTS (
        SELECT 1
        FROM jp_conectada.solicitations s
        JOIN jp_conectada.service_sector ss ON ss.service_id = s.service_id
        WHERE s.id = r.vote_origin_id
          AND ss.sector_id = ?
      )
    `;
    params.push(setor);
  }

  if (servico) {
    where += `
      AND EXISTS (
        SELECT 1
        FROM jp_conectada.solicitations s
        WHERE s.id = r.vote_origin_id
          AND s.service_id = ?
      )
    `;
    params.push(servico);
  }

  return { where, params };
}

/* ===== helper específico para ranking ponderado ===== */

function buildWhereRanking(query) {
  const { inicio, fim, setor, servico } = query;
  let where = `a.tenant_id = ${TENANT_ID} AND a.deleted_at IS NULL`;
  const params = [];

  if (inicio && fim) {
    where += " AND DATE(a.created_at) BETWEEN ? AND ?";
    params.push(inicio, fim);
  }

  if (setor) {
    where += `
      AND EXISTS (
        SELECT 1
        FROM jp_conectada.service_sector ss
        WHERE ss.service_id = a.service_id
          AND ss.sector_id = ?
      )
    `;
    params.push(setor);
  }

  if (servico) {
    where += " AND a.service_id = ?";
    params.push(servico);
  }

  return { where, params };
}

/* =========================================================
   RESUMO
========================================================= */

router.get("/avaliacoes/resumo", async (req, res) => {
  try {
    const { where, params } = buildWhereAverages(req.query);

    const [[row]] = await db.query(
      `
      SELECT
        SUM(a.total_votes) AS total_avaliacoes,
        ROUND(
          SUM(
            1*a.count_1 +
            2*a.count_2 +
            3*a.count_3 +
            4*a.count_4 +
            5*a.count_5
          ) / NULLIF(SUM(a.total_votes),0),
        2) AS media_geral
      FROM jp_conectada.averages a
      WHERE ${where}
      `,
      params
    );

    res.json({
      total_avaliacoes: Number(row?.total_avaliacoes || 0),
      media_geral: Number(row?.media_geral || 0),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ total_avaliacoes: 0, media_geral: 0 });
  }
});

/* =========================================================
   DISTRIBUIÇÃO
========================================================= */

router.get("/avaliacoes/distribuicao", async (req, res) => {
  try {
    const { where, params } = buildWhereAverages(req.query);

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
      c1: Number(row?.c1 || 0),
      c2: Number(row?.c2 || 0),
      c3: Number(row?.c3 || 0),
      c4: Number(row?.c4 || 0),
      c5: Number(row?.c5 || 0),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 });
  }
});

/* =========================================================
   EVOLUÇÃO DA MÉDIA
========================================================= */

router.get("/avaliacoes/evolucao", async (req, res) => {
  try {
    const { where, params } = buildWhereAverages(req.query);

    const [rows] = await db.query(
      `
      SELECT
        DATE_FORMAT(a.updated_at, '%Y-%m') AS mes,
        ROUND(
          SUM(
            1*a.count_1 +
            2*a.count_2 +
            3*a.count_3 +
            4*a.count_4 +
            5*a.count_5
          ) / NULLIF(SUM(a.total_votes),0),
        2) AS media
      FROM jp_conectada.averages a
      WHERE ${where}
      GROUP BY mes
      ORDER BY mes ASC
      LIMIT 6
      `,
      params
    );

    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json([]);
  }
});

/* =========================================================
   RANKING SETORES — PONDERADO
========================================================= */

router.get("/avaliacoes/ranking-setores", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        sc.title AS setor,

        ROUND(
          SUM(
            1 * a.count_1 +
            2 * a.count_2 +
            3 * a.count_3 +
            4 * a.count_4 +
            5 * a.count_5
          ) / NULLIF(SUM(a.total_votes), 0),
          2
        ) AS media,

        SUM(a.total_votes) AS total_votes,

        ROUND(
          (
            (
              SUM(
                1 * a.count_1 +
                2 * a.count_2 +
                3 * a.count_3 +
                4 * a.count_4 +
                5 * a.count_5
              ) / NULLIF(SUM(a.total_votes), 0)
            ) * SUM(a.total_votes)
            +
            (
              SELECT
                ROUND(
                  SUM(
                    1 * count_1 +
                    2 * count_2 +
                    3 * count_3 +
                    4 * count_4 +
                    5 * count_5
                  ) / NULLIF(SUM(total_votes), 0),
                  2
                )
              FROM jp_conectada.averages
              WHERE tenant_id = ?
            ) * 10
          )
          / (SUM(a.total_votes) + 10),
          2
        ) AS score_ponderado

      FROM jp_conectada.averages a
      JOIN jp_conectada.service_sector ss ON ss.service_id = a.evaluated_id
      JOIN jp_conectada.sectors sc ON sc.id = ss.sector_id

      WHERE a.tenant_id = ?
        AND a.total_votes > 0

      GROUP BY sc.id
      ORDER BY score_ponderado DESC
      `,
      [TENANT_ID, TENANT_ID]
    );

    const normalized = (rows || []).map(r => ({
      setor: r.setor,
      media: Number(r.media),
      total_votes: Number(r.total_votes),
      score_ponderado: Number(r.score_ponderado),
    }));

    res.json(normalized);
  } catch (e) {
    console.error("Erro ranking setores:", e);
    res.status(500).json([]);
  }
});


router.get("/avaliacoes/ranking-servicos", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        sv.title AS servico,

        ROUND(
          SUM(
            1 * a.count_1 +
            2 * a.count_2 +
            3 * a.count_3 +
            4 * a.count_4 +
            5 * a.count_5
          ) / NULLIF(SUM(a.total_votes), 0),
          2
        ) AS media,

        SUM(a.total_votes) AS total_votes,

        ROUND(
          (
            (
              SUM(
                1 * a.count_1 +
                2 * a.count_2 +
                3 * a.count_3 +
                4 * a.count_4 +
                5 * a.count_5
              ) / NULLIF(SUM(a.total_votes), 0)
            ) * SUM(a.total_votes)
            +
            (
              SELECT
                ROUND(
                  SUM(
                    1 * count_1 +
                    2 * count_2 +
                    3 * count_3 +
                    4 * count_4 +
                    5 * count_5
                  ) / NULLIF(SUM(total_votes), 0),
                  2
                )
              FROM jp_conectada.averages
              WHERE tenant_id = ?
            ) * 10
          )
          / (SUM(a.total_votes) + 10),
          2
        ) AS score_ponderado

      FROM jp_conectada.averages a
      JOIN jp_conectada.services sv ON sv.id = a.evaluated_id

      WHERE a.tenant_id = ?
        AND a.total_votes > 0

      GROUP BY sv.id
      ORDER BY score_ponderado DESC
      `,
      [TENANT_ID, TENANT_ID]
    );

    const normalized = (rows || []).map(r => ({
      servico: r.servico,
      media: Number(r.media),
      total_votes: Number(r.total_votes),
      score_ponderado: Number(r.score_ponderado),
    }));

    res.json(normalized);
  } catch (e) {
    console.error("Erro ranking serviços:", e);
    res.status(500).json([]);
  }
});


/* =========================================================
   COMENTÁRIOS
========================================================= */

router.get("/avaliacoes/comentarios", async (req, res) => {
  try {
    const { where, params } = buildWhereRatings(req.query);

    const [rows] = await db.query(
      `
      SELECT
        r.comment,
        r.score,
        r.created_at,
        sv.title AS servico,
        sec.title AS setores,
        c.name AS cidadao
      FROM jp_conectada.ratings r
      JOIN jp_conectada.solicitations s ON s.id = r.vote_origin_id
      JOIN jp_conectada.services sv ON sv.id = s.service_id
      JOIN jp_conectada.service_sector ss ON ss.service_id = sv.id
      JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      LEFT JOIN jp_conectada.citizens c ON c.id = s.citizen_id
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT 20
      `,
      params
    );

    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json([]);
  }
});

/* =========================================================
   OPÇÕES DE FILTRO
========================================================= */

router.get("/avaliacoes/setores", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT DISTINCT
        sec.id AS sector_id,
        sec.title AS name
      FROM jp_conectada.averages a
      JOIN jp_conectada.service_sector ss ON ss.service_id = a.evaluated_id
      JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      WHERE a.tenant_id = ?
        AND a.total_votes > 0
      ORDER BY sec.title
      `,
      [TENANT_ID]
    );

    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json([]);
  }
});

router.get("/avaliacoes/servicos", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        sv.id AS service_id,
        sv.title AS name
      FROM jp_conectada.averages a
      JOIN jp_conectada.services sv ON sv.id = a.evaluated_id
      WHERE a.tenant_id = ?
        AND a.total_votes > 0
      ORDER BY sv.title
      `,
      [TENANT_ID]
    );

    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json([]);
  }
});

router.get("/avaliacoes/servicos-por-setor", async (req, res) => {
  const { setor } = req.query;
  if (!setor) return res.json([]);

  try {
    const [rows] = await db.query(
      `
      SELECT DISTINCT
        sv.id AS service_id,
        sv.title AS name
      FROM jp_conectada.averages a
      JOIN jp_conectada.services sv ON sv.id = a.evaluated_id
      JOIN jp_conectada.service_sector ss ON ss.service_id = sv.id
      WHERE a.tenant_id = ?
        AND a.total_votes > 0
        AND ss.sector_id = ?
      ORDER BY sv.title
      `,
      [TENANT_ID, setor]
    );

    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json([]);
  }
});

module.exports = router;
