// battle.js - the duel: a 3D diorama with sprites and toon slugs, the battle HUD, and the controller that
// talks to the C++ engine (/fire /swap /guard /moss /run /enemyturn). The browser animates; C++ decides.
const Battle = (() => {
  const B = BABYLON;
  const $ = (id) => document.getElementById(id);
  const V3 = (x, y, z) => new B.Vector3(x, y, z);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const EL_COLOR = Art.ELEMENT_COLOR;
  const C = V3(0, 0, 300);                         // centre of the arena, far from the overworld
  const PLAYER_POS = V3(C.x - 4.1, 0, C.z - 0.9);
  const SLUG_POS = V3(C.x - 1.5, 0, C.z - 2.5);
  const ENEMY_POS = V3(C.x + 2.6, 0, C.z + 1.9);
  const CAM = { pos: V3(C.x - 7.8, 4.2, C.z - 9.4), look: V3(C.x + 0.5, 0.2, C.z + 0.6) };

  let arena = null, frontModel = null, enemyModel = null, enemyActor = null, playerActor = null, minionActors = [];
  let camPos = CAM.pos.clone(), camLook = CAM.look.clone(), camT = 0, camDesired = null, battleLight = null, fxLight = null, redPulse = 0;
  let cur = null;            // latest battle state from the engine
  let busy = false, typing = null, prevSun = null;
  let camSwing = 0, fogBefore = 0.03;

  // =========================================================
  //  arena
  // =========================================================
  function buildArena(zoneId) {
    const scene = World3D.scene, P = World3D.PRESETS[zoneId];
    arena = new B.TransformNode('arena', scene);
    const floorTex = World3D.texFromCanvas(Art.floorTexture(zoneId), 'floor' + zoneId, { wrap: true });
    const rockTex = World3D.texFromCanvas(Art.rockTexture(zoneId), 'rock' + zoneId, { wrap: true });
    const mk = (name, color) => { const m = new B.StandardMaterial(name, scene); m.diffuseColor = B.Color3.FromHexString(color); m.specularColor = new B.Color3(0, 0, 0); return m; };
    const floorM = mk('arenaFloor', '#ffffff'); floorM.diffuseTexture = floorTex; floorTex.uScale = 2.5; floorTex.vScale = 2.5; floorM.emissiveColor = new B.Color3(0.05, 0.07, 0.08);
    const plat = B.MeshBuilder.CreateCylinder('plat', { diameter: 13, height: 0.5, tessellation: 48 }, scene);
    plat.position = V3(C.x, -0.26, C.z); plat.material = floorM; plat.receiveShadows = true; plat.parent = arena; plat.isPickable = false;
    const rim = B.MeshBuilder.CreateTorus('platRim', { diameter: 13, thickness: 0.22, tessellation: 48 }, scene);
    rim.position = V3(C.x, 0.0, C.z); rim.parent = arena; rim.isPickable = false;
    const rm = mk('rimM', '#555a70'); rm.emissiveColor = B.Color3.FromHexString(P.accent).scale(0.25); rim.material = rm;
    const ringGlow = (d, th, a) => { const t = B.MeshBuilder.CreateTorus('glowRing', { diameter: d, thickness: th, tessellation: 64 }, scene); t.position = V3(C.x, 0.03, C.z); t.parent = arena; t.isPickable = false; const m = new B.StandardMaterial('rg', scene); m.emissiveColor = B.Color3.FromHexString(P.accent).scale(a); m.disableLighting = true; t.material = m; return t; };
    ringGlow(10.6, 0.05, 0.9); ringGlow(6.4, 0.04, 0.6);
    // rune disc
    const disc = B.MeshBuilder.CreatePlane('rune', { size: 9 }, scene); disc.rotation.x = Math.PI / 2; disc.position = V3(C.x, 0.04, C.z); disc.parent = arena; disc.isPickable = false;
    const dm = new B.StandardMaterial('runeDisc', scene); dm.emissiveTexture = World3D.texFromCanvas(Art2.swirl(zoneId === 'vein' ? 20 : zoneId === 'keep' ? 340 : zoneId === 'hollows' ? 205 : 160), 'swirlA' + zoneId, { alpha: true }); dm.opacityTexture = dm.emissiveTexture; dm.emissiveColor = new B.Color3(1, 1, 1); dm.disableLighting = true; dm.alpha = 0.55; dm.alphaMode = B.Engine.ALPHA_ADD; dm.backFaceCulling = false; disc.material = dm;
    arena._disc = disc;
    // standing crystals / props around the rim
    const accent = B.Color3.FromHexString(P.accent);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, r = 7.4 + (i % 2) * 1.6;
      const h = 1.6 + (i * 37 % 10) / 4;
      const c = B.MeshBuilder.CreateCylinder('bprop', { diameterTop: 0, diameterBottom: 0.9 + (i % 3) * 0.2, height: h, tessellation: zoneId === 'keep' ? 4 : 6 }, scene);
      c.position = V3(C.x + Math.cos(a) * r, h / 2 - 0.1, C.z + Math.sin(a) * r); c.rotation.set((i % 3 - 1) * 0.12, a, (i % 2 - 0.5) * 0.15); c.parent = arena; c.isPickable = false; c.metadata = { caster: false };
      const m = new B.StandardMaterial('bpm', scene); m.diffuseColor = accent.scale(0.5); m.emissiveColor = accent.scale(zoneId === 'keep' ? 0.12 : 0.35); m.specularColor = new B.Color3(1, 1, 1); m.alpha = zoneId === 'vein' || zoneId === 'keep' ? 1 : 0.92; c.material = m;
      if (zoneId === 'vein' || zoneId === 'keep') { m.diffuseColor = new B.Color3(0.12, 0.09, 0.14); m.emissiveColor = accent.scale(0.08); }
      c.convertToFlatShadedMesh();
    }
    // far rocks (backdrop) with the zone rock texture
    const rockM = mk('arenaRock', '#ffffff'); rockM.diffuseTexture = rockTex; rockM.emissiveColor = new B.Color3(0.06, 0.07, 0.1);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = 15 + (i % 3) * 2.5;
      const h = 6 + (i * 53 % 7);
      const c = B.MeshBuilder.CreateCylinder('brock', { diameterTop: 1.5 + (i % 3), diameterBottom: 4.2 + (i % 4), height: h, tessellation: 6 }, scene);
      c.position = V3(C.x + Math.cos(a) * r, h / 2 - 1, C.z + Math.sin(a) * r); c.rotation.y = i; c.parent = arena; c.material = rockM; c.isPickable = false; c.convertToFlatShadedMesh();
    }
    // moving light shafts and motes
    const shaftTex = World3D.texFromCanvas(Art2.shaft(), 'shaft', { alpha: true });
    for (let i = 0; i < 3; i++) {
      const s = B.MeshBuilder.CreatePlane('bshaft', { width: 3.4, height: 10 }, scene);
      s.position = V3(C.x + (i - 1) * 4.2, 5, C.z + 3 + i); s.rotation.z = -0.25; s.billboardMode = B.Mesh.BILLBOARDMODE_Y; s.parent = arena; s.isPickable = false;
      const m = new B.StandardMaterial('bsm', scene); m.emissiveTexture = shaftTex; m.opacityTexture = shaftTex; m.emissiveColor = B.Color3.FromHexString(P.mote).scale(0.5); m.alpha = 0.55; m.alphaMode = B.Engine.ALPHA_ADD; m.disableLighting = true; m.backFaceCulling = false; s.material = m;
    }
    const motes = new B.ParticleSystem('bmotes', 150, scene);
    motes.particleTexture = World3D.texFromCanvas(Art.glowDot(), 'dot', { alpha: true });
    motes.emitter = V3(C.x, 0.3, C.z); motes.minEmitBox = V3(-8, 0, -8); motes.maxEmitBox = V3(8, 5, 8);
    motes.color1 = B.Color4.FromColor3(B.Color3.FromHexString(P.mote), 0.9); motes.color2 = new B.Color4(1, 1, 1, 0.6); motes.colorDead = new B.Color4(0, 0, 0, 0);
    motes.minSize = 0.05; motes.maxSize = 0.18; motes.minLifeTime = 4; motes.maxLifeTime = 8; motes.emitRate = 24; motes.blendMode = B.ParticleSystem.BLENDMODE_ADD;
    motes.gravity = V3(0, zoneId === 'vein' ? 0.5 : 0.05, 0); motes.direction1 = V3(-0.3, 0.1, -0.3); motes.direction2 = V3(0.3, 0.4, 0.3); motes.preWarmCycles = 40; motes.preWarmStepOffset = 4; motes.start();
    arena._motes = motes;
    battleLight = new B.PointLight('battleLight', V3(C.x, 4.5, C.z), scene); battleLight.diffuse = B.Color3.FromHexString(P.accent); battleLight.intensity = 0.5; battleLight.range = 16;
    fxLight = new B.PointLight('fxLight', V3(C.x, 2, C.z), scene); fxLight.intensity = 0; fxLight.range = 12;
    arena._meshes = arena.getChildMeshes();
    return arena;
  }

  function disposeArena() {
    if (!arena) return;
    if (arena._motes) arena._motes.dispose();
    arena.getChildMeshes().forEach((m) => { if (m.material && !m.material._shared) m.material.dispose(); });
    arena.dispose(false, false);
    if (battleLight) battleLight.dispose(); if (fxLight) fxLight.dispose();
    arena = null;
  }

  // =========================================================
  //  characters
  // =========================================================
  function faceTo(node, from, to) { node.rotation.y = Math.atan2(to.x - from.x, to.z - from.z); }

  function setFront(slug, pop = true) {
    if (frontModel) { frontModel.dispose(); frontModel = null; }
    if (!slug) return;
    frontModel = Slugs3D.create(slug.element);
    frontModel.root.parent = arena; frontModel.root.position.copyFrom(SLUG_POS);
    faceTo(frontModel.root, SLUG_POS, ENEMY_POS);
    World3D.shadowGen && frontModel.meshes.forEach((m) => World3D.shadowGen.addShadowCaster(m));
    frontModel.slug = slug;
    if (pop) { frontModel.root.scaling.setAll(0.01); World3D.tween(0.35, (k) => { frontModel.root.scaling.setAll(0.01 + k * 0.99); }, (t) => 1 - Math.pow(1 - t, 3) * Math.cos(t * 9) * (1 - t)); Slugs3D.burst(SLUG_POS.add(V3(0, 0.6, 0)), slug.element, 16, 0.7); }
  }

  function makeEnemy(e) {
    const kind = e.kind;
    if (kind === 'wild') {
      enemyModel = Slugs3D.create(e.element);
      enemyModel.root.parent = arena; enemyModel.root.position.copyFrom(ENEMY_POS); enemyModel.root.scaling.setAll(1.85);
      faceTo(enemyModel.root, ENEMY_POS, PLAYER_POS);
      World3D.shadowGen && enemyModel.meshes.forEach((m) => World3D.shadowGen.addShadowCaster(m));
      enemyModel.baseScale = 1.85;
      return;
    }
    const name = kind === 'boss' ? 'gorvax' : kind === 'rival' ? 'kessa' : 'ghoul_' + ({ Ice: 'ice', Fire: 'fire', Ghoul: 'ghoul' }[e.element] || 'ghoul');
    const h = kind === 'boss' ? 4.1 : kind === 'rival' ? 2.2 : 2.3;
    enemyActor = new World3D.Actor(name, { h, float: kind === 'ghoul' ? 0.3 : 0, aura: kind === 'ghoul' ? ({ Ice: '#7ae0ff', Fire: '#ff9a3c', Ghoul: '#ff3df2' }[e.element] || '#ff3df2') : (kind === 'boss' ? '#ff2a3a' : null) });
    enemyActor.node.parent = arena; enemyActor.node.position.copyFrom(ENEMY_POS);
    if (kind === 'rival') enemyActor.hasViews = false;
    enemyActor.setDir('down');
  }

  function syncMinions(n) {
    while (minionActors.length > n) { const a = minionActors.pop(); popMinion(a); }
    while (minionActors.length < n) {
      const i = minionActors.length;
      const a = new World3D.Actor('minion', { h: 1.5, float: 0.2, aura: '#ff3df2' });
      a.node.parent = arena; a.node.position.set(ENEMY_POS.x + 1.9 + i * 0.0, 0, ENEMY_POS.z - 1.9 + i * 1.5);
      a.node.position.x = ENEMY_POS.x - 0.8 - i * 0.2; a.node.position.z = ENEMY_POS.z - 2.4 + i * 1.5;
      a.setDir('left'); minionActors.push(a);
      a.node.scaling.setAll(0.01); World3D.tween(0.4, (k) => a.node.scaling.setAll(Math.max(0.01, k)), World3D.easeOut);
      Slugs3D.burst(a.node.position.add(V3(0, 0.8, 0)), 'Ghoul', 14, 0.7);
    }
  }
  function popMinion(a) {
    Slugs3D.burst(a.node.position.add(V3(0, 0.8, 0)), 'Ghoul', 24, 0.9);
    World3D.tween(0.25, (k) => a.node.scaling.setAll(1 - k)).then(() => a.remove());
  }

  // =========================================================
  //  camera rig
  // =========================================================
  function camFrame(dt, t) {
    if (!arena) return;
    camT += dt;
    camSwing = Math.sin(camT * 0.35) * 0.9;
    const target = camDesired || { pos: CAM.pos, look: CAM.look };
    const k = Math.min(1, dt * 2.6);
    camPos.x += (target.pos.x - camPos.x) * k; camPos.y += (target.pos.y - camPos.y) * k; camPos.z += (target.pos.z - camPos.z) * k;
    camLook.x += (target.look.x - camLook.x) * k; camLook.y += (target.look.y - camLook.y) * k; camLook.z += (target.look.z - camLook.z) * k;
    const cam = World3D.camera;
    cam.position.set(camPos.x + camSwing * 0.5, camPos.y + Math.sin(camT * 0.5) * 0.12, camPos.z);
    cam.setTarget(camLook);
    if (arena._disc) arena._disc.rotation.y += dt * 0.12;
    if (frontModel) frontModel.idle(t);
    if (enemyModel) enemyModel.idle(t);
    if (fxLight && fxLight.intensity > 0) fxLight.intensity = Math.max(0, fxLight.intensity - dt * 7);
    if (redPulse > 0) { battleLight.diffuse = B.Color3.Lerp(B.Color3.FromHexString(World3D.PRESETS[World3D.zone.id].accent), new B.Color3(1, 0.1, 0.1), 0.5 + Math.sin(t * 9) * 0.5); battleLight.intensity = 1.2; }
  }
  const camShot = (name) => {
    const shots = {
      default: null,
      hit: { pos: V3(C.x - 6.2, 3.6, C.z - 9.0), look: V3(C.x + 1.4, 0.5, C.z + 0.8) },
      enemy: { pos: V3(C.x - 1.6, 3.0, C.z - 6.4), look: V3(C.x + 2.4, 0.8, C.z + 1.6) },
      player: { pos: V3(C.x - 1.4, 3.2, C.z - 8.6), look: V3(C.x - 2.4, 0.5, C.z - 1.6) },
      intro: { pos: V3(C.x + 6.0, 2.0, C.z - 2.0), look: V3(C.x + 3.0, 1.5, C.z + 2.0) },
      boss: { pos: V3(C.x + 1.4, 1.4, C.z - 1.0), look: V3(C.x + 3.0, 2.6, C.z + 2.0) },
    };
    camDesired = shots[name] || null;
  };
  const flashLight = (color, i = 3) => { if (!fxLight) return; fxLight.diffuse = B.Color3.FromHexString(color); fxLight.intensity = i; };

  // =========================================================
  //  battle HUD
  // =========================================================
  const hpClass = (hp, max) => (hp / max > 0.5 ? '' : hp / max > 0.2 ? 'mid' : 'low');
  function setBar(el, hp, max) { el.style.width = Math.max(0, hp / max * 100) + '%'; el.parentElement.className = 'bar big hp ' + hpClass(hp, max); }
  function updateHud(b, opts = {}) {
    cur = b;
    const e = b.enemy;
    $('enName').textContent = e.name; $('enLv').textContent = 'Lv' + e.level;
    $('enElem').textContent = Art.elementEmoji(e.element) + ' ' + e.element; $('enElem').style.color = EL_COLOR[e.element];
    if (!opts.keepEnemyHp) setBar($('enHp'), e.hp, e.maxHp);
    const st = [];
    if (e.burn > 0) st.push('🔥 burning'); if (e.slow > 0) st.push('❄ slowed'); if (e.stunned) st.push('⚡ stunned');
    $('enStatus').innerHTML = st.map((s) => `<span>${s}</span>`).join('');
    const bi = $('bossInfo');
    if (e.kind === 'boss') {
      bi.classList.remove('hidden');
      bi.innerHTML = `<div class="phase-pips">${[1, 2, 3].map((p) => `<i class="${p <= e.phase ? 'on' : ''}"></i>`).join('')}</div><div>PHASE ${e.phase} · shield: ${Art.elementEmoji(e.element)} ${e.element}${e.warning ? ' · <b style="color:#ff5a6a">WARNING!</b>' : ''}</div>${e.minions ? `<div class="minions">${'<span></span>'.repeat(e.minions)}<small>stack&lt;Enemy*&gt; · top absorbs the next hit</small></div>` : ''}`;
    } else bi.classList.add('hidden');
    const f = b.front;
    if (f) {
      $('plName').textContent = f.name; $('plLv').textContent = 'Lv' + f.level; $('plElem').textContent = Art.elementEmoji(f.element) + ' ' + f.element; $('plElem').style.color = EL_COLOR[f.element];
      setBar($('plHp'), f.hp, f.maxHp); $('plHpTxt').textContent = f.hp + '/' + f.maxHp; $('plXp').style.width = (f.xp / f.xpNeed * 100) + '%';
    }
    $('slHp').textContent = b.slingerHp + '/' + b.slingerMax; $('slAmmo').textContent = b.ammo; $('slMoss').textContent = b.moss;
    const sh = $('slShield'); sh.classList.toggle('hidden', !b.shield); sh.querySelector('b').textContent = b.shield;
    $('slGuard').classList.toggle('hidden', !b.guard);
    const q = $('battleQueue'); q.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const s = b.queue[i]; const d = document.createElement('div');
      d.className = 'qslot' + (s ? '' : ' empty') + (i === 0 && s ? ' front' : '');
      if (s) d.innerHTML = `<img src="${Art.portraitFor(s.name, 96)}"><span class="qlv">${s.level}</span><div class="qhp"><i style="width:${s.hp / s.maxHp * 100}%"></i></div>`;
      q.appendChild(d);
    }
    const my = b.turn === 'player' && !b.over && !busy;
    document.querySelectorAll('.cmd').forEach((c) => {
      c.disabled = !my;
      if (c.dataset.cmd === 'run') c.disabled = !my || e.kind !== 'wild';
      if (c.dataset.cmd === 'moss') c.disabled = !my || b.moss <= 0;
      if (c.dataset.cmd === 'fire') c.disabled = !my || b.ammo <= 0 || !b.front;
      if (c.dataset.cmd === 'swap') c.disabled = !my || b.queue.length < 2;
    });
  }

  function say(text, hold = 0) {
    return new Promise((resolve) => {
      clearInterval(typing);
      const el = $('msgText'); el.textContent = '';
      let i = 0;
      typing = setInterval(() => {
        i += 2; el.textContent = text.slice(0, i);
        if (i % 6 === 0) Sound.sfx.text();
        if (i >= text.length) { clearInterval(typing); el.textContent = text; setTimeout(resolve, hold); }
      }, 18);
    });
  }
  function banner(text, color) {
    const b = $('turnBanner'); b.textContent = text; b.style.color = color || '#fff'; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function effBanner(text, color) {
    const b = $('effBanner'); b.textContent = text; b.style.color = color; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function floater(text, cls, worldPos) {
    const p = World3D.camera ? projectWorld(worldPos) : { x: innerWidth / 2, y: innerHeight / 2 };
    const f = document.createElement('div'); f.className = 'floater ' + (cls || ''); f.textContent = text;
    f.style.left = p.x + 'px'; f.style.top = p.y + 'px'; $('floaters').appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }
  function projectWorld(v) {
    const eng = World3D.engine, sc = World3D.scene;
    const vp = World3D.camera.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight());
    const p = B.Vector3.Project(v, B.Matrix.Identity(), sc.getTransformMatrix(), vp);
    const k = eng.getHardwareScalingLevel();
    return { x: p.x * k, y: p.y * k };
  }

  // =========================================================
  //  animations
  // =========================================================
  const enemyCenter = () => (enemyModel ? ENEMY_POS.add(V3(0, 0.9, 0)) : ENEMY_POS.add(V3(0, (enemyActor ? enemyActor.h : 2) * 0.5, 0)));
  const slugCenter = () => SLUG_POS.add(V3(0, 0.7, 0));

  function enemyHitReact(power = 1) {
    if (enemyModel) { enemyModel.flashWhite(0.9); enemyModel.squashHit(0.45 * power); }
    if (enemyActor) {
      enemyActor.plane.material.emissiveColor = new B.Color3(1, 1, 1);
      const sx = enemyActor.node.position.x, sz = enemyActor.node.position.z;
      World3D.tween(0.32, (k) => { const o = Math.sin(k * Math.PI) * 0.45 * power; enemyActor.node.position.x = sx + o; enemyActor.node.position.z = sz + o * 0.6; enemyActor.plane.material.emissiveColor = new B.Color3(1 - k * 0.74, 1 - k * 0.74, 1 - k * 0.7); });
    }
  }

  async function animFire(a, b) {
    const s = a.slug, el = s.element;
    const model = frontModel;
    if (!model) return;
    const start = model.root.position.clone().add(V3(0, 0.3, 0));
    Sound.sfx.fire();
    camShot('player');
    // anticipation: squash and glow
    model.setGlow(0.4);
    await World3D.tween(0.22, (k) => { model.root.position.y = SLUG_POS.y - Math.sin(k * Math.PI) * 0.0; model.state.squash = 0.35 * k; });
    camShot('hit');
    const trail = Slugs3D.trail(model.root, el);
    const target = enemyCenter();
    const nHits = Math.max(1, a.hits || 1);
    const preHp = cur.enemy.hp;
    let landed = 0;
    for (let h = 0; h < nHits; h++) {
      const from = h === 0 ? start : target.add(V3(-1.2, 1.2, -0.8));
      const dur = h === 0 ? 0.5 : 0.3;
      await World3D.tween(dur, (k) => {
        const p = B.Vector3.Lerp(from, target, k);
        p.y += Math.sin(k * Math.PI) * (h === 0 ? 1.6 : 0.9);
        model.root.position.copyFrom(p);
        model.root.rotation.z = k * 12; model.state.squash = 0;
      }, World3D.easeInOut);
      model.root.rotation.z = 0;
      landed++;
      // impact: the slug "morphs": swells and glows while the element bursts out
      const super_ = a.label === 'super', res = a.label === 'resisted';
      Slugs3D.burst(target, el, super_ ? 70 : 40, super_ ? 1.5 : 1);
      Slugs3D.ring(target, Slugs3D.PAL[el].glow, super_ ? 4.5 : 3, 0.5);
      if (el === 'Energy') Slugs3D.bolt(target.add(V3(0, 4, 0)), target, '#fff06a');
      flashLight(Slugs3D.PAL[el].glow, super_ ? 5 : 3);
      World3D.addShake(super_ ? 0.42 : 0.2);
      if (a.absorbed) { Sound.sfx.resisted(); if (minionActors.length) { const m = minionActors.pop(); popMinion(m); } floater('ABSORBED', 'resisted', target); }
      else {
        const dmgThis = Math.round(a.damage / nHits);
        Sound.sfx[super_ ? 'superHit' : (res ? 'resisted' : 'hit')]();
        enemyHitReact(super_ ? 1.5 : res ? 0.5 : 1);
        floater(String(dmgThis), super_ ? 'super' : res ? 'resisted' : '', target.add(V3(0, 0.8 + h * 0.4, 0)));
        // live enemy HP tick: drops hit by hit, ends at the value C++ reported
        setBar($('enHp'), Math.max(b.enemy.hp, preHp - Math.round(a.damage * landed / nHits)), b.enemy.maxHp);
      }
      if (super_ && h === 0) { effBanner('SUPER EFFECTIVE!', '#ffe14a'); await World3D.tween(0.12, () => {}); }
      if (res && h === 0) effBanner('Not very effective...', '#9db3c9');
      model.root.scaling.setAll(1.45); model.setGlow(1);
      await World3D.tween(0.22, (k) => { model.root.scaling.setAll(1.45 - 0.45 * k); model.setGlow(1 - k * 0.7); });
      if (nHits > 1 && h < nHits - 1) await wait(60);
    }
    trail.stop(); setTimeout(() => trail.dispose(), 700);
    // return to the blaster (the slug re-queues at the back)
    const here = model.root.position.clone();
    await World3D.tween(0.38, (k) => {
      const p = B.Vector3.Lerp(here, start.add(V3(-1, 0.4, -0.6)), k); p.y += Math.sin(k * Math.PI) * 1.0;
      model.root.position.copyFrom(p); model.root.scaling.setAll(1 - k * 0.97);
    }, World3D.easeInOut);
    model.setGlow(0);
  }

  async function animEnemyAttack(m, b) {
    const k0 = m.kind;
    const target = frontModel ? frontModel.root.position.add(V3(0, 0.7, 0)) : PLAYER_POS.add(V3(0, 1, 0));
    if (k0 === 'stunned') { effBanner('STUNNED!', '#ffe14a'); Sound.sfx.hurt(); if (enemyActor) await World3D.tween(0.5, (k) => { enemyActor.node.position.x = ENEMY_POS.x + Math.sin(k * 40) * 0.12; }); if (enemyModel) { enemyModel.state.squash = 0.4; await wait(500); } return; }
    if (k0 === 'warning') { camShot('boss'); Sound.sfx.warning(); redPulse = 1; effBanner('WARNING!', '#ff5a6a'); World3D.flash(0.18); World3D.addShake(0.15); await wait(900); camShot('default'); return; }
    camShot('enemy');
    const from = enemyActor ? enemyActor.node.position.clone() : enemyModel.root.position.clone();
    const mover = enemyActor ? enemyActor.node : enemyModel.root;
    const to = B.Vector3.Lerp(from, PLAYER_POS.add(V3(1.2, 0, 0.8)), k0 === 'mega' ? 0.2 : 0.65);
    if (k0 === 'mega') { redPulse = 0; Sound.sfx.mega(); World3D.flash(0.5); await World3D.tween(0.5, (k) => { mover.position.y = k * 1.2; }); }
    else await World3D.tween(0.28, (k) => { mover.position.x = from.x + (to.x - from.x) * (k * k); mover.position.z = from.z + (to.z - from.z) * (k * k); }, (t) => t);
    camShot('hit');
    const col = enemyActor && b.enemy.kind === 'boss' ? 'Ghoul' : (b.enemy.element || 'Ghoul');
    Slugs3D.burst(target, col, 36, 1.1); Slugs3D.ring(target, Slugs3D.PAL[col].glow, 3, 0.45); flashLight(Slugs3D.PAL[col].glow, 3);
    if (m.guarded) { Sound.sfx.guard(); shieldFlash(); }
    else Sound.sfx.hurt();
    World3D.addShake(k0 === 'mega' ? 0.9 : m.label === 'super' ? 0.45 : 0.25);
    if (k0 === 'mega') { World3D.flash(0.7); floater('-' + m.dmgSlinger, 'take', PLAYER_POS.add(V3(0, 2.2, 0))); }
    if (m.dmgSlug > 0 && frontModel) { frontModel.flashWhite(0.8); frontModel.squashHit(0.5); floater('-' + m.dmgSlug, 'take', target.add(V3(0, 0.7, 0))); }
    if (m.shieldAbsorbed > 0) floater('🛡 -' + m.shieldAbsorbed, 'heal', target.add(V3(0.5, 1.3, 0)));
    if (m.label === 'super' && m.dmgSlug > 0) effBanner('Super effective!', '#ff7a8a');
    if (m.label === 'resisted' && m.dmgSlug > 0) effBanner('Not very effective...', '#9db3c9');
    await wait(180);
    await World3D.tween(0.3, (k) => { mover.position.x = to.x + (from.x - to.x) * k; mover.position.z = to.z + (from.z - to.z) * k; mover.position.y = (k0 === 'mega' ? 1.2 * (1 - k) : 0); });
    mover.position.copyFrom(from);
    if (m.fainted && frontModel) {
      Sound.sfx.faint();
      const fm = frontModel; frontModel = null;
      Slugs3D.burst(fm.root.position.add(V3(0, 0.6, 0)), fm.element, 30, 1);
      await World3D.tween(0.7, (k) => { fm.root.position.y += 0.03; fm.root.rotation.z = k * 4; fm.root.scaling.setAll(1 - k); });
      fm.dispose();
    }
  }

  let shield = null;
  function shieldFlash() {
    const scene = World3D.scene;
    if (shield) shield.dispose();
    shield = B.MeshBuilder.CreateSphere('shield', { diameter: 3.6, segments: 24 }, scene);
    shield.position = PLAYER_POS.add(V3(1.4, 1.1, 0.9)); shield.isPickable = false;
    const m = new B.StandardMaterial('shM', scene); m.emissiveColor = new B.Color3(0.2, 1, 0.75); m.disableLighting = true; m.alpha = 0.5; m.alphaMode = B.Engine.ALPHA_ADD; shield.material = m;
    World3D.tween(0.6, (k) => { shield && (m.alpha = 0.5 * (1 - k)); }).then(() => { shield && shield.dispose(); shield = null; });
  }

  async function animSwap() {
    Sound.sfx.swap();
    if (frontModel) { const fm = frontModel; await World3D.tween(0.2, (k) => { fm.root.scaling.setAll(1 - k * 0.99); fm.root.rotation.y += 0.5; }); }
  }

  async function animMoss() {
    Sound.sfx.heal();
    for (let i = 0; i < 3; i++) { Slugs3D.burst(slugCenter().add(V3(0, 0.3 * i, 0)), 'Earth', 26, 0.8); }
    flashLight('#7aff9a', 2);
    if (frontModel) floater('+HP', 'heal', slugCenter().add(V3(0, 1.1, 0)));
    await wait(500);
  }

  async function animEnemyDown(caught) {
    const t = enemyCenter();
    if (caught) {
      // capture: the wild slug shrinks into a glowing orb which wobbles and clicks
      const scene = World3D.scene;
      const orb = B.MeshBuilder.CreateSphere('orb', { diameter: 0.55 }, scene); orb.position = t.clone(); orb.isPickable = false;
      const m = new B.StandardMaterial('orbM', scene); m.emissiveColor = B.Color3.FromHexString(EL_COLOR[cur.enemy.element]); m.disableLighting = true; orb.material = m;
      const mover = enemyModel ? enemyModel.root : null;
      await World3D.tween(0.5, (k) => { if (mover) { mover.scaling.setAll(Math.max(0.01, enemyModel.baseScale * (1 - k))); mover.position.y = k * 0.4; } orb.position = B.Vector3.Lerp(t, ENEMY_POS.add(V3(0, 0.4, 0)), k); });
      if (mover) mover.setEnabled(false);
      await World3D.tween(0.35, (k) => { orb.position.y = 0.4 - k * 0.2; });
      for (let i = 0; i < 3; i++) { Sound.sfx.blip(); await World3D.tween(0.3, (k) => { orb.rotation.z = Math.sin(k * Math.PI * 2) * 0.5; }); await wait(120); }
      Sound.sfx.catch(); Slugs3D.burst(orb.position, cur.enemy.element, 50, 1.2); Slugs3D.ring(orb.position, EL_COLOR[cur.enemy.element], 3, 0.6);
      await wait(400);
      orb.dispose(); m.dispose();
      return;
    }
    Slugs3D.burst(t, cur.enemy.element === 'Ghoul' ? 'Ghoul' : cur.enemy.element, 80, 1.6); Slugs3D.ring(t, '#ffffff', 4, 0.7);
    Sound.sfx.faint(); World3D.addShake(0.3);
    const model = enemyModel, actor = enemyActor;
    await World3D.tween(0.8, (k) => {
      if (model) { model.root.scaling.setAll(Math.max(0.01, model.baseScale * (1 - k))); model.root.rotation.y += 0.2; model.root.position.y = k * 1.5; }
      if (actor) { actor.plane.visibility = 1 - k; actor.blob.visibility = 1 - k; actor.node.position.y = k * 0.6; if (actor.glowAura) actor.glowAura.visibility = 1 - k; }
    });
    if (model) model.root.setEnabled(false);
    minionActors.forEach(popMinion); minionActors = [];
  }

  // =========================================================
  //  controller
  // =========================================================
  let resolveBattle = null;
  let handler = null;     // Game.handle for each engine response
  let flushCards = async () => {};

  async function run(startResp, opts) {
    handler = opts.handle; flushCards = opts.flushCards;
    const b = startResp.battle;
    const done = new Promise((resolve) => { resolveBattle = resolve; });
    cur = b; busy = true;
    const zid = World3D.zone.id;
    Sound.sfx.encounter();
    World3D.flash(0.8);
    const fade = $('fade'); fade.classList.add('on'); await wait(450);
    // build the arena far away and switch the camera over
    World3D.setCamMode('free');
    fogBefore = World3D.scene.fogDensity; World3D.scene.fogDensity = fogBefore * 0.45;
    prevSun = { auto: World3D.sun.autoUpdateExtends, z: World3D.sun.autoCalcShadowZBounds };
    buildArena(zid);
    const sun = World3D.sun;
    sun.autoUpdateExtends = false; sun.autoCalcShadowZBounds = false;
    sun.position = V3(C.x - 12, 18, C.z - 8); sun.orthoLeft = -9; sun.orthoRight = 9; sun.orthoTop = 9; sun.orthoBottom = -9; sun.shadowMinZ = 1; sun.shadowMaxZ = 60;
    playerActor = new World3D.Actor('kai', { h: 2.0 }); playerActor.node.parent = arena; playerActor.node.position.copyFrom(PLAYER_POS); playerActor.hasViews = true; playerActor.setDir('up');
    makeEnemy(b.enemy);
    camPos.copyFrom(CAM.pos.add(V3(4.5, 1.5, 2))); camLook.copyFrom(CAM.look); camDesired = null;
    World3D.hooks.frame.push(camFrame);
    World3D.lantern.position.set(C.x - 4.5, 3.2, C.z - 5.5);
    Sound.music(b.enemy.kind === 'boss' ? 'boss' : 'battle');
    $('battleUI').classList.remove('hidden');
    UI.showHud(false);
    updateHud(b);
    $('msgText').textContent = '';
    setFront(b.front, false);
    if (frontModel) { frontModel.root.scaling.setAll(0.01); }
    await wait(120);
    fade.classList.remove('on'); await wait(500);
    // intro
    camShot('intro');
    if (b.enemy.kind === 'boss') { redPulse = 0; banner('GORVAX', '#ff5a6a'); World3D.addShake(0.3); Sound.sfx.mega(); await wait(900); }
    camShot('default');
    const intro = startResp.event && startResp.event.lines && startResp.event.lines[0];
    const lead = b.enemy.kind === 'wild' ? `A wild ${b.enemy.name.replace('Wild ', '')} appeared!` : (b.enemy.kind === 'boss' ? 'Gorvax the Hollow King blocks the light!' : (intro || (b.enemy.name + ' wants to duel!')));
    await say(lead, 500);
    if (b.enemy.kind === 'boss') await say('"A child with a toy blaster? The light is MINE, Slinger!"', 600);
    if (frontModel) { setFront(b.front, true); await say(`Go, ${b.front.name}!`, 300); }
    if (b.enemy.minions) syncMinions(b.enemy.minions);
    busy = false;
    await nextTurn(b);
    return done;
  }

  async function nextTurn(b) {
    updateHud(b);
    if (b.over) return;
    if (b.turn === 'player') { banner('YOUR TURN', '#5affbe'); await say('What will you do?', 0); }
  }

  async function command(cmd) {
    if (busy || !cur || cur.over || cur.turn !== 'player') return;
    busy = true; document.querySelectorAll('.cmd').forEach((c) => (c.disabled = true));
    Sound.sfx.select();
    const route = { fire: '/fire', swap: '/swap', guard: '/guard', moss: '/moss', run: '/run' }[cmd];
    const r = await Engine.call(route);
    if (!r.ok) {
      busy = false;
      const msg = r.error.kind === 'OutOfAmmoException' ? 'Out of ammo! Guard, swap or run, or use moss.' : r.error.msg;
      UI.toast(msg, 'bad'); Sound.sfx.locked();
      await handler(r); updateHud(cur); return;
    }
    await handler(r);
    const b = r.battle, a = r.action;
    if (cmd === 'fire') {
      const s = a.slug;
      await say(`${s.name} used ${a.effect === 'double' ? 'a double strike' : 'its element'}!`, 0);
      await animFire(a, b);
      updateHud(b, { keepEnemyHp: false });
      if (a.phaseMsg) { await flushCards(); effBanner(a.phaseMsg.split(':')[0], '#ff5a6a'); await say(a.phaseMsg, 500); if (b.enemy.minions) syncMinions(b.enemy.minions); }
      const bits = [];
      if (a.label === 'super') bits.push('It\'s super effective!'); if (a.label === 'resisted') bits.push('It\'s not very effective...');
      if (a.absorbed) bits.push('A Ghoul minion took the hit!');
      if (a.effect === 'burn' && !a.killed) bits.push(`${b.enemy.name} is burning!`);
      if (a.effect === 'slow' && !a.killed) bits.push(`${b.enemy.name} is slowed!`);
      if (a.effect === 'stun') bits.push(`${b.enemy.name} is stunned!`);
      if (a.effect === 'shield') bits.push(`${s.name} raised a shield (+${a.shieldGain})!`);
      if (bits.length) await say(bits.join(' '), 250);
      if (!b.over) { camShot('default'); setFront(b.front, true); }
      await flushCards();
    } else if (cmd === 'swap') {
      await animSwap(); setFront(b.front, true); await say(`${b.front.name} steps up to the front!`, 300);
    } else if (cmd === 'guard') {
      shieldFlash(); Sound.sfx.guard(); await say('You braced for impact. The next hit will be halved.', 300);
    } else if (cmd === 'moss') {
      await animMoss(); await say(`Healing Moss mended ${b.front.name}!`, 200);
    } else if (cmd === 'run') {
      if (a.escaped) { await say('Got away safely!', 400); return finish(r); }
      await say("Couldn't get away!", 300);
    }
    updateHud(b);
    if (b.over) return finish(r);
    await enemyTurn();
  }

  async function enemyTurn() {
    busy = true; updateHud(cur);
    await wait(250);
    const r = await Engine.call('/enemyturn');
    if (!r.ok) { busy = false; await handler(r); return; }
    await handler(r);
    const b = r.battle, m = r.action;
    if (m.burn > 0) { Slugs3D.burst(enemyCenter(), 'Fire', 24, 0.8); floater(String(m.burn), 'take', enemyCenter().add(V3(0, 1, 0))); await say(`${cur.enemy.name} is hurt by its burn!`, 200); setBar($('enHp'), b.enemy.hp, b.enemy.maxHp); }
    if (m.killed) { updateHud(b); return finish(r); }
    if (m.kind === 'none') { return finish(r); }
    await say(m.text, 0);
    await animEnemyAttack(m, b);
    camShot('default');
    updateHud(b);
    if (m.fainted) { await say(`${m.faintedName} fainted!`, 500); await flushCards(); }
    if (m.guarded && m.kind !== 'warning') await say('Your guard halved the damage!', 250);
    if (m.kind === 'mega' && !b.over) await say('The Hollow Blast hit you directly!', 300);
    if (b.over) return finish(r);
    if (b.front) setFront(b.front, !frontModel);
    busy = false;
    await nextTurn(b);
  }

  async function finish(r) {
    const b = r.battle;
    busy = true; redPulse = 0; camShot('default');
    updateHud(b);
    if (b.result === 'win') {
      await animEnemyDown(!!b.caught);
      Sound.music('win');
      Sound.sfx.win();
      if (b.caught) { effBanner('CAUGHT!', '#5affbe'); await say(`Gotcha! ${b.caught.name} (Lv${b.caught.level}) joined your collection!`, 700); }
      banner('VICTORY!', '#ffd23f');
      await say(`${b.enemy.name} was defeated! Your slugs gained ${b.xp} XP.`, 600);
      for (const l of b.levelUps) { Sound.sfx.levelup(); await say(l, 500); }
      const loot = []; if (b.ammoGained) loot.push(`+${b.ammoGained} ammo`); if (b.mossGained) loot.push(`+${b.mossGained} Healing Moss`);
      if (loot.length) await say('You found ' + loot.join(' and ') + '.', 500);
    } else if (b.result === 'lose') {
      Sound.sfx.lose(); banner('DEFEATED', '#ff5a6a');
      await say('All your slugs are down... You black out. The blaster is restored from its snapshot.', 1200);
    }
    await flushCards();
    $('fade').classList.add('on'); await wait(500);
    teardown();
    $('fade').classList.remove('on');
    busy = false;
    if (resolveBattle) { const rs = resolveBattle; resolveBattle = null; rs(r); }
  }

  function teardown() {
    World3D.hooks.frame = World3D.hooks.frame.filter((f) => f !== camFrame);
    if (frontModel) { frontModel.dispose(); frontModel = null; }
    if (enemyModel) { enemyModel.dispose(); enemyModel = null; }
    if (enemyActor) { enemyActor.remove(); enemyActor = null; }
    if (playerActor) { playerActor.remove(); playerActor = null; }
    minionActors.forEach((a) => a.remove()); minionActors = [];
    if (shield) { shield.dispose(); shield = null; }
    disposeArena();
    const sun = World3D.sun; if (prevSun) { sun.autoUpdateExtends = prevSun.auto; sun.autoCalcShadowZBounds = prevSun.z; }
    $('battleUI').classList.add('hidden'); $('floaters').innerHTML = '';
    World3D.setCamMode('follow');
    World3D.scene.fogDensity = fogBefore;
    clearInterval(typing);
  }

  // button + key wiring
  document.querySelectorAll('.cmd').forEach((c) => c.addEventListener('click', () => command(c.dataset.cmd)));
  const active = () => !!arena;

  return { run, command, active, isBusy: () => busy };
})();
