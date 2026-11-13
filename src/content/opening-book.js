/*
 * Chess-See Opening Book Manager.
 * Parses PGN repertoires (mainline + variations), normalizes positions, and provides instant book moves.
 */
(function () {
  'use strict';

  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const CS = root.ChessSee = root.ChessSee || {};

  const STARTER_REPERTOIRES = [
    {
      id: 'starter-italian',
      name: "White: Italian Game (1. e4)",
      color: 'white',
      isBuiltIn: true,
      active: true,
      pgn: `[Event "Italian Game"]
[White "Starter Repertoire"]
[Result "*"]

1. e4 e5 (1... c5 2. Nf3 d6 (2... Nc6 3. d4 cxd4 4. Nxd4) 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3) (1... e6 2. d4 d5 3. Nc3 Nf6 4. Bg5) (1... c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4) 2. Nf3 Nc6 (2... Nf6 3. Nxe5 d6 4. Nf3 Nxe4 5. d4) 3. Bc4 Bc5 (3... Nf6 4. d3 Bc5 5. c3 d6 6. O-O O-O) 4. c3 Nf6 5. d3 d6 6. O-O a6 7. a4 Ba7 8. Re1 O-O 9. h3 h6 *`
    },
    {
      id: 'starter-sicilian',
      name: "Black: Sicilian Defense (vs 1. e4)",
      color: 'black',
      isBuiltIn: true,
      active: true,
      pgn: `[Event "Sicilian Defense"]
[Black "Starter Repertoire"]
[Result "*"]

1. e4 c5 2. Nf3 d6 (2... Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6) (2... e6 3. d4 cxd4 4. Nxd4 a6 5. Nc3 Qc7) 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 (5... g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6) 6. Be3 e5 (6... e6 7. f3 b5 8. Qd2 Nbd7) 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 *`
    },
    {
      id: 'starter-queens-gambit',
      name: "White: Queen's Gambit (1. d4)",
      color: 'white',
      isBuiltIn: true,
      active: true,
      pgn: `[Event "Queen's Gambit"]
[White "Starter Repertoire"]
[Result "*"]

1. d4 d5 (1... Nf6 2. c4 e6 3. Nf3 d5 4. Nc3) (1... f5 2. c4 Nf6 3. g3) 2. c4 e6 (2... c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4) (2... dxc4 3. Nf3 Nf6 4. e3 e6 5. Bxc4) 3. Nc3 Nf6 (3... c6 4. e4) 4. cxd5 exd5 5. Bg5 Be7 6. e3 c6 7. Bd3 Nbd7 8. Qc2 O-O 9. Nf3 Re8 10. O-O Nf8 *`
    }
  ];

  function normalizeFenKey(fen) {
    if (!fen) return '';
    // Normalize position key to first 3 fields: board, turn, castling
    const parts = fen.trim().split(/\s+/);
    return parts.slice(0, 3).join(' ');
  }

  function parseMultiGamePgn(pgnText, moveMap, defaultName, repColor) {
    const ChessCtor = root.Chess;
    if (typeof ChessCtor !== 'function' || !pgnText) return;

    // Split games if multiple exist
    const gameBlocks = pgnText.split(/(?=\[Event\s)/i);

    gameBlocks.forEach((gameText) => {
      if (!gameText.trim()) return;

      let eventName = defaultName;
      const eventMatch = gameText.match(/\[Event\s+["']([^"']+)["']\]/i);
      if (eventMatch && eventMatch[1]) eventName = eventMatch[1];

      // Strip headers and comments
      let text = gameText.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ');
      const tokens = text
        .replace(/\(/g, ' ( ')
        .replace(/\)/g, ' ) ')
        .split(/\s+/)
        .filter((t) => t.length > 0);

      let currentGame = new ChessCtor();
      let fenStack = [currentGame.fen()];
      let branchStack = [];

      for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];

        if (token === '(') {
          const branchFen = fenStack.length >= 2 ? fenStack[fenStack.length - 2] : fenStack[0];
          branchStack.push({ fenStack: fenStack.slice(), gameFen: currentGame.fen() });
          currentGame = new ChessCtor(branchFen);
          fenStack = [branchFen];
          continue;
        }

        if (token === ')') {
          if (branchStack.length > 0) {
            const restored = branchStack.pop();
            currentGame = new ChessCtor(restored.gameFen);
            fenStack = restored.fenStack;
          }
          continue;
        }

        // Ignore termination, NAGs, move numbers
        if (/^(1-0|0-1|1\/2-1\/2|\*|\$\d+)$/.test(token)) continue;
        if (/^\d+\.+$/.test(token)) continue;

        const san = token.replace(/^\d+\.+/, '').replace(/[!?+#]+$/, '').trim();
        if (!san) continue;

        const fenBefore = currentGame.fen();
        const fenKey = normalizeFenKey(fenBefore);
        let moveObj = null;
        try {
          moveObj = currentGame.move(san, { sloppy: true });
        } catch (e) {
          moveObj = null;
        }

        if (moveObj) {
          const uci = moveObj.from + moveObj.to + (moveObj.promotion || '');
          if (!moveMap[fenKey]) moveMap[fenKey] = [];

          let existing = moveMap[fenKey].find((m) => m.uci === uci);
          if (!existing) {
            existing = {
              san: moveObj.san,
              uci: uci,
              from: moveObj.from,
              to: moveObj.to,
              color: moveObj.color,
              forWhite: repColor === 'white' || repColor === 'both',
              forBlack: repColor === 'black' || repColor === 'both',
              openingName: eventName || '',
              count: 1
            };
            moveMap[fenKey].push(existing);
          } else {
            existing.count += 1;
            if (repColor === 'white' || repColor === 'both') existing.forWhite = true;
            if (repColor === 'black' || repColor === 'both') existing.forBlack = true;
            if (!existing.openingName && eventName) existing.openingName = eventName;
          }
          fenStack.push(currentGame.fen());
        }
      }
    });
  }

  class OpeningBook {
    constructor() {
      this.repertoires = [];
      this.lookupTable = {};
      this.enabled = true;
      this.loaded = false;
    }

    async init() {
      if (this.loaded) return;
      await this.loadFromStorage();
      this.buildLookupTable();
      this.loaded = true;
    }

    async loadFromStorage() {
      const result = await new Promise((resolve) => {
        try {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['openingRepertoires', 'openingBookEnabled'], resolve);
          } else {
            resolve({});
          }
        } catch (e) {
          resolve({});
        }
      });

      if (result && Array.isArray(result.openingRepertoires) && result.openingRepertoires.length > 0) {
        this.repertoires = result.openingRepertoires;
      } else {
        this.repertoires = STARTER_REPERTOIRES.map((r) => Object.assign({}, r));
        this.saveToStorage();
      }

      if (typeof result.openingBookEnabled === 'boolean') {
        this.enabled = result.openingBookEnabled;
      }
    }

    async saveToStorage() {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await new Promise((resolve) => {
            chrome.storage.local.set({
              openingRepertoires: this.repertoires,
              openingBookEnabled: this.enabled
            }, resolve);
          });
        }
      } catch (e) {
        /* storage unavailable */
      }
    }

    buildLookupTable() {
      const newTable = {};
      this.repertoires.forEach((rep) => {
        if (!rep.active || !rep.pgn) return;
        try {
          parseMultiGamePgn(rep.pgn, newTable, rep.name, rep.color);
        } catch (error) {
          /* ignore malformed PGN */
        }
      });

      // Sort moves at each FEN by count (most popular lines first)
      Object.keys(newTable).forEach((key) => {
        newTable[key].sort((a, b) => b.count - a.count);
      });

      this.lookupTable = newTable;
    }

    findBookMoves(fen, myTurnColor) {
      if (!this.enabled || !fen) return [];
      const key = normalizeFenKey(fen);
      const moves = this.lookupTable[key] || [];
      if (!moves.length) return [];

      if (myTurnColor) {
        return moves.filter((m) => {
          if (m.color !== myTurnColor) return false;
          return myTurnColor === 'w' ? !!m.forWhite : !!m.forBlack;
        });
      }
      return moves;
    }

    addRepertoire(name, color, pgnText) {
      const id = 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const rep = {
        id: id,
        name: name || ('Custom Repertoire ' + (this.repertoires.length + 1)),
        color: color || 'white',
        isBuiltIn: false,
        active: true,
        pgn: pgnText || ''
      };
      this.repertoires.push(rep);
      this.buildLookupTable();
      this.saveToStorage();
      return rep;
    }

    updateRepertoire(id, updates) {
      const rep = this.repertoires.find((r) => r.id === id);
      if (!rep) return null;
      Object.assign(rep, updates);
      this.buildLookupTable();
      this.saveToStorage();
      return rep;
    }

    removeRepertoire(id) {
      this.repertoires = this.repertoires.filter((r) => r.id !== id);
      this.buildLookupTable();
      this.saveToStorage();
    }

    toggleRepertoireActive(id, active) {
      const rep = this.repertoires.find((r) => r.id === id);
      if (rep) {
        rep.active = typeof active === 'boolean' ? active : !rep.active;
        this.buildLookupTable();
        this.saveToStorage();
      }
    }

    toggleMaster(enabled) {
      this.enabled = typeof enabled === 'boolean' ? enabled : !this.enabled;
      this.saveToStorage();
    }

    getRepertoires() {
      return this.repertoires.slice();
    }
  }

  CS.OpeningBook = OpeningBook;
  CS.openingBook = new OpeningBook();
})();
