// Minimal Chrome DevTools Protocol driver (no dependencies, Node 22+). Used to take screenshots and press keys while testing.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function open(url, opts = {}) {
  const w = opts.w || 1280, h = opts.h || 720, port = opts.port || 9333 + Math.floor(Math.random() * 500);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slug-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${w},${h}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = {}; const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
    if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const api = {
    logs,
    sleep,
    async goto(u, wait = 1500) { await send('Page.navigate', { url: u }); await sleep(wait); },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result.exceptionDetails) return 'ERR: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result.result.value;
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
    async key(k, hold = 60) {
      const map = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27, Tab: 9, ' ': 32 };
      const code = map[k] || k.toUpperCase().charCodeAt(0);
      const text = k.length === 1 ? k : undefined;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, windowsVirtualKeyCode: code, text });
      await sleep(hold);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, windowsVirtualKeyCode: code });
    },
    async click(x, y) {
      for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', clickCount: 1 });
    },
    async close() { try { ws.close(); } catch (e) {} proc.kill(); },
  };
  await api.goto(url, opts.wait || 1500);
  return api;
}
module.exports = { open };
