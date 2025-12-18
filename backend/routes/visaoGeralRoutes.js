// routes/visaoGeralRoutes.js
const express = require("express");
const db = require("../db");
const { TENANT_ID } = require("../utils/constants");

const {
  brToMySQL,
  getPeriodoDates,
  getStartDateFromPeriod,
  dateRangeForYear,
  withCache,
  formatDurationFromMinutes
} = require("../utils/helpers");

const router = express.Router();

/* ================= VISÃO GERAL ================= */

router.get("/visao-geral/series", async (req, res) => {
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
    console.error("Erro /visao-geral/series:", err);
    res.status(500).json({ error: "Erro ao carregar séries" });
  }
});

router.get("/visao-geral/economia", async (req, res) => {
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
    res.json(rows);
  } catch (err) {
    console.error("Erro /visao-geral/economia:", err);
    res.status(500).json({ error: "Falha ao carregar economia" });
  }
});

router.get("/visao-geral/cidadaos-resumo", async (req, res) => {
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
      idade_media: rows.idade_media || 0,
    });
  } catch (err) {
    console.error("Erro /visao-geral/cidadaos-resumo:", err);
    res.status(500).json({ error: "Falha ao carregar resumo de cidadãos" });
  }
});

router.get("/visao-geral/evolucao-uso", async (req, res) => {
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
    console.error("Erro /visao-geral/evolucao-uso:", err);
    res.status(500).json({ error: "Erro ao carregar evolução" });
  }
});

router.get("/visao-geral/contadores", async (req, res) => {
  try {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM jp_conectada.services s 
          WHERE s.tenant_id = ? AND s.active = 1) AS total_servicos,
        (SELECT COUNT(*) FROM jp_conectada.users u 
          WHERE u.tenant_id = ? AND u.active = 1) AS total_usuarios,
        (SELECT COUNT(*) FROM jp_conectada.citizens c 
          WHERE c.tenant_id = ? AND c.active = 1) AS total_cidadaos,
        (SELECT COUNT(*) FROM jp_conectada.sectors se 
          WHERE se.tenant_id = ? AND se.active = 1) AS total_setores,
        (
          SELECT 
            IFNULL((SUM(CASE WHEN s.status = 1 THEN 1 END) / NULLIF(COUNT(*),0)) * 100, 0)
          FROM jp_conectada.solicitations s
          WHERE s.tenant_id = ?
        ) AS eficiencia_pct,
        (
          SELECT IFNULL(AVG(r.score), 0)
          FROM jp_conectada.ratings r
          WHERE r.tenant_id = ?
        ) AS qualidade_media
    `;
    const params = [TENANT_ID, TENANT_ID, TENANT_ID, TENANT_ID, TENANT_ID, TENANT_ID];
    const [rows] = await db.query(sql, params);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(rows[0] || {});
  } catch (err) {
    console.error("KPIs erro:", err);
    res.status(500).json({ error: "Falha ao carregar contadores" });
  }
});

/* =============== RESUMO PERÍODO =============== */

router.get("/resumo-periodo", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano) || new Date().getFullYear();
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
          (
            (COALESCE(sol.total_solicitacoes, 0) * 0.65) +
            (COALESCE(tram.total_tramitacoes, 0) * 0.20)
          ) AS folhas_economizadas,
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
      .filter((r) => r.mes <= mesAtual)
      .reduce((sum, r) => sum + Number(r.economia_gerada || 0), 0);

    const totalFolhas = rows
      .filter((r) => r.mes <= mesAtual)
      .reduce((sum, r) => sum + Number(r.folhas_economizadas || 0), 0);

    const totalArvores = totalFolhas / 8000;

    res.json({
      ano,
      meses: rows,
      total: {
        folhas: Math.round(totalFolhas),
        arvores: Number(totalArvores.toFixed(3)),
        dinheiro: Number(totalEconomia.toFixed(2)),
        custo_pagina_usado: custoPagina,
      },
    });
  } catch (err) {
    console.error("Erro /resumo-periodo:", err);
    res.status(500).json({ error: "Erro ao buscar dados" });
  }
});

/* =============== ECONOMÔMETRO =============== */

router.get("/economometro", async (req, res) => {
  try {
    const periodo = req.query.periodo || "ano";
    const key = `economometro:${periodo}`;

    const data = await withCache(key, 60000, async () => {
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
      const folhas = totalSolic * 0.65 + totalTram * 0.2;
      const arvores = folhas / 8000;

      return {
        periodo,
        intervalo: { inicio: inicioISO, fim: fimISO },
        solicitacoes: totalSolic,
        tramitacoes: totalTram,
        folhas: Math.round(folhas),
        arvores: arvores.toFixed(3),
        dinheiro: (folhas * custoPagina).toFixed(2),
      };
    });

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(data);
  } catch (err) {
    console.error("Erro /economometro:", err);
    res.status(500).json({ error: "Erro ao gerar economômetro" });
  }
});

/* =============== INDICADORES PERÍODO (TOP SERVIÇOS/SETORES) =============== */

router.get("/indicadores-periodo/servicos", async (req, res) => {
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
    console.error("Erro /indicadores-periodo/servicos:", error);
    res.status(500).json({ error: "Erro ao carregar serviços" });
  }
});

router.get("/indicadores-periodo/setores", async (req, res) => {
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
    console.error("Erro /indicadores-periodo/setores:", error);
    res.status(500).json({ error: "Erro ao buscar setores" });
  }
});

/* =============== INDICADORES: TAXA DE RESOLUÇÃO =============== */

router.get("/indicadores/taxa-resolucao", async (req, res) => {
  try {
    const periodo = req.query.periodo || "30d";
    const { inicio, fim } = getPeriodoDates(periodo);

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
    let totalMinutos = 0;
    for (const r of resolvidasRows) {
      totalMinutos += Math.floor(
        (new Date(r.updated_at) - new Date(r.created_at)) / 60000
      );
    }

    const tempo_medio =
      resolvidas > 0 ? Math.floor(totalMinutos / resolvidas) : 0;

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
      tempo_medio_conclusao_min: tempo_medio,
    });
  } catch (err) {
    console.error("Erro /indicadores/taxa-resolucao:", err);
    res.status(500).json({ error: "Erro ao calcular indicadores" });
  }
});

// ================= BAIRROS - TOP + EVOLUÇÃO =================

/* ================= BAIRROS - TOP + EVOLUÇÃO ================= */

router.get("/visao-geral/bairros-top6", async (req, res) => {
  try {
    // ==============================
    // TOP 6 BAIRROS (ranking geral)
    // ==============================
    const [bairros] = await db.query(
      `
      SELECT
        nb.title AS bairro,
        COUNT(*) AS total
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.citizens c
        ON c.id = s.citizen_id
      JOIN jp_conectada.neighborhoods nb
        ON nb.id = c.neighborhood_id
      WHERE s.tenant_id = ?
        AND s.deleted_at IS NULL
        AND c.neighborhood_id IS NOT NULL
        AND nb.active = 1
      GROUP BY nb.id, nb.title
      ORDER BY total DESC
      LIMIT 6
      `,
      [TENANT_ID]
    );

    // ==============================
    // EVOLUÇÃO MENSAL POR BAIRRO (ANO ATUAL)
    // ==============================
    const [meses] = await db.query(
      `
      SELECT
        MONTH(s.created_at) AS mes,
        nb.title AS bairro,
        COUNT(*) AS total
      FROM jp_conectada.solicitations s
      JOIN jp_conectada.citizens c
        ON c.id = s.citizen_id
      JOIN jp_conectada.neighborhoods nb
        ON nb.id = c.neighborhood_id
      WHERE s.tenant_id = ?
        AND s.deleted_at IS NULL
        AND c.neighborhood_id IS NOT NULL
        AND nb.active = 1
        AND YEAR(s.created_at) = YEAR(CURDATE())
      GROUP BY mes, nb.id, nb.title
      ORDER BY mes ASC
      `,
      [TENANT_ID]
    );

    res.json({ bairros, meses });
  } catch (err) {
    console.error("Erro /visao-geral/bairros-top6:", err);
    res.status(500).json({ error: "Erro ao carregar bairros" });
  }
});





/* =============== MÉDIA DIÁRIA DE SOLICITAÇÕES =============== */
router.get("/visao-geral/media-diaria", async (req, res) => {
  try {
    const periodo = req.query.periodo || "30d";

    // Usa mesma função dos indicadores
    const { inicio, fim } = getPeriodoDates(periodo);

    // 1) TOTAL DE SOLICITAÇÕES NO PERÍODO
    const [[{ total }]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM jp_conectada.solicitations
      WHERE tenant_id = ?
        AND deleted_at IS NULL
        AND created_at BETWEEN ? AND ?
      `,
      [TENANT_ID, inicio, fim]
    );

    // 2) DIAS NO PERÍODO (inclusivo)
    const diffMs = new Date(fim) - new Date(inicio);
    const diasPeriodo = Math.max(
      1,
      Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
    );

    // 3) MÉDIA DIÁRIA
    const media_diaria = Number((total / diasPeriodo).toFixed(1));

    res.json({
      periodo,
      inicio,
      fim,
      total,
      diasPeriodo,
      media_diaria,
    });

  } catch (err) {
    console.error("Erro /visao-geral/media-diaria:", err);
    res.status(500).json({ error: "Erro ao calcular média diária" });
  }
});


module.exports = router;
