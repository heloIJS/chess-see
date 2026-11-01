(function () {
  'use strict';

  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const CS = root.ChessSee = root.ChessSee || {};
  const DEFAULTS = Object.freeze({
    enabled: true,
    fadeMode: 'auto',
    arrowCount: 3,
    depth: 18,
    showEval: true,
    onlyOnMyTurn: true,
    analyzeOpponent: false,
    humanizer: true,
    elo: 1500,
    missChance: 0,
    mistakeChance: 0,
    blunderChance: 0,
    humanizerStyle: 'balanced',
    humanizerDelay: 0,
    subtle: false,
    debugGrid: false,
    offsetX: 0,
    offsetY: 0
  });

  class Controller {
    constructor() {
      this.settings = Object.assign({}, DEFAULTS);
      this.adapter = null;
      this.overlay = null;
      this.engine = null;
      this.hotkeys = null;
      this.position = null;
      this.currentFen = null;
      this.flaw = null;
      this.searchId = 0;
      this.stage2Timer = null;
      this.renderTimer = null;
      this.destroyed = false;
      this.storageHandler = this.storageHandler.bind(this);
    }

    async start() {
      const stored = await new Promise((resolve) => {
        try {
          chrome.storage.sync.get(DEFAULTS, resolve);
        } catch (error) {
          resolve(DEFAULTS);
        }
      });
      this.settings = Object.assign({}, DEFAULTS, stored || {});
      this.hotkeys = new CS.Hotkeys(this);
      this.hotkeys.start();

      try {
        chrome.storage.onChanged.addListener(this.storageHandler);
      } catch (error) {
        /* storage unavailable: run with defaults */
      }
      this.applyEnabled();
    }

    storageHandler(changes, area) {
      if (area !== 'sync') return;
      const previous = Object.assign({}, this.settings);
      Object.keys(changes).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
          this.settings[key] = changes[key].newValue;
        }
      });
      if (Object.prototype.hasOwnProperty.call(changes, 'enabled')) this.applyEnabled();
      if (this.overlay) this.overlay.updateSettings(this.settings);
      if (this.overlay && this.position) this.overlay.setVisible(this.shouldRender(this.position));
      if (previous.humanizer !== this.settings.humanizer ||
          previous.missChance !== this.settings.missChance ||
          previous.mistakeChance !== this.settings.mistakeChance ||
          previous.blunderChance !== this.settings.blunderChance ||
          previous.humanizerStyle !== this.settings.humanizerStyle) {
        this.flaw = null;
      }
      if (this.position && (
        previous.depth !== this.settings.depth ||
        previous.elo !== this.settings.elo ||
        previous.humanizer !== this.settings.humanizer ||
        previous.missChance !== this.settings.missChance ||
        previous.mistakeChance !== this.settings.mistakeChance ||
        previous.blunderChance !== this.settings.blunderChance ||
        previous.humanizerStyle !== this.settings.humanizerStyle ||
        previous.arrowCount !== this.settings.arrowCount ||
        previous.fadeMode !== this.settings.fadeMode ||
        previous.onlyOnMyTurn !== this.settings.onlyOnMyTurn ||
        previous.analyzeOpponent !== this.settings.analyzeOpponent
      )) this.restartAnalysis();
    }

    persist(values) {
      const previous = Object.assign({}, this.settings);
      Object.assign(this.settings, values);
      try {
        chrome.storage.sync.set(values);
      } catch (error) {
        /* keep local settings when sync write fails */
      }
      if (this.overlay) this.overlay.updateSettings(this.settings);
      if (this.overlay && this.position) this.overlay.setVisible(this.shouldRender(this.position));
      if (previous.humanizer !== this.settings.humanizer ||
          previous.missChance !== this.settings.missChance ||
          previous.mistakeChance !== this.settings.mistakeChance ||
          previous.blunderChance !== this.settings.blunderChance ||
          previous.humanizerStyle !== this.settings.humanizerStyle) {
        this.flaw = null;
      }
      if (this.position && (
        previous.depth !== this.settings.depth ||
        previous.elo !== this.settings.elo ||
        previous.humanizer !== this.settings.humanizer ||
        previous.missChance !== this.settings.missChance ||
        previous.mistakeChance !== this.settings.mistakeChance ||
        previous.blunderChance !== this.settings.blunderChance ||
        previous.humanizerStyle !== this.settings.humanizerStyle ||
        previous.arrowCount !== this.settings.arrowCount ||
        previous.fadeMode !== this.settings.fadeMode ||
        previous.onlyOnMyTurn !== this.settings.onlyOnMyTurn ||
        previous.analyzeOpponent !== this.settings.analyzeOpponent
      )) this.restartAnalysis();
    }

    applyEnabled() {
      if (this.settings.enabled) this.enableRuntime();
      else this.disableRuntime();
    }

    enableRuntime() {
      if (this.adapter) return;
      this.destroyed = false;
      this.adapter = new CS.BoardAdapter({
        onPosition: (position) => this.onPosition(position)
      });
      this.overlay = new CS.Overlay({
        adapter: this.adapter,
        getSettings: () => this.settings,
        onSetting: (key, value) => this.persist({ [key]: value })
      });
      this.engine = new CS.WorkerBridge({
        isCurrent: (id) => id === this.searchId && !this.destroyed,
        onInfo: (info, request) => this.onInfo(info, request),
        onBestMove: (best, request) => this.onBestMove(best, request),
        onCrash: () => {
          if (!this.destroyed && this.position) {
            window.setTimeout(() => {
              if (!this.destroyed && this.position) this.restartAnalysis();
            }, 400);
          }
        }
      });
      this.overlay.mount();
      this.adapter.start();
      this.adapter.refresh();
      this.engine.ensureReady().then(() => {
        // If the first board position arrived before the engine finished
        // booting, make sure it still gets analyzed.
        if (this.destroyed || !this.position || !this.overlay) return;
        if (!this.engine.active && !this.overlay.lastResult) this.restartAnalysis();
      }).catch(() => {
        if (this.overlay) this.overlay.notify('Engine unavailable');
      });
    }

    disableRuntime() {
      this.destroyed = true;
      this.searchId += 1;
      this.clearStage2Timer();
      this.clearRenderTimer();
      if (this.engine) this.engine.terminate();
      if (this.adapter) this.adapter.stop();
      if (this.overlay) this.overlay.destroy();
      this.engine = null;
      this.adapter = null;
      this.overlay = null;
      this.position = null;
      this.currentFen = null;
      this.flaw = null;
    }

    shouldRender(position) {
      if (this.settings.fadeMode === 'hidden') return false;
      if (this.settings.fadeMode === 'always') return true;
      const isFreePlay = !document.querySelector('.clock-component, wc-clock, .clock, .rclock') ||
                         (typeof location !== 'undefined' && /^\/(analysis|puzzles|study|practice|training|editor)/.test(location.pathname));
      if (isFreePlay || !this.settings.onlyOnMyTurn) return true;
      return !!position.myTurn;
    }

    canAnalyze(position) {
      if (this.settings.fadeMode === 'hidden') return false;
      const isFreePlay = !document.querySelector('.clock-component, wc-clock, .clock, .rclock') ||
                         (typeof location !== 'undefined' && /^\/(analysis|puzzles|study|practice|training|editor)/.test(location.pathname));
      if (isFreePlay || this.settings.analyzeOpponent || !this.settings.onlyOnMyTurn) return true;
      return !!position.myTurn;
    }

    onPosition(position) {
      if (!this.settings.enabled || this.destroyed || !this.engine || !this.overlay) return;
      this.overlay.setPosition(position);

      if (!position || !position.fen) {
        this.position = null;
        this.currentFen = null;
        this.flaw = null;
        this.searchId += 1;
        this.clearStage2Timer();
        this.clearRenderTimer();
        this.engine.cancel();
        this.overlay.setVisible(false);
        this.overlay.scheduleFadeClear(180);
        return;
      }

      const visible = this.shouldRender(position);
      if (position.fen === this.currentFen && this.searchId !== 0) {
        this.overlay.setVisible(visible);
        return;
      }

      this.currentFen = position.fen;
      this.position = position;
      this.prepareFlaw(position.fen);
      const id = ++this.searchId;
      this.clearStage2Timer();
      this.clearRenderTimer();
      this.engine.cancel();
      this.overlay.beginPosition(position, visible);

      if (!this.canAnalyze(position)) {
        this.engine.cancel();
        this.overlay.scheduleFadeClear(180);
        return;
      }

      // Stage 1: instant depth-6 search (3 lines when a miss is planned)
      const targetArrows = Math.max(1, Math.min(3, Number(this.settings.arrowCount) || 1));
      const pvCount = this.searchPvCount(targetArrows);
      const elo = Number(this.settings.elo) || 1500;
      const humanizer = this.settings.humanizer !== false;
      const stage1Promise = this.engine.search(position.fen, 6, pvCount, id, 1, elo, humanizer);
      stage1Promise.catch(() => {});
    }

    prepareFlaw(fen) {
      if (this.settings.humanizer === false) {
        this.flaw = null;
        return;
      }
      if (this.flaw && this.flaw.fen === fen) return;
      this.flaw = null;

      const blunderChance = Math.max(0, Math.min(100, Number(this.settings.blunderChance) || 0));
      const mistakeChance = Math.max(0, Math.min(100, Number(this.settings.mistakeChance) || 0));
      const missChance = Math.max(0, Math.min(100, Number(this.settings.missChance) || 0));

      const style = this.settings.humanizerStyle || 'balanced';

      if (blunderChance > 0 && Math.random() * 100 < blunderChance) {
        const move = this.randomLegalMove(fen, null, style);
        if (move) {
          this.flaw = { fen: fen, type: 'blunder', move: move };
          return;
        }
      }

      if (mistakeChance > 0 && Math.random() * 100 < mistakeChance) {
        const pick = style === 'defensive'
          ? 3
          : (style === 'aggressive' || style === 'tricky' ? 4 : 3 + Math.floor(Math.random() * 2));
        this.flaw = { fen: fen, type: 'mistake', pick: pick };
        return;
      }

      if (missChance > 0 && Math.random() * 100 < missChance) {
        const pick = style === 'defensive'
          ? 1
          : (style === 'aggressive' || style === 'tricky' ? 2 : 1 + Math.floor(Math.random() * 2));
        this.flaw = { fen: fen, type: 'miss', pick: pick };
      }
    }

    moveWeight(move, style) {
      if (!move || !style || style === 'balanced') return 1;
      const flags = String(move.flags || '');
      const capture = flags.indexOf('c') >= 0 || flags.indexOf('e') >= 0;
      const check = /[+#]/.test(String(move.san || ''));
      const promotion = flags.indexOf('p') >= 0;
      let weight = 1;
      if (style === 'aggressive') {
        weight += (capture ? 2 : 0) + (check ? 1 : 0) + (promotion ? 1 : 0);
      } else if (style === 'defensive') {
        weight += (!capture && !check) ? 1 : 0;
      } else if (style === 'tricky') {
        weight += (check ? 2 : 0) + (promotion ? 2 : 0) + (capture ? 1 : 0);
      }
      return weight;
    }

    randomLegalMove(fen, exclude, style) {
      try {
        const ChessCtor = root.Chess;
        if (typeof ChessCtor !== 'function') return null;
        const game = new ChessCtor(fen);
        const moves = game.moves({ verbose: true });
        const pool = exclude
          ? moves.filter((move) => move.from + move.to + (move.promotion || '') !== exclude)
          : moves;
        if (!pool.length) return null;

        let total = 0;
        const weighted = pool.map((move) => {
          const weight = this.moveWeight(move, style);
          total += weight;
          return { move: move, weight: weight };
        });
        let roll = Math.random() * total;
        for (let i = 0; i < weighted.length; i += 1) {
          roll -= weighted[i].weight;
          if (roll <= 0) {
            const move = weighted[i].move;
            return move.from + move.to + (move.promotion || '');
          }
        }
        const fallback = weighted[weighted.length - 1].move;
        return fallback.from + fallback.to + (fallback.promotion || '');
      } catch (error) {
        return null;
      }
    }

    searchPvCount(targetArrows) {
      if (this.flaw && this.flaw.type === 'mistake') return Math.max(targetArrows, 5);
      if (this.flaw && this.flaw.type === 'miss') return Math.max(targetArrows, 3);
      return targetArrows;
    }

    applyFlaw(lines, bestMove) {
      const flaw = this.flaw;
      if (!flaw || !this.position || flaw.fen !== this.position.fen) return lines;

      if (flaw.type === 'blunder' && flaw.move) {
        if (bestMove && flaw.move === bestMove) {
          const replacement = this.randomLegalMove(flaw.fen, bestMove, this.settings.humanizerStyle);
          if (replacement) flaw.move = replacement;
        }
        const matchIndex = lines.findIndex((line) => line.pv && line.pv[0] === flaw.move);
        let line = matchIndex >= 0 ? lines.splice(matchIndex, 1)[0] : CS.UCI.lineFromBestMove(flaw.move);
        if (!line) return lines;
        line.flaw = 'blunder';
        lines.unshift(line);
        return lines;
      }

      if (flaw.type === 'mistake' && lines.length > 1) {
        const index = Math.max(1, Math.min(lines.length - 1, flaw.pick || 3));
        const picked = lines.splice(index, 1)[0];
        picked.flaw = 'mistake';
        lines.unshift(picked);
      }

      if (flaw.type === 'miss' && lines.length > 1) {
        const index = Math.max(1, Math.min(lines.length - 1, flaw.pick || 1));
        const picked = lines.splice(index, 1)[0];
        picked.flaw = 'miss';
        lines.unshift(picked);
      }

      return lines;
    }

    onInfo(info, request) {
      if (!request || request.searchId !== this.searchId) return;
      request.lines.set(Math.max(1, info.multipv || 1), info);
    }

    onBestMove(best, request) {
      if (!request || request.searchId !== this.searchId || !this.position || this.destroyed) return;
      this.clearStage2Timer();
      const lines = Array.from(request.lines.values());

      if (request.stage === 1) {
        if (!lines.length && best && best.bestmove) {
          const fallback = CS.UCI.lineFromBestMove(best.bestmove);
          if (fallback) lines.push(fallback);
        }
        this.renderRequest(request, lines, best);
        if (best && best.bestmove && best.bestmove !== '(none)') this.startDeepSearch(request.searchId);
        return;
      }

      if (request.stage === 2) {
        if (!lines.length && best && best.bestmove) {
          const fallback = CS.UCI.lineFromBestMove(best.bestmove);
          if (fallback) lines.push(fallback);
        }
        this.renderRequest(request, lines, best);
      }
    }

    renderRequest(request, lines, best) {
      if (!this.overlay || !request || request.searchId !== this.searchId || !this.position) return;
      let sorted = CS.UCI.sortLines(lines.filter((line) => line && line.pv && line.pv.length));

      // Humanizer sorting: if Stockfish's Elo limiter chose a human bestmove, ensure that move is the #1 line
      if (this.settings.humanizer && best && best.bestmove && best.bestmove !== '(none)') {
        const matchIndex = sorted.findIndex((l) => l.pv && l.pv[0] === best.bestmove);
        if (matchIndex > 0) {
          const humanLine = sorted.splice(matchIndex, 1)[0];
          sorted.unshift(humanLine);
        } else if (matchIndex === -1 && sorted.length > 0) {
          const fallback = CS.UCI.lineFromBestMove(best.bestmove);
          if (fallback) sorted.unshift(fallback);
        }
      }

      sorted = this.applyFlaw(sorted, best ? best.bestmove : null);
      const scoredLine = sorted.find((line) => line && line.score);

      const result = {
        lines: sorted,
        score: scoredLine ? scoredLine.score : (request.bestScore || null),
        turn: this.position.turn,
        searchId: request.searchId,
        stage: request.stage,
        bestMove: best ? best.bestmove : null,
        elo: this.settings.elo,
        humanizer: this.settings.humanizer,
        flaw: this.flaw ? this.flaw.type : null
      };
      const draw = () => {
        if (!this.overlay || !this.engine || this.destroyed || request.searchId !== this.searchId) return;
        if (result.score) this.engine.lastScore = result.score;
        this.overlay.render(result, { instant: request.stage === 1 });
      };

      const delay = this.settings.humanizer !== false
        ? Math.max(0, Math.min(2000, Number(this.settings.humanizerDelay) || 0))
        : 0;
      if (delay > 0) {
        this.clearRenderTimer();
        this.renderTimer = window.setTimeout(() => {
          this.renderTimer = null;
          draw();
        }, delay);
      } else {
        draw();
      }
    }

    async startDeepSearch(id) {
      if (!this.position || id !== this.searchId || !this.engine || this.destroyed) return;
      const depth = Math.max(6, Number(this.settings.depth) || DEFAULTS.depth);
      const movetime = CS.WorkerBridge.movetimeFor(depth);
      const targetArrows = Math.max(1, Math.min(3, Number(this.settings.arrowCount) || 1));
      const pvCount = this.searchPvCount(targetArrows);
      const elo = Number(this.settings.elo) || 1500;
      const humanizer = this.settings.humanizer !== false;
      let request = null;
      try {
        request = await this.engine.search(
          this.position.fen,
          depth,
          pvCount,
          id,
          2,
          elo,
          humanizer
        );
      } catch (error) {
        return;
      }
      if (!request || id !== this.searchId || this.destroyed) return;
      this.clearStage2Timer();
      this.stage2Timer = window.setTimeout(() => {
        this.stage2Timer = null;
        if (!request || id !== this.searchId || this.destroyed || !this.engine) return;
        this.engine.cancel();
        this.renderRequest(request, Array.from(request.lines.values()), null);
      }, movetime + 500);
    }

    clearStage2Timer() {
      if (this.stage2Timer) {
        window.clearTimeout(this.stage2Timer);
        this.stage2Timer = null;
      }
    }

    clearRenderTimer() {
      if (this.renderTimer) {
        window.clearTimeout(this.renderTimer);
        this.renderTimer = null;
      }
    }

    restartAnalysis() {
      if (!this.settings.enabled || this.destroyed || !this.position) return;
      this.currentFen = null;
      this.onPosition(this.position);
    }

    toggleMaster() {
      this.persist({ enabled: !this.settings.enabled });
    }

    cycleFade() {
      const values = ['auto', 'always', 'hidden'];
      const index = values.indexOf(this.settings.fadeMode);
      const value = values[(index + 1) % values.length];
      this.persist({ fadeMode: value });
      if (this.overlay) this.overlay.notify('Fade: ' + value);
    }

    cycleArrows() {
      const value = ((Number(this.settings.arrowCount) || 1) % 3) + 1;
      this.persist({ arrowCount: value });
      if (this.overlay) this.overlay.notify('Arrows: ' + value);
    }

    cycleDepth() {
      const values = [12, 18, 24];
      const index = values.indexOf(Number(this.settings.depth));
      const value = values[(index + 1) % values.length];
      this.persist({ depth: value });
      if (this.overlay) this.overlay.notify('Depth: ' + value);
    }

    cycleElo() {
      const values = [800, 1100, 1400, 1600, 1800, 2000, 2400, 3200];
      const current = Number(this.settings.elo) || 1500;
      let nextIndex = 0;
      for (let i = 0; i < values.length; i += 1) {
        if (values[i] > current) {
          nextIndex = i;
          break;
        }
      }
      const value = values[nextIndex];
      this.persist({ elo: value });
      if (this.overlay) this.overlay.notify('Elo: ' + (value >= 3200 ? 'Max (Stockfish)' : value + ' Elo'));
    }

    toggleHumanizer() {
      const next = !this.settings.humanizer;
      this.persist({ humanizer: next });
      if (this.overlay) this.overlay.notify('Humanizer: ' + (next ? 'on' : 'off'));
    }

    toggleEval() {
      this.persist({ showEval: !this.settings.showEval });
      if (this.overlay) this.overlay.notify('Eval chip: ' + (this.settings.showEval ? 'on' : 'off'));
    }

    toggleSettings() {
      if (this.overlay) this.overlay.toggleSettings();
      else this.toggleMaster();
    }
  }

  const controller = new Controller();
  controller.start().catch(() => {});
  CS.controller = controller;
})();
