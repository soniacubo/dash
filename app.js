/* ============================================================
    VARIÁVEIS DE ESTADO E INICIALIZAÇÃO
============================================================ */

const API_BASE_URL = 'http://localhost:3000/api';

/* ============================================================
    CARDS DE ESTATÍSTICAS DE USUÁRIOS
============================================================ */
async function carregarEstatisticasUsuarios() {
    try {
        const res = await fetch(`${API_BASE_URL}/usuarios/estatisticas`);
        const stats = await res.json();

        const elTotal        = document.getElementById("card-total-servidores");
        const elAtivos24h    = document.getElementById("card-ativos-24h");
        const elInativos30d  = document.getElementById("card-inativos-30d");
        const elOnlineAgora  = document.getElementById("card-online-agora");
        const elCriadosMes   = document.getElementById("card-criados-ultimo-mes");

        if (elTotal)       elTotal.textContent       = stats.total_servidores ?? 0;
        if (elAtivos24h)   elAtivos24h.textContent   = stats.ativos_24h ?? 0;
        if (elInativos30d) elInativos30d.textContent = stats.inativos_30d ?? 0;
        if (elOnlineAgora) elOnlineAgora.textContent = stats.online_agora ?? 0;
        if (elCriadosMes)  elCriadosMes.textContent  = stats.criados_ultimo_mes ?? 0;

    } catch (e) {
        console.error("Erro ao carregar estatísticas de usuários:", e);
    }
}

// Variáveis de estado global para a ordenação
let allSetoresData = []; // Armazena a lista de setores carregada e ordenada

// ESTADO INICIAL DA ORDENAÇÃO
let sortColumn = 'Servicos'; // Define a coluna inicial como "Serviços"
let sortDirection = 'desc'; // Define a direção inicial como "descendente"
let rankingDespachosChart = null;


let usuariosData = [];
let sortUserColumn = "";
let sortUserDirection = "asc";

/* ============================================================
    1. CARREGAR SETORES + USUÁRIOS + EFICIÊNCIA + QUALIDADE
============================================================ */
async function carregarSetores() {
    if (!document.querySelector("#tabela-setores")) return; 
    try {
        const [resSetores, resUsuarios, resEficiencia, resQualidade] = await Promise.all([
            fetch(`${API_BASE_URL}/setores`),
            fetch(`${API_BASE_URL}/setores-usuarios-resumo`),
            fetch(`${API_BASE_URL}/setores-eficiencia`),
            fetch(`${API_BASE_URL}/setores-qualidade`)
        ]);

        const setores = await resSetores.json();
        const resumoUsuarios = await resUsuarios.json();
        const eficiencia = await resEficiencia.json();
        const qualidade = await resQualidade.json();

        const mapUsuarios = new Map(resumoUsuarios.map(u => [u.sector_id, u]));
        const mapEf = new Map(eficiencia.map(e => [e.sector_id, e]));
        const mapQual = new Map(qualidade.map(q => [q.sector_id, q]));

        const lista = setores.map(s => {
            const u = mapUsuarios.get(s.sector_id) || {};
            const e = mapEf.get(s.sector_id) || {};
            const q = mapQual.get(s.sector_id) || {};

            const totalSolic = Number(e.total_solicitacoes || 0);
            const totalConcl = Number(e.total_concluidas || 0);
            const totalResp = Number(e.total_respondidas || 0);

            // NÃO CONCLUÍDAS
            const naoConcluidas = Math.max(totalSolic - totalConcl, 0);

            // RESPONDIDAS NÃO CONCLUÍDAS
            let respondidasNaoConcluidas = totalResp - totalConcl;
            if (respondidasNaoConcluidas < 0) respondidasNaoConcluidas = 0;

            // ENGAJAMENTO REAL
            // (respondidas que ainda não concluíram / total não concluídas)
            const engajamentoPct =
                naoConcluidas > 0
                ? (respondidasNaoConcluidas / naoConcluidas) * 100
                : 0;
            
            
            // Serviços
            const principal = Number(s.servicos_principal_individual || 0);
            const participante = Number(s.servicos_participante_individual || 0);
            const servicosTotal = principal + participante;

            // Mapeia os dados para a lista final e chaves de ordenação
            return {
                ...s,

                // Chaves de Ordenação (correspondem aos data-column do HTML)
                'Setor': s.setor,
                'Usuarios': u.usuarios_total || 0,
                'Servicos': servicosTotal, // Soma principal + participante
                'Eficiencia': Number(e.eficiencia_percentual || 0) / 100, // Usa decimal para métrica
                'Engajamento': engajamentoPct / 100, // Usa decimal para métrica
                'Qualidade': Number(q.nota_media || 0),

                // outros campos
                usuarios_total: u.usuarios_total || 0,
                usuarios_ativos: u.usuarios_ativos || 0,
                usuarios_inativos: u.usuarios_inativos || 0,
                total_usuarios_root: u.total_geral_root || 0,
                solicitacoes_total: totalSolic,
                solicitacoes_concluidas: totalConcl,
                solicitacoes_respondidas: totalResp,
                eficiencia_percentual: Number(e.eficiencia_percentual || 0),
                engajamento_percentual: engajamentoPct,
                qualidade_media: Number(q.nota_media || 0),
                qualidade_total_avaliacoes: Number(q.total_avaliacoes || 0),
                qualidade_percentual_avaliado: Number(q.total_solicitacoes > 0
                    ? (q.total_avaliacoes / q.total_solicitacoes) * 100
                    : 0
                ),
            };
        });

        // 1. Armazena no estado global
        allSetoresData = lista;
        
        // 2. Consolida as métricas para os setores de Nível 0 (para Tooltip e Rankings)
        consolidarMetricasNivelZero();
        
        // 3. Ordenação inicial (por setor e depois por path)
        sortData('Setor', 'asc'); // O padrão é ordenar por Setor/path para manter a hierarquia

        // 4. Renderiza a tabela e rankings
        renderTabela(allSetoresData);
        montarRankings(allSetoresData);

    } catch (error) {
        console.error("Erro ao carregar dados do dashboard:", error);
        const tbody = document.querySelector("#tabela-setores tbody");
        if(tbody) {
             tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Erro ao conectar com a API (Verifique o servidor Node.js/MySQL).</td></tr>';
        }
    }
}


/* /* ============================================================
    2.1. CONSOLIDAÇÃO DE DADOS PARA NÍVEL 0 (SECRETARIAS)
============================================================ */
/**
 * Consolida as métricas (Eficiência, Engajamento, Qualidade, Serviços)
 * de todos os setores filhos para os setores de Nível 0.
 */
function consolidarMetricasNivelZero() {
    // Objeto para armazenar as somas e contagens de cada Nível 0
    const consolidadosMap = {};

    // Inicializa o mapa com todos os setores de Nível 0
    allSetoresData.forEach(setor => {
        if (setor.nivel === 0) {
            consolidadosMap[setor.sector_id] = {
                eficiencia: [],
                engajamento: [],
                qualidadeNotas: [],
                qualidadePesos: [],
                servicosTotal: 0,
                // NOVO: Inicializa o contador de avaliações totais
                totalAvaliacoes: 0, 
            };
        }
    });

    // Popula o mapa com os dados de todos os setores (inclusive os Nível 0)
    allSetoresData.forEach(setor => {
        // Encontra o ID da Secretaria (raiz) usando o path
        const path = setor.path.split(',').map(Number);
        const rootId = path[0];

        if (consolidadosMap[rootId]) {
            const data = consolidadosMap[rootId];

            // Soma dos Serviços
            data.servicosTotal += setor.Servicos; 

            // Eficiência e Engajamento
            if (setor.solicitacoes_total > 0) {
                if (setor.Eficiencia > 0) data.eficiencia.push(setor.Eficiencia);
                if (setor.Engajamento > 0) data.engajamento.push(setor.Engajamento);
            }

            // Qualidade (Média Ponderada)
            if (setor.qualidade_total_avaliacoes > 0) {
                data.qualidadeNotas.push(setor.qualidade_media);
                data.qualidadePesos.push(setor.qualidade_total_avaliacoes);
                
                // NOVO: Soma o total de avaliações
                data.totalAvaliacoes += setor.qualidade_total_avaliacoes; 
            }
        }
    });

    // Injeta os valores consolidados de volta nos objetos de Nível 0
    allSetoresData.forEach(setor => {
        if (setor.nivel === 0) {
            const data = consolidadosMap[setor.sector_id];
            
            // ... (restante das consolidações, sem alteração) ...
            setor.Usuarios_Consolidado = setor.total_usuarios_root || 0;
            setor.Servicos_Consolidado = data.servicosTotal;
            
            // EFICIÊNCIA
            if (data.eficiencia.length > 0) {
                const soma = data.eficiencia.reduce((sum, val) => sum + val, 0);
                setor.Eficiencia_Consolidado_Pct = (soma / data.eficiencia.length) * 100;
            } else {
                setor.Eficiencia_Consolidado_Pct = 0;
            }

            // ENGAJAMENTO
            if (data.engajamento.length > 0) {
                const soma = data.engajamento.reduce((sum, val) => sum + val, 0);
                setor.Engajamento_Consolidado_Pct = (soma / data.engajamento.length) * 100;
            } else {
                setor.Engajamento_Consolidado_Pct = 0;
            }
            
            // QUALIDADE
            const totalPesos = data.qualidadePesos.reduce((a, b) => a + b, 0);
            if (totalPesos > 0) {
                const totalPontos = data.qualidadeNotas.reduce((sum, nota, i) => sum + (nota * data.qualidadePesos[i]), 0);
                setor.Qualidade_Consolidada_Media = totalPontos / totalPesos;
            } else {
                setor.Qualidade_Consolidada_Media = 0;
            }
            
            // NOVO: Armazena o total consolidado de avaliações
            setor.Qualidade_Total_Avaliacoes_Consolidado = data.totalAvaliacoes;
        }
    });
}

/* ============================================================
    2.2. FUNÇÃO DE GERAÇÃO DE TOOLTIP CONSOLIDADO
============================================================ */
/**
 * Gera o conteúdo HTML do tooltip para setores de Nível 0 (Secretarias).
 * @param {object} setor - O objeto de dados do setor de Nível 0.
 * @returns {string} O HTML formatado para o tooltip.
 */
function generateConsolidatedTooltip(setor) {
    if (setor.nivel !== 0) return '';

    const usuarios = setor.Usuarios_Consolidado || 0;
    const totalServicos = setor.Servicos_Consolidado || 0;
    const eficienciaPct = setor.Eficiencia_Consolidado_Pct || 0;
    const engajamentoPct = setor.Engajamento_Consolidado_Pct || 0;
    const notaMedia = setor.Qualidade_Consolidada_Media || 0;
    
    // NOVO: Pega o total de avaliações consolidadas
    const totalAvaliacoes = setor.Qualidade_Total_Avaliacoes_Consolidado || 0; 
    
    const notaMediaStr = notaMedia > 0 ? notaMedia.toFixed(2) : '—';
    const eficienciaStr = eficienciaPct > 0 ? `${eficienciaPct.toFixed(1)}%` : '—';
    const engajamentoStr = engajamentoPct > 0 ? `${engajamentoPct.toFixed(1)}%` : '—';

    // Classes de cor baseadas no percentual consolidado
    const corEf = eficienciaPct >= 70 ? "pct-good" : eficienciaPct >= 40 ? "pct-medium" : "pct-bad";
    const corEng = engajamentoPct >= 70 ? "pct-good" : engajamentoPct >= 40 ? "pct-medium" : "pct-bad";
    const corNota = notaMedia >= 4 ? "pct-good" : notaMedia >= 2.5 ? "pct-medium" : "pct-bad";

    return `
        <div class="tooltip-consolidado">
            <h4>Dados consolidados da Secretaria</h4>
            <div class="tooltip-grid">
                <div>
                    <strong>Usuários:</strong> ${usuarios.toLocaleString()}
                </div>
                <div>
                    <strong>Serviços:</strong> ${totalServicos}
                </div>
                <div>
                    <strong>Eficiência:</strong> <span class="${eficienciaPct > 0 ? corEf : ''}">${eficienciaStr}</span>
                </div>
                <div>
                    <strong>Engajamento:</strong> <span class="${engajamentoPct > 0 ? corEng : ''}">${engajamentoStr}</span>
                </div>
                
                
                <div class="full-row"> 
                    <strong>Nota média:</strong> <span class="${notaMedia > 0 ? corNota : ''}">${notaMediaStr}</span>
                </div>
                
            </div>
        </div>
    `;
}


/* ============================================================
    3. RENDERIZAÇÃO DA TABELA (VERSÃO QUE FUNCIONAVA)
============================================================ */
function renderTabela(lista) {
    const tbody = document.querySelector("#tabela-setores tbody");
    if (!tbody) return;

    lista.forEach(setor => {
        const tr = document.createElement("tr");

        tr.dataset.id = setor.sector_id;
        tr.dataset.parent = setor.parent_id || "";
        tr.dataset.nivel = setor.nivel;

        // filhos começam ocultos, mas o render é feito com a lista já ordenada
        if (setor.nivel > 0) tr.classList.add("hidden-row");

        const temFilhos = lista.some(s => s.parent_id === setor.sector_id);
        const icon = temFilhos
            ? `<span class="toggle" data-id="${setor.sector_id}">▶</span>`
            : `<span class="no-toggle"></span>`;

        const recuo = "&nbsp;".repeat(setor.nivel * 6);
        
        // métricas numéricas
        const ef  = Number(setor.eficiencia_percentual || 0);
        const eng = Number(setor.engajamento_percentual || 0);
        const nota = Number(setor.qualidade_media || 0);

        const corEf   = ef  >= 70 ? "pct-good" : ef  >= 40 ? "pct-medium" : "pct-bad";
        const corEng  = eng >= 70 ? "pct-good" : eng >= 40 ? "pct-medium" : "pct-bad";

        // ⭐ QUALIDADE — REGRA CORRETA
        let qualidadeStr = "—";
        let corNota = "";
        if (setor.qualidade_total_avaliacoes > 0) {
            qualidadeStr = nota.toFixed(2);
            corNota = nota >= 4 ? "pct-good" :
                        nota >= 2.5 ? "pct-medium" :
                        "pct-bad";
        }

        // serviços
        const principal   = Number(setor.servicos_principal_individual || 0);
        const participante = Number(setor.servicos_participante_individual || 0);

        // ➜ REGRA: sem serviços = 0 / 0 --> mostrar "—"
        const semServicos = (principal + participante) === 0;

        // strings
        const servicosStr      = semServicos ? "—" : `${principal} / ${participante}`;
        const eficienciaStr    = semServicos ? "—" : `${ef.toFixed(1)}%`;
        const engajamentoStr   = semServicos ? "—" : `${eng.toFixed(1)}%`;
        
        // ⭐️ NOVO: Tooltip e Classes para Nível 0
        const isRoot = setor.nivel === 0;
        let tooltipHTML = '';
        if (isRoot) {
            tooltipHTML = generateConsolidatedTooltip(setor);
        }

        const nomeSetorHTML = `
            <div class="${isRoot ? 'th-tooltip' : ''}" style="display: inline-block;">
                ${setor.setor}
                ${isRoot ? `<div class="th-tooltip-text-custom">${tooltipHTML}</div>` : ''}
            </div>
        `;
        // FIM NOVO

        tr.innerHTML = `
            <td style="padding-left: ${setor.nivel * 20 + 8}px;">
                ${recuo}${icon} ${nomeSetorHTML}
            </td>

            <td class="col-usuarios" data-sector-id="${setor.sector_id}">
                ${setor.usuarios_total}
            </td>

            <td>
                ${servicosStr}
            </td>

            <td class="${semServicos ? "" : corEf} col-eficiencia"
                data-abertas="${setor.solicitacoes_total}"
                data-concluidas="${setor.solicitacoes_concluidas}">
                ${eficienciaStr}
            </td>

            <td class="${semServicos ? "" : corEng} col-engajamento"
                data-abertas="${setor.solicitacoes_total}"
                data-respondidas="${setor.solicitacoes_respondidas}">
                ${engajamentoStr}
            </td>

            <td class="${semServicos ? "" : corNota} col-qualidade"
                data-avaliacoes="${setor.qualidade_total_avaliacoes}"
                data-total="${setor.solicitacoes_total}">
                ${qualidadeStr}
            </td>
        `;

        tbody.appendChild(tr);
    });

    // Atualiza os ícones de ordenação no cabeçalho
    updateSortIcons();
    ativarToggles();
    ativarTooltipUsuarios();
    ativarTooltipsMetricas();
}


/* ============================================================
    4. LÓGICA DE ORDENAÇÃO (VERSÃO CORRIGIDA)
============================================================ */

/**
 * Ordena a lista plana de setores (allSetoresData) baseada na coluna e direção.
 * A ordenação principal é SEMPRE pelo 'path' (mantendo a hierarquia).
 * A ordenação por coluna só é aplicada aos itens de Nível 0 (ou quando a coluna é 'Setor').
 * @param {string} column - A chave da coluna para ordenar.
 * @param {string} [direction] - 'asc' ou 'desc'. Se não fornecido, inverte a atual ou usa o padrão.
 */
function sortData(column, direction) {
    
    // Para métricas, a ordenação padrão deve ser DESC (melhor/maior primeiro)
    const isMetric = (column === 'Eficiencia' || column === 'Engajamento' || column === 'Qualidade' || column === 'Usuarios' || column === 'Servicos');
    let defaultDirection = isMetric ? 'desc' : 'asc';
    
    let effectiveDirection;

    if (sortColumn === column) {
        // Se a mesma coluna for clicada, inverte a direção
        effectiveDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // Nova coluna, usa a direção padrão
        effectiveDirection = direction || defaultDirection;
    }

    const directionFactor = effectiveDirection === 'asc' ? 1 : -1;

    // Define a função de comparação
    const compare = (a, b) => {

        if (column === 'Setor') {
            // Se a ordenação for por Setor, usa o 'path' completo para garantir a hierarquia
            // e ordena alfabeticamente
            return directionFactor * a.path.localeCompare(b.path, 'pt-BR');
        } 
        
        // Se a ordenação NÃO for por Setor (é por métrica), precisamos garantir 
        // que a ordenação por path seja a base para todos.
        
        // 1. Itera sobre a lista de setores e atribui um índice de ordenação.
        // Isso é complexo demais para fazer em um 'sort' simples.
        
        // CORREÇÃO: Usar a ordenação por métrica apenas para os Nível 0 e depois
        // voltar à ordenação por path para a renderização, garantindo que
        // os filhos apareçam no lugar correto.

        // Por enquanto, ordenaremos a lista inteira pela métrica, mas o
        // 'Setor' sempre prevalecerá na renderização (via path). 
        // Para manter a estrutura de árvore, a ordenação deve ser complexa ou
        // o `renderTabela` precisa saber ordenar a árvore.

        // MANTENDO A LÓGICA ANTERIOR SIMPLES QUE FUNCIONAVA:

        const valA = a[column];
        const valB = b[column];
        
        // Ordenação numérica
        const numA = valA || 0;
        const numB = valB || 0;
        
        let comparison = directionFactor * (numA - numB);

        // Se os valores são iguais, mantém a ordem pela hierarquia (path)
        if (comparison === 0) {
            return a.path.localeCompare(b.path, 'pt-BR');
        }

        return comparison;
    };


    // ORDENAÇÃO HIERÁRQUICA COMPLEXA (PARA RESOLVER O BUG):
    // A melhor forma de manter a hierarquia é re-ordenar a lista de forma que:
    // 1. Elementos raiz (nivel 0) são ordenados pela coluna desejada.
    // 2. Os filhos são listados imediatamente após seu pai, ordenados por 'path'.

    // 1. Separar Nível 0 dos demais
    const rootNodes = allSetoresData.filter(s => s.nivel === 0);
    const childNodes = allSetoresData.filter(s => s.nivel > 0);
    const childMap = new Map();
    childNodes.forEach(child => {
        const pathArray = child.path.split(',').map(Number);
        const parentId = pathArray[pathArray.length - 2];
        if (!childMap.has(parentId)) {
            childMap.set(parentId, []);
        }
        childMap.get(parentId).push(child);
    });

    // 2. Ordenar os Nível 0 pela métrica
    rootNodes.sort((a, b) => {
        const valA = a[column] || 0;
        const valB = b[column] || 0;
        return directionFactor * (valA - valB);
    });

    // 3. Montar a lista final reordenada
    const orderedList = [];
    const insertChildren = (parentId) => {
        const children = childMap.get(parentId);
        if (!children) return;

        // Ordenar filhos por path ou nome para estabilidade
        children.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
        
        children.forEach(child => {
            orderedList.push(child);
            insertChildren(child.sector_id); // Inserir netos
        });
    };

    rootNodes.forEach(root => {
        orderedList.push(root);
        insertChildren(root.sector_id);
    });
    
    // Atualiza o estado global com a nova lista ordenada
    allSetoresData = orderedList;
    sortColumn = column;
    sortDirection = effectiveDirection;
}


/**
 * Atualiza os ícones de ordenação no cabeçalho da tabela (triângulos).
 */
function updateSortIcons() {
    const headers = document.querySelectorAll('#tabela-setores thead th.th-sortable');
    headers.forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        
        const columnKey = th.getAttribute('data-column');

        if (columnKey === sortColumn) {
            th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

/**
 * Listener de clique no cabeçalho.
 */
function handleHeaderClick(e) {
    const th = e.target.closest('th');
    // Ignora cliques em tooltips e em colunas não-ordenáveis
    if (!th || !th.classList.contains('th-sortable') || e.target.closest('.th-tooltip-text-custom')) return;

    const columnKey = th.getAttribute('data-column');
    if (!columnKey) return; 

    // Chama a ordenação, que atualizará sortColumn/sortDirection
    sortData(columnKey); 
    
    // Renderiza a tabela com a nova ordem
    renderTabela(allSetoresData);
    
    // Os rankings também devem ser atualizados 
    montarRankings(allSetoresData);
}

// Associa o listener de clique ao cabeçalho da tabela
document.addEventListener('DOMContentLoaded', () => {
    // É importante esperar que o DOM esteja carregado antes de adicionar listeners
    document.querySelectorAll('#tabela-setores thead th.th-sortable').forEach(th => {
        th.addEventListener('click', handleHeaderClick);
    });
});


/* ============================================================
    5. EXPAND / COLLAPSE
============================================================ */
function ativarToggles() {
    if (!document.querySelector("#tabela-setores")) return;

    document.querySelectorAll(".toggle").forEach(tg => {
        tg.addEventListener("click", () => {
            const id = tg.dataset.id;
            const aberto = tg.textContent === "";

            tg.textContent = aberto ? "▶" : "▼";
            alternarFilhos(id, !aberto);
        });
    });
}

function alternarFilhos(parentId, abrir) {
    document.querySelectorAll("#tabela-setores tbody tr").forEach(row => {
        if (row.dataset.parent == parentId) {
            if (abrir) row.classList.remove("hidden-row");
            else row.classList.add("hidden-row");

            // Recursivamente esconde ou mostra os netos
            alternarFilhos(row.dataset.id, abrir);
        }
    });
}

/* ============================================================
    6. TOOLTIP USUÁRIOS
============================================================ */
function ativarTooltipUsuarios() {
    if (!document.querySelector(".col-usuarios")) return;

    const tooltip = criarTooltip("tooltipUsers");

    document.addEventListener("mouseover", async (e) => {
        const cell = e.target.closest(".col-usuarios");
        if (!cell) {
            tooltip.style.display = "none";
            return;
        }

        const id = cell.dataset.sectorId;

        // Verifica se já existe um request em andamento para evitar chamadas duplicadas
        if (cell.dataset.loading === 'true') return;
        cell.dataset.loading = 'true';

        try {
            
            const res = await fetch(`${API_BASE_URL}/setores/${id}/usuarios`);
            const usuarios = await res.json();
    
            
            // Filtra e exibe no máximo 10 nomes
            const limitedContent = usuarios.slice(0, 10).map(u => `<div>${u.nome}</div>`).join("");
            let content = limitedContent;
            
            if (usuarios.length > 10) {
                 content = limitedContent + `<div><small>(+${usuarios.length - 10} mais)</small></div>`;
            } 
            
            tooltip.innerHTML = content || "Nenhum usuário.";
            
            // Ajuste a posição para melhor visualização
            tooltip.style.left = (e.pageX + 20) + "px";
            tooltip.style.top = (e.pageY + 20) + "px";
            tooltip.style.display = "block";
            
        } catch (error) {
            console.error("Erro ao buscar usuários para tooltip:", error);
            tooltip.innerHTML = "Erro ao carregar usuários.";
            tooltip.style.display = "block";
        } finally {
            cell.dataset.loading = 'false';
        }

    });

    document.addEventListener("mouseout", (e) => {
        if (!e.relatedTarget || !e.relatedTarget.closest(".col-usuarios")) {
            tooltip.style.display = "none";
        }
    });
}

/* ============================================================
    7. TOOLTIP BASE
============================================================ */
function criarTooltip(id) {
    let div = document.getElementById(id);
    if (!div) {
        div = document.createElement("div");
        div.id = id;
        div.style.position = "absolute";
        div.style.background = "#fff";
        div.style.border = "1px solid #ddd";
        div.style.padding = "10px";
        div.style.borderRadius = "6px";
        div.style.boxShadow = "0px 2px 8px rgba(0,0,0,0.15)";
        div.style.display = "none";
        div.style.zIndex = "9999";
        div.style.minWidth = "150px";
        div.style.maxWidth = "280px";
        div.style.fontSize = "13px";
        document.body.appendChild(div);
    }
    return div;
}

/* ============================================================
    8. VER TODOS
============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById("btnToggleAll");
    if (btn) {
        btn.addEventListener("click", () => {
            const abrir = btn.textContent === "Ver Todos";

            document.querySelectorAll("#tabela-setores tbody tr").forEach(tr => {
                if (abrir) tr.classList.remove("hidden-row");
                else if (tr.dataset.nivel > 0) tr.classList.add("hidden-row");
            });

            document.querySelectorAll(".toggle").forEach(tg => {
                tg.textContent = abrir ? "▼" : "▶";
            });

            btn.textContent = abrir ? "Ocultar Todos" : "Ver Todos";
        });
    }
});


/* ============================================================
    9. RANKINGS TOP 3
============================================================ */
function montarRankings(lista) {
    if (!document.getElementById("ranking-servicos")) return;


    // Filtra apenas setores de Nível 0 (Secretarias)
    const rootSetores = lista.filter(s => s.nivel === 0)

    // Mapeia para uma lista mais limpa, usando os dados consolidados para os rankings
    const setores = rootSetores.map(s => ({
        ...s,
        // Usando os dados consolidados que foram criados no consolidarMetricasNivelZero()
        servicos_total_consolidado: s.Servicos_Consolidado || 0,
        eficiencia_percentual: s.Eficiencia_Consolidado_Pct || 0,
        engajamento_percentual: s.Engajamento_Consolidado_Pct || 0,
        qualidade_media: s.Qualidade_Consolidada_Media || 0
    }));


    /* -----------------------------
        TOP 3 – SERVIÇOS CONSOLIDADOS
    ------------------------------ */
    const topServicos = setores
        .sort((a, b) => b.servicos_total_consolidado - a.servicos_total_consolidado)
        .slice(0, 3);

    preencherRanking("ranking-servicos", topServicos, s => s.servicos_total_consolidado);


    /* -----------------------------
        TOP 3 – EFICIÊNCIA CONSOLIDADA
    ------------------------------ */
    const topEf = setores.filter(s => s.eficiencia_percentual > 0)
        .sort((a, b) => b.eficiencia_percentual - a.eficiencia_percentual)
        .slice(0, 3);

    preencherRanking("ranking-eficiencia", topEf, s =>
        `${s.eficiencia_percentual.toFixed(1)}%`
    );


    /* -----------------------------
        TOP 3 – ENGAJAMENTO CONSOLIDADO
    ------------------------------ */
    const topEng = setores.filter(s => s.engajamento_percentual > 0)
        .sort((a, b) => b.engajamento_percentual - a.engajamento_percentual)
        .slice(0, 3);

    preencherRanking("ranking-engajamento", topEng, s =>
        `${s.engajamento_percentual.toFixed(1)}%`
    );


    /* -----------------------------
        TOP 3 – QUALIDADE CONSOLIDADA
    ------------------------------ */
    const topQual = setores.filter(s => s.qualidade_media > 0)
        .sort((a, b) => b.qualidade_media - a.qualidade_media)
        .slice(0, 3);

    preencherRanking("ranking-qualidade", topQual, s =>
        `${s.qualidade_media.toFixed(2)}`
    );
}

function preencherRanking(id, array, formatValor) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = "";

    if (array.length === 0) {
         el.innerHTML = '<li class="ranking-item">Nenhum dado disponível.</li>';
         return;
    }

    array.forEach((s, i) => {
        el.innerHTML += `
            <li class="ranking-item">
                <span class="ranking-item-pos pos-${i + 1}">${i + 1}</span>
                <span class="ranking-item-nome">${s.setor}</span>
                <span class="ranking-item-valor">${formatValor(s)}</span>
            </li>
        `;
    });
}


/* ============================================================
    10. TOOLTIP — EFICIÊNCIA / ENGAJAMENTO / QUALIDADE
============================================================ */
function ativarTooltipsMetricas() {
    if (!document.querySelector("#tabela-setores")) return;


    const tooltip = criarTooltip("tooltipMetricas");

    document.addEventListener("mouseover", (e) => {
        
        // Esconde o tooltip de usuários se estiver visível
        // É importante esconder o tooltipUsers, pois ele é carregado por demanda e pode estar visível.
        const tooltipUsers = document.getElementById("tooltipUsers");
        if (tooltipUsers) tooltipUsers.style.display = "none";
        
        /* ---------------- EFICIÊNCIA ---------------- */
        const ef = e.target.closest(".col-eficiencia");
        if (ef && ef.textContent.trim() !== "—") {
            tooltip.innerHTML = `
                Total: <b>${ef.dataset.abertas}</b><br>
                Concluídas: <b>${ef.dataset.concluidas}</b>
            `;
            tooltip.style.left = e.pageX + 14 + "px";
            tooltip.style.top = e.pageY + 14 + "px";
            tooltip.style.display = "block";
            return;
        }

        /* ---------------- ENGAJAMENTO ---------------- */
        const eng = e.target.closest(".col-engajamento");
        if (eng && eng.textContent.trim() !== "—") { 
        
            const tr = eng.closest('tr');
            const setorId = tr.dataset.id;
            const setor = allSetoresData.find(s => s.sector_id == setorId);

            if (setor) {
                const totalSolic = setor.solicitacoes_total;
                const totalConcl = setor.solicitacoes_concluidas;
                const totalResp = setor.solicitacoes_respondidas;

                // Abertas não concluídas (Denominador)
                const naoConcluidas = Math.max(totalSolic - totalConcl, 0); 
                
                // Respondidas não concluídas (Numerador)
                let respondidasNaoConcluidas = totalResp - totalConcl;
                if (respondidasNaoConcluidas < 0) respondidasNaoConcluidas = 0;


                tooltip.innerHTML = `
                    Total Abertas: <b>${naoConcluidas}</b><br>
                    Foram Respondidas: <b>${respondidasNaoConcluidas}</b>
                `;
                tooltip.style.left = e.pageX + 14 + "px";
                tooltip.style.top = e.pageY + 14 + "px";
                tooltip.style.display = "block";
                return;
            }
        }

        /* ---------------- QUALIDADE ---------------- */
        const q = e.target.closest(".col-qualidade");
        if (q && q.textContent.trim() !== "—") {
            
            const totalAvaliacoes = Number(q.dataset.avaliacoes);
            const totalSolicitacoes = Number(q.dataset.total);
            const percentualAvaliado = totalSolicitacoes > 0 ? (totalAvaliacoes / totalSolicitacoes * 100).toFixed(1) : '0.0';

            tooltip.innerHTML = `
                Total avaliadas: <b>${totalAvaliacoes}</b><br>
                % avaliado: <b>${percentualAvaliado}%</b>
            `;
            tooltip.style.left = e.pageX + 14 + "px";
            tooltip.style.top = e.pageY + 14 + "px";
            tooltip.style.display = "block";
            return;
        }

        tooltip.style.display = "none";
    });
}


/* ============================================================
    MÓDULO DE USUÁRIOS — NOMES ISOLADOS
============================================================ */


async function carregarUsuariosDetalhado() {

    const dataInicial = document.getElementById("startDate")?.value || "";
    const dataFinal   = document.getElementById("endDate")?.value || "";

    const url = `${API_BASE_URL}/usuarios/detalhado?dataInicial=${dataInicial}&dataFinal=${dataFinal}`;

    try {
        const res = await fetch(url);
        const lista = await res.json();

        usuariosData = lista;       // ← salva dados brutos
        renderTabelaUsuarios(lista);

    } catch (e) {
        console.error("Erro ao carregar usuários:", e);
    }
}
function definirDatasUltimos30Dias() {
    const startInput = document.getElementById("rankStartDate");
    const endInput = document.getElementById("rankEndDate");

    // se não existir na página, não faz nada
    if (!startInput || !endInput) return;

    const hoje = new Date();
    const anterior = new Date();
    anterior.setDate(anterior.getDate() - 30);

    endInput.value = hoje.toISOString().slice(0, 10);
    startInput.value = anterior.toISOString().slice(0, 10);
}



function renderTabelaUsuarios(lista) {

    // Certifica que está na página de usuários
    const tbody = document.getElementById("tabela-usuarios-body")
;
    if (!tbody) return;

    tbody.innerHTML = "";

    lista.forEach(usuario => {

        const tr = document.createElement("tr");

       tr.innerHTML = `
    <td>${usuario.nome}</td>
    <td>${usuario.secretaria || "—"}</td>
    <td>${formatarDataUsuario(usuario.created_at)}</td>
    <td>${usuario.ultimo_login_formatado || "—"}</td>
    <td>${usuario.dias_sem_login ?? "—"}</td>
    <td>${usuario.despachos_periodo}</td>
`;


        tbody.appendChild(tr);
    });
}


function formatarDataUsuario(dt) {
    if (!dt) return "—";
    const d = new Date(dt);
    return d.toLocaleDateString("pt-BR");
}

/* ============================================================
    ORDENAÇÃO — TABELA DE USUÁRIOS
============================================================ */

function sortUsuarios(column) {
    
    // Alternar ordem asc/desc
    if (sortUserColumn === column) {
        sortUserDirection = sortUserDirection === "asc" ? "desc" : "asc";
    } else {
        sortUserColumn = column;
        sortUserDirection = "asc";
    }

    const factor = sortUserDirection === "asc" ? 1 : -1;

    usuariosData.sort((a, b) => {

        let A = a[column];
        let B = b[column];

        // datas
    if (column === "created_at" || column === "last_login_at") {
    A = A ? new Date(A) : 0;
    B = B ? new Date(B) : 0;
}


        // strings
        if (typeof A === "string") A = A.toLowerCase();
        if (typeof B === "string") B = B.toLowerCase();

        if (A < B) return -1 * factor;
        if (A > B) return 1 * factor;
        return 0;
    });

    renderTabelaUsuarios(usuariosData);
    updateSortIconsUsuarios();
}

function updateSortIconsUsuarios() {
    document.querySelectorAll(".th-sortable-user").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");

        const col = th.dataset.column;
        if (col === sortUserColumn) {
            th.classList.add(sortUserDirection === "asc" ? "sort-asc" : "sort-desc");
        }
    });
}

async function carregarRankingDespachos() {
    const dataInicial = document.getElementById("rankStartDate")?.value || "";
    const dataFinal   = document.getElementById("rankEndDate")?.value || "";

    const url = `${API_BASE_URL}/ranking-despachos?dataInicial=${dataInicial}&dataFinal=${dataFinal}`;

    try {
        const res = await fetch(url);
        const dados = await res.json();

const labels = dados.map(item => item.nome);

  const valores = dados.map(item => item.total);


        const ctx = document.getElementById("rankingDespachosChart").getContext("2d");

        if (rankingDespachosChart) {
            rankingDespachosChart.destroy();
        }

        rankingDespachosChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "",
                    data: valores,
                    backgroundColor: "rgba(37, 99, 235, 0.65)",
                    borderColor: "rgba(37, 99, 235, 1)",
                    borderWidth: 1,
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: "y",  // gráfico horizontal
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.raw} despachos`
                        }
                    }
                },

                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { font: { size: 12 } },
                        grid: { color: "#e5e7eb" }
                    },
                    y: {
                        ticks: { font: { size: 14 } },
                        grid: { display: false }
                    }
                }
            }
        });

    } catch (error) {
        console.error("Erro ao carregar ranking:", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {

    /* ============================
       1. Estatísticas dos cards
    ============================ */
    if (document.getElementById("user-counters")) {
        carregarEstatisticasUsuarios();
    }

    /* ============================
       2. Ranking de despachos
    ============================ */
    if (document.getElementById("rankingDespachosChart")) {

        // datas padrão
        definirDatasUltimos30Dias();

        // gráfico inicial
        carregarRankingDespachos();

        // botão do filtro do ranking
        const btnRank = document.getElementById("applyRankFilter");
        if (btnRank) {
            btnRank.addEventListener("click", carregarRankingDespachos);
        }
    }

    /* ============================
       3. Lista detalhada de usuários
    ============================ */
    if (document.getElementById("tabela-usuarios")) {
        
        // carregar usuários iniciais
        carregarUsuariosDetalhado();

        // botão "Filtrar" da tabela de usuários
        const btnFilter = document.getElementById("applyFilter");
        if (btnFilter) {
            btnFilter.addEventListener("click", carregarUsuariosDetalhado);
        }

        // ordenar colunas
        document.querySelectorAll(".th-sortable-user").forEach(th => {
            th.addEventListener("click", () => {
                sortUsuarios(th.dataset.column);
            });
        });
    }

    /* ============================
       4. Carregar setores (página principal)
    ============================ */
    if (document.querySelector("#tabela-setores")) { 
        carregarSetores();
    }

});








/* ============================================================
    11. INICIAR
============================================================ */
// O carregamento inicial deve ser feito após o DOM carregar (ou ser chamado no fim do script)
carregarSetores();