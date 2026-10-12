/**
 * script.js — Interface e controle da calculadora de poker
 * Conecta a UI ao motor matemático (poker-engine.js)
 */

'use strict';

// ─── Estado Global ─────────────────────────────────────────────────────────────

const state = {
  holeCards: [],        // 2 cartas do jogador
  communityCards: [],   // 0–5 cartas comunitárias
  numOpponents: 1,
  pickerTarget: null,   // 'hole-0', 'hole-1', 'comm-0', etc.
  pickerSuit: 'h',
  worker: null,
  workerRunning: false,
  lastResults: null,
  activeResultTab: 'all',
};

// ─── Constantes de UI ──────────────────────────────────────────────────────────

const SUIT_SYMBOLS = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SUIT_COLORS  = { h: 'red', d: 'red', c: 'black', s: 'black' };
const SUIT_NAMES   = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
const RANK_DISPLAY = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

const STAGES       = ['Pré-Flop', 'Flop', 'Turn', 'River'];

const BAR_CLASSES = {
  9: 'bar-royal-flush',
  8: 'bar-straight-flush',
  7: 'bar-four-of-a-kind',
  6: 'bar-full-house',
  5: 'bar-flush',
  4: 'bar-straight',
  3: 'bar-three-of-a-kind',
  2: 'bar-two-pair',
  1: 'bar-one-pair',
  0: 'bar-high-card',
};

// ─── Inicialização ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initPickerGrid();
  initOpponentButtons();
  bindEvents();
  updateStageIndicator();
  renderFelt();
  showEmptyResults();
});

// ─── Event Binding ─────────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('btn-calculate').addEventListener('click', calculate);
  document.getElementById('btn-reset').addEventListener('click', resetAll);
  document.getElementById('btn-cancel').addEventListener('click', cancelWorker);
  document.getElementById('btn-tests').addEventListener('click', runTests);
  document.getElementById('close-tests').addEventListener('click', () => {
    document.getElementById('tests-modal').style.display = 'none';
  });
  document.getElementById('tests-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  // Fechar picker ao clicar fora
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('card-picker');
    if (!picker) return;
    if (picker.classList.contains('open') &&
        !picker.contains(e.target) &&
        !e.target.closest('.card-display') &&
        !e.target.classList.contains('card-remove')) {
      closePicker();
    }
  });
}

// ─── Picker Grid ───────────────────────────────────────────────────────────────

function initPickerGrid() {
  const suitTabs = document.getElementById('picker-suit-tabs');
  suitTabs.innerHTML = '';
  ['h', 'd', 'c', 's'].forEach(suit => {
    const tab = document.createElement('button');
    tab.className = 'picker-suit-tab';
    tab.dataset.suit = suit;
    tab.textContent = SUIT_SYMBOLS[suit];
    tab.title = SUIT_NAMES[suit];
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      switchPickerSuit(suit);
    });
    suitTabs.appendChild(tab);
  });
  renderPickerGrid();
}

function switchPickerSuit(suit) {
  state.pickerSuit = suit;
  document.querySelectorAll('.picker-suit-tab').forEach(t => {
    t.className = 'picker-suit-tab';
    if (t.dataset.suit === suit) {
      t.classList.add(`active-${SUIT_NAMES[suit]}`);
    }
  });
  renderPickerGrid();
}

function renderPickerGrid() {
  const grid = document.getElementById('picker-grid');
  if (!grid) return;

  const usedIds = new Set([...state.holeCards, ...state.communityCards].map(c => c.id));
  const currentId = state.pickerTarget ? getSelectedCardId(state.pickerTarget) : null;
  const suit = state.pickerSuit;
  const isRed = suit === 'h' || suit === 'd';

  grid.innerHTML = '';
  PokerEngine.RANKS.forEach(rank => {
    const id = rank + suit;
    const card = document.createElement('div');
    card.className = `picker-card ${isRed ? 'red-card' : 'black-card'}`;

    const isUsed = usedIds.has(id) && id !== currentId;
    const isCurrent = id === currentId;

    if (isUsed) card.classList.add('picker-card-used');
    if (isCurrent) card.classList.add('picker-card-selected');

    const rDisplay = RANK_DISPLAY[rank] || rank;
    card.innerHTML = `<span class="picker-card-rank">${rDisplay}</span><span class="picker-card-suit">${SUIT_SYMBOLS[suit]}</span>`;

    if (!isUsed) {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCard({ rank, suit, id });
      });
    }
    grid.appendChild(card);
  });

  // Atualiza tab ativa
  document.querySelectorAll('.picker-suit-tab').forEach(t => {
    t.className = 'picker-suit-tab';
    if (t.dataset.suit === suit) t.classList.add(`active-${SUIT_NAMES[suit]}`);
  });
}

function getSelectedCardId(target) {
  if (!target) return null;
  const [type, idx] = target.split('-');
  if (type === 'hole') return state.holeCards[parseInt(idx)]?.id;
  if (type === 'comm') return state.communityCards[parseInt(idx)]?.id;
  return null;
}

// ─── Card Selection ────────────────────────────────────────────────────────────

function selectCard(card) {
  const target = state.pickerTarget;
  if (!target) return;

  const usedIds = new Set([...state.holeCards, ...state.communityCards].map(c => c.id));
  const currentId = getSelectedCardId(target);
  if (usedIds.has(card.id) && card.id !== currentId) return;

  const [type, idxStr] = target.split('-');
  const idx = parseInt(idxStr);

  if (type === 'hole') {
    state.holeCards[idx] = card;
    // Avança automaticamente para o próximo slot vazio
    const nextEmpty = state.holeCards[0] && state.holeCards[1] ? null
      : (!state.holeCards[0] ? 'hole-0' : 'hole-1');
    if (nextEmpty && nextEmpty !== target) {
      openPickerFor(nextEmpty);
    } else {
      closePicker();
    }
  } else if (type === 'comm') {
    // Preenche o índice correto (só permite preencher em ordem)
    if (idx <= state.communityCards.length) {
      state.communityCards[idx] = card;
    }
    closePicker();
  }

  renderFelt();
  updateStageIndicator();
  renderPickerGrid();
}

function openPickerFor(target) {
  state.pickerTarget = target;
  const picker = document.getElementById('card-picker');
  picker.classList.add('open');

  const labels = {
    'hole-0': 'Sua 1ª carta',
    'hole-1': 'Sua 2ª carta',
    'comm-0': '1ª comunitária (Flop)',
    'comm-1': '2ª comunitária (Flop)',
    'comm-2': '3ª comunitária (Flop)',
    'comm-3': '4ª comunitária (Turn)',
    'comm-4': '5ª comunitária (River)',
  };
  document.getElementById('picker-target-label').textContent = labels[target] || 'Selecione';
  renderPickerGrid();
}

function closePicker() {
  state.pickerTarget = null;
  const picker = document.getElementById('card-picker');
  if (picker) picker.classList.remove('open');
  renderPickerGrid();
}

function removeCard(type, idx) {
  if (type === 'hole') {
    state.holeCards.splice(idx, 1);
  } else if (type === 'comm') {
    // Remove e compacta
    state.communityCards.splice(idx, 1);
  }
  renderFelt();
  updateStageIndicator();
  renderPickerGrid();
  closePicker();
}

// Expõe globalmente para onclick inline
window.removeCard = removeCard;
window.openPickerFor = openPickerFor;

// ─── Felt Rendering ────────────────────────────────────────────────────────────

function renderFelt() {
  renderHoleCards();
  renderCommunityCards();
}

function renderHoleCards() {
  const row = document.getElementById('hole-cards-row');
  if (!row) return;
  row.innerHTML = '';

  for (let i = 0; i < 2; i++) {
    const card = state.holeCards[i];
    row.appendChild(createCardDisplayEl(card, 'hole', i));
  }
}

function renderCommunityCards() {
  const row = document.getElementById('community-cards-row');
  if (!row) return;
  row.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    const card = state.communityCards[i];

    if (card) {
      // Carta já selecionada
      row.appendChild(createCardDisplayEl(card, 'comm', i));
    } else if (i === state.communityCards.length) {
      // Próximo slot disponível
      row.appendChild(createEmptyCardSlot('comm', i, i));
    } else {
      // Slot bloqueado (não é o próximo)
      row.appendChild(createLockedSlot(i));
    }
  }
}

function createCardDisplayEl(card, type, idx) {
  const el = document.createElement('div');
  const isRed = card && (card.suit === 'h' || card.suit === 'd');
  el.className = `card-display ${card ? (isRed ? 'red' : 'black') : 'empty'}`;

  if (card) {
    const rDisplay = RANK_DISPLAY[card.rank] || card.rank;
    el.innerHTML = `
      <span class="card-rank">${rDisplay}</span>
      <span class="card-suit">${SUIT_SYMBOLS[card.suit]}</span>
      <button class="card-remove" title="Remover carta">✕</button>
    `;
    el.querySelector('.card-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeCard(type, idx);
    });
    el.addEventListener('click', () => openPickerFor(`${type}-${idx}`));
  } else {
    el.innerHTML = `<span style="font-size:1.4rem;opacity:.35">+</span>`;
    el.addEventListener('click', () => openPickerFor(`${type}-${idx}`));
  }

  return el;
}

function createEmptyCardSlot(type, idx) {
  const el = document.createElement('div');
  el.className = 'card-display empty';
  const hints = ['Flop', 'Flop', 'Flop', 'Turn', 'River'];
  el.innerHTML = `<span style="font-size:0.55rem;opacity:.35;letter-spacing:0.04em;text-align:center">${hints[idx] || '+'}</span>`;
  el.addEventListener('click', () => openPickerFor(`${type}-${idx}`));
  return el;
}

function createLockedSlot(idx) {
  const el = document.createElement('div');
  el.className = 'card-display empty';
  el.style.cursor = 'default';
  el.style.opacity = '0.3';
  const labels = ['Flop', '', '', 'Turn', 'River'];
  el.innerHTML = `<span style="font-size:0.5rem;opacity:.4;letter-spacing:0.04em">${labels[idx] || ''}</span>`;
  return el;
}

// ─── Stage Indicator ───────────────────────────────────────────────────────────

function updateStageIndicator() {
  const n = state.communityCards.length;
  let si = 0;
  if (n === 0) si = 0;
  else if (n <= 3) si = 1;
  else if (n === 4) si = 2;
  else si = 3;

  document.querySelectorAll('.stage-step').forEach((el, i) => {
    el.classList.toggle('active', i === si);
  });

  const lbl = document.getElementById('current-stage-label');
  if (lbl) lbl.textContent = STAGES[si];
}

function getCurrentStage() {
  const n = state.communityCards.length;
  if (n === 0) return 'preflop';
  if (n <= 3) return 'flop';
  if (n === 4) return 'turn';
  return 'river';
}

// ─── Opponent Buttons ──────────────────────────────────────────────────────────

function initOpponentButtons() {
  const container = document.getElementById('opponents-buttons');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 1; i <= 9; i++) {
    const btn = document.createElement('button');
    btn.className = `opp-btn${i === 1 ? ' active' : ''}`;
    btn.textContent = i;
    btn.dataset.n = i;
    btn.addEventListener('click', () => {
      state.numOpponents = i;
      container.querySelectorAll('.opp-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    container.appendChild(btn);
  }
}

// ─── Calculation ───────────────────────────────────────────────────────────────

function calculate() {
  if (state.holeCards.length < 2) {
    showNotification('Selecione suas 2 cartas antes de calcular.', 'warning');
    return;
  }
  if (!state.holeCards[0] || !state.holeCards[1]) {
    showNotification('Selecione suas 2 cartas antes de calcular.', 'warning');
    return;
  }

  cancelWorker(); // cancela simulação anterior
  setCalcState(true);
  state.lastResults = null;

  const holeCards = [...state.holeCards];
  const commCards = [...state.communityCards];
  const stage = getCurrentStage();

  // ── Distribuição de mãos ──
  let distribution = null;
  try {
    distribution = PokerEngine.calculateHandDistribution(holeCards, commCards);
  } catch (e) { console.error('Distribuição:', e); }

  // ── Mão atual ──
  let currentHand = null;
  try {
    currentHand = PokerEngine.getBestCurrentHand(holeCards, commCards);
  } catch (e) { console.error('Mão atual:', e); }

  // ── Outs ──
  let outs = null;
  if (stage !== 'river' && stage !== 'preflop') {
    try {
      outs = PokerEngine.calculateOuts(holeCards, commCards);
    } catch (e) { console.error('Outs:', e); }
  }

  // ── Próximas cartas ──
  let nextCard = null;
  if (stage === 'flop' || stage === 'turn') {
    try {
      nextCard = PokerEngine.nextCardProbabilities(holeCards, commCards);
    } catch (e) { console.error('Próximas cartas:', e); }
  }

  state.lastResults = { distribution, outs, currentHand, nextCard, stage, winResult: null };

  // Renderiza resultados sem vitória primeiro
  renderResults();

  // ── Vitória (Monte Carlo via Worker) ──
  startWinCalculation(holeCards, commCards, state.numOpponents);
}

function startWinCalculation(holeCards, communityCards, numOpponents) {
  const NUM_SIMS = 100000;

  try {
    state.worker = new Worker('worker.js');
    state.workerRunning = true;

    state.worker.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'progress') {
        updateMCProgress(payload);
        if (state.lastResults) {
          state.lastResults.winResult = payload;
          updateWinUI();
        }
      } else if (type === 'done') {
        state.workerRunning = false;
        if (state.lastResults) {
          state.lastResults.winResult = payload;
        }
        setCalcState(false);
        updateWinUI();
      } else if (type === 'cancelled') {
        state.workerRunning = false;
        setCalcState(false);
      }
    };

    state.worker.onerror = (e) => {
      console.warn('Worker error, fallback to main thread:', e.message || e);
      state.workerRunning = false;
      runMonteCarloMainThread(holeCards, communityCards, numOpponents);
    };

    state.worker.postMessage({
      type: 'monte_carlo',
      payload: { holeCards, communityCards, numOpponents, numSimulations: NUM_SIMS }
    });

    // Exibe barra de progresso
    setMCProgressVisible(true, NUM_SIMS);

  } catch (e) {
    console.warn('Web Worker indisponível:', e);
    runMonteCarloMainThread(holeCards, communityCards, numOpponents);
  }
}

function runMonteCarloMainThread(holeCards, communityCards, numOpponents) {
  const NUM_SIMS = 30000;
  setMCProgressVisible(true, NUM_SIMS);

  const mc = PokerEngine.runMonteCarlo(
    holeCards, communityCards, numOpponents, NUM_SIMS,
    (partial, completed) => {
      updateMCProgress({ ...partial, completed, total: NUM_SIMS });
      if (state.lastResults) {
        state.lastResults.winResult = partial;
        updateWinUI();
      }
    }
  );

  mc.run((final) => {
    state.workerRunning = false;
    if (state.lastResults) state.lastResults.winResult = final;
    setCalcState(false);
    updateWinUI();
  });
}

function updateWinUI() {
  if (state.activeResultTab === 'win') {
    const body = document.getElementById('panel-bcd-body');
    if (body) renderWinPanel(body);
  } else if (state.activeResultTab === 'all') {
    const container = document.getElementById('win-panel-container');
    if (container) renderWinPanel(container);
  }
}

function cancelWorker() {
  if (state.worker) {
    try { state.worker.postMessage({ type: 'cancel' }); } catch (e) {}
    try { state.worker.terminate(); } catch (e) {}
    state.worker = null;
  }
  state.workerRunning = false;
  setCalcState(false);
}

function setCalcState(loading) {
  const btnCalc = document.getElementById('btn-calculate');
  const btnCancel = document.getElementById('btn-cancel');
  if (btnCalc) btnCalc.disabled = loading;
  if (btnCancel) btnCancel.style.display = loading ? 'inline-flex' : 'none';
  if (!loading) setMCProgressVisible(false);
}

function setMCProgressVisible(visible, total = 0) {
  const container = document.getElementById('mc-progress-container');
  if (!container) return;
  container.style.display = visible ? 'block' : 'none';
  if (visible && total > 0) {
    const el = document.getElementById('mc-total');
    if (el) el.textContent = total.toLocaleString('pt-BR');
  }
}

function updateMCProgress(data) {
  const bar = document.getElementById('mc-progress-bar');
  const completedEl = document.getElementById('mc-completed');
  const pct = data.total > 0 ? Math.min((data.completed / data.total) * 100, 100) : 0;
  if (bar) bar.style.width = pct + '%';
  if (completedEl) completedEl.textContent = (data.completed || 0).toLocaleString('pt-BR');
}

// ─── Result Rendering ──────────────────────────────────────────────────────────

function showEmptyResults() {
  const area = document.getElementById('results-area');
  if (!area) return;
  area.innerHTML = `
    <div class="panel">
      <div class="panel-body">
        <div class="empty-state">
          <div class="empty-state-icon">🂠</div>
          <div class="empty-state-text">Selecione suas 2 cartas e clique em<br><strong style="color:var(--green-400)">Calcular probabilidades</strong></div>
        </div>
      </div>
    </div>
  `;
}

function renderResults() {
  if (!state.lastResults) return;

  const area = document.getElementById('results-area');
  if (!area) return;

  const { stage } = state.lastResults;

  area.innerHTML = `
    <!-- Painel A -->
    <div id="panel-a" class="panel animate-in">
      <div class="panel-header">
        <span class="panel-title"><span class="panel-title-icon">🃏</span>Painel A — Sua Mão</span>
        <span id="current-stage-label" class="header-badge"></span>
      </div>
      <div class="panel-body" id="panel-a-body"></div>
    </div>

    <!-- Painéis B/C/D com tabs -->
    <div class="panel animate-in" style="animation-delay:0.06s">
      <div class="panel-header" style="flex-wrap:wrap;gap:0.5rem">
        <span class="panel-title"><span class="panel-title-icon">📊</span>Resultados Estatísticos</span>
        <div style="display:flex;gap:2px;background:var(--bg-card);border-radius:var(--radius-md);padding:3px;flex-wrap:wrap">
          ${[
            { id: 'all', label: 'Visão Completa' },
            { id: 'win', label: 'D · Vitória' },
            { id: 'distribution', label: 'B · Combinações' },
            { id: 'outs', label: 'C · Outs' }
          ].map(tab => {
            return `<button class="tab-btn${state.activeResultTab === tab.id ? ' active' : ''}" data-tab="${tab.id}">${tab.label}</button>`;
          }).join('')}
        </div>
      </div>
      <div class="panel-body" id="panel-bcd-body"></div>
    </div>
  `;

  // Re-bind tabs
  area.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeResultTab = btn.dataset.tab;
      area.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPanelContent();
    });
  });

  updateStageIndicator();
  renderPanelA();
  renderPanelContent();
}

function renderPanelA() {
  const { currentHand, stage } = state.lastResults;
  const body = document.getElementById('panel-a-body');
  if (!body) return;

  const holeHtml = state.holeCards.map(c => cardSmallHTML(c)).join('');
  const commHtml = state.communityCards.length > 0
    ? state.communityCards.map(c => cardSmallHTML(c)).join('')
    : `<span style="font-size:0.72rem;color:var(--text-muted);font-style:italic">Nenhuma carta comunitária</span>`;

  let bestHandHtml = '';
  if (currentHand) {
    const bestHtml = currentHand.cards && currentHand.cards.length >= 5
      ? currentHand.cards.map(c => cardSmallHTML(c, true)).join('')
      : '';
    bestHandHtml = `
      <div class="best-hand-info">
        <div class="best-hand-label">Melhor mão atual</div>
        <div class="best-hand-name">${currentHand.name}</div>
        ${bestHtml ? `<div class="best-hand-cards">${bestHtml}</div>` : ''}
      </div>
    `;
  }

  body.innerHTML = `
    <div class="your-hand-display">
      <div class="hand-group">
        <div class="hand-group-label">Suas cartas</div>
        <div class="hand-cards-row">${holeHtml}</div>
      </div>
      ${state.communityCards.length > 0 ? `
      <div class="hand-group">
        <div class="hand-group-label">Comunitárias</div>
        <div class="hand-cards-row">${commHtml}</div>
      </div>` : ''}
      ${bestHandHtml}
    </div>
    ${stage === 'river' && currentHand ? renderRiverBox(currentHand) : ''}
    ${stage === 'preflop' ? `
      <div class="alert alert-info" style="margin-top:0.75rem">
        ℹ️ Pré-flop: veja abaixo a probabilidade exata de formar combinações no flop (3 cartas) e a distribuição final provável no river.
      </div>` : ''}
  `;
}

function renderRiverBox(hand) {
  if (!hand || !hand.cards || hand.cards.length < 5) return '';
  const cardsHtml = hand.cards.map(c => cardSmallHTML(c)).join('');
  return `
    <div class="river-hand-box" style="margin-top:1rem">
      <div class="river-hand-label">🏆 Mão Final — River</div>
      <div class="river-hand-name">${hand.name}</div>
      <div class="river-hand-cards">${cardsHtml}</div>
    </div>
  `;
}

function renderPanelContent() {
  const body = document.getElementById('panel-bcd-body');
  if (!body) return;

  if (state.activeResultTab === 'all') {
    body.innerHTML = `
      <div class="result-subpanel">
        <div class="subpanel-title"><span>👥</span> Painel D — Contra os Oponentes</div>
        <div id="win-panel-container"></div>
      </div>

      <div class="result-subpanel" style="margin-top:1.25rem">
        <div class="subpanel-title"><span>📊</span> Painel B — Probabilidade das Combinações</div>
        <div id="distribution-panel-container"></div>
      </div>

      <div class="result-subpanel" style="margin-top:1.25rem">
        <div class="subpanel-title"><span>🎯</span> Painel C — Próximas Cartas & Outs</div>
        <div id="outs-panel-container"></div>
      </div>
    `;
    const winContainer = document.getElementById('win-panel-container');
    const distContainer = document.getElementById('distribution-panel-container');
    const outsContainer = document.getElementById('outs-panel-container');
    if (winContainer) renderWinPanel(winContainer);
    if (distContainer) renderDistributionPanel(distContainer);
    if (outsContainer) renderOutsPanel(outsContainer);
    return;
  }

  switch (state.activeResultTab) {
    case 'win':          renderWinPanel(body); break;
    case 'distribution': renderDistributionPanel(body); break;
    case 'outs':         renderOutsPanel(body); break;
  }
}

// ─── Painel B — Distribuição ───────────────────────────────────────────────────

function renderDistributionPanel(container) {
  const { distribution, stage, nextCard } = state.lastResults;
  if (!distribution) {
    container.innerHTML = emptyStateHTML('📊', 'Distribuição não disponível.');
    return;
  }

  const dist = distribution.distribution;
  const total = distribution.total;

  // Caso especial Pré-flop: exibe Flop (intermediário) e River (final)
  if (stage === 'preflop' && distribution.flopDistribution) {
    const flopEntries = Object.entries(distribution.flopDistribution)
      .map(([rank, d]) => ({ rank: parseInt(rank), ...d }))
      .sort((a, b) => b.pct - a.pct);

    const riverEntries = Object.entries(dist)
      .map(([rank, d]) => ({ rank: parseInt(rank), ...d }))
      .sort((a, b) => b.pct - a.pct);

    let html = `
      <div class="stage-subbox">
        <div class="stage-subbox-header">
          <span class="stage-subbox-title">1. No Flop — Chance de Formar Combinação (3 cartas)</span>
          <span class="stage-subbox-badge">19.600 combinações exatas</span>
        </div>
        <div class="distribution-grid">
    `;

    for (const e of flopEntries) {
      if (e.pct === 0) continue;
      const barCls = BAR_CLASSES[e.rank];
      const pctStr = e.pct >= 99.995 ? '100%' : e.pct >= 0.01 ? e.pct.toFixed(2) + '%' : '< 0.01%';
      const cntStr = e.count > 0 ? e.count.toLocaleString('pt-BR') : '—';
      const width  = Math.max(Math.min(e.pct, 100), e.pct > 0 ? 0.5 : 0);

      html += `
        <div class="dist-row">
          <div class="dist-name">${e.name}</div>
          <div class="dist-bar-wrap">
            <div class="dist-bar ${barCls}" style="width:${width}%"></div>
          </div>
          <div class="dist-pct">${pctStr}</div>
          <div class="dist-count">${cntStr}</div>
        </div>
      `;
    }
    html += `</div></div>`;

    html += `
      <div class="stage-subbox" style="margin-top:1.25rem">
        <div class="stage-subbox-header">
          <span class="stage-subbox-title">2. No River — Distribuição Provável Final (5 cartas)</span>
          <span class="stage-subbox-badge">Monte Carlo (${total.toLocaleString('pt-BR')} boards)</span>
        </div>
        <div class="distribution-grid">
    `;

    for (const e of riverEntries) {
      if (e.pct === 0) continue;
      const barCls = BAR_CLASSES[e.rank];
      const pctStr = e.pct >= 99.995 ? '100%' : e.pct >= 0.01 ? e.pct.toFixed(2) + '%' : '< 0.01%';
      const cntStr = e.count > 0 ? e.count.toLocaleString('pt-BR') : '—';
      const width  = Math.max(Math.min(e.pct, 100), e.pct > 0 ? 0.5 : 0);

      html += `
        <div class="dist-row">
          <div class="dist-name">${e.name}</div>
          <div class="dist-bar-wrap">
            <div class="dist-bar ${barCls}" style="width:${width}%"></div>
          </div>
          <div class="dist-pct">${pctStr}</div>
          <div class="dist-count">${cntStr}</div>
        </div>
      `;
    }
    html += `</div></div>`;

    container.innerHTML = html;
    return;
  }

  // Ordena por probabilidade (maior primeiro); mantém ranking para cores
  const entries = Object.entries(dist)
    .map(([rank, d]) => ({ rank: parseInt(rank), ...d }))
    .sort((a, b) => b.pct - a.pct);

  const totalLabel = stage === 'river'
    ? 'Mão definitiva'
    : `${total.toLocaleString('pt-BR')} combinações analisadas`;

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem">
      <span style="font-size:0.72rem;color:var(--text-muted)">${totalLabel}</span>
      ${stage !== 'river' ? `<span style="font-size:0.68rem;color:var(--text-muted)">Probabilidades até o river</span>` : ''}
    </div>
    <div class="distribution-grid">
  `;

  for (const e of entries) {
    // Oculta categorias com 0 exceto no river (onde mostra tudo)
    if (e.pct === 0 && stage !== 'river') continue;

    const barCls = BAR_CLASSES[e.rank];
    const pctStr = e.pct >= 99.995 ? '100%' : e.pct >= 0.01 ? e.pct.toFixed(2) + '%' : '< 0.01%';
    const cntStr = e.count > 0 ? e.count.toLocaleString('pt-BR') : '—';
    const width  = Math.max(Math.min(e.pct, 100), e.pct > 0 ? 0.5 : 0);

    html += `
      <div class="dist-row">
        <div class="dist-name">${e.name}</div>
        <div class="dist-bar-wrap">
          <div class="dist-bar ${barCls}" style="width:${width}%"></div>
        </div>
        <div class="dist-pct">${pctStr}</div>
        <div class="dist-count">${cntStr}</div>
      </div>
    `;
  }
  html += '</div>';

  // Seção de próxima carta (flop/turn)
  if (nextCard && stage !== 'river') {
    const ncEntries = Object.entries(nextCard.byCategory)
      .map(([r, d]) => ({ rank: parseInt(r), ...d }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.rank - a.rank);

    if (ncEntries.length > 0) {
      const nextLabel = stage === 'flop' ? 'no Turn' : 'no River';
      html += `
        <div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:1rem">
          <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-bottom:0.6rem;text-transform:uppercase;letter-spacing:0.06em">
            Distribuição ${nextLabel} (${nextCard.total} cartas disponíveis)
          </div>
          <table class="next-card-table">
            <thead><tr><th>Combinação</th><th>Cartas</th><th>Probabilidade</th></tr></thead>
            <tbody>
      `;
      for (const e of ncEntries) {
        html += `<tr>
          <td>${e.name}</td>
          <td style="font-family:monospace;font-size:0.72rem;color:var(--text-muted)">${e.count}</td>
          <td style="font-weight:700;color:var(--green-400);font-family:monospace">${e.pct.toFixed(1)}%</td>
        </tr>`;
      }
      html += '</tbody></table></div>';
    }
  }

  // Verifica se total ≈ 100%
  const sumPct = entries.reduce((s, e) => s + e.pct, 0);
  if (Math.abs(sumPct - 100) > 0.5) {
    html += `<div class="alert alert-warning" style="margin-top:0.5rem">⚠️ Soma: ${sumPct.toFixed(2)}% (possível erro de arredondamento)</div>`;
  }

  container.innerHTML = html;
}

// ─── Painel C — Outs ──────────────────────────────────────────────────────────

function renderOutsPanel(container) {
  const { outs, stage } = state.lastResults;

  if (stage === 'river') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏁</div>
        <div class="empty-state-text">River atingido — não há mais cartas a serem reveladas.<br>Consulte a mão final no Painel A.</div>
      </div>
    `;
    return;
  }

  if (stage === 'preflop') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🂠</div>
        <div class="empty-state-text">Os outs são calculados a partir do flop (quando há cartas comunitárias conhecidas).</div>
      </div>
    `;
    return;
  }

  if (!outs) {
    container.innerHTML = emptyStateHTML('⚠️', 'Não foi possível calcular os outs.');
    return;
  }

  if (outs.total === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-text">Nenhum out encontrado.<br>Sua mão atual já é a mais forte possível com estas cartas, ou nenhuma carta adicional melhora a combinação.</div>
      </div>
    `;
    return;
  }

  const pctNext  = outs.pctNext.toFixed(1) + '%';
  const pctRiver = outs.pctByRiver !== null ? outs.pctByRiver.toFixed(1) + '%' : '—';

  let html = `
    <div class="outs-summary">
      <div class="outs-stat">
        <div class="outs-stat-value">${outs.total}</div>
        <div class="outs-stat-label">Outs</div>
      </div>
      <div class="outs-stat" data-tooltip="Probabilidade de acertar um out na próxima carta">
        <div class="outs-stat-value">${pctNext}</div>
        <div class="outs-stat-label">Próxima carta</div>
      </div>
      <div class="outs-stat" data-tooltip="${stage === 'flop' ? 'Probabilidade de acertar até o river (2 cartas)' : '—'}">
        <div class="outs-stat-value">${pctRiver}</div>
        <div class="outs-stat-label">Até o River</div>
      </div>
    </div>
  `;

  // Todas as cartas que melhoram
  html += `
    <div class="outs-cards-section">
      <div class="outs-cards-title">Cartas que melhoram sua mão (${outs.remaining} restantes)</div>
      <div class="outs-cards-grid">
        ${outs.outs.map(c => {
          const isRed = c.suit === 'h' || c.suit === 'd';
          return `<span class="out-card-chip ${isRed ? 'red' : 'black'}">${(RANK_DISPLAY[c.rank] || c.rank)}${SUIT_SYMBOLS[c.suit]}</span>`;
        }).join('')}
      </div>
    </div>
  `;

  // Outs por categoria
  const cats = Object.entries(outs.outsByCategory)
    .sort((a, b) => parseInt(b[0]) - parseInt(a[0]));

  if (cats.length > 0) {
    html += `<div class="outs-cards-title" style="margin-top:0.75rem">Por combinação</div>
      <div class="outs-by-category">`;
    for (const [rank, cat] of cats) {
      html += `
        <div class="out-category">
          <span class="out-category-name">${cat.name}</span>
          <span class="out-category-count">${cat.cards.length} out${cat.cards.length !== 1 ? 's' : ''}</span>
          <div class="outs-cards-grid" style="width:100%;margin-top:4px">
            ${cat.cards.map(c => {
              const isRed = c.suit === 'h' || c.suit === 'd';
              return `<span class="out-card-chip ${isRed ? 'red' : 'black'}">${(RANK_DISPLAY[c.rank] || c.rank)}${SUIT_SYMBOLS[c.suit]}</span>`;
            }).join('')}
          </div>
        </div>
      `;
    }
    html += '</div>';
  }

  html += `
    <div class="alert alert-info" style="margin-top:0.75rem">
      ℹ️ Outs indicam cartas que melhoram <em>sua</em> combinação. Isso não garante vitória — o adversário também pode melhorar a mão.
    </div>
  `;

  container.innerHTML = html;
}

// ─── Painel D — Vitória ────────────────────────────────────────────────────────

function renderWinPanel(container) {
  const data = state.lastResults?.winResult;

  if (!data) {
    // Ainda calculando
    container.innerHTML = `
      <div class="empty-state" style="padding:1.5rem">
        <div class="spinner"></div>
        <div class="empty-state-text" style="margin-top:0.6rem">Calculando probabilidades de vitória…</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem">Simulação Monte Carlo em andamento</div>
      </div>
    `;
    return;
  }

  const { winPct, tiePct, lossPct, equity, method, total } = data;
  const isEst = method === 'monte_carlo';

  container.innerHTML = `
    <div class="win-display">
      <div class="win-stat win">
        <div class="win-pct">${winPct.toFixed(1)}%</div>
        <div class="win-label">Vitória</div>
      </div>
      <div class="win-stat tie">
        <div class="win-pct">${tiePct.toFixed(1)}%</div>
        <div class="win-label">Empate</div>
      </div>
      <div class="win-stat loss">
        <div class="win-pct">${lossPct.toFixed(1)}%</div>
        <div class="win-label">Derrota</div>
      </div>
    </div>

    <div style="margin-bottom:0.9rem">
      <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-muted);margin-bottom:0.35rem">
        <span>Equidade da mão</span>
        <span style="font-weight:700;color:var(--green-400);font-family:monospace">${equity.toFixed(1)}%</span>
      </div>
      <div class="equity-bar">
        <div class="equity-segment win"  style="width:${winPct}%"></div>
        <div class="equity-segment tie"  style="width:${tiePct * 0.5}%"></div>
        <div class="equity-segment loss" style="width:${lossPct}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.62rem;color:var(--text-muted);margin-top:4px">
        <span style="color:var(--green-500)">Vitória ${winPct.toFixed(1)}%</span>
        <span style="color:#fbbf24">Empate ${tiePct.toFixed(1)}%</span>
        <span style="color:#f87171">Derrota ${lossPct.toFixed(1)}%</span>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;padding-top:0.5rem;border-top:1px solid var(--border)">
      <span class="method-badge ${isEst ? 'monte-carlo' : 'exact'}">
        ${isEst ? '🎲 Monte Carlo' : '✓ Enumeração exata'}
        · ${(total || 0).toLocaleString('pt-BR')} ${isEst ? 'simulações' : 'cenários'}
      </span>
      <span style="font-size:0.7rem;color:var(--text-muted)">${state.numOpponents} oponente${state.numOpponents > 1 ? 's' : ''} desconhecido${state.numOpponents > 1 ? 's' : ''}</span>
    </div>

    ${isEst ? `<div class="alert alert-warning" style="margin-top:0.75rem">⚠️ Resultado estimado por simulação Monte Carlo. A precisão aumenta com o número de simulações.</div>` : ''}
  `;
}

// ─── Utilitários HTML ──────────────────────────────────────────────────────────

function cardSmallHTML(card, highlight = false) {
  if (!card) return '';
  const isRed = card.suit === 'h' || card.suit === 'd';
  const rDisplay = RANK_DISPLAY[card.rank] || card.rank;
  const cls = highlight ? 'card-sm best-hand-card-highlight' : 'card-sm';
  return `
    <div class="${cls} ${isRed ? 'red' : 'black'}">
      <span class="card-rank">${rDisplay}</span>
      <span class="card-suit">${SUIT_SYMBOLS[card.suit]}</span>
    </div>
  `;
}

function emptyStateHTML(icon, text) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-text">${text}</div>
    </div>
  `;
}

// ─── Reset ─────────────────────────────────────────────────────────────────────

function resetAll() {
  cancelWorker();
  state.holeCards = [];
  state.communityCards = [];
  state.lastResults = null;
  state.pickerTarget = null;
  closePicker();
  renderFelt();
  updateStageIndicator();
  showEmptyResults();
}

// ─── Notificação ───────────────────────────────────────────────────────────────

function showNotification(msg, type = 'info') {
  const existing = document.getElementById('_notif');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = '_notif';
  const isWarn = type === 'warning';
  el.style.cssText = [
    'position:fixed;top:72px;right:1.5rem;z-index:999',
    'padding:.75rem 1.25rem;border-radius:8px;font-size:.82rem',
    'box-shadow:0 4px 16px rgba(0,0,0,.4)',
    'animation:fadeIn .2s ease;max-width:320px;line-height:1.4',
    isWarn
      ? 'background:#2d1a00;border:1px solid #fbbf24;color:#fde68a'
      : 'background:#0d2240;border:1px solid #2563eb;color:#93c5fd',
  ].join(';');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ─── Testes ─────────────────────────────────────────────────────────────────────

function runTests() {
  document.getElementById('tests-modal').style.display = 'flex';
  const results = PokerEngine.validateEngine();
  const body = document.getElementById('tests-body');
  const passCount = results.filter(r => r.pass).length;
  const allPass = passCount === results.length;

  body.innerHTML = `
    <div style="margin-bottom:1rem;font-size:0.9rem;font-weight:700;color:${allPass ? 'var(--green-400)' : '#f85149'}">
      ${allPass ? '✅' : '⚠️'} ${passCount}/${results.length} testes unitários passaram
    </div>
    ${results.map(r => `
      <div class="test-result ${r.pass ? 'test-pass' : 'test-fail'}">
        <span class="test-icon">${r.pass ? '✓' : '✗'}</span>
        <div>
          <div class="test-name">${r.name}</div>
          <div class="test-detail">Esperado: ${r.expected} · Obtido: ${r.got}</div>
        </div>
      </div>
    `).join('')}

    <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border)">
      <div style="font-weight:700;font-size:0.85rem;color:var(--text-primary);margin-bottom:0.4rem">
        📚 Referência Oficial: C(52, 5) = 2.598.960 Combinações
      </div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.75rem">
        Distribuição exata de todas as 2.598.960 mãos possíveis de 5 cartas (baralho padrão sem curingas):
      </div>
      <table class="ref-table">
        <thead>
          <tr><th>Combinação</th><th style="text-align:right">Combinações</th><th style="text-align:right">Probabilidade</th></tr>
        </thead>
        <tbody>
          <tr><td>Royal Flush</td><td class="num">4</td><td class="num">0,00015%</td></tr>
          <tr><td>Straight Flush</td><td class="num">36</td><td class="num">0,00139%</td></tr>
          <tr><td>Quadra</td><td class="num">624</td><td class="num">0,02401%</td></tr>
          <tr><td>Full House</td><td class="num">3.744</td><td class="num">0,14406%</td></tr>
          <tr><td>Flush</td><td class="num">5.108</td><td class="num">0,19654%</td></tr>
          <tr><td>Sequência</td><td class="num">10.200</td><td class="num">0,39246%</td></tr>
          <tr><td>Trinca</td><td class="num">54.912</td><td class="num">2,11285%</td></tr>
          <tr><td>Dois Pares</td><td class="num">123.552</td><td class="num">4,75390%</td></tr>
          <tr><td>Um Par</td><td class="num">1.098.240</td><td class="num">42,25690%</td></tr>
          <tr><td>Carta Alta</td><td class="num">1.302.540</td><td class="num">50,11774%</td></tr>
          <tr style="font-weight:700;background:var(--bg-card)">
            <td>TOTAL</td><td class="num">2.598.960</td><td class="num">100,00000%</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:0.6rem;font-size:0.68rem;color:var(--green-400)">
        ✓ Validado pelo motor: enumeração algorítmica exata sem aproximações.
      </div>
    </div>
  `;
}
