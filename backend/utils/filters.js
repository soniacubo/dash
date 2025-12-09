// utils/filters.js

/**
 * Converte um período (inicio, fim) em filtro SQL + params.
 * Usado para filtrar por datas em averages, tramitations, solicitations, etc.
 */
function buildPeriodFilter(inicio, fim, column = "created_at") {
  let sql = "";
  const params = [];

  if (inicio && fim) {
    sql = ` AND DATE(${column}) BETWEEN ? AND ? `;
    params.push(inicio, fim);
  }

  return { sql, params };
}

/**
 * Filtro por setor usando tabela service_sector.
 * Isso garante compatibilidade com averages e solicitations.
 */
function buildSetorFilter(setor) {
  if (!setor) return { sql: "", params: [] };

  const sql = `
    AND EXISTS (
      SELECT 1
      FROM jp_conectada.service_sector ss
      WHERE ss.service_id = a.evaluated_id
        AND ss.sector_id = ?
    )
  `;

  return { sql, params: [setor] };
}

/**
 * Filtro direto por serviço.
 */
function buildServicoFilter(servico) {
  if (!servico) return { sql: "", params: [] };

  return {
    sql: " AND a.evaluated_id = ? ",
    params: [servico],
  };
}

/**
 * Combina filtros dinamicamente.
 * Retorna: { whereSQL, params }
 */
function mergeFilters(...filters) {
  let whereSQL = "";
  let params = [];

  filters.forEach((f) => {
    if (!f) return;
    if (f.sql) whereSQL += ` ${f.sql} `;
    if (f.params?.length) params.push(...f.params);
  });

  return { whereSQL, params };
}

module.exports = {
  buildPeriodFilter,
  buildSetorFilter,
  buildServicoFilter,
  mergeFilters,
};
