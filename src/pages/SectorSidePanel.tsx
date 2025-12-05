const SectorSidePanel: React.FC<SectorSidePanelProps> = ({
  open,
  sectorId,
  sectorName,
  onClose,
}) => {
  const evolCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const evolChartRef = useRef<Chart | null>(null);

  const statusCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusChartRef = useRef<Chart | null>(null);

  const [loadingEvol, setLoadingEvol] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingServicos, setLoadingServicos] = useState(false);

  const [evolucao, setEvolucao] = useState<
    { mes: number; abertas: number; concluidas: number }[]
  >([]);

  const [status, setStatus] = useState<{
    iniciadas: number;
    espera: number;
    respondidas: number;
    concluidas: number;
  } | null>(null);

  const [servicos, setServicos] = useState<
    { servico: string; total: number }[]
  >([]);

  const [erro, setErro] = useState<string | null>(null);

  /* ============================================================
     1) Buscar EVOLUÇÃO
  ============================================================ */
  async function carregarEvolucao() {
    if (!sectorId) return;
    setLoadingEvol(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/solicitacoes/setor/evolucao?setor=${sectorId}`
      );
      const data = await res.json();
      setEvolucao(data || []);
      setErro(null);
      atualizarGraficoEvolucao(data || []);
    } catch (err) {
      setErro("Erro ao carregar evolução do setor");
    } finally {
      setLoadingEvol(false);
    }
  }

  function atualizarGraficoEvolucao(rows: any[]) {
    const canvas = evolCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const labels = rows.map((r) => `M${r.mes}`);
    const abertas = rows.map((r) => r.abertas || 0);
    const concluidas = rows.map((r) => r.concluidas || 0);

    if (evolChartRef.current) {
      evolChartRef.current.data.labels = labels;
      evolChartRef.current.data.datasets[0].data = abertas;
      evolChartRef.current.data.datasets[1].data = concluidas;
      evolChartRef.current.update();
      return;
    }

    evolChartRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Abertas",
            data: abertas,
            borderWidth: 2,
            tension: 0.25,
          },
          {
            label: "Concluídas",
            data: concluidas,
            borderWidth: 2,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
        },
      },
    });
  }

  /* ============================================================
     2) Buscar STATUS
  ============================================================ */
  async function carregarStatus() {
    if (!sectorId) return;
    setLoadingStatus(true);

    try {
      const res = await fetch(
        `${API_BASE_URL}/solicitacoes/setor/status?setor=${sectorId}`
      );
      const data = await res.json();
      setStatus(data || null);
      setErro(null);
      atualizarGraficoStatus(data || null);
    } catch (err) {
      setErro("Erro ao carregar status do setor");
    } finally {
      setLoadingStatus(false);
    }
  }

  function atualizarGraficoStatus(st: any) {
    const canvas = statusCanvasRef.current;
    if (!canvas || !st) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const labels = ["Iniciadas", "Espera", "Respondidas", "Concluídas"];
    const values = [
      st.iniciadas || 0,
      st.espera || 0,
      st.respondidas || 0,
      st.concluidas || 0,
    ];

    if (statusChartRef.current) {
      statusChartRef.current.data.labels = labels;
      statusChartRef.current.data.datasets[0].data = values;
      statusChartRef.current.update();
      return;
    }

    statusChartRef.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
        },
      },
    });
  }

  /* ============================================================
     3) Buscar SERVIÇOS TOP
  ============================================================ */
  async function carregarServicos() {
    if (!sectorId) return;
    setLoadingServicos(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/solicitacoes/setor/servicos-top?setor=${sectorId}`
      );
      const data = await res.json();
      setServicos(data || []);
      setErro(null);
    } catch (err) {
      setErro("Erro ao carregar serviços do setor");
    } finally {
      setLoadingServicos(false);
    }
  }

  /* ============================================================
     Ao abrir o painel → carregar tudo
  ============================================================ */
  useEffect(() => {
    if (open) {
      carregarEvolucao();
      carregarStatus();
      carregarServicos();
    }
  }, [open, sectorId]);

  /* ============================================================
     RENDER
  ============================================================ */

  if (!open) return null;

  return (
    <>
      <div
        className="side-panel-backdrop show"
        onClick={onClose}
      ></div>

      <div className="side-panel open">
        <div className="side-panel-header">
          <h2>{sectorName}</h2>
          <button onClick={onClose}>×</button>
        </div>

        <div className="side-panel-content">
          {erro && (
            <div
              style={{
                background: "#fee2e2",
                padding: 12,
                color: "#b91c1c",
                borderRadius: 8,
                marginBottom: 10,
              }}
            >
              {erro}
            </div>
          )}

          {/* EVOLUÇÃO */}
          <section className="painel-bloco">
            <h3>Evolução mensal</h3>
            <div className="chart-container" style={{ height: 220 }}>
              {loadingEvol ? (
                <p>Carregando...</p>
              ) : (
                <canvas ref={evolCanvasRef}></canvas>
              )}
            </div>
          </section>

          {/* STATUS */}
          <section className="painel-bloco">
            <h3>Status das Solicitações</h3>
            <div className="chart-container" style={{ height: 220 }}>
              {loadingStatus ? (
                <p>Carregando...</p>
              ) : (
                <canvas ref={statusCanvasRef}></canvas>
              )}
            </div>
          </section>

          {/* SERVIÇOS TOP */}
          <section className="painel-bloco">
            <h3>Serviços mais solicitados</h3>
            {loadingServicos ? (
              <p>Carregando...</p>
            ) : servicos.length === 0 ? (
              <p>Nenhum serviço encontrado.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {servicos.map((s, i) => (
                  <li
                    key={i}
                    style={{
                      padding: "8px 0",
                      borderBottom: "1px solid #e5e7eb",
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: ".95rem",
                    }}
                  >
                    <span>{s.servico}</span>
                    <strong>{fmtNumero.format(s.total)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
};
