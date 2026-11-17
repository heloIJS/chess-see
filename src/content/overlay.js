/* Chess-See shadow-root HUD renderer. */
(function () {
  'use strict';

  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const CS = root.ChessSee = root.ChessSee || {};
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const FILES = 'abcdefgh';
  const COLORS = ['#22c55e', '#3b82f6', '#f59e0b'];
  const BRILLIANT_COLOR = '#1baaa0';
  const BOOK_COLOR = '#8b5cf6';
  const DEFAULTS = {
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
    brilliantChance: 0,
    brilliantTarget: 'auto',
    humanizerStyle: 'balanced',
    humanizerDelay: 0,
    subtle: false,
    debugGrid: false,
    offsetX: 0,
    offsetY: 0
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || min));
  }

  function element(name) {
    return document.createElementNS(SVG_NS, name);
  }

  function textElement(value) {
    const node = element('text');
    node.textContent = value;
    return node;
  }

  class Overlay {
    constructor(options) {
      options = options || {};
      this.adapter = options.adapter;
      this.getSettings = options.getSettings || (() => DEFAULTS);
      this.onSetting = options.onSetting || (() => {});
      this.settings = Object.assign({}, DEFAULTS, this.getSettings());
      this.shadowHost = null;
      this.shadow = null;
      this.svg = null;
      this.defs = null;
      this.stageLayer = null;
      this.debugLayer = null;
      this.chip = null;
      this.hud = null;
      this.geometry = null;
      this.position = null;
      this.lastResult = null;
      this.clearTimer = null;
      this.layoutTimer = null;
      this.refreshTimer = null;
      this.resizeObserver = null;
      this.observedBoard = null;
      this.mounted = false;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this._resize = this.refresh.bind(this);
      this._scroll = this.refresh.bind(this);
      this._reducedMotionChange = this.refresh.bind(this);
    }

    mount() {
      if (this.mounted) return;
      this.mounted = true;
      this.shadowHost = document.createElement('span');
      this.shadowHost.setAttribute('aria-hidden', 'true');
      this.shadowHost.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none;display:block;';
      this.shadow = this.shadowHost.attachShadow({ mode: 'closed' });

      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = chrome.runtime.getURL('src/content/shadow.css');
      this.shadow.appendChild(css);

      const rootNode = document.createElement('span');
      rootNode.setAttribute('aria-hidden', 'true');
      rootNode.className = 'cs-root';
      rootNode.innerHTML = '<svg class="cs-svg" aria-hidden="true"><defs></defs><g class="cs-debug"></g><g class="cs-stages"></g></svg><span class="cs-eval" hidden></span><span class="cs-settings-mount"></span>';
      this.shadow.appendChild(rootNode);
      this.rootNode = rootNode;
      this.svg = rootNode.querySelector('.cs-svg');
      this.defs = rootNode.querySelector('defs');
      this.debugLayer = rootNode.querySelector('.cs-debug');
      this.stageLayer = rootNode.querySelector('.cs-stages');
      this.chip = rootNode.querySelector('.cs-eval');
      this.cssLink = css;

      const fab = document.createElement('button');
      fab.type = 'button';
      fab.className = 'cs-fab';
      fab.textContent = '⚙';
      fab.setAttribute('aria-label', 'Toggle Chess-See settings');
      fab.addEventListener('click', () => this.toggleSettings());
      rootNode.appendChild(fab);
      this.fab = fab;

      css.addEventListener('error', () => {
        this.notify('HUD stylesheet failed to load');
      }, { once: true });

      document.documentElement.appendChild(this.shadowHost);
      if (CS.HUD) {
        this.hud = new CS.HUD({
          mount: rootNode.querySelector('.cs-settings-mount'),
          getSettings: () => this.settings,
          onSetting: (key, value) => this.onSetting(key, value),
          getFen: () => this.position ? this.position.fen : ''
        });
        this.hud.mountPanel();
      }

      window.addEventListener('resize', this._resize, true);
      window.addEventListener('scroll', this._scroll, true);
      if (this.reducedMotion.addEventListener) this.reducedMotion.addEventListener('change', this._reducedMotionChange);
      this.layoutTimer = window.setInterval(this._resize, 700);
      this.refresh();
    }

    destroy() {
      if (!this.mounted) return;
      this.mounted = false;
      if (this.clearTimer) window.clearTimeout(this.clearTimer);
      if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
      if (this.layoutTimer) window.clearInterval(this.layoutTimer);
      if (this.resizeObserver) this.resizeObserver.disconnect();
      this.clearTimer = this.refreshTimer = this.layoutTimer = null;
      this.resizeObserver = null;
      window.removeEventListener('resize', this._resize, true);
      window.removeEventListener('scroll', this._scroll, true);
      if (this.reducedMotion.removeEventListener) this.reducedMotion.removeEventListener('change', this._reducedMotionChange);
      if (this.hud) this.hud.destroy();
      this.hud = null;
      if (this.shadowHost) this.shadowHost.remove();
      this.shadowHost = this.shadow = this.svg = this.rootNode = null;
      this.chip = this.fab = null;
    }

    updateSettings(settings) {
      this.settings = Object.assign({}, DEFAULTS, settings || {});
      if (!this.mounted) return;
      this.applyTheme();
      this.refresh(true);
    }

    setPosition(position) {
      this.position = position || null;
      if (this.hud) this.hud.updateFen(position ? position.fen : '');
      this.refresh();
    }

    setVisible(visible) {
      if (!this.rootNode) return;
      const mode = this.settings.fadeMode;
      const show = mode !== 'hidden' && (mode === 'always' || visible);
      this.rootNode.classList.toggle('cs-visible', !!show);
      this.rootNode.classList.toggle('cs-hidden', !show);
      this.rootNode.classList.toggle('cs-always', mode === 'always');
    }

    beginPosition(position, visible) {
      if (this.clearTimer) window.clearTimeout(this.clearTimer);
      this.clearTimer = null;
      this.setPosition(position);
      this.setVisible(visible);
      this.clearStage();
      this.lastResult = null;
      this.setEval(null);
    }

    scheduleFadeClear(delay) {
      if (this.clearTimer) window.clearTimeout(this.clearTimer);
      this.clearTimer = window.setTimeout(() => {
        this.clearTimer = null;
        this.clearStage();
        this.lastResult = null;
        this.setEval(null);
      }, typeof delay === 'number' ? delay : 220);
    }

    render(result, options) {
      if (!this.mounted) return;
      options = options || {};
      if (!result) return;
      this.lastResult = result;
      this.setEval(result);
      this.refresh();
      if (this.hud && typeof this.hud.updateLines === 'function') {
        this.hud.updateLines(result.lines || []);
      }
      if (!this.geometry) return;

      const lines = (result.lines || []).slice(0, this.settings.subtle ? 1 : clamp(this.settings.arrowCount, 1, 3));
      const previousStage = this.stageLayer.lastElementChild;
      const hadStage = !!previousStage;
      if (previousStage && (!options.instant && result.stage === 2)) {
        Array.from(this.stageLayer.children).forEach((child) => {
          if (child !== previousStage) child.remove();
        });
      } else {
        this.clearStage();
      }
      if (!lines.length || this.settings.fadeMode === 'hidden') {
        this.clearStage();
        return;
      }

      const group = element('g');
      group.setAttribute('class', 'cs-stage');
      group.style.opacity = hadStage && !options.instant ? '0' : '1';
      this.addMarkers();

      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (!line || !line.pv || !line.pv[0]) continue;
        const move = line.pv[0];
        const from = this.movePoint(move.slice(0, 2));
        const to = this.movePoint(move.slice(2, 4));
        if (!from || !to) continue;
        const isBook = !!line.book;
        const isBrilliant = !isBook && !!line.brilliant;
        const color = isBook ? BOOK_COLOR : (isBrilliant ? BRILLIANT_COLOR : (COLORS[index] || COLORS[0]));
        const width = index === 0 ? 10 : (index === 1 ? 6.5 : 5);
        const alpha = this.settings.subtle ? 0.4 : (index === 0 ? 0.85 : (index === 1 ? 0.72 : 0.6));
        const showBadge = (lines.length > 1) || isBrilliant || isBook;
        const rankText = isBook ? '📖' : (isBrilliant ? '!!' : String(index + 1));
        this.addArrow(group, from, to, color, width, alpha, index > 0 && !isBrilliant && !isBook, index === 0 || isBrilliant || isBook, rankText, showBadge, isBrilliant, isBook);
        if (index === 0 || isBrilliant || isBook) this.addOrigin(group, from, color);
      }

      const best = lines[0];
      if (best && best.pv && best.pv[0]) {
        const destination = this.movePoint(best.pv[0].slice(2, 4));
        if (destination) {
          const isBook = !!best.book;
          const ringColor = isBook ? BOOK_COLOR : (best.brilliant ? BRILLIANT_COLOR : COLORS[0]);
          this.addRing(group, destination, ringColor, best.brilliant, isBook);
        }
      }

      this.stageLayer.appendChild(group);
      if (hadStage && !options.instant) {
        window.requestAnimationFrame(() => {
          if (group.isConnected) group.style.opacity = '1';
          if (previousStage && previousStage !== group) previousStage.style.opacity = '0';
        });
        window.setTimeout(() => {
          if (previousStage && previousStage.parentNode === this.stageLayer) previousStage.remove();
        }, 220);
      }
    }

    clearStage() {
      if (this.stageLayer) this.stageLayer.replaceChildren();
      if (this.hud && typeof this.hud.updateLines === 'function') {
        this.hud.updateLines([]);
      }
    }

    refresh(force) {
      if (!this.mounted || !this.adapter) return;
      if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => {
        this.refreshTimer = null;
        const next = this.adapter.getOverlayGeometry();
        const key = next ? [next.left, next.top, next.width, next.height, next.orientation].join('|') : '';
        const changed = !this.geometry || key !== this.geometry.key;
        if (next) {
          next.key = key;
          next.left += Number(this.settings.offsetX) || 0;
          next.top += Number(this.settings.offsetY) || 0;
          this.geometry = next;
          this.svg.style.left = next.left + 'px';
          this.svg.style.top = next.top + 'px';
          this.svg.setAttribute('width', next.width);
          this.svg.setAttribute('height', next.height);
          this.svg.style.width = next.width + 'px';
          this.svg.style.height = next.height + 'px';
          this.observeBoard();
          this.applyTheme();
          this.drawDebug();
          this.positionChip();
          if (this.lastResult && (force || changed)) this.render(this.lastResult, { instant: true });
        } else {
          this.geometry = null;
          this.clearStage();
          this.setEval(null);
        }
      }, 0);
    }

    observeBoard() {
      const board = this.adapter.getBoardElement();
      if (!board || board === this.observedBoard || !window.ResizeObserver) return;
      if (this.resizeObserver) this.resizeObserver.disconnect();
      this.resizeObserver = new ResizeObserver(this._resize);
      this.resizeObserver.observe(board);
      this.observedBoard = board;
    }

    applyTheme() {
      if (!this.rootNode) return;
      const html = document.documentElement;
      const body = document.body;
      const values = [html && html.getAttribute('data-theme'), body && body.getAttribute('data-theme'), body && body.className, html && html.className].join(' ').toLowerCase();
      this.rootNode.classList.toggle('cs-dark', /dark|night/.test(values) && !/light/.test(values));
    }

    movePoint(square) {
      const parsed = CS.FenBuilder.squareToCoords(square);
      if (!parsed || !this.geometry) return null;
      const flipped = this.geometry.orientation === 'b';
      const file = flipped ? 7 - parsed.file : parsed.file;
      const rank = flipped ? parsed.rank - 1 : 8 - parsed.rank;
      const size = this.geometry.width / 8;
      return { x: file * size + size / 2, y: rank * size + size / 2, size: size };
    }

    addMarkers() {
      this.defs.replaceChildren();
      const filter = element('filter');
      filter.setAttribute('id', 'cs-blur');
      filter.setAttribute('x', '-50%'); filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%'); filter.setAttribute('height', '200%');
      const blur = element('feGaussianBlur');
      blur.setAttribute('stdDeviation', '4');
      filter.appendChild(blur);
      this.defs.appendChild(filter);
    }

    addArrow(group, from, to, color, width, alpha, dashed, glow, rankNumber, showRank, isBrilliant, isBook) {
      const size = from.size || this.geometry && this.geometry.width / 8 || 60;
      const early = Math.min(size * 0.16, 12);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy) || 1;
      const ux = dx / distance;
      const uy = dy / distance;
      const px = -uy;
      const py = ux;
      const headLength = Math.max(width * 2.6, size * 0.3);
      const halfHead = Math.max(width * 1.4, size * 0.17);
      const tip = { x: to.x - ux * early, y: to.y - uy * early };
      const base = { x: tip.x - ux * headLength, y: tip.y - uy * headLength };
      const one = { x: base.x + px * halfHead, y: base.y + py * halfHead };
      const two = { x: base.x - px * halfHead, y: base.y - py * halfHead };
      const shaftEnd = { x: base.x - ux * 4, y: base.y - uy * 4 };

      if (glow) {
        const halo = element('line');
        halo.setAttribute('x1', from.x); halo.setAttribute('y1', from.y);
        halo.setAttribute('x2', shaftEnd.x); halo.setAttribute('y2', shaftEnd.y);
        halo.setAttribute('stroke', color); halo.setAttribute('stroke-width', width * 2.4);
        halo.setAttribute('stroke-linecap', 'round');
        halo.setAttribute('opacity', '0.22');
        halo.setAttribute('filter', 'url(#cs-blur)');
        group.appendChild(halo);
      }

      const shaft = element('line');
      shaft.setAttribute('x1', from.x); shaft.setAttribute('y1', from.y);
      shaft.setAttribute('x2', shaftEnd.x); shaft.setAttribute('y2', shaftEnd.y);
      shaft.setAttribute('stroke', color); shaft.setAttribute('stroke-width', width);
      shaft.setAttribute('stroke-linecap', dashed ? 'butt' : 'round');
      shaft.setAttribute('opacity', alpha);
      if (dashed) shaft.setAttribute('stroke-dasharray', width >= 6 ? '7 4' : '5 4');
      group.appendChild(shaft);

      const head = element('polygon');
      head.setAttribute('points', [
        one.x.toFixed(2), one.y.toFixed(2),
        tip.x.toFixed(2), tip.y.toFixed(2),
        two.x.toFixed(2), two.y.toFixed(2)
      ].join(' '));
      head.setAttribute('fill', color);
      head.setAttribute('stroke', color);
      head.setAttribute('stroke-width', Math.max(1.2, width / 6));
      head.setAttribute('stroke-linejoin', 'round');
      head.setAttribute('opacity', alpha);
      group.appendChild(head);

      if (showRank && rankNumber) {
        const badgeRadius = Math.max(7, Math.min(10, size * 0.13));
        const badgeOffset = size * 0.22;
        const bx = from.x + ux * badgeOffset;
        const by = from.y + uy * badgeOffset;

        const circle = element('circle');
        circle.setAttribute('cx', bx);
        circle.setAttribute('cy', by);
        circle.setAttribute('r', badgeRadius);
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', '#0f172a');
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('opacity', '0.96');
        if (isBook) circle.setAttribute('class', 'cs-badge-book');
        else if (isBrilliant) circle.setAttribute('class', 'cs-badge-brilliant');
        group.appendChild(circle);

        const txt = textElement(String(rankNumber));
        txt.setAttribute('x', bx);
        txt.setAttribute('y', by + (rankNumber === '!!' ? 3.2 : 3.5));
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('fill', '#ffffff');
        txt.setAttribute('font-size', (rankNumber === '!!' || rankNumber === '📖') ? '11px' : '10px');
        txt.setAttribute('font-weight', 'bold');
        txt.setAttribute('font-family', 'ui-monospace, monospace, sans-serif');
        if (rankNumber === '!!') txt.setAttribute('letter-spacing', '-0.05em');
        txt.setAttribute('pointer-events', 'none');
        group.appendChild(txt);
      }
    }

    addOrigin(group, point, color) {
      const rect = element('rect');
      const size = point.size;
      rect.setAttribute('x', point.x - size / 2); rect.setAttribute('y', point.y - size / 2);
      rect.setAttribute('width', size); rect.setAttribute('height', size);
      rect.setAttribute('fill', color); rect.setAttribute('opacity', '0.18');
      group.insertBefore(rect, group.firstChild);
    }

    addRing(group, point, color, isBrilliant, isBook) {
      const ring = element('circle');
      ring.setAttribute('cx', point.x); ring.setAttribute('cy', point.y);
      ring.setAttribute('r', point.size * 0.42); ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', color); ring.setAttribute('stroke-width', (isBrilliant || isBook) ? '2.5' : '2');
      ring.setAttribute('class', 'cs-ring' + (isBrilliant ? ' cs-brilliant-ring' : '') + (isBook ? ' cs-book-ring' : ''));
      if (this.reducedMotion.matches) ring.classList.add('cs-static-ring');
      group.appendChild(ring);
    }

    setEval(result) {
      if (!this.chip) return;
      if (!result || !this.settings.showEval || this.settings.subtle || !result.score) {
        this.chip.hidden = true;
        return;
      }
      const formatted = CS.UCI.formatEval(result.score, result.turn || (this.position && this.position.turn) || 'w');
      if (!formatted) {
        this.chip.hidden = true;
        return;
      }
      this.chip.hidden = false;
      const eloNum = Number(this.settings.elo);
      const isHuman = (this.settings.humanizer !== false) && eloNum > 0 && eloNum < 3200;
      const isBook = !!(result && (result.book || (result.lines && result.lines[0] && result.lines[0].book)));
      const isBrilliant = !isBook && !!(result && (result.brilliant || (result.lines && result.lines[0] && result.lines[0].brilliant)));
      const brilliantTag = isBrilliant ? ' · !!' : '';
      const bookTag = isBook ? (' · 📖 ' + (result.openingName || 'Book')) : '';
      const eloTag = isHuman ? ' · ' + eloNum : '';
      this.chip.textContent = formatted.text + brilliantTag + bookTag + eloTag;
      this.chip.classList.toggle('cs-brilliant', isBrilliant);
      this.chip.classList.toggle('cs-book', isBook);
      this.chip.title = (isBook ? ('Opening Book: ' + (result.openingName || 'Repertoire') + ' · ') : '') +
                        (isBrilliant ? 'Brilliant move (!!) · ' : '') +
                        (isHuman ? ('Stockfish Humanizer: ' + eloNum + ' Elo') : 'Stockfish (Max strength)');
      this.chip.classList.remove('cs-positive', 'cs-negative', 'cs-neutral');
      this.chip.classList.add(formatted.className);
      this.positionChip();
    }

    positionChip() {
      if (!this.chip || !this.geometry) return;
      const clock = document.querySelector('.rclock-bottom, .clock-component.clock-bottom, .clock-bottom, [class*="clock-bottom"]');
      const clockSide = clock && clock.getBoundingClientRect().top < this.geometry.top + this.geometry.height / 2 ? 'top' : 'bottom';
      const margin = 8;
      const x = this.geometry.left + (this.geometry.width - 80) / 2;
      const y = clockSide === 'top' ? this.geometry.top + this.geometry.height - 36 : this.geometry.top + margin;
      this.chip.style.left = Math.max(this.geometry.left + margin, x) + 'px';
      this.chip.style.top = y + 'px';
    }

    drawDebug() {
      if (!this.debugLayer || !this.geometry) return;
      this.debugLayer.replaceChildren();
      if (!this.settings.debugGrid) return;
      const size = this.geometry.width / 8;
      const box = element('rect');
      box.setAttribute('x', '0'); box.setAttribute('y', '0');
      box.setAttribute('width', this.geometry.width); box.setAttribute('height', this.geometry.height);
      box.setAttribute('fill', 'none'); box.setAttribute('stroke', '#ef4444'); box.setAttribute('stroke-width', '1');
      this.debugLayer.appendChild(box);
      for (let i = 1; i < 8; i += 1) {
        const v = element('line');
        v.setAttribute('x1', i * size); v.setAttribute('x2', i * size); v.setAttribute('y1', '0'); v.setAttribute('y2', this.geometry.height);
        v.setAttribute('stroke', '#ef4444'); v.setAttribute('stroke-width', '0.5'); v.setAttribute('opacity', '0.7');
        this.debugLayer.appendChild(v);
        const h = element('line');
        h.setAttribute('x1', '0'); h.setAttribute('x2', this.geometry.width); h.setAttribute('y1', i * size); h.setAttribute('y2', i * size);
        h.setAttribute('stroke', '#ef4444'); h.setAttribute('stroke-width', '0.5'); h.setAttribute('opacity', '0.7');
        this.debugLayer.appendChild(h);
      }
      for (let i = 0; i < 8; i += 1) {
        const file = textElement(FILES[this.geometry.orientation === 'b' ? 7 - i : i]);
        file.setAttribute('x', i * size + 4); file.setAttribute('y', this.geometry.height - 4); file.setAttribute('class', 'cs-debug-label');
        this.debugLayer.appendChild(file);
        const rank = textElement(String(this.geometry.orientation === 'b' ? i + 1 : 8 - i));
        rank.setAttribute('x', '4'); rank.setAttribute('y', i * size + 13); rank.setAttribute('class', 'cs-debug-label');
        this.debugLayer.appendChild(rank);
      }
    }

    openSettings() { if (this.hud) this.hud.open(); }
    closeSettings() { if (this.hud) this.hud.close(); }
    toggleSettings() { if (this.hud) this.hud.toggle(); }
    notify(message) { if (this.hud) this.hud.notify(message); }
  }

  CS.Overlay = Overlay;
})();
