// Plays Slugbound start to finish through the HTTP API. Used to check the C++ engine, the maps and the balance.
// usage: node tools/bot.js [port]
const PORT = process.argv[2] || 8080;
const T0 = Date.now();
setTimeout(() => { console.error('BOT TIMEOUT after 120 s at step', global.__where || '?', JSON.stringify(global.__S && global.__S.player)); process.exit(2); }, 120000).unref();
const BASE = `http://localhost:${PORT}/api`;
let S = null, Z = null, logAll = [], stats = { battles: 0, losses: 0, steps: 0 };
const call = async (route, body) => {
  const r = await (await fetch(BASE + route, { method: 'POST', body: JSON.stringify(body || {}) })).json();
  if (r.state) { S = r.state; global.__S = S; }
  if (r.log) logAll.push(...r.log);
  return r;
};
const say = (...a) => console.log(...a);
const elWheelBeats = { Fire: 'Ice', Ice: 'Air', Air: 'Earth', Earth: 'Energy', Energy: 'Fire' };
const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const key = (x, y) => x + ',' + y;
let seedState = Number(process.env.SLUG_SEED || 1);
const rnd = () => { seedState = (seedState * 1664525 + 1013904223) % 4294967296; return seedState / 4294967296; };

async function loadZone() { Z = (await call('/zone')).zone; }
const objs = () => Z.objects;
const GATES = ['wall', 'gap', 'bridge', 'door', 'keepgate'];
const blocks = (o) => o.kind !== 'patch' && !(o.done && ['ghoul', 'boss', 'rival', ...GATES].includes(o.kind));
const isGate = (o) => GATES.includes(o.kind);

function path(from, goalFn) {
  const q = [[from.x, from.y]], prev = { [key(from.x, from.y)]: null };
  while (q.length) {
    const [x, y] = q.shift();
    if (goalFn(x, y)) { const out = []; let k = key(x, y); while (prev[k]) { out.push(prev[k].d); k = prev[k].from; } return out.reverse(); }
    for (const d in D) {
      const nx = x + D[d][0], ny = y + D[d][1], k = key(nx, ny);
      if (k in prev) continue;
      const t = Z.rows[ny] && Z.rows[ny][nx];
      if (t !== '.' && t !== 'm') continue;
      const o = objs().find((o) => o.x === nx && o.y === ny && o.kind !== 'patch');
      if (o && blocks(o) && !isGate(o)) continue;
      prev[k] = { d, from: key(x, y) };
      q.push([nx, ny]);
    }
  }
  return null;
}

async function fight(r) {
  stats.battles++;
  let b = r.battle, guard = 0, last = b;
  while (b && guard++ < 300) {
    if (b.over) break;
    let res;
    if (b.turn === 'player') {
      const front = b.front;
      if (b.enemy.warning && !b.guard) res = await call('/guard');
      else if (front && front.hp < front.maxHp * 0.3 && b.moss > 0) res = await call('/moss');
      else {
        const good = b.queue.findIndex((s) => elWheelBeats[s.element] === b.enemy.element);
        if (good > 0 && b.queue.length > 1 && b.enemy.kind !== 'minion' && b.enemy.kind !== 'boss') {
          res = await call('/swap'); b = res.battle; last = b;
          if (b.over) break;
          res = await call('/enemyturn'); b = res.battle; last = b;
          if (b.over) break;
        }
        res = await call('/fire');
      }
    } else res = await call('/enemyturn');
    if (!res.ok) {
      if (res.error && res.error.kind === 'OutOfAmmoException') { say('  !! out of ammo'); res = await call('/guard'); if (!res.ok) break; }
      else { say('  battle error', res.error); break; }
    }
    if (res.battle) { b = res.battle; last = b; }
    if (res.over) break;
  }
  if (last.result === 'lose') { stats.losses++; say('  ** BLACKOUT vs ' + last.enemy.name); }
  else if (last.result === 'win') say(`  win vs ${last.enemy.name} (Lv${last.enemy.level}) xp+${last.xp}${last.caught ? ' caught ' + last.caught.name : ''} ${last.levelUps.join(' ')}`);
  await loadZone();
  return last;
}

async function step(d) {
  const r = await call('/move', { dir: d });
  stats.steps++;
  if (!r.ok) return { r, stop: r.locked ? 'locked' : 'error' };
  if (r.battle) { await fight(r); return { r, stop: 'battle' }; }
  if (r.zoneChanged) { await loadZone(); return { r, stop: 'zone' }; }
  return { r, moved: r.moved, event: r.event };
}

async function goTo(x, y) {
  for (let tries = 0; tries < 12; tries++) {
    if (S.player.x === x && S.player.y === y) return;
    const p = path(S.player, (a, b) => a === x && b === y);
    if (!p) throw new Error(`no path to ${x},${y} from ${S.player.x},${S.player.y} in ${Z.id}`);
    for (const d of p) {
      const s = await step(d);
      if (s.stop === 'zone') return;
      if (s.stop === 'locked') throw new Error(`gate locked on the way: ${s.r.msg}`);
      if (s.stop) break;
      if (s.event && s.event.type === 'gate_open') { say('  gate:', s.event.text); await loadZone(); break; }
      if (!s.moved) break;
    }
  }
  if (!(S.player.x === x && S.player.y === y)) throw new Error(`could not reach ${x},${y} (at ${S.player.x},${S.player.y})`);
}

async function interactWith(id, allowLocked) {
  global.__where = 'interactWith ' + id;
  const o = objs().find((o) => o.id === id);
  if (!o) throw new Error('no object ' + id);
  let best = null;
  for (const d in D) {
    const ax = o.x - D[d][0], ay = o.y - D[d][1];
    const t = Z.rows[ay] && Z.rows[ay][ax];
    if (t !== '.' && t !== 'm') continue;
    if (objs().some((q) => q.x === ax && q.y === ay && q.kind !== 'patch' && blocks(q))) continue;
    const p = path(S.player, (a, b) => a === ax && b === ay);
    if (p && (!best || p.length < best.p.length)) best = { ax, ay, d, p };
  }
  if (!best) throw new Error('cannot reach ' + id);
  await goTo(best.ax, best.ay);
  let r = await call('/move', { dir: best.d });
  if (r.battle) { await fight(r); return r; }
  if (!r.ok && r.locked && !allowLocked) {
    // the slug that should open this gate fainted on the way: heal, load it again and retry once
    const m = /Need an? (\w+) slug/.exec(r.msg);
    if (m) { say('  (gate slug fainted, healing and retrying)'); await healSpring(); await load(m[1]); await goTo(best.ax, best.ay); r = await call('/move', { dir: best.d }); }
  }
  if (!r.ok) { if (allowLocked && r.locked) { say('  locked (expected):', r.msg); return r; } throw new Error('move failed: ' + JSON.stringify(r.error)); }
  if (r.event && r.event.type === 'gate_open') { say('  gate:', r.event.text); await loadZone(); return r; }
  r = await call('/interact');
  if (r.battle) { await fight(r); return r; }
  if (r.event && r.event.text) say('  ' + id + ':', r.event.text);
  if (r.event && r.event.lines && r.event.lines.length) say('  ' + id + ':', r.event.lines[0]);
  await loadZone();
  return r;
}

const slugs = () => [...S.blaster, ...S.storage];
async function load(...els) {
  // a fainted gate slug cannot open anything: heal at the nearest heart shard first
  if (els.some((e) => ['Earth', 'Ice', 'Air', 'Energy'].includes(e) && !slugs().some((x) => x.element === e && x.hp > 0))) await healSpring();
  const all = slugs().filter((s) => s.hp > 0).sort((a, b) => b.level - a.level);
  const pick = [];
  for (const e of els) { const s = all.find((s) => s.element === e && !pick.includes(s)); if (s) pick.push(s); }
  for (const s of all) if (pick.length < 4 && !pick.includes(s)) pick.push(s);
  const r = await call('/loadout', { ids: pick.map((s) => s.id) });
  if (!r.ok) throw new Error('loadout failed ' + JSON.stringify(r.error));
}

async function healSpring() { const sp = objs().find((o) => o.kind === 'spring'); if (sp) await interactWith(sp.id); }

async function grind(untilFn, label) {
  let n = 0;
  while (!untilFn() && n++ < 300) {
    const moss = [];
    for (let y = 0; y < Z.h; y++) for (let x = 0; x < Z.w; x++) if (Z.rows[y][x] === 'm' && !objs().some((o) => o.x === x && o.y === y && o.kind !== 'patch')) moss.push([x, y]);
    const m = moss[Math.floor(rnd() * moss.length)];
    await goTo(m[0], m[1]);
    if (S.blaster.some((s) => s.hp < s.maxHp * 0.4) && S.player.moss > 0) await call('/moss');
    if (n % 5 === 0) await healSpring();
  }
  if (!untilFn()) throw new Error('grind failed: ' + label);
}

(async () => {
  await call('/new'); await loadZone();
  say('--- Grotto: tutorial');
  await goTo(5, 12); await interactWith('g_mossback');
  await call('/slugpedia'); await call('/slugs');
  say('--- first duel (forced Frostmaw)');
  await goTo(4, 6);
  await interactWith('g_mossback');
  say('  slugs:', slugs().map((s) => `${s.name} L${s.level}`).join(', '));
  await load('Earth', 'Fire', 'Ice');
  await interactWith('g_wall');
  await interactWith('g_chest1');
  await interactWith('g_gap', true); // fails on purpose: no Air slug
  say('  log:', logAll.filter((l) => /throw|catch|ScopedLogger/.test(l)).slice(-5).join(' | '));
  await grind(() => slugs().some((s) => s.element === 'Air'), 'catch Zephyra');
  await load('Air');
  await interactWith('g_gap');
  await interactWith('g_egg');
  say('  slugs:', slugs().map((s) => `${s.name} L${s.level}`).join(', '));
  // fuse two slugs, but never destroy the last slug of an element a gate needs (Earth, Ice, Air, Energy)
  const safePair = () => {
    const all = slugs();
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const rest = all.filter((_, k) => k !== i && k !== j);
      if (['Earth', 'Ice', 'Air', 'Energy'].every((e) => rest.some((x) => x.element === e))) return [all[i], all[j]];
    }
    return null;
  };
  await grind(() => safePair() !== null && slugs().length >= 6, 'a safe pair to fuse');
  const pair = safePair();
  const fz = await call('/fuse', { a: pair[0].id, b: pair[1].id });
  say('  FUSED:', fz.ok, fz.parents);
  await interactWith('g_chest3');
  await healSpring();
  say('  saved:', (await call('/save')).ok);
  say('--- Crystal Hollows');
  await goTo(22, 12);
  await load('Earth', 'Ice', 'Air', 'Energy');
  await interactWith('h_wall'); await interactWith('h_altar1');
  await interactWith('h_bridge'); await interactWith('h_altar2');
  await interactWith('h_chest1');
  await healSpring();
  await goTo(22, 7);
  say('--- Magma Vein');
  await healSpring();
  await load('Ice', 'Air', 'Energy', 'Fire');
  await interactWith('v_bridge');
  await interactWith('v_rival');
  await load('Ice', 'Air', 'Energy', 'Fire');
  await interactWith('v_gap');
  await interactWith('v_door');
  await interactWith('v_altar3');
  say('  keystones:', S.player.keystones);
  await healSpring();
  await load('Fire', 'Ice', 'Earth', 'Air');
  await interactWith('v_keepgate');
  await goTo(22, 13);
  say("--- Gorvax's Keep, zone =", S.zone);
  await healSpring();
  await interactWith('k_boss');
  const heart = await interactWith('k_heart');
  say('VICTORY?', heart.event && heart.event.type, '| battles', stats.battles, 'losses', stats.losses, 'steps', stats.steps);
  say('slugs:', slugs().map((s) => `${s.name} L${s.level}`).join(', '));
  say('cards shown:', S.tutorial.shown.join(','));
})().catch((e) => { console.error('BOT FAILED:', e.message); console.error(logAll.slice(-6).join('\n')); process.exit(1); });
