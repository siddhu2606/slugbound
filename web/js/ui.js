// ui.js - everything made of HTML: HUD, dialogue, toasts, OOP cards, Code Lens, menus and screens.
const UI = (() => {
  const $ = (id) => document.getElementById(id);
  const EL_COLOR = Art.ELEMENT_COLOR;
  const hooks = { handle: null, openCard: null };
  let state = null;

  const CLASS_TAGS = {
    Chest: 'Chest : Interactable', NPC: 'NPC : Interactable', FusionStone: 'FusionStone : Interactable', HealingSpring: 'HealingSpring : Interactable',
    GhoulPatrol: 'GhoulPatrol : Interactable', RivalSlinger: 'RivalSlinger : Interactable', BreakableWall: 'BreakableWall : Gate : Interactable',
    GapLedge: 'GapLedge : Gate : Interactable', IceBridge: 'IceBridge : Gate : Interactable', CrystalDoor: 'CrystalDoor : Gate : Interactable',
    KeepGate: 'KeepGate : Gate : Interactable', KeystoneAltar: 'KeystoneAltar : Interactable', BossThrone: 'BossThrone : Interactable', Heartcrystal: 'Heartcrystal : Interactable',
  };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const hpClass = (hp, max) => (hp / max > 0.5 ? '' : hp / max > 0.2 ? 'mid' : 'low');
  document.querySelectorAll('[data-ico]').forEach((el) => (el.src = Art.icon(el.dataset.ico)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------
  //  HUD
  // ---------------------------------------------------------
  function updateHud(s) {
    state = s;
    const p = s.player;
    $('hudHp').style.width = (p.hp / p.maxHp * 100) + '%';
    $('hudHp').parentElement.className = 'bar hp ' + hpClass(p.hp, p.maxHp);
    $('hudHpTxt').textContent = p.hp + '/' + p.maxHp;
    $('hudAmmo').textContent = p.ammo; $('hudMoss').textContent = p.moss; $('hudKeys').textContent = p.keystones;
    $('objText').textContent = s.tutorial.objective;
    const shown = s.tutorial.shown.length;
    $('objCount').textContent = shown < s.tutorial.total ? 'OOP cards ' + shown + ' / ' + s.tutorial.total : 'All 11 OOP cards found';
    const slots = $('queueSlots'); slots.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const sl = s.blaster[i];
      const d = document.createElement('div');
      d.className = 'qslot' + (sl ? '' : ' empty') + (i === 0 && sl ? ' front' : '');
      if (sl) d.innerHTML = `<img src="${Art.portraitFor(sl.name, 96)}" alt=""><span class="qlv">${sl.level}</span><div class="qhp"><i style="width:${sl.hp / sl.maxHp * 100}%"></i></div>`;
      slots.appendChild(d);
    }
  }
  function showHud(v) { $('hud').classList.toggle('hidden', !v); }

  let bannerT = 0;
  function zoneBanner(name) {
    const b = $('zoneBanner'); b.textContent = name; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 2600);
  }

  // ---------------------------------------------------------
  //  toasts
  // ---------------------------------------------------------
  function toast(msg, kind = '') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // ---------------------------------------------------------
  //  dialogue with typewriter
  // ---------------------------------------------------------
  let dlg = null;
  function say(lines, speaker, portrait) {
    return new Promise((resolve) => {
      const el = $('dialog');
      $('dlgName').textContent = speaker || '';
      const img = $('dlgImg');
      if (portrait) { img.src = Art.dataUrl(portrait, 'front'); img.parentElement.style.display = ''; } else img.parentElement.style.display = 'none';
      el.classList.remove('hidden');
      dlg = { lines: lines.slice(), i: 0, pos: 0, typing: false, timer: null, resolve };
      startLine();
    });
  }
  function startLine() {
    const d = dlg, text = $('dlgText');
    text.textContent = ''; d.pos = 0; d.typing = true;
    const full = d.lines[d.i];
    d.timer = setInterval(() => {
      d.pos += 2;
      text.textContent = full.slice(0, d.pos);
      if (d.pos % 4 === 0) Sound.sfx.text();
      if (d.pos >= full.length) { clearInterval(d.timer); d.typing = false; text.textContent = full; }
    }, 22);
  }
  function dialogAdvance() {
    if (!dlg) return false;
    const d = dlg;
    if (d.typing) { clearInterval(d.timer); d.typing = false; $('dlgText').textContent = d.lines[d.i]; return true; }
    d.i++;
    if (d.i >= d.lines.length) { $('dialog').classList.add('hidden'); const r = d.resolve; dlg = null; r(); return true; }
    startLine();
    return true;
  }
  const dialogOpen = () => !!dlg;

  // ---------------------------------------------------------
  //  console (Code Lens)
  // ---------------------------------------------------------
  function logLines(lines) {
    const body = $('consoleBody');
    lines.forEach((l) => {
      const m = /^\[([^\]]+)\]/.exec(l);
      const tag = m ? m[1] : 'call';
      const d = document.createElement('div');
      d.className = 'l-' + tag;
      d.textContent = l;
      body.appendChild(d);
    });
    while (body.children.length > 500) body.removeChild(body.firstChild);
    body.scrollTop = body.scrollHeight;
  }
  function toggleConsole(v) { const c = $('console'); const show = v === undefined ? c.classList.contains('hidden') : v; c.classList.toggle('hidden', !show); }
  const consoleOpen = () => !$('console').classList.contains('hidden');

  // ---------------------------------------------------------
  //  OOP card
  // ---------------------------------------------------------
  function cardHtml(c, step, total) {
    const oop = c.oop.map((l) => { const i = l.indexOf(':'); return `<div class="concept"><b>${esc(l.slice(0, i))}</b>${esc(l.slice(i))}</div>`; }).join('');
    return `<div class="oop"><div class="oop-in">
      <div class="oop-step"><span>${step ? 'OOP CARD ' + step + ' OF ' + total : 'OOP CARD'}</span><span>${esc(c.badge)}</span></div>
      <div class="oop-title">${esc(c.title)}</div>
      <div class="oop-class">${esc(c.classLine)}</div>
      <div class="oop-row"><b>Inherited from:</b> ${esc(c.inherits)}</div>
      <div class="oop-row"><b>Data members:</b> ${esc(c.data)}</div>
      <div class="oop-funcs">${c.funcs.map((f) => `<div>${esc(f)}</div>`).join('')}</div>
      <div class="oop-concepts">${oop}</div>

      <div class="oop-foot"><span>Press <kbd>E</kbd> or click to continue · every card is produced by the class itself, through describeOOP()</span></div>
    </div></div>`;
  }
  let cardResolve = null;
  function showCard(c, step, total) {
    return new Promise((resolve) => {
      const layer = $('cardLayer');
      layer.innerHTML = cardHtml(c, step, total);
      layer.classList.remove('hidden');
      Sound.sfx.card();
      cardResolve = resolve;
    });
  }
  function closeCard() {
    if (!cardResolve) return false;
    $('cardLayer').classList.add('hidden');
    const r = cardResolve; cardResolve = null; r();
    return true;
  }
  const cardOpen = () => !!cardResolve;
  $('cardLayer').addEventListener('click', () => closeCard());

  // ---------------------------------------------------------
  //  Code Lens tags above objects
  // ---------------------------------------------------------
  let lensOn = false, tagEls = [];
  function lensClear() { $('lensTags').innerHTML = ''; tagEls = []; }
  function lensBuild(zone) {
    lensClear();
    const add = (text, x, y, h, inspectId) => {
      const d = document.createElement('div'); d.className = 'lens-tag'; d.textContent = text;
      d.addEventListener('click', () => hooks.openCard && hooks.openCard(inspectId));
      $('lensTags').appendChild(d);
      tagEls.push({ el: d, x, y, h, id: inspectId, follow: null });
      return tagEls[tagEls.length - 1];
    };
    const pl = add('Slinger : Combatant, Explorer', 0, 0, 2.2, 'player'); pl.follow = 'player';
    zone.objects.forEach((o) => { if (o.kind === 'patch') return; const h = { chest: 0.9, spring: 1.8, fusionstone: 2.2, altar: 1.9, wall: 1.8, gap: 1.2, bridge: 1.2, door: 2.6, keepgate: 3.5, boss: 3.4, heartcrystal: 2.9 }[o.kind] || 2.0; add(CLASS_TAGS[o.cls] || o.cls, o.x, o.y, h, 'obj:' + o.id); });
    add('WildPatch : Interactable', 0, 0, 0, 'obj:' + (zone.objects.find((o) => o.kind === 'patch') || { id: '' }).id).hidden = true;
  }
  function lensSet(on) { lensOn = on; $('lensTags').style.display = on ? '' : 'none'; }
  const lensIsOn = () => lensOn;
  function lensUpdate() {
    if (!lensOn) return;
    tagEls.forEach((t) => {
      if (t.hidden) { t.el.style.display = 'none'; return; }
      let x = t.x, y = t.y;
      if (t.follow === 'player' && World3D.player) { x = World3D.player.node.position.x; y = -World3D.player.node.position.z; }
      const p = World3D.project(x, y, t.h);
      t.el.style.display = p.visible ? '' : 'none';
      t.el.style.left = p.x + 'px'; t.el.style.top = p.y + 'px';
    });
  }

  // ---------------------------------------------------------
  //  screens (pause, blaster, slugpedia, fusion, trade, how-to)
  // ---------------------------------------------------------
  let screenOpen = false, screenKey = null, screenClose = null;
  function openScreen(html, key, onClose) {
    const sc = $('screen'); sc.innerHTML = html; sc.classList.remove('hidden');
    screenOpen = true; screenKey = key; screenClose = onClose || null;
    sc.onclick = (e) => { if (e.target === sc) closeScreen(); };
  }
  function closeScreen() {
    if (!screenOpen) return;
    $('screen').classList.add('hidden'); $('screen').innerHTML = '';
    screenOpen = false; const cb = screenClose; screenClose = null; screenKey = null;
    if (cb) cb();
  }
  const isScreen = (k) => screenOpen && (!k || screenKey === k);

  function slugCardHtml(s, extra = '') {
    return `<img src="${Art.portraitFor(s.name, 120)}" alt=""><div class="nm" style="color:${EL_COLOR[s.element]}">${esc(s.name)}</div><div class="sub">${Art.elementEmoji(s.element)} Lv ${s.level} · ${s.hp}/${s.maxHp}</div>${extra}`;
  }
  const ABILITY_TXT = { freeze: 'Freezes lava and water into a bridge', smash: 'Smashes cracked walls', glide: 'Glides across chasms', power: 'Powers crystal doors', none: 'No exploration ability' };

  async function sync(r) { if (hooks.handle) await hooks.handle(r); }

  // ----- pause menu
  function pauseMenu(handlers) {
    const items = [['Resume', '', 'resume'], ['Blaster', 'B', 'blaster'], ['Slugpedia', 'P', 'pedia'], ['Save game', 'binary file', 'save'], ['Load game', '', 'load'], ['Quality: ' + World3D.quality.toUpperCase(), 'low / medium / high', 'quality'], ['Code Lens', 'Tab', 'lens'], ['Sound: ' + (Sound.muted ? 'OFF' : 'ON'), 'M', 'sound'], ['How to play', '', 'how'], ['Quit to title', '', 'quit']];
    openScreen(`<div class="sheet" style="width:auto"><div class="sheet-head"><h2>PAUSED</h2><small>${state ? esc(state.zoneName) : ''}</small></div><div class="menu-list">${items.map(([a, b, id]) => `<button class="menu-item" data-id="${id}"><img class="cur" data-ico="hand" alt="">${a}${b ? `<small>${b}</small>` : ''}</button>`).join('')}</div></div>`, 'pause');
    $('screen').querySelectorAll('[data-ico]').forEach((el) => (el.src = Art.icon(el.dataset.ico)));
    $('screen').querySelectorAll('.menu-item').forEach((b) => b.addEventListener('click', () => { Sound.sfx.select(); handlers[b.dataset.id](); }));
  }

  // ----- blaster / loadout
  let selSlug = null;
  async function blasterScreen() {
    const r = await Engine.call('/slugs'); await sync(r);
    renderBlaster();
  }
  function renderBlaster() {
    const s = state;
    const all = [...s.blaster, ...s.storage];
    const sel = all.find((x) => x.id === selSlug) || null;
    const slot = (i) => {
      const sl = s.blaster[i];
      if (!sl) return `<div class="slot"><span class="order">${i === 0 ? 'FRONT' : '#' + (i + 1)}</span><span class="slot-sub">empty</span></div>`;
      return `<div class="slot filled" data-id="${sl.id}"><span class="order">${i === 0 ? 'FRONT · fires first' : '#' + (i + 1)}</span>${slugCardHtml(sl, `<div class="bar ${hpClass(sl.hp, sl.maxHp)}"><i style="width:${sl.hp / sl.maxHp * 100}%"></i></div>`)}</div>`;
    };
    const inB = (id) => s.blaster.some((x) => x.id === id);
    const gate = { Earth: 'smash', Ice: 'freeze', Air: 'glide', Energy: 'power' };
    const need = ['Earth', 'Ice', 'Air', 'Energy'].map((e) => `<span style="color:${EL_COLOR[e]}">${Art.elementEmoji(e)} ${e}: ${ABILITY_TXT[gate[e]]}${s.blaster.some((x) => x.element === e && x.hp > 0) ? ' ' + Art.iconHtml('check') : ''}</span>`).join(' &nbsp; ');
    const detail = sel ? `<div class="pedia-detail"><img src="${Art.portraitFor(sel.name, 160)}"><div><div style="font-size:26px;font-weight:800;color:${EL_COLOR[sel.element]}">${esc(sel.name)} <small style="color:var(--dim);font-size:14px">${sel.cls}</small></div><div>Lv ${sel.level} · HP ${sel.hp}/${sel.maxHp} · power ${sel.power} · XP ${sel.xp}/${sel.xpNeed}</div><div style="color:var(--dim)">${ABILITY_TXT[sel.ability] || ''}${sel.hp <= 0 ? ' · FAINTED, heal at a heart shard' : ''}</div><div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn gold" id="bToggle" ${sel.hp <= 0 && !inB(sel.id) ? 'disabled' : ''}>${inB(sel.id) ? 'Take out of blaster' : 'Load into blaster'}</button><button class="btn" id="bCard">OOP card</button><button class="btn danger" id="bRelease">Release (delete)</button></div></div></div>` : '<div style="color:var(--dim);padding:6px 0 12px">Select a slug to load it into the blaster. The FRONT slug fires first, then goes to the back of the queue.</div>';
    openScreen(`<div class="sheet"><div class="sheet-head"><h2>BLASTER</h2><small>queue&lt;Slug*&gt; · holds 4</small></div><div class="sheet-body"><div class="slots">${[0, 1, 2, 3].map(slot).join('')}</div><div style="font-size:13px;margin-bottom:10px">${need}</div>${detail}<div class="grid">${all.map((x) => `<div class="card ${inB(x.id) ? 'in-blaster' : ''} ${x.id === selSlug ? 'sel' : ''}" data-id="${x.id}">${inB(x.id) ? '<span class="badge">LOADED</span>' : ''}${slugCardHtml(x)}</div>`).join('')}</div></div><div class="sheet-foot"><span><kbd>Esc</kbd> close</span><span>Different slugs open different gates. Pick your loadout before you walk up to one.</span></div></div>`, 'blaster', () => { selSlug = null; });
    const sc = $('screen');
    sc.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => { Sound.sfx.blip(); selSlug = Number(el.dataset.id); renderBlaster(); }));
    const apply = async (ids) => {
      const r = await Engine.call('/loadout', { ids });
      if (!r.ok) { toast(r.error.msg, 'bad'); Sound.sfx.locked(); }
      await sync(r); renderBlaster();
    };
    if (sel) {
      const t = $('bToggle');
      if (t) t.onclick = () => {
        let ids = s.blaster.map((x) => x.id);
        if (inB(sel.id)) { if (ids.length <= 1) { toast('Keep at least one slug loaded', 'bad'); return; } ids = ids.filter((i) => i !== sel.id); }
        else { if (ids.length >= 4) { toast('The blaster holds 4. Take one out first', 'bad'); return; } ids.push(sel.id); }
        Sound.sfx.swap(); apply(ids);
      };
      $('bCard').onclick = () => hooks.openCard('slug:' + sel.id);
      $('bRelease').onclick = async () => {
        const r = await Engine.call('/release', { id: sel.id });
        if (!r.ok) { toast(r.error.msg, 'bad'); Sound.sfx.locked(); } else { toast(sel.name + ' was released. Watch the console: [dtor] FireSlug, then [dtor] Slug', 'gold'); Sound.sfx.faint(); selSlug = null; }
        await sync(r); renderBlaster();
      };
    }
  }

  // ----- slugpedia
  async function pediaScreen() {
    const r = await Engine.call('/slugpedia'); await sync(r);
    const found = r.entries.filter((e) => e.found).length;
    openScreen(`<div class="sheet"><div class="sheet-head"><h2>SLUGPEDIA</h2><small>map&lt;string, Slug*&gt; + set&lt;string&gt; found · ${found}/${r.entries.length}</small></div><div class="sheet-body"><div class="grid">${r.entries.map((e) => `<div class="card ${e.found ? '' : 'unknown'}" data-n="${esc(e.name)}"><img src="${Art.portraitFor(e.name, 120)}"><div class="nm">${e.found ? esc(e.name) : '???'}</div><div class="sub">${e.found ? Art.elementEmoji(e.element) + ' ' + e.element + ' · base HP ' + e.hp : 'not discovered'}</div>${e.found ? `<div class="sub" style="margin-top:4px;font-size:11px">${esc(e.blurb)}</div>` : ''}</div>`).join('')}</div></div><div class="sheet-foot"><span><kbd>Esc</kbd> close</span><span>Click a discovered slug to see its OOP card.</span></div></div>`, 'pedia');
    $('screen').querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { if (!c.classList.contains('unknown')) { Sound.sfx.select(); hooks.openCard('pedia:' + c.dataset.n); } }));
  }

  // ----- fusion
  let fuseSel = [];
  function fusionScreen() {
    fuseSel = [];
    renderFusion();
  }
  function renderFusion() {
    const all = [...state.blaster, ...state.storage];
    const a = all.find((x) => x.id === fuseSel[0]), b = all.find((x) => x.id === fuseSel[1]);
    const box = (s, label) => `<div class="fuse-box">${s ? `<img src="${Art.portraitFor(s.name, 120)}"><b style="color:${EL_COLOR[s.element]}">${esc(s.name)}</b><small>Lv ${s.level}</small>` : `<span style="color:var(--dim)">${label}</span>`}</div>`;
    openScreen(`<div class="sheet"><div class="sheet-head"><h2>FUSION STONE</h2><small>Slug* Slug::operator+(const Slug&amp;) const</small></div><div class="sheet-body"><div class="fuse-stage">${box(a, 'pick a slug')}<span class="fuse-plus">+</span>${box(b, 'pick another')}<span class="fuse-plus">=</span><div class="fuse-box"><img src="${Art.portraitFor('Umbrafang', 120)}" style="filter:${a && b ? 'none' : 'brightness(0) opacity(.5)'}"><b style="color:var(--ghoul)">Umbrafang</b><small>new GhoulSlug</small></div></div><div style="text-align:center;margin-bottom:14px"><button class="btn gold" id="fuseGo" ${a && b ? '' : 'disabled'}>FUSE (both parents are lost)</button></div><div class="grid">${all.map((x) => `<div class="card ${fuseSel.includes(x.id) ? 'sel' : ''}" data-id="${x.id}">${slugCardHtml(x)}</div>`).join('')}</div></div><div class="sheet-foot"><span><kbd>Esc</kbd> close</span><span>Fusion allocates a new GhoulSlug with <b>new</b>, then deletes both parents. Watch the console.</span></div></div>`, 'fusion');
    $('screen').querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => {
      const id = Number(c.dataset.id); Sound.sfx.blip();
      if (fuseSel.includes(id)) fuseSel = fuseSel.filter((x) => x !== id); else { fuseSel.push(id); if (fuseSel.length > 2) fuseSel.shift(); }
      renderFusion();
    }));
    const go = $('fuseGo');
    if (go) go.onclick = async () => {
      go.disabled = true;
      const r = await Engine.call('/fuse', { a: fuseSel[0], b: fuseSel[1] });
      closeScreen();
      if (r.ok) { hooks.fused && (await hooks.fused(r)); } else toast(r.error.msg, 'bad');
      await sync(r);
    };
  }

  // ----- trade
  function tradeScreen() {
    const spare = state.storage;
    openScreen(`<div class="sheet"><div class="sheet-head"><h2>TRADER PIM</h2><small>swap a spare slug for a Voltick</small></div><div class="sheet-body">${spare.length ? `<div class="grid">${spare.map((x) => `<div class="card" data-id="${x.id}">${slugCardHtml(x)}</div>`).join('')}</div>` : '<p style="font-size:18px">You have no spare slugs in storage. Catch extras, then come back!</p>'}</div><div class="sheet-foot"><span><kbd>Esc</kbd> close</span><span>Only slugs that are not in your blaster can be traded.</span></div></div>`, 'trade');
    $('screen').querySelectorAll('.card').forEach((c) => c.addEventListener('click', async () => {
      const r = await Engine.call('/trade', { id: Number(c.dataset.id) });
      closeScreen();
      if (r.ok) { toast('Traded! You got ' + r.got.name + ' Lv' + r.got.level, 'good'); Sound.sfx.catch(); } else toast(r.error.msg, 'bad');
      await sync(r);
    }));
  }

  // ----- how to play
  function howScreen() {
    openScreen(`<div class="sheet"><div class="sheet-head"><h2>HOW TO PLAY</h2></div><div class="sheet-body how">
      <p><b>Slugbound</b> is a game about C++ objects. Every rule (movement, damage, turn order, saves) is calculated by a <b>C++ engine</b>. The browser only draws what C++ tells it.</p>
      <h3>Controls</h3><table><tr><td><kbd>W A S D</kbd> / arrows</td><td>walk</td></tr><tr><td><kbd>E</kbd> / <kbd>Space</kbd></td><td>talk, open, interact (face the thing)</td></tr><tr><td><kbd>H</kbd></td><td>show or hide the direction arrow (it points at the next thing to do)</td></tr><tr><td><kbd>B</kbd></td><td>blaster and slugs</td></tr><tr><td><kbd>P</kbd></td><td>Slugpedia</td></tr><tr><td><kbd>Tab</kbd></td><td>Code Lens: class tags and a live console of constructors, destructors and exceptions</td></tr><tr><td><kbd>Esc</kbd></td><td>menu (save, load, quality)</td></tr><tr><td><kbd>1</kbd>-<kbd>5</kbd></td><td>fire, swap, guard, moss, run in a duel</td></tr></table>
      <h3>The element wheel</h3><p>${Art.iconHtml('Fire')} Fire → ${Art.iconHtml('Ice')} Ice → ${Art.iconHtml('Air')} Air → ${Art.iconHtml('Earth')} Earth → ${Art.iconHtml('Energy')} Energy → ${Art.iconHtml('Fire')} Fire. Hit the next element for <b>2x</b>, the previous for <b>0.5x</b>.</p>
      <h3>Gates</h3><p>The slug that opens a gate must be <b>in your blaster</b>: Earth smashes walls, Ice freezes lava and water, Air glides across chasms, Energy powers crystal doors. Find the 3 keystones, break into Gorvax's Keep and take back the light.</p>
    </div><div class="sheet-foot"><span><kbd>Esc</kbd> close</span></div></div>`, 'how');
  }

  function creditsScreen(concepts) {
    openScreen(`<div class="sheet" style="width:min(760px,94vw)"><div class="sheet-body credits"><h1>The light returns</h1><p style="font-size:20px">You relit the Heartcrystal. Hollowdeep glows again.</p><p style="color:var(--teal);letter-spacing:3px;font-weight:800">OOP CONCEPTS IN THIS GAME</p><ul>${concepts.map((c) => `<li>${esc(c)}</li>`).join('')}</ul><p style="color:var(--dim)">Built for the Object Oriented Programming course (C++).</p><button class="btn gold" id="creditsOk">Back to the Keep</button></div></div>`, 'credits');
    $('creditsOk').onclick = () => closeScreen();
  }

  return {
    hooks, updateHud, showHud, zoneBanner, toast, say, dialogAdvance, dialogOpen, logLines, toggleConsole, consoleOpen,
    showCard, closeCard, cardOpen, lensBuild, lensSet, lensUpdate, lensIsOn, lensClear, openScreen, closeScreen, isScreen,
    pauseMenu, blasterScreen, renderBlaster, pediaScreen, fusionScreen, tradeScreen, howScreen, creditsScreen, sleep, esc, get state() { return state; },
  };
})();
