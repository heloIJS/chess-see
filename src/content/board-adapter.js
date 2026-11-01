/*
 * Chess.com board adapter.
 *
 * FRAGILE-SELECTOR ZONE
 * Chess.com changes its markup without notice. Everything that depends on
 * their class names lives in SELECTORS and the small extraction methods below.
 * See README.md, "The fragile-selector patch point".
 */
(function () {
  'use strict';

  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const CS = root.ChessSee = root.ChessSee || {};
  const FB = CS.FenBuilder;

  const SELECTORS = Object.freeze({
    board: [
      'cg-board',
      '.cg-wrap',
      'wc-chess-board.board',
      'wc-chess-board',
      'chess-board',
      '.board.board',
      '.board',
      '#chessboard'
    ],
    moveList: [
      'i5d',
      '.analyse__moves',
      '.moves',
      '.move-list',
      'l4x',
      'rmoves',
      'app',
      'wc-simple-move-list',
      'wc-move-list',
      'wc-vertical-move-list',
      'vertical-move-list',
      '.vertical-move-list',
      '.main-line',
      '.move-list-container'
    ],
    moveNodes: [
      'z7yx',
      'san',
      'move',
      '.main-line-row .node',
      '.move-list-row .node',
      '.node[data-ply]',
      '[data-ply].node',
      '[data-ply]',
      '.node'
    ],
    sanText: [
      'san',
      '.node-highlight-content',
      '.node-san',
      '.san',
      '.move-text',
      '.move-san',
      '[data-san]'
    ],
    activeClock: [
      '.rclock.running',
      '.clock-player-turn',
      '[class*="clock-player-turn"]'
    ],
    bottomClock: [
      '.rclock-bottom',
      '.clock-bottom',
      '[class*="clock-bottom"]'
    ],
    clock: [
      '.rclock',
      '.clock-component',
      'wc-clock',
      '.clock'
    ],
    bottomPlayer: [
      '.ruser-bottom',
      '.analyse__player_strip.bottom',
      '.board-layout-player-bottom',
      '[class*="player-bottom"]',
      '.player-bottom'
    ]
  });

  function isVisible(element) {
    if (!element || !element.getClientRects) return false;
    if (!element.getClientRects().length) return false;
    try {
      const style = window.getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none';
    } catch (error) {
      return true;
    }
  }

  function firstVisible(selectors, scope) {
    const searchRoot = scope || document;
    let first = null;
    for (let i = 0; i < selectors.length; i += 1) {
      let nodes;
      try {
        nodes = searchRoot.querySelectorAll(selectors[i]);
      } catch (error) {
        continue;
      }
      for (let j = 0; j < nodes.length; j += 1) {
        if (!first) first = nodes[j];
        if (isVisible(nodes[j])) return nodes[j];
      }
    }
    return first;
  }

  function classColor(element) {
    if (!element || !element.classList) return null;
    const dataColor = element.getAttribute('data-color');
    if (dataColor === 'black') return 'b';
    if (dataColor === 'white') return 'w';
    if (element.classList.contains('clock-black') ||
        element.classList.contains('rclock-black') ||
        element.classList.contains('ruser-black') ||
        element.classList.contains('black')) return 'b';
    if (element.classList.contains('clock-white') ||
        element.classList.contains('rclock-white') ||
        element.classList.contains('ruser-white') ||
        element.classList.contains('white')) return 'w';
    return null;
  }

  function orderValue(node, fallback) {
    const ply = Number(node.getAttribute('data-ply'));
    if (Number.isFinite(ply) && ply > 0) return ply * 10;
    const nodeId = node.getAttribute('data-node') || '';
    const pair = nodeId.match(/^(\d+)-(\d+)$/);
    if (pair) return (Number(pair[1]) * 2 + Number(pair[2]) + 1) * 10;
    return fallback;
  }

  function readSanText(node) {
    if (!node) return null;
    const direct = node.getAttribute('data-san');
    if (direct) return direct;

    const tag = (node.tagName || '').toLowerCase();
    if (tag === 'z7yx' || tag === 'san' || tag === 'move') {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3 && child.textContent && child.textContent.trim()) {
          return child.textContent;
        }
      }
    }

    for (let i = 0; i < SELECTORS.sanText.length; i += 1) {
      let textNode = null;
      try {
        textNode = node.querySelector(SELECTORS.sanText[i]);
      } catch (error) {
        continue;
      }
      if (!textNode) continue;
      const dataSan = textNode.getAttribute('data-san');
      const value = dataSan || textNode.textContent;
      if (value && value.trim()) return value;
    }

    try {
      const clone = node.cloneNode(true);
      const junk = clone.querySelectorAll('.time, .eval, .node-eval, [class*="time"], [class*="eval"]');
      for (let j = 0; j < junk.length; j += 1) {
        junk[j].remove();
      }
      const text = clone.textContent;
      if (text && text.trim()) return text.trim();
    } catch (e) {
      if (node.textContent && node.textContent.trim()) return node.textContent.trim();
    }
    return null;
  }

  function readTurnFromHighlights(board) {
    if (!board) return null;
    let highlights = [];
    try {
      highlights = board.querySelectorAll('.highlight');
    } catch (e) {
      return null;
    }
    if (!highlights || !highlights.length) return null;
    for (let i = 0; i < highlights.length; i += 1) {
      const hl = highlights[i];
      const match = (hl.className || '').match(/square-([1-8])([1-8])/);
      if (!match) continue;
      const sqClass = 'square-' + match[1] + match[2];
      const piece = board.querySelector('.piece.' + sqClass);
      if (piece) {
        const pClass = piece.className || '';
        if (/\bw[pnbrqk]\b/.test(pClass)) return 'b';
        if (/\bb[pnbrqk]\b/.test(pClass)) return 'w';
      }
    }
    return null;
  }

  class BoardAdapter {
    constructor(options) {
      this.onPosition = options && options.onPosition ? options.onPosition : function () {};
      this.boardElement = null;
      this.moveListElement = null;
      this.boardObserver = null;
      this.moveListObserver = null;
      this.retryTimer = null;
      this.debounceTimer = null;
      this.lastKey = null;
      this.started = false;
      this.paused = false;
      this._onVisibility = this._handleVisibility.bind(this);
    }

    start() {
      if (this.started) return;
      this.started = true;
      document.addEventListener('visibilitychange', this._onVisibility, true);
      this.ensureAttached(true);
      this.retryTimer = window.setInterval(() => {
        this.ensureAttached(false);
      }, 900);
      this.schedule(0);
    }

    stop() {
      this.started = false;
      this.paused = false;
      if (this.boardObserver) this.boardObserver.disconnect();
      if (this.moveListObserver) this.moveListObserver.disconnect();
      this.boardObserver = null;
      this.moveListObserver = null;
      if (this.retryTimer) window.clearInterval(this.retryTimer);
      if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
      this.retryTimer = null;
      this.debounceTimer = null;
      document.removeEventListener('visibilitychange', this._onVisibility, true);
      this.boardElement = null;
      this.moveListElement = null;
      this.lastKey = null;
    }

    refresh() {
      this.schedule(0);
    }

    _handleVisibility() {
      this.paused = document.hidden;
      if (this.paused) {
        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
        return;
      }
      this.ensureAttached(false);
      this.schedule(0);
    }

    ensureAttached(force) {
      if (!this.started) return;
      const board = firstVisible(SELECTORS.board);
      const moveList = firstVisible(SELECTORS.moveList);

      if (board !== this.boardElement || force) {
        if (this.boardObserver) this.boardObserver.disconnect();
        this.boardElement = board || null;
        if (this.boardElement) {
          this.boardObserver = new MutationObserver(() => this.schedule());
          this.boardObserver.observe(this.boardElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class', 'flipped', 'orientation', 'data-orientation', 'data-flipped', 'style', 'transform', 'data-key']
          });
        }
      }

      if (moveList !== this.moveListElement || force) {
        if (this.moveListObserver) this.moveListObserver.disconnect();
        this.moveListElement = moveList || null;
        if (this.moveListElement) {
          this.moveListObserver = new MutationObserver(() => this.schedule());
          this.moveListObserver.observe(this.moveListElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class', 'data-ply', 'data-node', 'data-san']
          });
        }
      }
    }

    schedule(delay) {
      if (!this.started || this.paused || document.hidden) return;
      if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => {
        this.debounceTimer = null;
        this.emit();
      }, typeof delay === 'number' ? delay : 80);
    }

    emit() {
      if (!this.started || this.paused || document.hidden) return;
      const position = this.readPosition();
      const key = position
        ? position.fen + '|' + position.orientation + '|' + position.myColor
        : null;
      if (key === this.lastKey) return;
      this.lastKey = key;
      this.onPosition(position);
    }

    getBoardElement() {
      if (this.boardElement && this.boardElement.isConnected) return this.boardElement;
      this.boardElement = firstVisible(SELECTORS.board);
      return this.boardElement;
    }

    getMoveListElement() {
      if (this.moveListElement && this.moveListElement.isConnected) return this.moveListElement;
      this.moveListElement = firstVisible(SELECTORS.moveList);
      return this.moveListElement;
    }

    getOrientation() {
      const board = this.getBoardElement();
      if (!board) return 'w';

      let node = board;
      for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
        if (!node.classList) continue;
        if (node.classList.contains('flipped') ||
            node.classList.contains('orientation-black') ||
            node.getAttribute('data-flipped') === 'true' ||
            node.getAttribute('data-orientation') === 'black' ||
            node.getAttribute('orientation') === 'black' ||
            node.hasAttribute('flipped')) {
          return 'b';
        }
      }
      return 'w';
    }

    getUserColor() {
      const bottomClock = firstVisible(SELECTORS.bottomClock);
      const bottomColor = classColor(bottomClock);
      if (bottomColor) return bottomColor;

      const bottomPlayer = firstVisible(SELECTORS.bottomPlayer);
      if (bottomPlayer) {
        const playerColor = classColor(bottomPlayer);
        if (playerColor) return playerColor;
        if (bottomPlayer.classList.contains('white')) return 'w';
        if (bottomPlayer.classList.contains('black')) return 'b';
      }

      return this.getOrientation();
    }

    readTurnFromClock() {
      const active = firstVisible(SELECTORS.activeClock);
      if (active) {
        const color = classColor(active);
        if (color) return color;
        const bottom = active.closest ? active.closest('.clock-bottom, [class*="clock-bottom"]') : null;
        if (bottom) {
          const bottomColor = classColor(bottom);
          if (bottomColor) return bottomColor;
        }
      }

      const bottom = firstVisible(SELECTORS.bottomClock);
      if (bottom && bottom.classList && bottom.classList.contains('clock-player-turn')) {
        const bottomColor = classColor(bottom);
        if (bottomColor) return bottomColor;
      }
      return null;
    }

    readSanMoves() {
      const roots = [];
      const seenRoots = new Set();

      for (let i = 0; i < SELECTORS.moveList.length; i += 1) {
        let nodes;
        try {
          nodes = document.querySelectorAll(SELECTORS.moveList[i]);
        } catch (error) {
          continue;
        }
        for (let j = 0; j < nodes.length; j += 1) {
          if (!seenRoots.has(nodes[j])) {
            seenRoots.add(nodes[j]);
            roots.push(nodes[j]);
          }
        }
      }

      if (!roots.length) {
        const fallbackRoot = document.querySelector('.main-line-row');
        if (fallbackRoot && fallbackRoot.parentElement) roots.push(fallbackRoot.parentElement);
      }

      let best = null;
      for (let r = 0; r < roots.length; r += 1) {
        const candidate = this._candidateFromRoot(roots[r]);
        if (!candidate || !candidate.sans.length) continue;
        candidate.visible = isVisible(roots[r]);
        candidate.score = candidate.sans.length + (candidate.visible ? 100000 : 0);
        if (!best || candidate.score > best.score) best = candidate;
      }

      if (!best) return { sans: [], result: null, root: null, visible: false };
      return best;
    }

    _candidateFromRoot(moveListRoot) {
      let nodes = [];
      for (let i = 0; i < SELECTORS.moveNodes.length; i += 1) {
        const found = moveListRoot.querySelectorAll(SELECTORS.moveNodes[i]);
        if (found.length) {
          nodes = Array.prototype.slice.call(found);
          break;
        }
      }
      if (!nodes.length) return null;

      const indexed = nodes.map((node, index) => ({
        node: node,
        order: orderValue(node, index + 1)
      }));
      indexed.sort((a, b) => a.order - b.order);

      let limit = indexed.length;
      const currentIndex = indexed.findIndex((entry) =>
        entry.node.classList && entry.node.classList.contains('a1t'));
      if (currentIndex >= 0) limit = currentIndex + 1;

      const sans = [];
      const seenPly = new Set();
      for (let i = 0; i < limit; i += 1) {
        const entry = indexed[i];
        const ply = entry.node.getAttribute('data-ply');
        if (ply) {
          if (seenPly.has(ply)) continue;
          seenPly.add(ply);
        }

        const text = readSanText(entry.node);
        if (!text) continue;
        const san = FB.cleanSan(text);
        if (!san || FB.isResultToken(san)) continue;
        sans.push(san);
      }

      const result = FB.positionFromSan(sans);
      return {
        sans: sans,
        result: result,
        root: moveListRoot,
        visible: isVisible(moveListRoot),
        score: 0
      };
    }

    readFenInput() {
      const inputs = document.querySelectorAll('input.copyable, input.fen, input[data-fen]');
      for (let i = 0; i < inputs.length; i += 1) {
        const element = inputs[i];
        if (!element || element.classList.contains('cs-fen')) continue;
        const value = typeof element.value === 'string' ? element.value.trim() : '';
        if (value && FB.validateFen(value)) return value;
      }
      return null;
    }

    readPosition() {
      const board = this.getBoardElement();
      if (!board) return null;

      const orientation = this.getOrientation();
      const myColor = this.getUserColor();
      const fenInput = this.readFenInput();
      if (fenInput) {
        return this._positionFromParts(
          fenInput,
          fenInput.split(/\s+/)[1],
          orientation,
          myColor,
          'fen'
        );
      }

      const sanMoves = this.readSanMoves();

      if (sanMoves.result && sanMoves.result.ok) {
        return this._positionFromParts(
          sanMoves.result.fen,
          sanMoves.result.turn,
          orientation,
          myColor,
          'san'
        );
      }

      let turn = this.readTurnFromClock();
      if (!turn && sanMoves.sans && sanMoves.sans.length > 0) {
        turn = sanMoves.sans.length % 2 === 0 ? 'w' : 'b';
      }
      if (!turn) {
        turn = readTurnFromHighlights(board);
      }
      if (!turn) {
        turn = 'w';
      }

      const scanned = FB.boardToFen(board, turn, orientation);
      if (!scanned || !FB.validateFen(scanned.fen)) return null;

      return this._positionFromParts(
        scanned.fen,
        scanned.turn,
        orientation,
        myColor,
        'board'
      );
    }

    _positionFromParts(fen, turn, orientation, myColor, source) {
      if (!FB.validateFen(fen)) return null;
      return {
        fen: fen,
        turn: turn === 'b' ? 'b' : 'w',
        orientation: orientation === 'b' ? 'b' : 'w',
        myColor: myColor === 'b' ? 'b' : 'w',
        myTurn: (turn === 'b' ? 'b' : 'w') === (myColor === 'b' ? 'b' : 'w'),
        source: source,
        fullmove: Number(fen.split(' ')[5]) || 1
      };
    }

    getOverlayGeometry() {
      const board = this.getBoardElement();
      if (!board) return null;
      const rect = board.getBoundingClientRect();
      if (!rect || rect.width < 80 || rect.height < 80) return null;
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        orientation: this.getOrientation()
      };
    }
  }

  CS.BoardAdapter = BoardAdapter;
  CS.BoardAdapter.SELECTORS = SELECTORS;
})();
