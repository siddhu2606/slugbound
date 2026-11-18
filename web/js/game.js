// game.js - the main loop: input, exploring, talking to the C++ engine and turning its answers into animation.
const Game = (() => {
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const DIRS = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
  let mode = 'boot';              // boot, title, explore, battle
  let state = null, zone = null;
  let busy = false;
  let held = [];
  let cardQueue = [];
  let started = false;
  let titleRot = 0;
  let params = new URLSearchParams(location.search);

  // ---------------------------------------------------------
  //  responses from the engine
  // ---------------------------------------------------------
  async function handleResp(r) {
    if (r.state) { state = r.state; UI.updateHud(state); }
    if (r.log && r.log.length) UI.logLines(r.log);
    if (r.cards && r.cards.length) cardQueue.push(...r.cards);
  }
  UI.hooks.handle = handleResp;
  async function flushCards() {
    while (cardQueue.length) {
      const c = cardQueue.shift();
      await UI.showCard(c.card, c.step, c.total);
    }
  }
  UI.hooks.openCard = async (id) => {
    const r = await Engine.call('/inspect?id=' + encodeURIComponent(id));
    await handleResp(r);
    if (r.ok) await UI.showCard(r.card, 0, 0);
    else UI.toast(r.error.msg, 'bad');
  };
  UI.hooks.fused = async (r) => {
    Sound.sfx.fuse();
    World3D.flash(0.6);
    UI.toast(`${r.parents} = Umbrafang!`, 'gold');
    await handleResp(r);
    await wait(900);
    UI.toast('Two destructors ran, one constructor built the Ghoul slug. Check the Code Lens console (Tab).', 'good');
  };

  // ---------------------------------------------------------
  //  zones
  // ---------------------------------------------------------
  let objSnapshot = {};
  async function loadZone(fresh = true) {
    const r = await Engine.call('/zone');
    await handleResp(r);
    zone = r.zone;
    World3D.buildZone(zone, state);
    objSnapshot = {};
    zone.objects.forEach((o) => (objSnapshot[o.id] = o.done));
    UI.lensBuild(zone);
    UI.lensSet(UI.lensIsOn());
    Sound.music(zone.id);
  }
  async function refreshZone() {
    const r = await Engine.call('/zone');
    await handleResp(r);
    const nz = r.zone;
    let terrain = false;
    nz.objects.forEach((o) => {
      if (objSnapshot[o.id] !== o.done) {
        objSnapshot[o.id] = o.done;
        World3D.refreshObject(o);
        if (['wall', 'gap', 'bridge'].includes(o.kind)) terrain = true;
      }
    });
    zone.objects = nz.objects;
    World3D.zone.objects.forEach((zo) => { const o = nz.objects.find((q) => q.id === zo.id); if (o) zo.done = o.done; });
    if (terrain) World3D.rebuildTerrain();
    World3D.refreshKeepGate(state);
  }
  async function enterZone(withFade = true) {
    const fade = $('fade');
    if (withFade) { fade.classList.add('on'); await wait(450); }
    await loadZone();
    UI.zoneBanner(zone.name);
    if (withFade) { await wait(150); fade.classList.remove('on'); }
  }

  // ---------------------------------------------------------
  //  exploring
  // ---------------------------------------------------------
  function objectAhead() {
    if (!zone || !state) return null;
    const p = state.player, d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dir];
    return zone.objects.find((o) => o.kind !== 'patch' && o.x === p.x + d[0] && o.y === p.y + d[1] && !(o.done && ['ghoul', 'boss'].includes(o.kind)));
  }
  const PROMPTS = { chest: 'Open the chest', mossback: 'Talk to Old Mossback', trader: 'Talk to Trader Pim', spring: 'Touch the heart shard', fusionstone: 'Use the Fusion Stone', altar: 'Take the keystone', rival: 'Duel Kessa', boss: 'Face Gorvax', heartcrystal: 'Touch the Heartcrystal', wall: 'Smash (needs Earth)', gap: 'Glide (needs Air)', bridge: 'Freeze (needs Ice)', door: 'Power (needs Energy)', keepgate: 'Open (needs 3 keystones)', ghoul: 'Fight' };
  function updatePrompt() {
    let el = $('prompt');
    if (!el) { el = document.createElement('div'); el.id = 'prompt'; el.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);background:rgba(10,18,32,.82);border:1px solid rgba(255,255,255,.2);border-radius:99px;padding:6px 18px;font-size:18px;font-weight:700;z-index:11;pointer-events:none;transition:opacity .2s;'; document.body.appendChild(el); }
    const o = mode === 'explore' && !busy ? objectAhead() : null;
    if (o && PROMPTS[o.kind] && !(o.done && ['chest', 'altar'].includes(o.kind))) { el.innerHTML = '<kbd>E</kbd> ' + PROMPTS[o.kind]; el.style.opacity = 1; }
    else el.style.opacity = 0;
  }

  async function step(dir) {
    busy = true;
    try {
      const r = await Engine.call('/move', { dir });
      await handleResp(r);
      World3D.player.setDir(dir);
      if (!r.ok) {
        if (r.locked) { Sound.sfx.locked(); World3D.addShake(0.12); UI.toast(r.msg, 'bad'); lockedPuff(dir); }
        else UI.toast(r.error.msg, 'bad');
      } else {
        if (r.zoneChanged) { Sound.sfx.encounter(); await enterZone(true); }
        else {
          if (r.moved) { Sound.sfx.step(); await World3D.stepPlayer(dir, r.x, r.y, 0.15); }
          if (r.battle) await runBattle(r);
          else if (r.event) await handleEvent(r.event);
        }
      }
      await flushCards();
    } catch (e) { console.error(e); }
    busy = false;
  }
  function lockedPuff(dir) {
    const p = state.player, d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    Slugs3D.burst(new BABYLON.Vector3(p.x + d[0] * 0.7, 0.9, -(p.y + d[1] * 0.7)), 'Energy', 16, 0.6);
  }

  async function interact() {
    busy = true;
    try {
      const r = await Engine.call('/interact');
      await handleResp(r);
      if (!r.ok) UI.toast(r.error.msg, 'bad');
      else if (r.battle) await runBattle(r);
      else if (r.event) await handleEvent(r.event);
      await flushCards();
    } catch (e) { console.error(e); }
    busy = false;
  }

  function gatePos(src) { const o = zone.objects.find((q) => q.id === src); return o ? new BABYLON.Vector3(o.x, 0.8, -o.y) : null; }

  async function handleEvent(ev) {
    const t = ev.type;
    if (t === 'bump' || t === 'blocked') return;
    if (t === 'msg') { if (ev.text) UI.toast(ev.text); return; }
    if (t === 'dialog') {
      World3D.flash(0.0);
      const portrait = ev.speaker === 'Old Mossback' ? 'mossback' : ev.speaker === 'Trader Pim' ? 'pim' : null;
      for (let i = 0; i < ev.lines.length; i++) {
        await UI.say([ev.lines[i]], ev.speaker, portrait);
        if (i === ev.lines.length - 2 && ev.extra && ev.extra.gift) { Sound.sfx.catch(); UI.toast('You received ' + ev.extra.gift.name + '!', 'gold'); }
      }
      Sound.sfx.heal(); World3D.flash(0.15);
      return;
    }
    if (t === 'chest') {
      Sound.sfx.chest();
      const p = zone.objects.find((o) => o.kind === 'chest' && Math.abs(o.x - state.player.x) + Math.abs(o.y - state.player.y) === 1) || null;
      if (p) Slugs3D.burst(new BABYLON.Vector3(p.x, 0.7, -p.y), 'Energy', 40, 1);
      UI.toast(ev.text, 'gold');
      await refreshZone();
      return;
    }
    if (t === 'gate_open') {
      Sound.sfx.gate(); World3D.addShake(0.45); World3D.flash(0.25);
      const gp = gatePos(ev.source);
      if (gp) { Slugs3D.burst(gp, ev.extra.kind === 'wall' ? 'Earth' : ev.extra.kind === 'gap' ? 'Air' : ev.extra.kind === 'bridge' ? 'Ice' : 'Energy', 70, 1.4); Slugs3D.ring(gp.add(new BABYLON.Vector3(0, -0.6, 0)), '#ffffff', 4, 0.6); }
      UI.toast(ev.text, 'good');
      await refreshZone();
      return;
    }
    if (t === 'altar') {
      Sound.sfx.keystone(); World3D.flash(0.5);
      const gp = zone.objects.find((o) => o.kind === 'altar' && Math.abs(o.x - state.player.x) + Math.abs(o.y - state.player.y) === 1);
      if (gp) Slugs3D.burst(new BABYLON.Vector3(gp.x, 1.4, -gp.y), 'Energy', 80, 1.6);
      UI.toast(ev.text, 'gold');
      await refreshZone();
      await wait(400);
      return;
    }
    if (t === 'heal') {
      Sound.sfx.heal(); World3D.flash(0.3);
      Slugs3D.burst(new BABYLON.Vector3(state.player.x, 0.9, -state.player.y), 'Earth', 60, 1.2);
      UI.toast(ev.text, 'good');
      return;
    }
    if (t === 'fusion') { if (/at least two/.test(ev.text)) UI.toast(ev.text, 'bad'); else UI.fusionScreen(); return; }
    if (t === 'trade') { for (const l of ev.lines) await UI.say([l], ev.speaker, 'pim'); UI.tradeScreen(); return; }
    if (t === 'victory') {
      Sound.music('win'); Sound.sfx.win(); World3D.flash(1);
      await UI.say([ev.text], null, null);
      UI.creditsScreen(ev.extra.concepts);
      await refreshZone();
      return;
    }
  }

  async function runBattle(r) {
    mode = 'battle';
    held = [];
    UI.updateHud(state);
    const dlgEvent = r.event && r.event.lines && r.event.lines.length ? r.event : null;
    if (r.event && r.event.text && r.event.type === 'battle') UI.toast(r.event.text, 'bad');
    const res = await Battle.run(r, { handle: handleResp, flushCards });
    mode = 'explore';
    UI.showHud(true);
    if (res.respawn) { UI.toast('You wake up at the Heartlight in Glowmoss Grotto.', 'gold'); await enterZone(false); }
    else { await refreshZone(); Sound.music(zone.id); World3D.setPlayer(state.player.x, state.player.y, state.player.dir); }
    UI.updateHud(state);
    if (res.battle && res.battle.result === 'win' && res.battle.source === 'k_boss') {
      UI.toast('Gorvax falls! The Heartcrystal waits behind his throne.', 'gold');
    }
  }

  // ---------------------------------------------------------
  //  menus
  // ---------------------------------------------------------
  function openPause() {
    UI.pauseMenu({
      resume: () => UI.closeScreen(),
      blaster: () => UI.blasterScreen(),
      pedia: () => UI.pediaScreen(),
      save: async () => { const r = await Engine.call('/save'); await handleResp(r); if (r.ok) { Sound.sfx.save(); UI.toast('Game saved (binary file written by C++)', 'good'); } else UI.toast(r.error.msg, 'bad'); UI.closeScreen(); await flushCards(); },
      load: async () => {
        const r = await Engine.call('/load'); await handleResp(r);
        UI.closeScreen();
        if (r.ok) { UI.toast('Game loaded', 'good'); await enterZone(true); } else { UI.toast(r.error.kind === 'SaveCorruptedException' ? 'Load failed: ' + r.error.msg : r.error.msg, 'bad'); }
      },
      quality: () => { const order = ['low', 'medium', 'high']; const q = order[(order.indexOf(World3D.quality) + 1) % 3]; World3D.applyQuality(q); try { localStorage.setItem('slugbound.quality', q); } catch (e) {} UI.closeScreen(); openPause(); },
      lens: () => { toggleLens(); UI.closeScreen(); },
      sound: () => { Sound.toggleMute(); UI.closeScreen(); openPause(); },
      how: () => UI.howScreen(),
      quit: () => location.reload(),
    });
  }
  function toggleLens() {
    const on = !UI.lensIsOn();
    UI.lensSet(on); UI.toggleConsole(on);
    UI.toast(on ? 'Code Lens ON: class tags and the live C++ console' : 'Code Lens off', 'good');
  }

  // ---------------------------------------------------------
  //  input
  // ---------------------------------------------------------
  window.addEventListener('keydown', async (e) => {
    if (e.repeat && !DIRS[e.key]) return;
    Sound.ensure();
    const k = e.key;
    if (['Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    if (mode === 'title') { if (k === 'Enter') $('btnNew').click(); return; }
    if (UI.cardOpen()) { if (['e', 'E', 'Enter', ' ', 'Escape'].includes(k)) UI.closeCard(); return; }
    if (UI.dialogOpen()) { if (['e', 'E', 'Enter', ' '].includes(k)) UI.dialogAdvance(); return; }
    if (mode === 'battle') {
      if (k >= '1' && k <= '5') Battle.command(['fire', 'swap', 'guard', 'moss', 'run'][Number(k) - 1]);
      if (k === 'Tab') toggleLens();
      if (k === 'm' || k === 'M') Sound.toggleMute();
      return;
    }
    if (UI.isScreen()) { if (k === 'Escape' || (k === 'b' && UI.isScreen('blaster')) || (k === 'p' && UI.isScreen('pedia'))) { Sound.sfx.back(); UI.closeScreen(); } return; }
    if (mode !== 'explore') return;
    if (DIRS[k]) { const d = DIRS[k]; held = held.filter((x) => x !== d); held.push(d); return; }
    if (busy) return;
    if (k === 'e' || k === 'E' || k === ' ' || k === 'Enter') interact();
    else if (k === 'Escape') { Sound.sfx.select(); openPause(); }
    else if (k === 'b' || k === 'B') { Sound.sfx.select(); UI.blasterScreen(); }
    else if (k === 'p' || k === 'P') { Sound.sfx.select(); UI.pediaScreen(); }
    else if (k === 'Tab') toggleLens();
    else if (k === 'm' || k === 'M') { Sound.toggleMute(); UI.toast(Sound.muted ? 'Sound off' : 'Sound on'); }
  });
  window.addEventListener('keyup', (e) => { const d = DIRS[e.key]; if (d) held = held.filter((x) => x !== d); });
  window.addEventListener('blur', () => (held = []));
  $('queueBar').addEventListener('click', () => { if (mode === 'explore' && !busy && !UI.isScreen()) UI.blasterScreen(); });
  $('consoleClose').addEventListener('click', () => { UI.toggleConsole(false); UI.lensSet(false); });

  function tick() {
    if (mode === 'explore' && !busy && !UI.isScreen() && !UI.dialogOpen() && !UI.cardOpen() && held.length) step(held[held.length - 1]);
    updatePrompt();
  }

  // ---------------------------------------------------------
  //  title and boot
  // ---------------------------------------------------------
  function titleCam(dt) {
    if (mode !== 'title') return;
    titleRot += dt * 0.12;
    const cam = World3D.camera;
    const cx = 9 + Math.cos(titleRot) * 3, cz = -7 + Math.sin(titleRot * 0.7) * 1.5;
    cam.position.set(cx + Math.sin(titleRot) * 5, 5.2 + Math.sin(titleRot * 1.3) * 0.6, cz - 9);
    cam.setTarget(new BABYLON.Vector3(cx, 0.9, cz));
  }

  async function beginPlay(loadFirst) {
    Sound.ensure();
    $('title').classList.add('out');
    $('fade').classList.add('on'); await wait(500);
    if (loadFirst) {
      const r = await Engine.call('/load'); await handleResp(r);
      if (!r.ok) { UI.toast('Could not load the save: ' + r.error.msg, 'bad'); await Engine.call('/new'); }
    } else { const n = await Engine.call('/new'); await handleResp(n); }
    const s = await Engine.call('/state'); await handleResp(s);
    World3D.setCamMode('follow');
    await loadZone();
    UI.lensBuild(zone); UI.lensSet(false); UI.toggleConsole(false);
    UI.showHud(true);
    $('fade').classList.remove('on');
    UI.zoneBanner(zone.name);
    mode = 'explore';
    if (!loadFirst) setTimeout(() => UI.toast('Welcome, Slinger. Walk with WASD, talk with E.', 'good'), 800);
    setTimeout(() => $('title').style.display = 'none', 900);
  }

  async function boot() {
    const lt = $('loadText');
    lt.textContent = 'Starting the C++ engine…';
    const mode0 = await Engine.init();
    lt.textContent = 'Painting the cave…';
    let q = 'high';
    try { q = localStorage.getItem('slugbound.quality') || ((navigator.hardwareConcurrency || 8) < 4 ? 'medium' : 'high'); } catch (e) {}
    if (params.get('quality')) q = params.get('quality');
    const { scene, camera } = World3D.init($('view'), q);
    Slugs3D.init(scene, camera);
    World3D.hooks.frame.push((dt) => { titleCam(dt); UI.lensUpdate(); });
    setInterval(tick, 16);
    // the title screen shows a live grotto
    const dbg = params.get('dbg');
    await Engine.call('/new');
    if (dbg) await Engine.call('/debug', JSON.parse(dbg));
    const s0 = await Engine.call('/state'); state = s0.state;
    const z0 = await Engine.call('/zone'); zone = z0.zone;
    World3D.buildZone(zone, state);
    World3D.setCamMode('free');
    mode = 'title';
    $('titleFoot').textContent = mode0 === 'wasm' ? 'C++ engine running as WebAssembly in your browser' : 'C++ engine running as a native server';
    if (!Engine.hasSave()) $('btnContinue').disabled = true;
    $('btnNew').onclick = () => { Sound.sfx.select(); beginPlay(false); };
    $('btnContinue').onclick = () => { Sound.sfx.select(); beginPlay(true); };
    $('btnHow').onclick = () => { Sound.sfx.select(); UI.howScreen(); };
    $('loading').classList.add('out');
    document.addEventListener('pointerdown', () => { Sound.ensure(); if (mode === 'title') Sound.music('title'); }, { once: true });
    if (params.get('autostart')) { await beginPlay(false); if (dbg) { await Engine.call('/debug', JSON.parse(dbg)); const s = await Engine.call('/state'); await handleResp(s); await loadZone(); } }
  }

  window.addEventListener('error', (e) => { const lt = $('loadText'); if (lt && !$('loading').classList.contains('out')) lt.textContent = 'Error: ' + e.message; });
  boot().catch((e) => { console.error(e); $('loadText').textContent = 'Could not start: ' + e.message; });
  return { handleResp, get state() { return state; }, get zone() { return zone; }, get mode() { return mode; }, step, interact, refreshZone, loadZone, flushCards };
})();
window.__game = Game;
