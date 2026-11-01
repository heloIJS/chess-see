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
        '<label><input data-key="humanizer" type="checkbox"><strong>Humanizer mode</strong></label>' +
        '<label>Elo rating <strong data-value="eloLabel"></strong><input data-key="elo" type="range" min="800" max="3200" step="50"></label>' +
        '<label>Miss chance <strong data-value="missChance"></strong><input data-key="missChance" type="range" min="0" max="100" step="5"></label>' +
        '<label>Mistake chance <strong data-value="mistakeChance"></strong><input data-key="mistakeChance" type="range" min="0" max="100" step="5"></label>' +
        '<label>Blunder chance <strong data-value="blunderChance"></strong><input data-key="blunderChance" type="range" min="0" max="100" step="5"></label>' +
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
        if (key === 'missChance' || key === 'mistakeChance' || key === 'blunderChance') {
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
      if (!key || !this.options.onSetting) return;
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
