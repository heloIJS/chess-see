/*
 * Chess-See UCI parser.
 * Pure functions. No DOM, no engine state.
 */
(function () {
  'use strict';

  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const CS = root.ChessSee = root.ChessSee || {};

  const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

  function parseInfo(line) {
    if (typeof line !== 'string' || line.indexOf('info ') !== 0) return null;

    const depthMatch = line.match(/\bdepth (\d+)/);
    const multipvMatch = line.match(/\bmultipv (\d+)/);
    const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?/);
    const pvMatch = line.match(/\bpv\s+(.+)$/);
    const nodesMatch = line.match(/\bnodes (\d+)/);
    const npsMatch = line.match(/\bnps (\d+)/);
    const timeMatch = line.match(/\btime (\d+)/);

    if (!scoreMatch || !pvMatch) return null;

    const pv = pvMatch[1]
      .trim()
      .split(/\s+/)
      .filter(function (token) { return UCI_MOVE.test(token); });

    if (!pv.length) return null;

    return {
      depth: depthMatch ? Number(depthMatch[1]) : 0,
      multipv: multipvMatch ? Math.max(1, Number(multipvMatch[1])) : 1,
      score: {
        type: scoreMatch[1],
        value: Number(scoreMatch[2]),
        bound: scoreMatch[3] || null
      },
      pv: pv,
      nodes: nodesMatch ? Number(nodesMatch[1]) : null,
      nps: npsMatch ? Number(npsMatch[1]) : null,
      time: timeMatch ? Number(timeMatch[1]) : null,
      raw: line
    };
  }

  function parseBestMove(line) {
    if (typeof line !== 'string') return null;
    const match = line.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
    if (!match) return null;
    return {
      bestmove: match[1],
      ponder: match[2] || null
    };
  }

  function lineFromBestMove(bestmove) {
    if (!bestmove || bestmove === '(none)' || !UCI_MOVE.test(bestmove)) return null;
    return {
      depth: 0,
      multipv: 1,
      score: null,
      pv: [bestmove],
      nodes: null,
      nps: null,
      time: null,
      raw: 'bestmove ' + bestmove
    };
  }

  function sortLines(lines) {
    return lines.slice().sort(function (a, b) {
      return (a.multipv || 1) - (b.multipv || 1);
    });
  }

  // UCI scores are from the side-to-move's point of view. The HUD is
  // conventional: positive is good for White.
  function toWhitePov(score, turn) {
    if (!score) return null;
    const sign = turn === 'b' ? -1 : 1;
    return {
      type: score.type,
      value: sign * score.value,
      bound: score.bound || null
    };
  }

  function formatEval(score, turn) {
    const white = toWhitePov(score, turn);
    if (!white) return null;

    if (white.type === 'mate') {
      if (white.value === 0) {
        return { text: '#', sign: 0, className: 'cs-neutral' };
      }
      const text = (white.value > 0 ? '+M' : '-M') + Math.abs(white.value);
      return {
        text: text,
        sign: white.value > 0 ? 1 : -1,
        className: white.value > 0 ? 'cs-positive' : 'cs-negative'
      };
    }

    let pawns = white.value / 100;
    if (pawns > 99) pawns = 99;
    if (pawns < -99) pawns = -99;
    const abs = Math.abs(pawns);
    const digits = abs < 10 ? 2 : 1;
    let text = pawns.toFixed(digits);
    if (pawns > 0) text = '+' + text;

    return {
      text: text,
      sign: pawns > 0 ? 1 : (pawns < 0 ? -1 : 0),
      className: pawns > 0 ? 'cs-positive' : (pawns < 0 ? 'cs-negative' : 'cs-neutral')
    };
  }

  function mateIn(score, turn) {
    const white = toWhitePov(score, turn);
    return white && white.type === 'mate' ? white.value : null;
  }

  CS.UCI = {
    parseInfo: parseInfo,
    parseBestMove: parseBestMove,
    lineFromBestMove: lineFromBestMove,
    sortLines: sortLines,
    toWhitePov: toWhitePov,
    formatEval: formatEval,
    mateIn: mateIn,
    UCI_MOVE: UCI_MOVE
  };
})();
