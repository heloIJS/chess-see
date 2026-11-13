(function () {
  'use strict';
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const CS = root.ChessSee = root.ChessSee || {};

  class HUD {
    constructor(options) {
      this.options = options || {};
      this.mount = this.options.mount;
      this.panel = null;
      this.toast = null;
      this.fenInput = null;
      this.hideTimer = null;
    }

    mountPanel() {
      if (!this.mount || this.panel) return;
      this.panel = document.createElement('section');
      this.panel.className = 'cs-panel';
      this.panel.hidden = true;
      this.panel.setAttribute('aria-label', 'Chess-See settings');
      this.panel.innerHTML = '<div class="cs-row"><h2>Chess-See</h2><button type="button" data-action="close" aria-label="Close settings">×</button></div>' +
        '<label><input data-key="openingBook" type="checkbox"><strong>Opening Book (Repertoire)</strong></label>' +
        '<div class="cs-book-status" data-book-status>📖 Opening Book: Enabled</div>' +
        '<label><input data-key="humanizer" type="checkbox"><strong>Humanizer mode</strong></label>' +
        '<label>Elo rating <strong data-value="eloLabel"></strong><input data-key="elo" type="range" min="800" max="3200" step="50"></label>' +
        '<label>Miss chance <strong data-value="missChance"></strong><input data-key="missChance" type="range" min="0" max="100" step="5"></label>' +
        '<label>Mistake chance <strong data-value="mistakeChance"></strong><input data-key="mistakeChance" type="range" min="0" max="100" step="5"></label>' +
        '<label>Blunder chance <strong data-value="blunderChance"></strong><input data-key="blunderChance" type="range" min="0" max="100" step="5"></label>' +
        '<label>Brilliant (Brillante) chance <strong data-value="brilliantChance"></strong><input data-key="brilliantChance" type="range" min="0" max="100" step="5"></label>' +
        '<label>Choose brilliant move <select data-key="brilliantTarget"><option value="auto">Auto (Sacrifice / Best)</option><option value="best">Best move (#1)</option><option value="sacrifice">Piece sacrifice</option><option value="line2">2nd best move (#2)</option><option value="line3">3rd best move (#3)</option></select></label>' +
        '<div class="cs-brilliant-buttons"><button type="button" data-action="set-brilliant-target" data-target="auto">Auto</button><button type="button" data-action="set-brilliant-target" data-target="best">#1 Best</button><button type="button" data-action="set-brilliant-target" data-target="sacrifice">Sacrifice</button><button type="button" data-action="set-brilliant-target" data-target="line2">#2 Alt</button><button type="button" data-action="set-brilliant-target" data-target="line3">#3 Alt</button></div>' +
        '<div class="cs-candidate-moves" data-candidates hidden></div>' +
        '<label>Style <select data-key="humanizerStyle"><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option><option value="defensive">Defensive</option><option value="tricky">Tricky</option></select></label>' +
        '<label>Think delay <strong data-value="humanizerDelay"></strong><input data-key="humanizerDelay" type="range" min="0" max="2000" step="100"></label>' +
        '<label>Alternative arrows <strong data-value="arrowCountLabel"></strong><input data-key="arrowCount" type="range" min="1" max="3" step="1"></label>' +
        '<label>Depth <strong data-value="depth"></strong><input data-key="depth" type="range" min="12" max="24" step="6"></label>' +
        '<label><input data-key="onlyOnMyTurn" type="checkbox">Only show on my turn</label>' +
        '<label><input data-key="analyzeOpponent" type="checkbox">Analyze opponent turn</label>' +
        '<label><input data-key="showEval" type="checkbox">Show evaluation chip</label>' +
        '<label><input data-key="subtle" type="checkbox">Subtle mode</label>' +
        '<label><input data-key="debugGrid" type="checkbox">Board-offset debug grid</label>' +
        '<div class="cs-row"><button type="button" data-action="copy-fen">Copy FEN</button><button type="button" data-action="open-options">More options</button></div>' +
        '<input class="cs-fen" data-fen readonly aria-label="Current FEN">';
      this.mount.appendChild(this.panel);
      this.fenInput = this.panel.querySelector('[data-fen]');
      this.toast = document.createElement('span');
      this.toast.className = 'cs-toast';
      this.toast.setAttribute('role', 'status');
      this.mount.appendChild(this.toast);
      this.panel.addEventListener('click', this.handleClick.bind(this));
      this.panel.addEventListener('input', this.handleInput.bind(this));
      this.panel.addEventListener('change', this.handleInput.bind(this));
      this.sync();
    }

    settings() { return this.options.getSettings ? this.options.getSettings() : {}; }

    sync() {
      if (!this.panel) return;
      const settings = this.settings();
      const bookCheckbox = this.panel.querySelector('[data-key="openingBook"]');
      if (bookCheckbox && CS.openingBook) {
        bookCheckbox.checked = CS.openingBook.enabled;
      }
      const statusNode = this.panel.querySelector('[data-book-status]');
      if (statusNode && CS.openingBook) {
        statusNode.textContent = CS.openingBook.enabled ? '📖 Opening Book: Enabled' : 'Opening Book: Disabled';
      }

      this.panel.querySelectorAll('[data-key]').forEach((node) => {
        const key = node.getAttribute('data-key');
        const value = settings[key];
        if (node.type === 'checkbox') node.checked = !!value;
        else node.value = String(value == null ? '' : value);
      });
      function getEloDesc(elo) {
        if (!elo || elo >= 3200) return 'Max (Stockfish)';
        if (elo < 1000) return elo + ' (Beginner)';
        if (elo < 1300) return elo + ' (Casual)';
        if (elo < 1600) return elo + ' (Intermediate)';
        if (elo < 1900) return elo + ' (Club)';
        if (elo < 2200) return elo + ' (Expert)';
        if (elo < 2600) return elo + ' (Master)';
        return elo + ' (Grandmaster)';
      }

      const curTarget = settings.brilliantTarget || 'auto';
      this.panel.querySelectorAll('[data-action="set-brilliant-target"]').forEach((btn) => {
        const t = btn.getAttribute('data-target');
        btn.classList.toggle('cs-btn-active', t === curTarget);
      });

      this.panel.querySelectorAll('[data-value]').forEach((node) => {
        const key = node.getAttribute('data-value');
        if (key === 'eloLabel') {
          node.textContent = getEloDesc(Number(settings.elo));
          return;
        }
        if (key === 'arrowCountLabel') {
          const count = Number(settings.arrowCount) || 1;
          node.textContent = count === 1 ? '1 (Best only)' : (count === 2 ? '2 (Best + 1 Alt)' : '3 (Best + 2 Alts)');
          return;
        }
        if (key === 'missChance' || key === 'mistakeChance' || key === 'blunderChance' || key === 'brilliantChance') {
          node.textContent = (Number(settings[key]) || 0) + '%';
          return;
        }
        if (key === 'humanizerDelay') {
          node.textContent = (Number(settings[key]) || 0) + ' ms';
          return;
        }
        node.textContent = String(settings[key] == null ? '' : settings[key]);
      });
    }

    handleClick(event) {
      const action = event.target && event.target.getAttribute('data-action');
      if (!action) return;
      if (action === 'close') this.close();
      if (action === 'copy-fen') this.copyFen();
      if (action === 'set-brilliant-target') {
        const target = event.target.getAttribute('data-target');
        if (target && this.options.onSetting) {
          if ((Number(this.settings().brilliantChance) || 0) === 0) {
            this.options.onSetting('brilliantChance', 100);
          }
          this.options.onSetting('brilliantTarget', target);
          const labels = { auto: 'Auto (Sacrifice / Best)', best: 'Best move (#1)', sacrifice: 'Piece sacrifice', line2: '2nd best (#2)', line3: '3rd best (#3)' };
          this.notify('Brilliant: ' + (labels[target] || target));
          this.sync();
        }
      }
      if (action === 'choose-line-brilliant') {
        const move = event.target.getAttribute('data-move');
        const index = Number(event.target.getAttribute('data-index'));
        if (this.options.onSetting) {
          if ((Number(this.settings().brilliantChance) || 0) === 0) {
            this.options.onSetting('brilliantChance', 100);
          }
          const target = index === 0 ? 'best' : (index === 1 ? 'line2' : 'line3');
          this.options.onSetting('brilliantTarget', move || target);
          this.notify('Brilliant: ' + (move || target) + ' !!');
          this.sync();
        }
      }
      if (action === 'open-options') {
        try {
          const response = chrome.runtime.sendMessage({ type: 'open-options' }, () => void chrome.runtime.lastError);
          if (response && typeof response.catch === 'function') response.catch(() => {});
        } catch (error) {
          this.notify('Options unavailable');
        }
      }
    }

    handleInput(event) {
      const node = event.target;
      const key = node && node.getAttribute('data-key');
      if (!key) return;
      if (key === 'openingBook' && CS.openingBook) {
        CS.openingBook.toggleMaster(node.checked);
        this.notify('Opening Book: ' + (node.checked ? 'Enabled' : 'Disabled'));
        if (this.options.onSetting) this.options.onSetting('openingBook', node.checked);
        this.sync();
        return;
      }
      if (!this.options.onSetting) return;
      let value;
      if (node.type === 'checkbox') value = node.checked;
      else if (node.tagName === 'SELECT') value = node.value;
      else value = Number(node.value);
      this.options.onSetting(key, value);
      this.sync();
    }

    async copyFen() {
      const fen = this.options.getFen ? this.options.getFen() : '';
      try {
        await navigator.clipboard.writeText(fen);
        this.notify('FEN copied');
      } catch (error) {
        this.fenInput.focus();
        this.fenInput.select();
        this.notify('Select FEN and copy');
      }
    }

    updateLines(lines) {
      if (!this.panel) return;
      const mount = this.panel.querySelector('[data-candidates]');
      if (!mount) return;
      if (!lines || !lines.length) {
        mount.replaceChildren();
        mount.hidden = true;
        return;
      }
      mount.hidden = false;
      mount.replaceChildren();
      const title = document.createElement('div');
      title.className = 'cs-candidates-title';
      title.textContent = 'Active moves (choose which is brilliant):';
      mount.appendChild(title);
      const list = document.createElement('div');
      list.className = 'cs-candidates-list';
      lines.slice(0, 3).forEach((line, idx) => {
        if (!line || !line.pv || !line.pv[0]) return;
        const moveUci = line.pv[0];
        const row = document.createElement('div');
        row.className = 'cs-candidate-row';
        if (line.brilliant) row.classList.add('cs-candidate-brilliant');
        const label = document.createElement('span');
        label.textContent = '#' + (idx + 1) + ' ' + moveUci;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-action', 'choose-line-brilliant');
        btn.setAttribute('data-move', moveUci);
        btn.setAttribute('data-index', String(idx));
        btn.textContent = line.brilliant ? '!! Active' : 'Make !!';
        if (line.brilliant) btn.classList.add('cs-btn-active');
        row.appendChild(label);
        row.appendChild(btn);
        list.appendChild(row);
      });
      mount.appendChild(list);
    }
    updateFen(fen) { if (this.fenInput) this.fenInput.value = fen || ''; }
    open() { if (!this.panel) this.mountPanel(); this.panel.hidden = false; this.sync(); }
    close() { if (this.panel) this.panel.hidden = true; if (this.options.onClose) this.options.onClose(); }
    toggle() { if (!this.panel || this.panel.hidden) this.open(); else this.close(); }
    notify(message) {
      if (!this.toast) return;
      this.toast.textContent = message;
      this.toast.classList.add('cs-on');
      if (this.hideTimer) window.clearTimeout(this.hideTimer);
      this.hideTimer = window.setTimeout(() => this.toast.classList.remove('cs-on'), 1500);
    }
    destroy() { if (this.hideTimer) window.clearTimeout(this.hideTimer); if (this.panel) this.panel.remove(); if (this.toast) this.toast.remove(); this.panel = this.toast = null; }
  }
  CS.HUD = HUD;
})();
