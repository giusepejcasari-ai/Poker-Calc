/**
 * poker-engine.js
 * Motor matemático para Texas Hold'em
 * Sem IA — cálculos puramente matemáticos e combinatórios
 */

'use strict';

// ─── Constantes ────────────────────────────────────────────────────────────────

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['c', 'd', 'h', 's']; // clubs, diamonds, hearts, spades

const RANK_VALUE = {};
RANKS.forEach((r, i) => { RANK_VALUE[r] = i + 2; }); // 2=2, ..., A=14

// Categorias de mão (maior = melhor)
const HAND_RANK = {
  HIGH_CARD:       0,
  ONE_PAIR:        1,
  TWO_PAIR:        2,
  THREE_OF_A_KIND: 3,
  STRAIGHT:        4,
  FLUSH:           5,
  FULL_HOUSE:      6,
  FOUR_OF_A_KIND:  7,
  STRAIGHT_FLUSH:  8,
  ROYAL_FLUSH:     9,
};

const HAND_NAMES = {
  0: 'Carta Alta',
  1: 'Um Par',
  2: 'Dois Pares',
  3: 'Trinca',
  4: 'Sequência',
  5: 'Flush',
  6: 'Full House',
  7: 'Quadra',
  8: 'Straight Flush',
  9: 'Royal Flush',
};

// ─── Deck ──────────────────────────────────────────────────────────────────────

/**
 * Cria o baralho completo de 52 cartas.
 * Cada carta: { rank: 'A', suit: 'h', id: 'Ah' }
 */
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, id: rank + suit });
    }
  }
  return deck;
}

/**
 * Retorna o baralho sem as cartas fornecidas.
 * knownCards: array de { id } ou strings de id.
 */
function remainingDeck(knownCards) {
  const known = new Set(knownCards.map(c => (typeof c === 'string' ? c : c.id)));
  return createDeck().filter(c => !known.has(c.id));
}

// ─── Avaliador de Mão ──────────────────────────────────────────────────────────

/**
 * Avalia a melhor mão de 5 cartas dentre as fornecidas (2–7 cartas).
 * Retorna: { rank, name, cards, tiebreaker }
 * tiebreaker: array de valores para desempate (maior primeiro)
 */
function evaluateBestHand(cards) {
  if (!cards || cards.length < 2) return null;
  if (cards.length === 5) return evaluateHand5(cards);
  if (cards.length < 5) {
    // Avalia com as cartas disponíveis (menos de 5)
    return evaluateHand5(cards);
  }
  // Gera todas as combinações de 5 entre as cartas disponíveis
  const combos = combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const h = evaluateHand5(combo);
    if (!best || compareHands(h, best) > 0) best = h;
  }
  return best;
}

/**
 * Avalia exatamente 5 cartas (ou menos, como fallback).
 * Retorna objeto de mão.
 */
function evaluateHand5(cards) {
  if (!cards || cards.length === 0) return null;

  // Normaliza card para garantir .rank e .suit
  const normalized = cards.map(c => {
    if (typeof c === 'string') return { rank: c[0], suit: c[1], id: c };
    return c;
  });

  const vals = normalized.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suits = normalized.map(c => c.suit);
  const counts = {};
  vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });

  // Só considera flush/straight em mãos de 5 cartas
  const isFiveCard = normalized.length === 5;
  const isFlush = isFiveCard && new Set(suits).size === 1;
  const straightTop = isFiveCard ? checkStraight(vals) : null;

  // Straight Flush / Royal Flush
  if (isFlush && straightTop !== null) {
    if (straightTop === 14) {
      return { rank: HAND_RANK.ROYAL_FLUSH, name: HAND_NAMES[9], cards: normalized, tiebreaker: [14] };
    }
    return { rank: HAND_RANK.STRAIGHT_FLUSH, name: HAND_NAMES[8], cards: normalized, tiebreaker: [straightTop] };
  }

  const groups = Object.entries(counts)
    .map(([v, c]) => ({ val: parseInt(v), count: c }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  const groupCounts = groups.map(g => g.count);

  // Quadra
  if (groupCounts[0] === 4) {
    const quad = groups[0].val;
    const kicker = groups.length > 1 ? groups[1].val : 0;
    return { rank: HAND_RANK.FOUR_OF_A_KIND, name: HAND_NAMES[7], cards: normalized, tiebreaker: [quad, kicker] };
  }

  // Full House
  if (groupCounts[0] === 3 && groupCounts[1] === 2) {
    return { rank: HAND_RANK.FULL_HOUSE, name: HAND_NAMES[6], cards: normalized, tiebreaker: [groups[0].val, groups[1].val] };
  }

  // Flush
  if (isFlush) {
    return { rank: HAND_RANK.FLUSH, name: HAND_NAMES[5], cards: normalized, tiebreaker: vals };
  }

  // Sequência
  if (straightTop !== null) {
    return { rank: HAND_RANK.STRAIGHT, name: HAND_NAMES[4], cards: normalized, tiebreaker: [straightTop] };
  }

  // Trinca
  if (groupCounts[0] === 3) {
    const kickers = groups.filter(g => g.count < 3).map(g => g.val).sort((a, b) => b - a);
    return { rank: HAND_RANK.THREE_OF_A_KIND, name: HAND_NAMES[3], cards: normalized, tiebreaker: [groups[0].val, ...kickers] };
  }

  // Dois Pares
  if (groupCounts[0] === 2 && groupCounts[1] === 2) {
    const pairs = groups.filter(g => g.count === 2).map(g => g.val).sort((a, b) => b - a);
    const kicker = groups.find(g => g.count === 1)?.val || 0;
    return { rank: HAND_RANK.TWO_PAIR, name: HAND_NAMES[2], cards: normalized, tiebreaker: [...pairs, kicker] };
  }

  // Um Par
  if (groupCounts[0] === 2) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.val).sort((a, b) => b - a);
    return { rank: HAND_RANK.ONE_PAIR, name: HAND_NAMES[1], cards: normalized, tiebreaker: [groups[0].val, ...kickers] };
  }

  // Carta Alta
  return { rank: HAND_RANK.HIGH_CARD, name: HAND_NAMES[0], cards: normalized, tiebreaker: vals };
}

/**
 * Verifica se os valores (ordenados desc) formam uma sequência.
 * Retorna o valor mais alto da sequência ou null.
 * Trata o caso especial A-2-3-4-5 (wheel).
 */
function checkStraight(sortedValsDesc) {
  // Remove duplicatas e garante ordem desc
  const vals = [...new Set(sortedValsDesc)].sort((a, b) => b - a);
  if (vals.length < 5) return null;

  // Verifica sequência normal com os 5 maiores
  // (para mãos de exatamente 5 cartas sem duplicatas, vals terá exatamente 5)
  if (vals[0] - vals[4] === 4) return vals[0];

  // Verifica wheel: A-2-3-4-5
  // vals[0] === 14 e os outros são 5,4,3,2
  if (vals[0] === 14) {
    const rest = vals.slice(1);
    if (rest[0] === 5 && rest[1] === 4 && rest[2] === 3 && rest[3] === 2) {
      return 5;
    }
  }

  return null;
}

/**
 * Compara duas mãos avaliadas.
 * Retorna positivo se h1 > h2, negativo se h1 < h2, 0 se empate.
 */
function compareHands(h1, h2) {
  if (!h1 && !h2) return 0;
  if (!h1) return -1;
  if (!h2) return 1;
  if (h1.rank !== h2.rank) return h1.rank - h2.rank;
  const len = Math.max(h1.tiebreaker.length, h2.tiebreaker.length);
  for (let i = 0; i < len; i++) {
    const a = h1.tiebreaker[i] || 0;
    const b = h2.tiebreaker[i] || 0;
    if (a !== b) return a - b;
  }
  return 0;
}

// ─── Combinações ───────────────────────────────────────────────────────────────

/**
 * Gera todas as combinações de k elementos dentre arr.
 */
function combinations(arr, k) {
  const result = [];
  function helper(start, current) {
    if (current.length === k) { result.push([...current]); return; }
    const remaining = arr.length - start;
    const needed = k - current.length;
    if (remaining < needed) return;
    for (let i = start; i <= arr.length - needed; i++) {
      current.push(arr[i]);
      helper(i + 1, current);
      current.pop();
    }
  }
  helper(0, []);
  return result;
}

/**
 * Número de combinações C(n, k)
 */
function C(n, k) {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

// ─── Distribuição de Mãos ──────────────────────────────────────────────────────

/**
 * Calcula a distribuição de categorias de mão dado:
 * - holeCards: 2 cartas do jogador
 * - communityCards: 0–5 cartas comunitárias
 * Retorna um objeto com contagens para cada categoria.
 *
 * Método: enumeração exata de todas as combinações válidas.
 */
function calculateHandDistribution(holeCards, communityCards) {
  const known = [...holeCards, ...communityCards];
  const deck = remainingDeck(known);
  const needed = 5 - communityCards.length; // cartas comunitárias restantes

  const distribution = {};
  for (let i = 0; i <= 9; i++) distribution[i] = 0;
  let total = 0;
  let isEstimate = false;
  let flopDist = null;

  if (needed === 0) {
    // River — mão já definida
    const hand = evaluateBestHand([...holeCards, ...communityCards]);
    if (hand) distribution[hand.rank] = 1;
    total = 1;
  } else if (needed === 5) {
    // Pré-flop:
    // 1. Distribuição exata no Flop (C(50, 3) = 19.600 combinações)
    const flopCombos = combinations(deck, 3);
    const flopCounts = {};
    for (let i = 0; i <= 9; i++) flopCounts[i] = 0;
    for (let c = 0; c < flopCombos.length; c++) {
      const fHand = evaluateHand5([...holeCards, ...flopCombos[c]]);
      if (fHand) flopCounts[fHand.rank]++;
    }
    const flopTotal = flopCombos.length;
    flopDist = {};
    for (let i = 0; i <= 9; i++) {
      flopDist[i] = {
        count: flopCounts[i],
        total: flopTotal,
        pct: (flopCounts[i] / flopTotal) * 100,
        name: HAND_NAMES[i],
      };
    }

    // 2. Distribuição provável no River via amostragem representativa rápida (25.000 boards aleatórios)
    const samples = 25000;
    const nDeck = deck.length;
    for (let s = 0; s < samples; s++) {
      // Amostra 5 cartas sem reposição
      const dCopy = [...deck];
      for (let i = 0; i < 5; i++) {
        const j = i + Math.floor(Math.random() * (nDeck - i));
        const tmp = dCopy[i];
        dCopy[i] = dCopy[j];
        dCopy[j] = tmp;
      }
      const board5 = dCopy.slice(0, 5);
      const hand = evaluateBestHand([...holeCards, ...board5]);
      if (hand) distribution[hand.rank]++;
    }
    total = samples;
    isEstimate = true;
  } else {
    // Flop (1.081 combos) ou Turn (46 combos) — enumeração exata
    const combos = combinations(deck, needed);
    total = combos.length;
    for (const combo of combos) {
      const allCards = [...holeCards, ...communityCards, ...combo];
      const hand = evaluateBestHand(allCards);
      if (hand) distribution[hand.rank]++;
    }
  }

  // Converte para percentuais
  const result = {};
  for (let i = 0; i <= 9; i++) {
    result[i] = {
      count: distribution[i],
      total,
      pct: total > 0 ? (distribution[i] / total) * 100 : 0,
      name: HAND_NAMES[i],
    };
  }
  return { distribution: result, total, isEstimate, flopDistribution: flopDist };
}

// ─── Outs ──────────────────────────────────────────────────────────────────────

/**
 * Calcula os outs: cartas restantes que podem melhorar a mão atual.
 *
 * Para o flop (3 comunitárias), considera a melhor mão possível após
 * adicionar qualquer uma das cartas restantes como turn.
 * Para o turn (4 comunitárias), considera somente a próxima carta (river).
 *
 * Um out é qualquer carta que resulte em uma categoria de mão melhor
 * do que a atual (considerando todas as 7 cartas disponíveis).
 */
function calculateOuts(holeCards, communityCards) {
  if (communityCards.length === 5) return { outs: [], total: 0 };
  if (communityCards.length === 0) return { outs: [], total: 0 }; // pré-flop sem outs definíveis

  const known = [...holeCards, ...communityCards];
  const deck = remainingDeck(known);

  // Mão atual com as cartas disponíveis
  const currentHand = evaluateBestHand([...holeCards, ...communityCards]);
  const currentRank = currentHand ? currentHand.rank : -1;

  const outsSet = new Map(); // id -> card
  const outsByCategory = {};

  for (const card of deck) {
    // Adiciona a carta como próxima comunitária
    const testComm = [...communityCards, card];
    const testHand = evaluateBestHand([...holeCards, ...testComm]);

    if (testHand && testHand.rank > currentRank) {
      outsSet.set(card.id, card);
      if (!outsByCategory[testHand.rank]) {
        outsByCategory[testHand.rank] = { name: HAND_NAMES[testHand.rank], cards: [] };
      }
      // Evita duplicata na categoria
      if (!outsByCategory[testHand.rank].cards.find(c => c.id === card.id)) {
        outsByCategory[testHand.rank].cards.push(card);
      }
    }
  }

  const uniqueOuts = [...outsSet.values()];
  const remaining = deck.length;
  const pctNext = remaining > 0 ? (uniqueOuts.length / remaining) * 100 : 0;

  // Probabilidade de acertar até o river (flop -> river: 2 cartas)
  // Fórmula: 1 - C(remaining - outs, 2) / C(remaining, 2)
  let pctByRiver = null;
  if (communityCards.length === 3 && remaining >= 2) {
    const n = uniqueOuts.length;
    const missses = remaining - n;
    if (missses >= 2) {
      pctByRiver = (1 - (C(missses, 2) / C(remaining, 2))) * 100;
    } else {
      pctByRiver = 100;
    }
  }

  return {
    outs: uniqueOuts,
    total: uniqueOuts.length,
    outsByCategory,
    remaining,
    pctNext,
    pctByRiver,
    currentHand,
  };
}

// ─── Probabilidade de Vitória ──────────────────────────────────────────────────

/**
 * Verifica se a enumeração exata é viável.
 * Retorna true se o número de cenários for <= threshold.
 */
function isExactFeasible(deckSize, communityNeeded, numOpponents, threshold = 200000) {
  // C(deckSize, communityNeeded) * C(deckSize - communityNeeded, 2 * numOpponents)
  const commCombos = C(deckSize, communityNeeded);
  const holeAfterComm = deckSize - communityNeeded;
  const holeCombos = C(holeAfterComm, 2 * numOpponents);
  // Para 1 oponente com river: C(45, 0) * C(45, 2) = 990 — muito viável
  // Para 1 oponente sem comunitárias: C(50, 5) * C(45, 2) = ~118M — inviável
  return commCombos * holeCombos <= threshold;
}

/**
 * Simulação Monte Carlo para calcular win/tie/loss.
 * Retorna um objeto de controle { run(onDone), cancel() }.
 */
function runMonteCarlo(holeCards, communityCards, numOpponents, numSimulations, progressCallback) {
  const known = [...holeCards, ...communityCards];
  const deck = remainingDeck(known);
  const communityNeeded = 5 - communityCards.length;

  let wins = 0, ties = 0, losses = 0;
  let cancelled = false;
  const batchSize = 2000;
  let completed = 0;

  function runBatch() {
    if (cancelled) return;

    const end = Math.min(completed + batchSize, numSimulations);

    for (let i = completed; i < end; i++) {
      const shuffled = shuffleArray([...deck]);
      let pos = 0;

      // Distribui cartas comunitárias restantes
      const newComm = shuffled.slice(pos, pos + communityNeeded);
      pos += communityNeeded;
      const fullCommunity = [...communityCards, ...newComm];

      // Distribui cartas dos oponentes
      const opponentHands = [];
      let valid = true;
      for (let j = 0; j < numOpponents; j++) {
        if (pos + 2 > shuffled.length) { valid = false; break; }
        opponentHands.push(shuffled.slice(pos, pos + 2));
        pos += 2;
      }
      if (!valid) continue;

      // Avalia mão do jogador
      const playerHand = evaluateBestHand([...holeCards, ...fullCommunity]);
      if (!playerHand) continue;

      // Melhor mão dos adversários
      let bestOppHand = null;
      for (const oppHole of opponentHands) {
        const oppHand = evaluateBestHand([...oppHole, ...fullCommunity]);
        if (!bestOppHand || compareHands(oppHand, bestOppHand) > 0) {
          bestOppHand = oppHand;
        }
      }

      if (!bestOppHand) continue;

      const cmp = compareHands(playerHand, bestOppHand);
      if (cmp > 0) wins++;
      else if (cmp === 0) ties++;
      else losses++;
    }

    completed = end;

    if (progressCallback) {
      progressCallback(formatWinResult(wins, ties, losses, completed, 'monte_carlo'), completed, numSimulations);
    }
  }

  return {
    run: (onDone) => {
      function step() {
        if (cancelled || completed >= numSimulations) {
          if (!cancelled && onDone) {
            onDone(formatWinResult(wins, ties, losses, completed, 'monte_carlo'));
          }
          return;
        }
        runBatch();
        setTimeout(step, 0);
      }
      step();
    },
    cancel: () => { cancelled = true; },
  };
}

function formatWinResult(wins, ties, losses, total, method) {
  const t = wins + ties + losses;
  const base = t > 0 ? t : 1;
  const equity = ((wins + ties * 0.5) / base) * 100;
  return {
    wins, ties, losses, total,
    winPct:  (wins  / base) * 100,
    tiePct:  (ties  / base) * 100,
    lossPct: (losses / base) * 100,
    equity,
    method,
  };
}

// ─── Mão Atual ────────────────────────────────────────────────────────────────

/**
 * Retorna a melhor mão formada com as cartas disponíveis.
 */
function getBestCurrentHand(holeCards, communityCards) {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 2) return null;
  return evaluateBestHand(allCards);
}

// ─── Probabilidades na Próxima Carta ──────────────────────────────────────────

/**
 * Calcula distribuição de categorias na próxima carta comunitária.
 * Usado no flop e turn para mostrar o que pode aparecer.
 */
function nextCardProbabilities(holeCards, communityCards) {
  if (communityCards.length >= 5) return null;
  if (communityCards.length === 0) return null; // pré-flop

  const known = [...holeCards, ...communityCards];
  const deck = remainingDeck(known);

  const distribution = {};
  for (let i = 0; i <= 9; i++) distribution[i] = 0;

  for (const card of deck) {
    const newComm = [...communityCards, card];
    const hand = evaluateBestHand([...holeCards, ...newComm]);
    if (hand) distribution[hand.rank]++;
  }

  const total = deck.length;
  const byCategory = {};
  for (let i = 0; i <= 9; i++) {
    byCategory[i] = {
      count: distribution[i],
      pct: total > 0 ? (distribution[i] / total) * 100 : 0,
      name: HAND_NAMES[i],
    };
  }

  return { byCategory, total };
}

// ─── Utilitários ───────────────────────────────────────────────────────────────

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardToDisplay(card) {
  const suitSymbols = { c: '♣', d: '♦', h: '♥', s: '♠' };
  const rankDisplay  = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
  const r = card.rank || card[0];
  const s = card.suit || card[1];
  return {
    rank: rankDisplay[r] || r,
    suit: suitSymbols[s],
    suitName: s,
    color: (s === 'h' || s === 'd') ? 'red' : 'black',
    id: card.id || (r + s),
  };
}

// ─── Testes de Validação ────────────────────────────────────────────────────────

/**
 * Executa testes unitários no motor.
 * Retorna array de resultados { name, expected, got, pass }.
 */
function validateEngine() {
  const results = [];

  // ── Teste 1: Total de combinações C(52,5) ──
  const total52_5 = C(52, 5);
  results.push({
    name: 'Total de combinações C(52,5)',
    expected: 2598960,
    got: total52_5,
    pass: total52_5 === 2598960,
  });

  // ── Teste 2: Royal Flush ──
  const rf = evaluateHand5([
    { rank: 'A', suit: 'h', id: 'Ah' }, { rank: 'K', suit: 'h', id: 'Kh' },
    { rank: 'Q', suit: 'h', id: 'Qh' }, { rank: 'J', suit: 'h', id: 'Jh' },
    { rank: 'T', suit: 'h', id: 'Th' },
  ]);
  results.push({ name: 'Royal Flush', expected: 'Royal Flush', got: rf.name, pass: rf.rank === HAND_RANK.ROYAL_FLUSH });

  // ── Teste 3: Straight Flush ──
  const sf = evaluateHand5([
    { rank: '9', suit: 's', id: '9s' }, { rank: '8', suit: 's', id: '8s' },
    { rank: '7', suit: 's', id: '7s' }, { rank: '6', suit: 's', id: '6s' },
    { rank: '5', suit: 's', id: '5s' },
  ]);
  results.push({ name: 'Straight Flush 9-alta', expected: 'Straight Flush', got: sf.name, pass: sf.rank === HAND_RANK.STRAIGHT_FLUSH && sf.tiebreaker[0] === 9 });

  // ── Teste 4: Wheel (A-2-3-4-5) — Sequência, não Straight Flush ──
  const wheel = evaluateHand5([
    { rank: 'A', suit: 'c', id: 'Ac' }, { rank: '2', suit: 'd', id: '2d' },
    { rank: '3', suit: 'h', id: '3h' }, { rank: '4', suit: 's', id: '4s' },
    { rank: '5', suit: 'c', id: '5c' },
  ]);
  results.push({ name: 'Sequência Wheel (A-2-3-4-5), alto=5', expected: 'Sequência (5)', got: `${wheel.name} (${wheel.tiebreaker[0]})`, pass: wheel.rank === HAND_RANK.STRAIGHT && wheel.tiebreaker[0] === 5 });

  // ── Teste 5: Wheel Straight Flush (A-2-3-4-5 mesmo naipe) ──
  const wheelSF = evaluateHand5([
    { rank: 'A', suit: 'c', id: 'Ac' }, { rank: '2', suit: 'c', id: '2c' },
    { rank: '3', suit: 'c', id: '3c' }, { rank: '4', suit: 'c', id: '4c' },
    { rank: '5', suit: 'c', id: '5c' },
  ]);
  results.push({ name: 'Straight Flush Wheel (mesmo naipe)', expected: 'Straight Flush (5)', got: `${wheelSF.name} (${wheelSF.tiebreaker[0]})`, pass: wheelSF.rank === HAND_RANK.STRAIGHT_FLUSH && wheelSF.tiebreaker[0] === 5 });

  // ── Teste 6: Quadra ──
  const quads = evaluateHand5([
    { rank: 'A', suit: 'c', id: 'Ac' }, { rank: 'A', suit: 'd', id: 'Ad' },
    { rank: 'A', suit: 'h', id: 'Ah' }, { rank: 'A', suit: 's', id: 'As' },
    { rank: 'K', suit: 'c', id: 'Kc' },
  ]);
  results.push({ name: 'Quadra de Ases', expected: 'Quadra', got: quads.name, pass: quads.rank === HAND_RANK.FOUR_OF_A_KIND && quads.tiebreaker[0] === 14 });

  // ── Teste 7: Full House ──
  const fh = evaluateHand5([
    { rank: 'K', suit: 'c', id: 'Kc' }, { rank: 'K', suit: 'd', id: 'Kd' },
    { rank: 'K', suit: 'h', id: 'Kh' }, { rank: 'Q', suit: 's', id: 'Qs' },
    { rank: 'Q', suit: 'c', id: 'Qc' },
  ]);
  results.push({ name: 'Full House KKK-QQ', expected: 'Full House', got: fh.name, pass: fh.rank === HAND_RANK.FULL_HOUSE });

  // ── Teste 8: Flush ──
  const flush = evaluateHand5([
    { rank: 'A', suit: 'h', id: 'Ah' }, { rank: 'J', suit: 'h', id: 'Jh' },
    { rank: '9', suit: 'h', id: '9h' }, { rank: '7', suit: 'h', id: '7h' },
    { rank: '3', suit: 'h', id: '3h' },
  ]);
  results.push({ name: 'Flush', expected: 'Flush', got: flush.name, pass: flush.rank === HAND_RANK.FLUSH });

  // ── Teste 9: Sequência ──
  const straight = evaluateHand5([
    { rank: 'J', suit: 'h', id: 'Jh' }, { rank: 'T', suit: 'd', id: 'Td' },
    { rank: '9', suit: 'c', id: '9c' }, { rank: '8', suit: 's', id: '8s' },
    { rank: '7', suit: 'h', id: '7h' },
  ]);
  results.push({ name: 'Sequência J-alta', expected: 'Sequência (11)', got: `${straight.name} (${straight.tiebreaker[0]})`, pass: straight.rank === HAND_RANK.STRAIGHT && straight.tiebreaker[0] === 11 });

  // ── Teste 10: Melhor mão de 7 cartas (Royal Flush) ──
  const best7 = evaluateBestHand([
    { rank: 'A', suit: 'h', id: 'Ah' }, { rank: 'K', suit: 'h', id: 'Kh' },
    { rank: 'Q', suit: 'h', id: 'Qh' }, { rank: 'J', suit: 'h', id: 'Jh' },
    { rank: 'T', suit: 'h', id: 'Th' }, { rank: '2', suit: 'c', id: '2c' },
    { rank: '3', suit: 'd', id: '3d' },
  ]);
  results.push({ name: 'Melhor mão de 7 → Royal Flush', expected: 'Royal Flush', got: best7.name, pass: best7.rank === HAND_RANK.ROYAL_FLUSH });

  // ── Teste 11: Kicker de par ──
  const pair1 = evaluateHand5([
    { rank: 'A', suit: 'c', id: 'Ac' }, { rank: 'A', suit: 'd', id: 'Ad' },
    { rank: 'K', suit: 'h', id: 'Kh' }, { rank: 'Q', suit: 's', id: 'Qs' },
    { rank: 'J', suit: 'c', id: 'Jc' },
  ]);
  const pair2 = evaluateHand5([
    { rank: 'A', suit: 'h', id: 'Ah' }, { rank: 'A', suit: 's', id: 'As' },
    { rank: 'K', suit: 'c', id: 'Kc' }, { rank: 'Q', suit: 'd', id: 'Qd' },
    { rank: 'T', suit: 'c', id: 'Tc' },
  ]);
  results.push({ name: 'Desempate por kicker: AA-K-Q-J > AA-K-Q-T', expected: 'pair1 > pair2', got: compareHands(pair1, pair2) > 0 ? 'pair1 > pair2' : 'pair1 <= pair2', pass: compareHands(pair1, pair2) > 0 });

  // ── Teste 12: C(n,k) ──
  results.push({ name: 'C(52,5) = 2.598.960', expected: 2598960, got: C(52, 5), pass: C(52, 5) === 2598960 });
  results.push({ name: 'C(7,5) = 21', expected: 21, got: C(7, 5), pass: C(7, 5) === 21 });
  results.push({ name: 'C(47,2) = 1.081', expected: 1081, got: C(47, 2), pass: C(47, 2) === 1081 });

  // ── Teste 13: Deck restante ──
  const knownCards = [{ id: 'Ah' }, { id: 'Kh' }];
  const rest = remainingDeck(knownCards);
  results.push({ name: 'Deck restante com 2 cartas conhecidas = 50 cartas', expected: 50, got: rest.length, pass: rest.length === 50 });

  // ── Teste 14: Dois pares vs Um par ──
  const twoPair = evaluateHand5([
    { rank: 'A', suit: 'c', id: 'Ac' }, { rank: 'A', suit: 'd', id: 'Ad' },
    { rank: 'K', suit: 'c', id: 'Kc' }, { rank: 'K', suit: 'd', id: 'Kd' },
    { rank: 'Q', suit: 'c', id: 'Qc' },
  ]);
  const onePair = evaluateHand5([
    { rank: 'A', suit: 'h', id: 'Ah' }, { rank: 'A', suit: 's', id: 'As' },
    { rank: 'K', suit: 'h', id: 'Kh' }, { rank: 'Q', suit: 'h', id: 'Qh' },
    { rank: 'J', suit: 'h', id: 'Jh' },
  ]);
  results.push({ name: 'Dois pares bate Um par', expected: 'twoPair > onePair', got: compareHands(twoPair, onePair) > 0 ? 'twoPair > onePair' : 'twoPair <= onePair', pass: compareHands(twoPair, onePair) > 0 });

  return results;
}

// ─── Distribuição Completa de 5 Cartas (Referência/Validação) ─────────────────

/**
 * Calcula a distribuição exata de todas as mãos de 5 cartas (2.598.960).
 * Executado de forma assíncrona com callback de progresso.
 * progressCallback(processed, total, dist?) — dist só no final.
 */
function fullDeckDistribution(progressCallback) {
  const deck = createDeck();
  const dist = {};
  for (let i = 0; i <= 9; i++) dist[i] = 0;

  const total = C(52, 5); // 2.598.960
  let processed = 0;
  const batchSize = 30000;

  // Geração incremental de combinações para evitar alocação de ~2.6M arrays
  function processCombinations(callback) {
    const arr = deck;
    const n = arr.length;
    const k = 5;
    const indices = [0, 1, 2, 3, 4];
    let done = false;
    let batchCount = 0;

    function step() {
      while (!done) {
        // Avalia combinação atual
        const combo = indices.map(i => arr[i]);
        const h = evaluateHand5(combo);
        if (h) dist[h.rank]++;
        processed++;
        batchCount++;

        // Próxima combinação
        let i = k - 1;
        while (i >= 0 && indices[i] === i + n - k) i--;
        if (i < 0) { done = true; break; }
        indices[i]++;
        for (let j = i + 1; j < k; j++) indices[j] = indices[j-1] + 1;

        if (batchCount >= batchSize) {
          batchCount = 0;
          if (progressCallback) progressCallback(processed, total);
          setTimeout(step, 0);
          return;
        }
      }

      if (done) {
        if (progressCallback) progressCallback(total, total, dist);
      }
    }

    step();
  }

  processCombinations();
  return { total };
}

// ─── Exports ───────────────────────────────────────────────────────────────────

const PokerEngine = {
  // Constantes
  RANKS, SUITS, RANK_VALUE, HAND_RANK, HAND_NAMES,

  // Deck
  createDeck, remainingDeck,

  // Avaliação
  evaluateBestHand, evaluateHand5, compareHands, checkStraight,

  // Combinações
  combinations, C,

  // Distribuição
  calculateHandDistribution,

  // Outs
  calculateOuts,

  // Vitória
  runMonteCarlo,
  isExactFeasible,

  // Mão atual
  getBestCurrentHand,
  nextCardProbabilities,

  // Utilitários
  shuffleArray, cardToDisplay,

  // Validação
  validateEngine,
  fullDeckDistribution,

  // Formatação
  formatWinResult,
};

// Suporte a browser (script tag), Web Worker (self) e Node.js (module)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PokerEngine;
} else if (typeof self !== 'undefined') {
  self.PokerEngine = PokerEngine;
}
