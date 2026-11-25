// Minimal stand-in for the chrome.* extension API, so the content script and
// the popup can run in an ordinary page. Storage lives in memory only.
(function () {
  const store = {};
  window.__vspStore = store;
  window.chrome = {
    storage: {
      sync: {
        get(keys, cb) {
          const out = {};
          keys.forEach((k) => { if (k in store) out[k] = store[k]; });
          setTimeout(() => cb(out), 0);
        },
        set(obj) { Object.assign(store, obj); }
      }
    },
    runtime: {
      onMessage: { addListener(fn) { window.__vspMessage = fn; } }
    },
    tabs: {
      query(q, cb) { cb([{ id: 1 }]); },
      sendMessage(id, msg, cb) { if (cb) cb({ success: true }); }
    }
  };
})();
