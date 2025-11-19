// visao.js (compatível com seu server.js atual)
const API = "http://localhost:3000";
const fmt = new Intl.NumberFormat("pt-BR");
let evolucaoChart = null;

// util
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
const fmtR$ = (n) => `R$ ${fmt.format(Number(n || 0))}`;

/* 1) KPIs principais */
async function carregarContadores() {
  try {
    const r = await fetch(`${API}/api/visao-geral/contadores`);
    const k = await r.json();

    setText("vg-servicos",      fmt.format(k.total_servicos || 0));
    setText("vg-usuarios",      fmt.format(k.total_usuarios || 0));
    setText("vg-cidadaos-total",fmt.format(k.total_cidadaos || 0));
    setText("vg-setores",       fmt.format(k.total_setores || 0));

    const ef = Number(k.eficiencia_pct || 0);
    setText("vg-eficiencia", `${ef.toFixed(1)}%`);

    const qual = Number(k.qualidade_media || 0);
    setText("vg-qualidade", qual > 0 ? qual.toFixed(2) : "—");
  } catch (e) {
    console.error("KPIs erro:", e);
  }
}

/* 2) Cidadãos (homens, mulheres, idade média) */
async function carregarCidadaosResumo() {
  try {
    const r = await fetch(`${API}/api/visao-geral/cidadaos-resumo`);
    const c = await r.json();
    setText("vg-cidadaos-homens",  fmt.format(c.homens || 0));
    setText("vg-cidadaos-mulheres",fmt.format(c.mulheres || 0));
    const idade = c.idade_media != null ? Number(c.idade_media) : null;
    setText("vg-idade-media", idade != null ? `${idade.toFixed(0)} anos` : "—");
  } catch (e) {
    console.error("Cidadaos-resumo erro:", e);
  }
}

/* 3) Evolução de uso (últimos 12 meses) */
async function carregarEvolucaoUso() {
  const r = await fetch(`${API}/api/visao-geral/evolucao-uso`);
  const data = await r.json();

  const labels = data.map(d => {
    const dt = new Date(`${d.mes_iso}T00:00:00`);
    return new Intl.DateTimeFormat("pt-BR", { month: "short" })
      .format(dt).replace(".", "");
  });

  const abertas    = data.map(d => Number(d.abertas || 0));
  const concluidas = data.map(d => Number(d.concluidas || 0));

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
          tension: 0.25
        },
        {
          label: "Concluídas",
          data: concluidas,
          borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,.12)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.25,
          hidden: true  // começa desligada; o usuário ativa na legenda
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: v => fmt.format(v) } }
      }
    }
  });
}



/* 4) Economia por ano/mês (usa apenas as 3 colunas retornadas hoje) */
async function carregarEconomiaAno(ano) {
  try {
    const r = await fetch(`${API}/api/visao-geral/economia?ano=${ano}`);
    const rows = await r.json();

    const tbody = document.getElementById("vg-periodo-body");
    const tfoot = document.getElementById("vg-periodo-totais");
    if (!tbody || !tfoot) return;

    tbody.innerHTML = "";

    let totSolic = 0;
    let totEco = 0;

    rows.forEach(row => {
      const dt = new Date(`${row.mes_iso}T00:00:00`);
      const mesNome = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(dt);
      const mes = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);

      const solicit = Number(row.solicitacoes_mes || 0);
      const eco = Number(row.economia_estimativa || 0);

      totSolic += solicit;
      totEco += eco;

      // Como seu endpoint ainda não retorna pessoas/anexos/acessos, deixamos "—"
      tbody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${mes}</td>
          <td class="center">${fmt.format(solicit)}</td>
          <td class="center">—</td>
          <td class="center">—</td>
          <td class="center">—</td>
          <td class="center">${fmtR$(eco)}</td>
        </tr>
      `);
    });

    tfoot.innerHTML = `
      <td><strong>Total</strong></td>
      <td class="center"><strong>${fmt.format(totSolic)}</strong></td>
      <td class="center"><strong>—</strong></td>
      <td class="center"><strong>—</strong></td>
      <td class="center"><strong>—</strong></td>
      <td class="center"><strong>${fmtR$(totEco)}</strong></td>
    `;

    // Atualiza o card de “Economia estimada”
    setText("vg-economia", fmtR$(totEco));
  } catch (e) {
    console.error("Economia erro:", e);
  }
}

/* 5) Popular anos no select e bind */
async function initSelectAno() {
  const sel = document.getElementById("vg-ano-select");
  if (!sel) return;
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3, anoAtual - 4];
  sel.innerHTML = anos.map(a => `<option value="${a}">${a}</option>`).join("");
  sel.value = String(anoAtual);
  await carregarEconomiaAno(sel.value);
  sel.addEventListener("change", () => carregarEconomiaAno(sel.value));
}

/* INIT */
document.addEventListener("DOMContentLoaded", async () => {
  await carregarContadores();
  await carregarCidadaosResumo();
  await carregarEvolucaoUso();
  await initSelectAno();
});
