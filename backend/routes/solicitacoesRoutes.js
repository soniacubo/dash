// ===============================================
// routes/solicitacoesRoutes.js — VERSÃO FINAL
// ===============================================

const express = require("express");
const db = require("../db");
const { TENANT_ID } = require("../utils/constants");
const { dateRangeForYear, formatDurationFromMinutes, withCache } = require("../utils/helpers");

const router = express.Router();
function isValid(v) {
  return v !== undefined && v !== null && v !== "" && v !== "0" && v !== "null";
}


/* ============================================================
   HELPERS
============================================================ */

function buildSolicitacoesWhere(query) {
  let where = `s.tenant_id = ${TENANT_ID} AND s.deleted_at IS NULL`;
  const params = [];
  const { inicio, fim, setor, servico } = query;

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

/* ============================================================
   RESUMO KPIs
============================================================ */

router.get("/solicitacoes/resumo", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req.query);

    const [rows] = await db.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN s.status = 0 THEN 1 ELSE 0 END) AS iniciadas,
        SUM(CASE WHEN s.status = 2 THEN 1 ELSE 0 END) AS espera,
        SUM(CASE WHEN s.status = 3 THEN 1 ELSE 0 END) AS respondidas,
        SUM(CASE WHEN s.status IN (1,4) THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      `,
      params
    );

    res.json(rows[0] || {});
  } catch (err) {
    console.error("Erro /solicitacoes/resumo:", err);
    res.status(500).json({ error: "Erro ao carregar resumo" });
  }
});



router.get("/solicitacoes/lista", async (req, res) => {
  try {
    const {
      inicio,
      fim,
      setor,
      servico,
      page = "1",
      limit = "50",
    } = req.query;

    const pageNum  = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(10, Math.min(parseInt(limit, 10) || 50, 200));
    const offset   = (pageNum - 1) * limitNum;

    const params = [TENANT_ID];
    let where = `s.tenant_id = ? AND s.deleted_at IS NULL`;

    if (inicio && fim) {
      where += ` AND DATE(s.created_at) BETWEEN ? AND ?`;
      params.push(inicio, fim);
    }

    if (setor) {
      where += ` AND ss.sector_id = ?`;
      params.push(setor);
    }

    if (servico) {
      where += ` AND s.service_id = ?`;
      params.push(servico);
    }

    const baseFrom = `
      FROM jp_conectada.solicitations s
      LEFT JOIN jp_conectada.citizens c 
             ON c.id = s.citizen_id
      LEFT JOIN jp_conectada.services sv 
             ON sv.id = s.service_id
      LEFT JOIN jp_conectada.service_sector ss
             ON ss.service_id = sv.id
      LEFT JOIN jp_conectada.sectors st 
             ON st.id = ss.sector_id
      WHERE ${where}
    `;

    /* CONSULTA PRINCIPAL */
    const [rows] = await db.query(
      `
      SELECT
        s.id,
        s.created_at,
        s.protocol,
        s.status,
        c.name AS cidadao,
        sv.title AS servico,
        st.title AS setor,
        st.id AS sector_id
      ${baseFrom}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limitNum, offset]
    );

    /* TOTAL PARA PAGINAÇÃO */
    const [[count]] = await db.query(
      `SELECT COUNT(*) AS total ${baseFrom}`,
      params
    );

    const total = Number(count.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    res.json({
      rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    });

  } catch (err) {
    console.error("Erro /solicitacoes/lista:", err);
    res.status(500).json({ error: "Erro ao buscar lista" });
  }
});


router.get("/solicitacoes/evolucao", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req.query);

    const [rows] = await db.query(
      `
      SELECT
        DATE(s.created_at) AS data_ref,
        COUNT(*) AS abertas,
        SUM(CASE WHEN s.status IN (1,4) THEN 1 ELSE 0 END) AS concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      GROUP BY DATE(s.created_at)
      ORDER BY data_ref ASC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/evolucao:", err);
    res.status(500).json({ error: "Erro ao buscar evolução" });
  }
});


router.get("/solicitacoes/setores", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        sec.id AS sector_id,
        sec.title AS name
      FROM jp_conectada.sectors sec
      WHERE sec.active = 1
        AND sec.tenant_id = 1
        AND EXISTS (
            SELECT 1
            FROM jp_conectada.service_sector ss
            WHERE ss.sector_id = sec.id
        )
      ORDER BY sec.title ASC
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/setores:", err);
    res.status(500).json({ error: "Erro ao carregar setores" });
  }
});


router.get("/solicitacoes/servicos", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        id AS service_id,
        title AS name
      FROM jp_conectada.services
      WHERE tenant_id = ${TENANT_ID}
        AND active = 1
      ORDER BY title ASC
      `
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/servicos:", err);
    res.status(500).json({ error: "Erro ao buscar serviços" });
  }
});

router.get("/solicitacoes/servicos-por-setor", async (req, res) => {
  try {
    const setorId = req.query.setor;
    if (!setorId) return res.json([]);

    const [rows] = await db.query(
      `
      SELECT 
        sv.id AS service_id,
        sv.title AS name
      FROM jp_conectada.services sv
      INNER JOIN jp_conectada.service_sector ss 
        ON ss.service_id = sv.id
      WHERE ss.sector_id = ?
        AND sv.active = 1
      ORDER BY sv.title ASC
      `,
      [setorId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/servicos-por-setor:", err);
    res.status(500).json({ error: "Erro ao carregar serviços" });
  }
});

router.get("/solicitacoes/tempo-medio", async (req, res) => {
  try {
    const { inicio, fim, setor, servico } = req.query;

    let where = `s.tenant_id = ${TENANT_ID} AND s.status IN (1,4)`;
    const params = [];

    if (inicio && fim) {
      where += ` AND DATE(s.updated_at) BETWEEN ? AND ? `;
      params.push(inicio, fim);
    }

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

    if (servico) {
      where += ` AND s.service_id = ? `;
      params.push(servico);
    }

    const [rows] = await db.query(
      `
      SELECT 
        AVG(TIMESTAMPDIFF(DAY, s.created_at, s.updated_at)) AS media_geral_dias,
        COUNT(*) AS total_concluidas
      FROM jp_conectada.solicitations s
      WHERE ${where}
      `,
      params
    );

    res.json(rows[0] || { media_geral_dias: 0, total_concluidas: 0 });
  } catch (err) {
    console.error("Erro ao calcular tempo médio:", err);
    res.status(500).json({ error: "Erro ao calcular tempo médio" });
  }
});

router.get("/solicitacoes/paradas", async (req, res) => {
  try {
    const { inicio, fim, setor, servico } = req.query;

    let where = `s.tenant_id = ${TENANT_ID}`;
    const params = [];

    if (inicio && fim) {
      where += ` AND DATE(s.created_at) BETWEEN ? AND ? `;
      params.push(inicio, fim);
    }

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

    if (servico) {
      where += ` AND s.service_id = ? `;
      params.push(servico);
    }

    // Status NÃO concluídos
    where += ` AND s.status NOT IN (1,4)`;

    const [rows] = await db.query(
      `
      SELECT 
        TIMESTAMPDIFF(DAY, s.created_at, NOW()) AS dias_parado
      FROM jp_conectada.solicitations s
      WHERE ${where}
      `,
      params
    );

    const total_paradas = rows.length;
    const media_dias_paradas = total_paradas
      ? rows.reduce((acc, r) => acc + r.dias_parado, 0) / total_paradas
      : 0;

    res.json({ total_paradas, media_dias_paradas });
  } catch (err) {
    console.error("Erro ao buscar paradas:", err);
    res.status(500).json({ error: "Erro ao buscar paradas" });
  }
});


// routes/solicitacoesRoutes.js

router.get("/paradas-por-setor", async (req, res) => {
  try {
    const { inicio, fim, setor, servico } = req.query;

    let where = `
      s.tenant_id = ?
      AND s.deleted_at IS NULL
      AND s.status NOT IN (1, 4)
    `;

    const params = [TENANT_ID];

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
        )
      `;
      params.push(setor);
    }

    if (servico) {
      where += " AND s.service_id = ?";
      params.push(servico);
    }

    const [rows] = await db.query(
      `
      SELECT
        sec.id AS sector_id,
        sec.name AS setor,
        COUNT(*) AS total_paradas,
        AVG(DATEDIFF(NOW(), s.created_at)) AS media_dias_paradas
      FROM jp_conectada.solicitacoes s
      JOIN jp_conectada.service_sector ss
        ON ss.service_id = s.service_id
      JOIN jp_conectada.sectors sec
        ON sec.id = ss.sector_id
      WHERE ${where}
      GROUP BY sec.id, sec.name
      ORDER BY total_paradas DESC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro paradas por setor:", err);
    res.status(500).json({ error: "Erro paradas por setor" });
  }
});


router.get("/solicitacoes/top-servicos", async (req, res) => {
  try {
    let { inicio, fim, setor } = req.query;
    const params = [TENANT_ID];

    let where = "s.tenant_id = ? AND s.deleted_at IS NULL";

    if (inicio && fim && inicio !== "" && fim !== "") {
      where += " AND DATE(s.created_at) BETWEEN ? AND ?";
      params.push(inicio, fim);
    }

    if (setor && setor !== "" && setor !== "0" && setor !== "null") {
      where += `
        AND EXISTS (
          SELECT 1 FROM jp_conectada.service_sector ss
          WHERE ss.service_id = s.service_id
          AND ss.sector_id = ?
        )
      `;
      params.push(setor);
    }

    const [rows] = await db.query(
      `
      SELECT 
        sv.title AS servico,
        COUNT(*) AS total
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.services sv ON sv.id = s.service_id
      WHERE ${where}
      GROUP BY sv.id
      ORDER BY total DESC
      LIMIT 5
      `,
      params
    );

    res.json(rows);

  } catch (err) {
    console.error("Erro Top Serviços:", err);
    res.status(500).json({ error: "Erro ao carregar top serviços" });
  }
});



router.get("/solicitacoes/paradas-por-setor", async (req, res) => {
  try {
    const { inicio, fim, setor } = req.query;
    const params = [];

    let where = `s.tenant_id = ${TENANT_ID} AND s.status NOT IN (1,4)`;

    if (isValid(inicio) && isValid(fim)) {
      where += " AND DATE(s.created_at) BETWEEN ? AND ?";
      params.push(inicio, fim);
    }

    if (isValid(setor)) {
      where += `
        AND EXISTS (
          SELECT 1 FROM jp_conectada.service_sector ss2
          WHERE ss2.service_id = s.service_id
          AND ss2.sector_id = ?
        )
      `;
      params.push(setor);
    }

    const [rows] = await db.query(
      `
      SELECT 
        sec.id AS sector_id,
        sec.title AS setor,
        COUNT(*) AS total_paradas,
        AVG(TIMESTAMPDIFF(DAY, s.created_at, NOW())) AS media_dias_parado
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.service_sector ss ON ss.service_id = s.service_id
      JOIN jp_conectada.sectors sec ON sec.id = ss.sector_id
      WHERE ${where}
      GROUP BY sec.id
      ORDER BY total_paradas DESC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro paradas setor:", err);
    res.status(500).json({ error: "Erro ao consultar paradas por setor" });
  }
});




router.get("/solicitacoes/paradas-por-servico", async (req, res) => {
  try {
    const { inicio, fim, setor } = req.query;
    const params = [];

    let where = `s.tenant_id = ${TENANT_ID} AND s.status NOT IN (1,4)`;

    if (isValid(inicio) && isValid(fim)) {
      where += " AND DATE(s.created_at) BETWEEN ? AND ?";
      params.push(inicio, fim);
    }

    if (isValid(setor)) {
      where += `
        AND EXISTS (
          SELECT 1 FROM jp_conectada.service_sector ss
          WHERE ss.service_id = s.service_id
          AND ss.sector_id = ?
        )
      `;
      params.push(setor);
    }

    const [rows] = await db.query(
      `
      SELECT 
        sv.id AS service_id,
        sv.title AS servico,
        COUNT(*) AS total_paradas,
        AVG(TIMESTAMPDIFF(DAY, s.created_at, NOW())) AS media_dias_parado
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.services sv ON sv.id = s.service_id
      WHERE ${where}
      GROUP BY sv.id
      ORDER BY total_paradas DESC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro paradas serviço:", err);
    res.status(500).json({ error: "Erro ao consultar paradas por serviço" });
  }
});





/* ============================================================
   EXPORTAR ROUTER
============================================================ */

module.exports = router;
