/* ============================================================
   BASE & UTILS
============================================================ */
function resolveApiBase() {
  const loc = window.location;
  const origin = loc.origin || `${loc.protocol}//${loc.host}`;
  if (origin.includes(":3000")) return `${origin}/api`;
  return `${loc.protocol}//${loc.hostname}:3000/api`;
}
const API_BASE_URL = resolveApiBase();

const fmt = new Intl.NumberFormat("pt-BR");
const fmtR$ = (n) => `R$ ${fmt.format(Number(n || 0))}`;

const setText = (id, v) => {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
};

let evolucaoChart = null;
let graficoTop6Bairros = null;

/* ============================================================
   1) KPIs PRINCIPAIS
============================================================ */
async function carregarContadores() {
  try {
    const r = await fetch(`${API_BASE_URL}/visao-geral/contadores`);
    const k = await r.json();

    setText("vg-servicos", fmt.format(k.total_servicos || 0));
    setText("vg-usuarios", fmt.format(k.total_usuarios || 0));
    setText("vg-cidadaos-total", fmt.format(k.total_cidadaos || 0));
    setText("vg-setores", fmt.format(k.total_setores || 0));

    const ef = Number(k.eficiencia_pct || 0);
    setText("vg-eficiencia", `${ef.toFixed(1)}%`);

    const qual = Number(k.qualidade_media || 0);
    setText("vg-qualidade", qual > 0 ? qual.toFixed(2) : "—");
  } catch (e) {
    console.error("KPIs erro:", e);
  }
}


async function loadTaxa() {
  const res = await fetch(
    `${API_BASE_URL}/taxa-resolucao?tenantId=${tenant}&start=${startDate}&end=${endDate}`
  );
  const data = await res.json();
  setTaxaResolucao(data.taxa_resolucao_percent);
}

async function loadStatusBar() {
  const res = await fetch(
    `${API_BASE_URL}/status-periodo?tenantId=${tenant}&start=${startDate}&end=${endDate}`
  );
  const data = await res.json();
  setStatusPeriodo(data);
}
useEffect(() => {
  loadTaxa();
  loadStatusBar();
}, [tenant, startDate, endDate]);

/* ============================================================
   2) CIDADÃOS RESUMO
============================================================ */
async function carregarCidadaosResumo() {
  try {
    const r = await fetch(`${API_BASE_URL}/visao-geral/cidadaos-resumo`);
    const c = await r.json();

    setText("vg-cidadaos-homens", fmt.format(c.homens || 0));
    setText("vg-cidadaos-mulheres", fmt.format(c.mulheres || 0));

    const idade = c.idade_media != null ? Number(c.idade_media) : null;
    setText(
      "vg-idade-media",
      idade != null ? `${idade.toFixed(0)} anos` : "—"
    );
  } catch (e) {
    console.error("Cidadaos-resumo erro:", e);
  }
}

/* ============================================================
   3) EVOLUÇÃO DE USO (12 meses)
============================================================ */
async function carregarEvolucaoUso() {
  const r = await fetch(`${API_BASE_URL}/visao-geral/evolucao-uso`);
  const data = await r.json();

  const labels = data.map((d) => {
    const dt = new Date(`${d.mes_iso}T00:00:00`);
    return new Intl.DateTimeFormat("pt-BR", { month: "short" })
      .format(dt)
      .replace(".", "");
  });

  const abertas = data.map((d) => Number(d.abertas || 0));
  const concluidas = data.map((d) => Number(d.concluidas || 0));

  const ctx = document.getElementById("evolucaoUsoChart");
  if (!ctx) return;
  if (evolucaoChart) evolucaoChart.destroy();

  evolucaoChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Abertas",
          data: abertas,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,.12)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.25,
        },
        {
          label: "Concluídas",
          data: concluidas,
          borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,.12)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.25,
          hidden: true,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "bottom" },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

/* ============================================================
   3.1) TOP 6 BAIRROS – mesmo endpoint do React
============================================================ */
async function carregarTop6Bairros() {
  try {
    const res = await fetch(`${API_BASE_URL}/solicitacoes/bairros-top6`);
    const rows = await res.json();

    const canvas = document.getElementById("graficoTop3Bairros");
    if (!canvas) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      if (graficoTop6Bairros) graficoTop6Bairros.destroy();
      graficoTop6Bairros = new Chart(canvas, {
        type: "line",
        data: { labels: [], datasets: [] },
        options: { responsive: true, maintainAspectRatio: false },
      });
      return;
    }

    // meses ISO (YYYY-MM) ordenados
    const mesesISO = Array.from(
      new Set(rows.map((r) => String(r.mes)))
    ).sort((a, b) => {
      const da = new Date(`${a}-01`).getTime();
      const db = new Date(`${b}-01`).getTime();
      return da - db;
    });

    const labels = mesesISO.map((m) => {
      const dt = new Date(`${m}-01`);
      return new Intl.DateTimeFormat("pt-BR", { month: "short" })
        .format(dt)
        .replace(".", "");
    });

    // somar total por bairro e pegar top 6
    const bairroTotals = new Map();
    rows.forEach((row) => {
      const b = String(row.bairro || "—");
      bairroTotals.set(b, (bairroTotals.get(b) || 0) + Number(row.total || 0));
    });

    const bairros = Array.from(bairroTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([b]) => b)
      .slice(0, 6);

    const cores = [
      "#1d4ed8",
      "#059669",
      "#f59e0b",
      "#dc2626",
      "#7c3aed",
      "#0ea5e9",
    ];

    const datasets =
      bairros.length > 0
        ? bairros.map((bairro, idx) => {
            const data = mesesISO.map((mesIso) => {
              const row = rows.find(
                (r) =>
                  String(r.mes) === mesIso &&
                  String(r.bairro || "—") === bairro
              );
              return row ? Number(row.total || 0) : 0;
            });

            return {
              label: bairro,
              data,
              borderColor: cores[idx % cores.length],
              backgroundColor: cores[idx % cores.length] + "33",
              borderWidth: 2,
              tension: 0.25,
              pointRadius: 3,
            };
          })
        : [
            {
              label: "Sem dados",
              data: new Array(labels.length).fill(0),
              borderColor: "#9ca3af",
              backgroundColor: "#9ca3af33",
            },
          ];

    if (graficoTop6Bairros) graficoTop6Bairros.destroy();

    graficoTop6Bairros = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "bottom",
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
      },
    });
  } catch (error) {
    console.error("Erro ao carregar top 6 bairros:", error);
  }
}

/* ============================================================
   4) ECONOMIA — TABELA POR ANO
============================================================ */
async function carregarEconomiaAno(ano) {
  try {
    const r = await fetch(`${API_BASE_URL}/visao-geral/economia?ano=${ano}`);
    const rows = await r.json();

    const tbody = document.getElementById("vg-periodo-body");
    const tfoot = document.getElementById("vg-periodo-totais");
    if (!tbody || !tfoot) return;

    tbody.innerHTML = "";

    let totSolic = 0;
    let totEco = 0;

    rows.forEach((row) => {
      const dt = new Date(`${row.mes_iso}T00:00:00`);
      const mesNome = new Intl.DateTimeFormat("pt-BR", {
        month: "long",
      }).format(dt);
      const mes = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);

      const solicit = Number(row.solicitacoes_mes || 0);
      const eco = Number(row.economia_estimativa || 0);

      totSolic += solicit;
      totEco += eco;

      tbody.insertAdjacentHTML(
        "beforeend",
        `
        <tr>
          <td>${mes}</td>
          <td class="center">${fmt.format(solicit)}</td>
          <td class="center">—</td>
          <td class="center">—</td>
          <td class="center">—</td>
          <td class="center">${fmtR$(eco)}</td>
        </tr>
      `
      );
    });

    tfoot.innerHTML = `
      <td><strong>Total</strong></td>
      <td class="center"><strong>${fmt.format(totSolic)}</strong></td>
      <td class="center"><strong>—</strong></td>
      <td class="center"><strong>—</strong></td>
      <td class="center"><strong>—</strong></td>
      <td class="center"><strong>${fmtR$(totEco)}</strong></td>
    `;
  } catch (e) {
    console.error("Economia erro:", e);
  }
}

/* ============================================================
   5) ECONÔMETRO
============================================================ */
async function carregarEconomometro(periodo) {
  try {
    // mesmo endpoint usado no React
    const r = await fetch(`${API_BASE_URL}/economometro?periodo=${periodo}`);
    const eco = await r.json();

    setText("eco-arvores", fmt.format(eco.arvores || 0));
    setText("eco-folhas", fmt.format(eco.folhas || 0));
    setText("eco-dinheiro", fmtR$(eco.dinheiro || 0));
  } catch (e) {
    console.error("Economometro erro:", e);
  }
}

function initEconomometro() {
  const sel = document.getElementById("eco-periodo-select");
  if (!sel) return;

  carregarEconomometro(sel.value);
  sel.addEventListener("change", () => carregarEconomometro(sel.value));
}

/* ============================================================
   6) POPULAR SELECT ANO
============================================================ */
async function initSelectAno() {
  const sel = document.getElementById("vg-ano-select");
  if (!sel) return;

  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual, anoAtual - 1, anoAtual - 2];

  sel.innerHTML = anos.map((a) => `<option value="${a}">${a}</option>`).join("");
  sel.value = String(anoAtual);

  await carregarEconomiaAno(sel.value);
  sel.addEventListener("change", () => carregarEconomiaAno(sel.value));
}

/* ============================================================
   INIT
============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  await carregarContadores();
  await carregarCidadaosResumo();
  await carregarEvolucaoUso();
  await initSelectAno();
  initEconomometro();
  await carregarTop6Bairros();
});
