// api.js - talks to the C++ engine.
// Hosted version: the engine runs in the browser as WebAssembly (web/engine/engine.js).
// Local version: the same engine runs as a native HTTP server and we use fetch("api/...").
// Either way the browser NEVER decides a rule: it sends input and draws what C++ answers.
const Engine = (() => {
  let mode = 'http';
  let fn = null;
  let mod = null;
  const SAVE_KEY = 'slugbound.save.v1';

  async function init() {
    const forceHttp = new URLSearchParams(location.search).has('server');
    if (!forceHttp && typeof SlugEngine === 'function') {
      mod = await SlugEngine();
      fn = mod.cwrap('slug_api', 'string', ['string', 'string']);
      mode = 'wasm';
    }
    return mode;
  }

  function b64FromBytes(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function bytesFromB64(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  async function call(route, body) {
    const payload = JSON.stringify(body || {});
    let raw;
    if (mode === 'wasm') {
      if (route === '/load') {
        try {
          const saved = localStorage.getItem(SAVE_KEY);
          if (saved) mod.FS.writeFile('/slugbound.sav', bytesFromB64(saved));
        } catch (e) { /* storage blocked: the engine will report "no save file" */ }
      }
      raw = fn(route, payload);
      if (route === '/save') {
        try {
          const bytes = mod.FS.readFile('/slugbound.sav');
          localStorage.setItem(SAVE_KEY, b64FromBytes(bytes));
        } catch (e) { /* ignore */ }
      }
    } else {
      const res = await fetch('api' + route, { method: 'POST', body: payload });
      raw = await res.text();
      if (route === '/save') { try { localStorage.setItem(SAVE_KEY + '.http', '1'); } catch (e) {} }
    }
    return JSON.parse(raw);
  }

  function hasSave() {
    try {
      return !!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(SAVE_KEY + '.http'));
    } catch (e) { return false; }
  }

  return { init, call, hasSave, get mode() { return mode; } };
})();
