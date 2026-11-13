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
    brilliantChance: 0,
    brilliantTarget: 'auto',
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
    if (key === 'missChance' || key === 'mistakeChance' || key === 'blunderChance' || key === 'brilliantChance') {
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
    if (input.closest('#openingRepertoiresSection')) return;
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

  // Opening Repertoires Management
  const openingBookEnabledInput = document.getElementById('openingBookEnabled');
  const pgnFileInput = document.getElementById('pgnFileInput');
  const pgnTextInput = document.getElementById('pgnTextInput');
  const newRepNameInput = document.getElementById('newRepName');
  const newRepColorSelect = document.getElementById('newRepColor');
  const btnAddRepertoire = document.getElementById('btnAddRepertoire');
  const repertoireList = document.getElementById('repertoireList');

  const DEFAULT_STARTERS = [
    {
      id: 'starter-italian',
      name: "White: Italian Game (1. e4)",
      color: 'white',
      isBuiltIn: true,
      active: true,
      pgn: '[Event "Italian Game"]\n[White "Starter Repertoire"]\n[Result "*"]\n\n1. e4 e5 (1... c5 2. Nf3 d6 (2... Nc6 3. d4 cxd4 4. Nxd4) 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3) (1... e6 2. d4 d5 3. Nc3 Nf6 4. Bg5) (1... c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4) 2. Nf3 Nc6 (2... Nf6 3. Nxe5 d6 4. Nf3 Nxe4 5. d4) 3. Bc4 Bc5 (3... Nf6 4. d3 Bc5 5. c3 d6 6. O-O O-O) 4. c3 Nf6 5. d3 d6 6. O-O a6 7. a4 Ba7 8. Re1 O-O 9. h3 h6 *'
    },
    {
      id: 'starter-sicilian',
      name: "Black: Sicilian Defense (vs 1. e4)",
      color: 'black',
      isBuiltIn: true,
      active: true,
      pgn: '[Event "Sicilian Defense"]\n[Black "Starter Repertoire"]\n[Result "*"]\n\n1. e4 c5 2. Nf3 d6 (2... Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6) (2... e6 3. d4 cxd4 4. Nxd4 a6 5. Nc3 Qc7) 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 (5... g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6) 6. Be3 e5 (6... e6 7. f3 b5 8. Qd2 Nbd7) 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 *'
    },
    {
      id: 'starter-queens-gambit',
      name: "White: Queen's Gambit (1. d4)",
      color: 'white',
      isBuiltIn: true,
      active: true,
      pgn: `[Event "Queen's Gambit"]\n[White "Starter Repertoire"]\n[Result "*"]\n\n1. d4 d5 (1... Nf6 2. c4 e6 3. Nf3 d5 4. Nc3) (1... f5 2. c4 Nf6 3. g3) 2. c4 e6 (2... c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4) (2... dxc4 3. Nf3 Nf6 4. e3 e6 5. Bxc4) 3. Nc3 Nf6 (3... c6 4. e4) 4. cxd5 exd5 5. Bg5 Be7 6. e3 c6 7. Bd3 Nbd7 8. Qc2 O-O 9. Nf3 Re8 10. O-O Nf8 *`
    }
  ];

  function loadRepertoires() {
    chrome.storage.local.get(['openingRepertoires', 'openingBookEnabled'], (data) => {
      if (openingBookEnabledInput) {
        openingBookEnabledInput.checked = data.openingBookEnabled !== false;
      }
      let list = data.openingRepertoires;
      if (!Array.isArray(list) || !list.length) {
        list = DEFAULT_STARTERS;
        chrome.storage.local.set({ openingRepertoires: list });
      }
      renderRepertoires(list);
    });
  }

  function renderRepertoires(list) {
    if (!repertoireList) return;
    repertoireList.replaceChildren();

    list.forEach((rep) => {
      const card = document.createElement('div');
      card.className = 'cs-repertoire-card';

      const info = document.createElement('div');
      info.className = 'cs-repertoire-info';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !!rep.active;
      chk.title = 'Toggle active in games';
      chk.addEventListener('change', () => {
        rep.active = chk.checked;
        saveAllRepertoires(list);
      });

      const badge = document.createElement('span');
      badge.className = 'cs-badge-color cs-badge-' + (rep.color || 'white');
      badge.textContent = rep.color || 'white';

      const title = document.createElement('strong');
      title.textContent = rep.name;

      info.appendChild(chk);
      info.appendChild(badge);
      info.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'cs-card-actions';

      const exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'cs-btn-export';
      exportBtn.textContent = 'Copy PGN';
      exportBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(rep.pgn);
          exportBtn.textContent = 'Copied!';
          setTimeout(() => { exportBtn.textContent = 'Copy PGN'; }, 1500);
        } catch (e) {
          alert('Could not copy to clipboard.');
        }
      });
      actions.appendChild(exportBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'cs-btn-delete';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        if (confirm('Delete repertoire "' + rep.name + '"?')) {
          const updated = list.filter((r) => r.id !== rep.id);
          saveAllRepertoires(updated);
        }
      });
      actions.appendChild(delBtn);

      card.appendChild(info);
      card.appendChild(actions);
      repertoireList.appendChild(card);
    });
  }

  function saveAllRepertoires(list) {
    chrome.storage.local.set({ openingRepertoires: list }, () => {
      renderRepertoires(list);
    });
  }

  if (openingBookEnabledInput) {
    openingBookEnabledInput.addEventListener('change', () => {
      chrome.storage.local.set({ openingBookEnabled: openingBookEnabledInput.checked });
    });
  }

  if (pgnFileInput) {
    pgnFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (pgnTextInput) pgnTextInput.value = ev.target.result;
        if (newRepNameInput && !newRepNameInput.value) {
          newRepNameInput.value = file.name.replace(/\.[^/.]+$/, '');
        }
      };
      reader.readAsText(file);
    });
  }

  if (btnAddRepertoire) {
    btnAddRepertoire.addEventListener('click', () => {
      const name = (newRepNameInput && newRepNameInput.value.trim()) || 'Custom Repertoire';
      const color = (newRepColorSelect && newRepColorSelect.value) || 'white';
      const pgn = (pgnTextInput && pgnTextInput.value.trim()) || '';

      if (!pgn) {
        alert('Please paste PGN moves or upload a .pgn file first.');
        return;
      }

      chrome.storage.local.get(['openingRepertoires'], (data) => {
        const list = Array.isArray(data.openingRepertoires) ? data.openingRepertoires : DEFAULT_STARTERS.slice();
        const newRep = {
          id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name: name,
          color: color,
          isBuiltIn: false,
          active: true,
          pgn: pgn
        };
        list.push(newRep);
        saveAllRepertoires(list);

        if (newRepNameInput) newRepNameInput.value = '';
        if (pgnTextInput) pgnTextInput.value = '';
        if (pgnFileInput) pgnFileInput.value = '';
      });
    });
  }

  loadRepertoires();

})();
