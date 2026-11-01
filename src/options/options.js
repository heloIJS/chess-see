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

  const controls = {};
  const outputs = {};
  let loaded = false;
  let suppressWrite = true;

  function calculateValue(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'range' || input.type === 'number') return Number(input.value);
    if (input.tagName === 'SELECT') return isNaN(Number(input.value)) ? input.value : Number(input.value);
    return input.value;
  }

  function updateControl(key, value) {
    const input = controls[key];
    if (!input) return;
    if (input.type === 'checkbox') input.checked = !!value;
    else input.value = value == null ? '' : String(value);
    updateOutput(key);
  }

  function updateOutput(key) {
    const input = controls[key];
    const output = outputs[key];
    if (!input || !output) return;
    if (key === 'elo') {
      const value = Number(input.value) || 1500;
      if (value >= 3200) {
        output.textContent = '3200 (Max / Full Strength)';
      } else if (value < 1000) {
        output.textContent = value + ' (Beginner)';
      } else if (value < 1300) {
        output.textContent = value + ' (Casual)';
      } else if (value < 1600) {
        output.textContent = value + ' (Intermediate)';
      } else if (value < 1900) {
        output.textContent = value + ' (Club)';
      } else if (value < 2200) {
        output.textContent = value + ' (Expert)';
      } else if (value < 2600) {
        output.textContent = value + ' (Master)';
      } else {
        output.textContent = value + ' (Grandmaster)';
      }
      return;
    }
    if (key === 'arrowCount') {
      const value = Number(input.value) || 1;
      output.textContent = value === 1 ? '1 (Best only)' : (value === 2 ? '2 (Best + 1 Alt)' : '3 (Best + 2 Alts)');
      return;
    }
    if (key === 'missChance' || key === 'mistakeChance' || key === 'blunderChance') {
      output.textContent = (Number(input.value) || 0) + '%';
      return;
    }
    if (key === 'humanizerDelay') {
      output.textContent = (Number(input.value) || 0) + ' ms';
      return;
    }
    output.textContent = input.type === 'checkbox' ? '' : String(input.value);
  }

  function updateOutputs() {
    Object.keys(controls).forEach(updateOutput);
  }

  function apply(settings) {
    const merged = Object.assign({}, DEFAULTS, settings || {});
    Object.keys(controls).forEach((key) => {
      updateControl(key, merged[key]);
    });
    updateOutputs();
  }

  function save(event) {
    if (!loaded || suppressWrite || !event || !event.target) return;
    const input = event.target;
    if (!controls[input.id]) return;
    chrome.storage.sync.set({ [input.id]: calculateValue(input) }, () => void chrome.runtime.lastError);
  }

  document.querySelectorAll('input[id], select[id]').forEach((input) => {
    const key = input.id;
    controls[key] = input;
    input.addEventListener('input', (event) => {
      if (input.type === 'range') updateOutput(key);
      save(event);
    });
    input.addEventListener('change', (event) => {
      if (input.tagName === 'SELECT') updateOutput(key);
      save(event);
    });
  });

  document.querySelectorAll('[data-out]').forEach((output) => {
    outputs[output.getAttribute('data-out')] = output;
  });

  document.getElementById('reset').addEventListener('click', () => {
    const request = Object.assign({}, DEFAULTS);
    chrome.storage.sync.set(request, () => {
      if (chrome.runtime.lastError) return;
      apply(request);
      updateOutputs();
    });
  });

  chrome.storage.sync.get(DEFAULTS, (settings) => {
    apply(settings);
    loaded = true;
    suppressWrite = false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || suppressWrite) return;
    const next = {};
    Object.keys(changes).forEach((key) => {
      next[key] = changes[key].newValue;
    });
    apply(Object.assign({}, DEFAULTS, next));
  });
})();
