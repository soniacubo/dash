// utils/averages.js

/**
 * Retorna o SELECT padrão para consultar averages com:
 * - média ponderada (score)
 * - total de votos somado
 *
 * Isso evita duplicações em várias rotas.
 */
function selectAverageBase() {
  return `
    SELECT
      a.evaluated_id AS id,
      a.evaluated_type AS tipo,
      a.score AS media,
      a.total_votes AS total_votos,
      a.count_1,
      a.count_2,
      a.count_3,
      a.count_4,
      a.count_5
    FROM jp_conectada.averages a
  `;
}

/**
 * Calcula uma média ponderada manualmente (caso precise).
 * Útil para rotas onde a média deve ser recalculada antes de exibir.
 */
function calcularMediaPonderada(row) {
  const c1 = row.count_1 || 0;
  const c2 = row.count_2 || 0;
  const c3 = row.count_3 || 0;
  const c4 = row.count_4 || 0;
  const c5 = row.count_5 || 0;

  const total = c1 + c2 + c3 + c4 + c5;

  if (total === 0) {
    return { media: 0, total_votes: 0 };
  }

  const soma =
    c1 * 1 +
    c2 * 2 +
    c3 * 3 +
    c4 * 4 +
    c5 * 5;

  return {
    media: soma / total,
    total_votes: total,
  };
}

/**
 * Formata um registro retornado pelo banco, garantindo consistência.
 */
function formatAverageRow(row) {
  if (!row) {
    return {
      id: null,
      media: 0,
      total_votos: 0,
      counts: { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 },
    };
  }

  return {
    id: row.id,
    media: row.media || 0,
    total_votos: row.total_votos || 0,
    counts: {
      c1: row.count_1 || 0,
      c2: row.count_2 || 0,
      c3: row.count_3 || 0,
      c4: row.count_4 || 0,
      c5: row.count_5 || 0,
    }
  };
}

/**
 * Verifica se um serviço/setor tem votos suficientes.
 */
function minimoAvaliacoes(row, minimo = 1) {
  return (row?.total_votos || 0) >= minimo;
}

module.exports = {
  selectAverageBase,
  calcularMediaPonderada,
  formatAverageRow,
  minimoAvaliacoes,
};
