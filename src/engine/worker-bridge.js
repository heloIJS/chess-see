(function () {
  'use strict';
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const CS = root.ChessSee = root.ChessSee || {};

  class WorkerBridge {
    constructor(options) {
      this.options = options || {};
      this.sessionId = 'cs-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      this.port = null;
      this.ready = false;
      this.booting = null;
      this.requestSerial = 0;
      this.active = null;
      this.crashTimer = null;
      this.destroyed = false;
    }

    async ensureReady() {
      if (this.destroyed) throw new Error('engine destroyed');
      if (this.ready && this.port) return;
      if (this.booting) return this.booting;

      this.booting = new Promise((resolve, reject) => {
        let settled = false;

        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          this.cleanup();
          reject(new Error('Stockfish initialization timed out'));
        }, 20000);

        const finish = (error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          this.booting = null;
          if (error) {
            this.cleanup();
            reject(error);
          } else {
            resolve();
          }
        };

        try {
          const port = chrome.runtime.connect({ name: 'chess-see-engine' });
          this.port = port;

          port.onMessage.addListener((msg) => {
            if (!msg || msg.sessionId !== this.sessionId) return;

            if (msg.type === 'ready') {
              this.send('uci');
              return;
            }

            if (msg.type === 'line') {
              const line = String(msg.data == null ? '' : msg.data).trim();
              if (line === 'uciok') {
                this.send('setoption name Hash value 64');
                this.send('setoption name MultiPV value 1');
                this.send('setoption name Ponder value false');
                this.send('isready');
                return;
              }
              if (line === 'readyok') {
                this.ready = true;
                finish();
                return;
              }
              this.handleLine(line);
              return;
            }

            if (msg.type === 'crash') {
              const err = new Error(msg.message || 'Stockfish worker error');
              if (!this.ready) finish(err);
              else this.handleCrash(err);
            }
          });

          port.onDisconnect.addListener(() => {
            const lastError = chrome.runtime.lastError;
            const err = new Error(lastError && lastError.message
              ? lastError.message
              : 'Stockfish engine host disconnected');
            this.port = null;
            if (!this.ready) finish(err);
            else this.handleCrash(err);
          });

          port.postMessage({ type: 'engine-init', sessionId: this.sessionId });
        } catch (setupError) {
          finish(setupError);
        }
      });

      return this.booting;
    }

    handleLine(line) {
      const active = this.active;
      if (!active) return;
      const info = CS.UCI.parseInfo(line);
      if (info && this.options.onInfo) this.options.onInfo(info, active);
      const best = CS.UCI.parseBestMove(line);
      if (best) {
        if (this.options.onBestMove) this.options.onBestMove(best, active);
        if (this.active === active) this.active = null;
      }
    }

    send(command) {
      if (!this.port) return false;
      try {
        this.port.postMessage({
          type: 'engine-send',
          sessionId: this.sessionId,
          command: command
        });
        return true;
      } catch (error) {
        this.handleCrash(error);
        return false;
      }
    }

    static movetimeFor(depth) {
      const d = Number(depth) || 18;
      if (d <= 12) return 600;
      if (d <= 18) return 1100;
      if (d <= 24) return 1800;
      return Math.min(2200, Math.round(d / 24 * 1800) || 1800);
    }

    async search(fen, depth, multipv, searchId, stage, elo, humanizer) {
      await this.ensureReady();
      if (this.destroyed || (this.options.isCurrent && !this.options.isCurrent(searchId))) return null;
      this.cancel();

      const eloNum = Number(elo);
      const isHuman = (humanizer !== false) && (eloNum > 0 && eloNum < 3200);
      const movetimeMs = WorkerBridge.movetimeFor(depth);
      const pvCount = Math.max(1, Math.min(5, Number(multipv) || 1));

      const request = {
        id: ++this.requestSerial,
        searchId: searchId,
        stage: stage,
        fen: fen,
        depth: depth,
        multipv: pvCount,
        movetime: stage >= 2 ? movetimeMs : null,
        lines: new Map(),
        startedAt: performance.now()
      };
      this.active = request;

      if (isHuman) {
        this.send('setoption name UCI_LimitStrength value true');
        const clampedElo = Math.max(1320, Math.min(3190, eloNum));
        this.send('setoption name UCI_Elo value ' + clampedElo);
        const skillLevel = Math.max(0, Math.min(20, Math.round((eloNum - 600) / 2400 * 20)));
        this.send('setoption name Skill Level value ' + skillLevel);
      } else {
        this.send('setoption name UCI_LimitStrength value false');
        this.send('setoption name Skill Level value 20');
      }

      this.send('setoption name MultiPV value ' + pvCount);
      this.send('position fen ' + fen);
      this.send(stage >= 2 ? ('go movetime ' + movetimeMs) : ('go depth 6'));
      return request;
    }

    cancel() {
      if (!this.active) return;
      this.send('stop');
      this.active = null;
    }

    handleCrash(error) {
      this.cleanup();
      if (this.options.onCrash) this.options.onCrash(error);
      if (!this.destroyed && !this.crashTimer) {
        this.crashTimer = window.setTimeout(() => {
          this.crashTimer = null;
          this.ensureReady().catch(() => {});
        }, 250);
      }
    }

    cleanup() {
      this.ready = false;
      this.active = null;
      if (this.port) {
        try {
          this.port.postMessage({ type: 'engine-terminate', sessionId: this.sessionId });
        } catch (ignored) {}
        try { this.port.disconnect(); } catch (ignored) {}
        this.port = null;
      }
    }

    terminate() {
      this.destroyed = true;
      if (this.crashTimer) window.clearTimeout(this.crashTimer);
      this.cancel();
      this.cleanup();
      this.booting = null;
    }
  }

  CS.WorkerBridge = WorkerBridge;
})();
