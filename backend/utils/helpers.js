// backend/utils/helpers.js

/* ============================================================
   FORMATAÇÃO DE DATAS
============================================================ */

/**
 * Converte data no formato BR (dd/mm/yyyy) para MySQL (yyyy-mm-dd)
 */
function brToMySQL(dateBR) {
  if (!dateBR) return null;
  const [d, m, y] = dateBR.split("/");
  return `${y}-${m}-${d}`;
}

function getStartDateFromPeriod(period) {
  const today = new Date();
  const end = new Date(today);

  const start = new Date(today);

  switch (period) {
    case "hoje":
      start.setHours(0, 0, 0, 0);
      break;

    case "7d":
      start.setDate(start.getDate() - 6);
      break;

    case "30d":
      start.setDate(start.getDate() - 29);
      break;

    case "90d":
      start.setDate(start.getDate() - 89);
      break;

    case "6m":
      start.setMonth(start.getMonth() - 6);
      break;

    case "1y":
      start.setFullYear(start.getFullYear(), 0, 1);
      break;

    case "ano_passado":
      start.setFullYear(start.getFullYear() - 1, 0, 1);
      end.setFullYear(end.getFullYear() - 1, 11, 31);
      break;

    case "all":
      start.setFullYear(2000, 0, 1);
      break;

    default:
      start.setDate(start.getDate() - 29);
  }

  return {
    inicioISO: start.toISOString().slice(0, 10),
    fimISO: end.toISOString().slice(0, 10)
  };
}

module.exports = {
  getStartDateFromPeriod,
  // mantenha os outros exports existentes
};

/**
 * Dado um período (today, 7d, 30d, 90d, 6m, 1y, ano_passado, all),
 * retorna objetos inicio, fim e diasPeriodo.
 */
function getPeriodoDates(periodoRaw) {
  const periodo = String(periodoRaw || "30d");
  const agora = new Date();

  const fim = new Date();
  let inicio = new Date();

  switch (periodo) {
    case "today":
      inicio = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        now.getDate(),
        0, 0, 0
      );
      break;
    case "7d":
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 6);
      break;
    case "30d":
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 29);
      break;
    case "90d":
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 89);
      break;
    case "6m":
      inicio = new Date(agora);
      inicio.setMonth(inicio.getMonth() - 6);
      break;
    case "1y":
      inicio = new Date(agora.getFullYear(), 0, 1);
      break;
    case "ano_passado":
      inicio = new Date(agora.getFullYear() - 1, 0, 1);
      fim.setFullYear(agora.getFullYear() - 1, 11, 31);
      break;
    case "all":
      inicio = new Date("2000-01-01T00:00:00Z");
      break;
    default:
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 29);
      break;
  }

  const diasPeriodo = Math.max(
    1,
    Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1
  );

  return { inicio, fim, diasPeriodo, periodo };
}

/**
 * Retorna data inicial (YYYY-MM-DD HH:MM:SS) com base em um período reduzido
 */
function getStartDateFromPeriod(periodKey) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const start = new Date(now);

  switch (periodKey) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "90d":
      start.setDate(start.getDate() - 90);
      break;
    case "6m":
      start.setMonth(start.getMonth() - 6);
      break;
    case "1y":
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }

  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")} 00:00:00`;
}

/**
 * Retorna {start, end} para um ano específico
 */
function dateRangeForYear(year) {
  return {
    start: `${year}-01-01 00:00:00`,
    end: `${year}-12-31 23:59:59`
  };
}

/* ============================================================
   CACHE SIMPLES
============================================================ */

const _cache = new Map();

async function withCache(key, ttlMs, loader) {
  const now = Date.now();
  const entry = _cache.get(key);
  if (entry && now - entry.t < ttlMs) return entry.v;

  const value = await loader();
  _cache.set(key, { v: value, t: now });
  return value;
}

/* ============================================================
   FORMATAÇÃO — DURAÇÃO EM MINUTOS
============================================================ */

function formatDurationFromMinutes(totalMinutes) {
  const min = Math.floor(Number(totalMinutes || 0));
  if (min <= 0) return "0 minuto";

  const minutosPorDia = 60 * 24;
  const dias = Math.floor(min / minutosPorDia);
  const horas = Math.floor((min % minutosPorDia) / 60);
  const minutos = min % 60;

  const partes = [];
  if (dias > 0) partes.push(`${dias} dia${dias > 1 ? "s" : ""}`);
  if (horas > 0) partes.push(`${horas} hora${horas > 1 ? "s" : ""}`);

  if (partes.length === 0 && minutos > 0) {
    partes.push(`${minutos} minuto${minutos > 1 ? "s" : ""}`);
  }

  return partes.join(" e ");
}

/* ============================================================
   EXPORTAÇÃO
============================================================ */

module.exports = {
  brToMySQL,
  getPeriodoDates,
  getStartDateFromPeriod,
  dateRangeForYear,
  withCache,
  formatDurationFromMinutes
};
