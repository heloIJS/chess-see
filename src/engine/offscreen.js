(function () {
  'use strict';

  const workers = new Map();
  let port = null;
  let reconnectTimer = null;

  function terminateWorker(sessionId) {
    const worker = workers.get(sessionId);
    if (!worker) return;
    workers.delete(sessionId);
    try { worker.terminate(); } catch (ignored) {}
  }

  function createWorker(sessionId) {
    terminateWorker(sessionId);

    let worker;
    try {
      worker = new Worker(chrome.runtime.getURL('src/lib/stockfish/stockfish.js'));
    } catch (error) {
      if (port) {
        port.postMessage({
          type: 'crash',
          sessionId: sessionId,
          message: error && error.message ? error.message : 'Failed to start Stockfish worker'
        });
      }
      return;
    }

    worker.onmessage = function (event) {
      if (!port) return;
      port.postMessage({
        type: 'line',
        sessionId: sessionId,
        data: String(event.data == null ? '' : event.data)
      });
    };

    worker.onerror = function (event) {
      if (!port) return;
      port.postMessage({
        type: 'crash',
        sessionId: sessionId,
        message: event && event.message ? event.message : 'Stockfish worker error'
      });
    };

    workers.set(sessionId, worker);
  }

  function handleMessage(msg) {
    if (!msg || !msg.sessionId) return;

    if (msg.type === 'engine-init') {
      createWorker(msg.sessionId);
      if (port) port.postMessage({ type: 'ready', sessionId: msg.sessionId });
      return;
    }

    if (msg.type === 'engine-send') {
      const worker = workers.get(msg.sessionId);
      if (!worker) return;
      try {
        worker.postMessage(msg.command);
      } catch (error) {
        if (port) {
          port.postMessage({
            type: 'crash',
            sessionId: msg.sessionId,
            message: error && error.message ? error.message : 'Stockfish send failed'
          });
        }
      }
      return;
    }

    if (msg.type === 'engine-terminate') {
      terminateWorker(msg.sessionId);
    }
  }

  function connect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    try {
      port = chrome.runtime.connect({ name: 'engine-offscreen' });
    } catch (error) {
      port = null;
      reconnectTimer = setTimeout(connect, 500);
      return;
    }

    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(function () {
      port = null;
      reconnectTimer = setTimeout(connect, 500);
    });
  }

  connect();
})();
