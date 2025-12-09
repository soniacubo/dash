// routes/solicitacoesRoutes.js
const express = require("express");
const db = require("../db");
const { TENANT_ID } = require("../utils/constants");

const { dateRangeForYear, formatDurationFromMinutes, withCache } = require("../utils/helpers");

const router = express.Router();

/* Helper WHERE compartilhado */
function buildSolicitacoesWhere(query) {
  let where = `s.tenant_id = 1 AND s.deleted_at IS NULL`;
  const params = [];
  const { inicio, fim, setor, servico } = query;

  if (inicio && fim) {
    where += " AND DATE(s.created_at) BETWEEN ? AND ?";
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
    where += " AND s.service_id = ?";
    params.push(servico);
  }

  return { where, params };
}

/* ==================== KPIs RESUMO ==================== */

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

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro /solicitacoes/resumo:", err);
    res.status(500).json({ error: "Erro ao carregar resumo" });
  }
});

/* Lista detalhada para tabela secundária (sem paginação) */
router.get("/solicitacoes/lista", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req.query);

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
      LEFT JOIN jp_conectada.service_sector ss 
        ON ss.service_id = s.service_id 
        AND ss.primary = 1
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

/* Lista paginada (tabela principal) */
router.get("/solicitacoes/lista-paginada", async (req, res) => {
  try {
    const {
      offset = 0,
      limit = 50,
      setor = "",
      servico = "",
      inicio = "",
      fim = "",
    } = req.query;

    const params = [];
    let where = `
      s.tenant_id = 1
      AND s.deleted_at IS NULL
    `;

    if (inicio && fim) {
      where += ` AND DATE(s.created_at) BETWEEN ? AND ?`;
      params.push(inicio, fim);
    }

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

    if (servico) {
      where += ` AND s.service_id = ?`;
      params.push(servico);
    }

    const [rows] = await db.query(
      `
      SELECT
        s.id,
        s.created_at,
        s.protocol,
        s.status,
        s.citizen_name AS cidadao,
        sv.title AS servico,
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
    console.error("Erro /solicitacoes/lista-paginada:", err);
    res.status(500).json({ error: "Erro ao carregar lista paginada" });
  }
});

/* Evolução abertas x concluídas */
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

/* Filtros: setores & serviços */

router.get("/solicitacoes/setores", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        sec.id AS sector_id,
        sec.title AS name,
        (
          SELECT COUNT(*) 
          FROM jp_conectada.service_sector ss 
          WHERE ss.sector_id = sec.id
        ) AS total_servicos,
        (
          SELECT COUNT(*) 
          FROM jp_conectada.solicitations sol
          WHERE sol.deleted_at IS NULL
            AND sol.tenant_id = 1
            AND EXISTS (
                SELECT 1 
                FROM jp_conectada.service_sector ss2
                WHERE ss2.service_id = sol.service_id
                  AND ss2.sector_id = sec.id
            )
        ) AS total_solicitacoes
      FROM jp_conectada.sectors sec
      WHERE sec.active = 1
        AND sec.tenant_id = 1
      HAVING total_servicos > 0 OR total_solicitacoes > 0
      ORDER BY sec.title ASC
      `
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/setores:", err);
    res.status(500).json({ error: "Erro ao carregar setores" });
  }
});

router.get("/solicitacoes/setores-filtrados", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().toLowerCase().trim();

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

    const mapa = new Map();
    [...setoresServicos, ...setoresSolicitacoes].forEach((s) => {
      mapa.set(s.sector_id, s);
    });

    let listaFinal = Array.from(mapa.values());

    if (q.length > 0) {
      listaFinal = listaFinal.filter((s) =>
        s.name.toLowerCase().includes(q)
      );
    }

    res.json(listaFinal);
  } catch (err) {
    console.error("Erro /solicitacoes/setores-filtrados:", err);
    res.status(500).json({ error: "Erro ao buscar setores filtrados" });
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
      WHERE tenant_id = 1
        AND active = 1 
      ORDER BY title
      `
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/servicos:", err);
    res.status(500).json({ error: "Erro ao carregar serviços" });
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
        sv.title as name 
      FROM jp_conectada.services sv
      INNER JOIN jp_conectada.service_sector ss 
        ON ss.service_id = sv.id
      WHERE ss.sector_id = ?
        AND EXISTS (
            SELECT 1 
            FROM jp_conectada.solicitations s
            WHERE s.service_id = sv.id
              AND s.deleted_at IS NULL
              AND s.tenant_id = 1
        )
      GROUP BY sv.id, sv.title
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

/* Tempo médio de conclusão diário */
router.get("/solicitacoes/tempo-medio", async (req, res) => {
  try {
    const { inicio = "", fim = "", setor = "", servico = "" } = req.query;

    const params = [];
    let where = `
      s.tenant_id = 1
      AND s.deleted_at IS NULL
      AND s.status = 1
      AND s.updated_at IS NOT NULL
    `;

    if (inicio && fim) {
      where += ` AND DATE(s.created_at) BETWEEN ? AND ?`;
      params.push(inicio, fim);
    }

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

    if (servico) {
      where += ` AND s.service_id = ?`;
      params.push(servico);
    }

    const [rows] = await db.query(
      `
      SELECT
        DATE(s.updated_at) AS data_ref,
        AVG(TIMESTAMPDIFF(MINUTE, s.created_at, s.updated_at)) AS media_minutos
      FROM jp_conectada.solicitations s
      WHERE ${where}
      GROUP BY DATE(s.updated_at)
      ORDER BY data_ref ASC
      `,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error("Erro /solicitacoes/tempo-medio:", error);
    res.status(500).json({ error: "Erro ao calcular tempo médio" });
  }
});

/* KPI – processos parados */
router.get("/solicitacoes/tempo-parados", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req.query);

    const [rows] = await db.query(
      `
      SELECT
        COUNT(*) AS total_parados,
        AVG(TIMESTAMPDIFF(MINUTE, s.created_at, NOW())) AS media_minutos
      FROM jp_conectada.solicitations s
      WHERE ${where}
        AND s.status NOT IN (1,4)
      `,
      params
    );

    const row = rows[0] || {};
    const mediaMin = Number(row.media_minutos || 0);
    const mediaHoras = mediaMin / 60;
    const mediaDias = mediaMin / 60 / 24;

    res.json({
      total_parados: Number(row.total_parados || 0),
      tempo_medio_parado_min: Number(mediaMin.toFixed(2)),
      tempo_medio_parado_horas: Number(mediaHoras.toFixed(2)),
      tempo_medio_parado_dias: Number(mediaDias.toFixed(2)),
      tempo_medio_parado_formatado: formatDurationFromMinutes(mediaMin),
    });
  } catch (err) {
    console.error("Erro /solicitacoes/tempo-parados:", err);
    res.status(500).json({ error: "Erro ao calcular processos parados" });
  }
});

/* KPI – tempo médio de conclusão (status = 1) */
router.get("/solicitacoes/tempo-conclusao", async (req, res) => {
  try {
    const { where, params } = buildSolicitacoesWhere(req.query);

    const [rows] = await db.query(
      `
      SELECT
        COUNT(*) AS total_concluidas,
        AVG(
          TIMESTAMPDIFF(
            MINUTE,
            s.created_at,
            s.updated_at
          )
        ) AS media_minutos
      FROM jp_conectada.solicitations s
      WHERE ${where}
        AND s.status = 1
        AND s.updated_at IS NOT NULL
      `,
      params
    );

    const row = rows[0] || {};
    const mediaMin = Number(row.media_minutos || 0);
    const mediaHoras = mediaMin / 60;
    const mediaDias = mediaMin / 60 / 24;

    res.json({
      total_concluidas: Number(row.total_concluidas || 0),
      tempo_medio_conclusao_min: Number(mediaMin.toFixed(2)),
      tempo_medio_conclusao_horas: Number(mediaHoras.toFixed(2)),
      tempo_medio_conclusao_dias: Number(mediaDias.toFixed(2)),
      tempo_medio_conclusao_formatado: formatDurationFromMinutes(mediaMin),
    });
  } catch (err) {
    console.error("Erro /solicitacoes/tempo-conclusao:", err);
    res.status(500).json({ error: "Erro ao calcular tempo de conclusão" });
  }
});

/* Top serviços (contagem) */
router.get("/solicitacoes/top-servicos", async (req, res) => {
  try {
    const { inicio, fim, setor, servico } = req.query;

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
        COALESCE(sv.title, 'Não informado') AS servico,
        COUNT(*) AS total
      FROM jp_conectada.solicitations s
      LEFT JOIN jp_conectada.services sv ON sv.id = s.service_id
      WHERE ${where}
      GROUP BY servico
      ORDER BY total DESC
      LIMIT 5
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro /solicitacoes/top-servicos:", err);
    res.status(500).json({ error: "Erro ao carregar top serviços" });
  }
});

/* Bairros top 6 + evolução */
router.get("/solicitacoes/bairros-top6", async (req, res) => {
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

      const bairros = top.map((b) => b.bairro);
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
    console.error("Erro /solicitacoes/bairros-top6:", err);
    res.status(500).json({ error: "Erro ao buscar bairros" });
  }
});

module.exports = router;
