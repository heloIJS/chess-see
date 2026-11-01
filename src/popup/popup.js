(function () {
  'use strict';

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
    humanizerStyle: 'balanced',
    humanizerDelay: 0,
    subtle: false,
    debugGrid: false,
    offsetX: 0,
    offsetY: 0
  };

  const form = {
    enabled: document.getElementById('enabled'),
    humanizer: document.getElementById('humanizer'),
    subtle: document.getElementById('subtle'),
    showEval: document.getElementById('showEval'),
    arrowCount: document.getElementById('arrowCount'),
    depth: document.getElementById('depth'),
    elo: document.getElementById('elo'),
    missChance: document.getElementById('missChance'),
    mistakeChance: document.getElementById('mistakeChance'),
    blunderChance: document.getElementById('blunderChance'),
    humanizerStyle: document.getElementById('humanizerStyle'),
    humanizerDelay: document.getElementById('humanizerDelay')
  };
  const openOptions = document.getElementById('openOptions');

  function selectClosest(select, value) {
    if (!select) return;
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < select.options.length; i += 1) {
      const diff = Math.abs(Number(select.options[i].value) - value);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    select.selectedIndex = closestIdx;
  }

  function apply(settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    form.enabled.checked = !!s.enabled;
    if (form.humanizer) form.humanizer.checked = s.humanizer !== false;
    form.subtle.checked = !!s.subtle;
    form.showEval.checked = !!s.showEval;
    form.arrowCount.value = String(Math.max(1, Math.min(3, Number(s.arrowCount) || 1)));
    form.depth.value = String(s.depth);
    selectClosest(form.elo, Number(s.elo) || 1500);
    selectClosest(form.missChance, Number(s.missChance) || 0);
    selectClosest(form.mistakeChance, Number(s.mistakeChance) || 0);
    selectClosest(form.blunderChance, Number(s.blunderChance) || 0);
    selectClosest(form.humanizerDelay, Number(s.humanizerDelay) || 0);
    if (form.humanizerStyle) {
      form.humanizerStyle.value = String(s.humanizerStyle || 'balanced');
      if (!form.humanizerStyle.value) form.humanizerStyle.value = 'balanced';
    }
  }

  function load() {
    chrome.storage.sync.get(DEFAULTS, (settings) => apply(settings));
  }

  Object.keys(form).forEach((key) => {
    if (!form[key]) return;
    form[key].addEventListener('change', () => {
      const input = form[key];
      const value = input.type === 'checkbox'
        ? input.checked
        : (input.tagName === 'SELECT' && isNaN(Number(input.value)) ? input.value : Number(input.value));
      chrome.storage.sync.set({ [key]: value });
    });
  });

  openOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    load();
  });

  load();
})();
