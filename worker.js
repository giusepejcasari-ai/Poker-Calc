/**
 * worker.js
 * Web Worker para executar simulações Monte Carlo sem bloquear a UI.
 */

'use strict';

importScripts('poker-engine.js');

let cancelled = false;

self.onmessage = function(e) {
  const { type, payload } = e.data;

  if (type === 'cancel') {
    cancelled = true;
    return;
  }

  if (type === 'monte_carlo') {
    cancelled = false;
    const { holeCards, communityCards, numOpponents, numSimulations } = payload;
    runMonteCarloWorker(holeCards, communityCards, numOpponents, numSimulations);
    return;
  }

  if (type === 'distribution') {
    const { holeCards, communityCards } = payload;
    try {
      const result = PokerEngine.calculateHandDistribution(holeCards, communityCards);
      self.postMessage({ type: 'distribution_result', payload: result });
    } catch(err) {
      self.postMessage({ type: 'error', payload: err.message });
    }
    return;
  }

  if (type === 'full_deck_distribution') {
    PokerEngine.fullDeckDistribution((processed, total, dist) => {
      if (dist) {
        self.postMessage({ type: 'full_deck_done', payload: { dist, total } });
      } else {
        self.postMessage({ type: 'full_deck_progress', payload: { processed, total } });
      }
    });
    return;
  }
};

function runMonteCarloWorker(holeCards, communityCards, numOpponents, numSimulations) {
  const known = [...holeCards, ...communityCards];
  const deck = PokerEngine.remainingDeck(known);
  const communityNeeded = 5 - communityCards.length;

  let wins = 0, ties = 0, losses = 0;
  const batchSize = 5000;
  let completed = 0;

  function runBatch() {
    if (cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }

    const end = Math.min(completed + batchSize, numSimulations);

    for (let i = completed; i < end; i++) {
      const shuffled = PokerEngine.shuffleArray([...deck]);
      let pos = 0;

      // Cartas comunitárias restantes
      const newComm = shuffled.slice(pos, pos + communityNeeded);
      pos += communityNeeded;
      const fullCommunity = [...communityCards, ...newComm];

      // Cartas dos oponentes
      const opponentHands = [];
      let valid = true;
      for (let j = 0; j < numOpponents; j++) {
        if (pos + 2 > shuffled.length) { valid = false; break; }
        opponentHands.push(shuffled.slice(pos, pos + 2));
        pos += 2;
      }
      if (!valid) continue;

      // Avalia mão do jogador
      const playerHand = PokerEngine.evaluateBestHand([...holeCards, ...fullCommunity]);

      // Melhor mão dos adversários
      let bestOppHand = null;
      for (const oppHole of opponentHands) {
        const oppHand = PokerEngine.evaluateBestHand([...oppHole, ...fullCommunity]);
        if (!bestOppHand || PokerEngine.compareHands(oppHand, bestOppHand) > 0) {
          bestOppHand = oppHand;
        }
      }

      if (!bestOppHand) continue;

      const cmp = PokerEngine.compareHands(playerHand, bestOppHand);
      if (cmp > 0) wins++;
      else if (cmp === 0) ties++;
      else losses++;
    }

    completed = end;

    // Envia progresso parcial
    const partial = PokerEngine.formatWinResult(wins, ties, losses, completed, 'monte_carlo');
    self.postMessage({
      type: 'progress',
      payload: { ...partial, completed, total: numSimulations }
    });

    if (completed < numSimulations && !cancelled) {
      setTimeout(runBatch, 0);
    } else if (!cancelled) {
      self.postMessage({
        type: 'done',
        payload: PokerEngine.formatWinResult(wins, ties, losses, completed, 'monte_carlo')
      });
    }
  }

  runBatch();
}
