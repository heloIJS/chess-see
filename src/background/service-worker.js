chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  const defaults = {
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
  try {
    chrome.storage.sync.set(defaults, () => void chrome.runtime.lastError);
  } catch (error) {
    /* storage unavailable */
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'open-options') return false;
  try {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  } catch (error) {
    sendResponse({ ok: false });
  }
  return false;
});

// The engine runs in an offscreen document. This avoids embedding a
// chrome-extension:// iframe in the page, which Brave Shields can block.
const engineSessions = new Map();
let engineOffscreenPort = null;
let engineOffscreenCreating = null;
const enginePending = [];

async function ensureEngineOffscreen() {
  if (engineOffscreenPort) return;
  if (engineOffscreenCreating) return engineOffscreenCreating;
  if (!chrome.offscreen || typeof chrome.offscreen.createDocument !== 'function') {
    throw new Error('Offscreen engine host is unavailable');
  }

  engineOffscreenCreating = (async () => {
    let hasDocument = false;
    try {
      if (typeof chrome.offscreen.hasDocument === 'function') {
        hasDocument = await chrome.offscreen.hasDocument();
      }
    } catch (error) {
      hasDocument = false;
    }

    if (hasDocument && !engineOffscreenPort) {
      try { await chrome.offscreen.closeDocument(); } catch (ignored) {}
      hasDocument = false;
    }

    if (!hasDocument) {
      try {
        await chrome.offscreen.createDocument({
          url: 'src/engine/offscreen.html',
          reasons: ['WORKERS'],
          justification: 'Run the bundled local Stockfish engine'
        });
      } catch (error) {
        const message = String(error && error.message ? error.message : error);
        if (!/single offscreen|already exists|Only a single/i.test(message)) throw error;
      }
    }
  })();

  try {
    await engineOffscreenCreating;
  } finally {
    engineOffscreenCreating = null;
  }
}

function sendToEngineOffscreen(message) {
  if (engineOffscreenPort) {
    try {
      engineOffscreenPort.postMessage(message);
      return;
    } catch (error) {
      engineOffscreenPort = null;
    }
  }
  enginePending.push(message);
  ensureEngineOffscreen().catch(() => {});
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'engine-offscreen') {
    engineOffscreenPort = port;

    while (enginePending.length) {
      const pending = enginePending.shift();
      try { port.postMessage(pending); } catch (ignored) {}
    }

    port.onMessage.addListener((message) => {
      if (!message || !message.sessionId) return;
      const session = engineSessions.get(message.sessionId);
      if (!session) return;
      try { session.port.postMessage(message); } catch (ignored) {}
    });

    port.onDisconnect.addListener(() => {
      if (engineOffscreenPort === port) engineOffscreenPort = null;
      engineSessions.forEach((session) => {
        try {
          session.port.postMessage({
            type: 'crash',
            sessionId: session.id,
            message: 'Stockfish engine host disconnected'
          });
        } catch (ignored) {}
      });
    });
    return;
  }

  if (port.name !== 'chess-see-engine') return;

  let sessionId = null;
  port.onMessage.addListener((message) => {
    if (!message) return;

    if (message.type === 'engine-init') {
      sessionId = message.sessionId;
      if (!sessionId) return;
      engineSessions.set(sessionId, { id: sessionId, port: port });
      ensureEngineOffscreen()
        .then(() => sendToEngineOffscreen(message))
        .catch((error) => {
          try {
            port.postMessage({
              type: 'crash',
              sessionId: sessionId,
              message: error && error.message ? error.message : 'Engine host unavailable'
            });
          } catch (ignored) {}
        });
      return;
    }

    if (sessionId) sendToEngineOffscreen(message);
  });

  port.onDisconnect.addListener(() => {
    if (!sessionId) return;
    engineSessions.delete(sessionId);
    sendToEngineOffscreen({ type: 'engine-terminate', sessionId: sessionId });
  });
});
