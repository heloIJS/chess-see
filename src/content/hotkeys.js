(function () {
  'use strict';

  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const CS = root.ChessSee = root.ChessSee || {};

  class Hotkeys {
    constructor(controller) {
      this.controller = controller;
      this.handle = this.handle.bind(this);
    }

    start() {
      document.addEventListener('keydown', this.handle, true);
    }

    stop() {
      document.removeEventListener('keydown', this.handle, true);
    }

    handle(event) {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target && target.nodeType === 1 &&
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) &&
          target.getAttribute('data-chess-see-input') !== 'range') {
        return;
      }

      const code = String(event.code || '');
      const actionMap = {
        KeyA: 'toggleMaster',
        KeyF: 'cycleFade',
        KeyN: 'cycleArrows',
        KeyD: 'cycleDepth',
        KeyL: 'cycleElo',
        KeyH: 'toggleHumanizer',
        KeyE: 'toggleEval',
        KeyS: 'toggleSettings'
      };
      const action = actionMap[code];
      if (!action || !this.controller || typeof this.controller[action] !== 'function') return;

      event.preventDefault();
      event.stopPropagation();
      try {
        this.controller[action]();
      } catch (error) {
        /* Hotkeys must never throw into the host page. */
      }
    }
  }

  CS.Hotkeys = Hotkeys;
})();
