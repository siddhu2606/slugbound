import re
# ---- index.html
p = 'web/index.html'
s = open(p, encoding='utf-8').read()
s = re.sub(r'<link href="https://fonts.googleapis.com/css2\?[^"]*" rel="stylesheet">', '<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Pixelify+Sans:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">', s)
a = s.index('  <div id="commands">'); b = s.index('  <div id="floaters">')
cmds = '''  <div id="commands">
    <button class="cmd fire" data-cmd="fire"><img class="cur" data-ico="hand" alt=""><span>Fire</span><small>Slug* attack()</small><kbd>1</kbd></button>
    <button class="cmd swap" data-cmd="swap"><img class="cur" data-ico="hand" alt=""><span>Swap</span><small>queue rotates</small><kbd>2</kbd></button>
    <button class="cmd guard" data-cmd="guard"><img class="cur" data-ico="hand" alt=""><span>Guard</span><small>halve next hit</small><kbd>3</kbd></button>
    <button class="cmd moss" data-cmd="moss"><img class="cur" data-ico="hand" alt=""><span>Moss</span><small>heal front slug</small><kbd>4</kbd></button>
    <button class="cmd run" data-cmd="run"><img class="cur" data-ico="hand" alt=""><span>Run</span><small>wild only</small><kbd>5</kbd></button>
  </div>
'''
s = s[:a] + cmds + s[b:]
s = s.replace('<div id="fade"></div>', '<div id="iris"></div>\n<div id="fade"></div>')
s = s.replace('<div class="q-label">FIRE ORDER</div>', '<div class="q-label">TURN ORDER</div>')
open(p, 'w', encoding='utf-8').write(s)

# ---- ui.js: pause menu cursor
p = 'web/js/ui.js'
s = open(p, encoding='utf-8').read()
s = s.replace('<button class="menu-item" data-id="${id}">${a}${b ?', '<button class="menu-item" data-id="${id}"><img class="cur" data-ico="hand" alt="">${a}${b ?')
s = s.replace("$('screen').querySelectorAll('.menu-item').forEach((b) =>", "$('screen').querySelectorAll('[data-ico]').forEach((el) => (el.src = Art.icon(el.dataset.ico)));\n    $('screen').querySelectorAll('.menu-item').forEach((b) =>", 1)
open(p, 'w', encoding='utf-8').write(s)

# ---- scene.js: hit-stop
p = 'web/js/scene.js'
s = open(p, encoding='utf-8').read()
s = s.replace("    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);\n    time += dt;", "    let dt = Math.min(0.05, engine.getDeltaTime() / 1000);\n    if (hitStopT > 0) { hitStopT -= engine.getDeltaTime() / 1000; dt = 0; }\n    time += dt;", 1)
s = s.replace("  const lookAhead = { x: 0, z: 0 };", "  const lookAhead = { x: 0, z: 0 };\n  let hitStopT = 0;", 1)
s = s.replace("    setCamMode(m) { camMode = m; },", "    hitStop(ms) { hitStopT = ms / 1000; }, setCamMode(m) { camMode = m; },", 1)
open(p, 'w', encoding='utf-8').write(s)

# ---- battle.js
p = 'web/js/battle.js'
s = open(p, encoding='utf-8').read()
# iris wipe instead of black fade
s = s.replace("    const fade = $('fade'); fade.classList.add('on'); await wait(450);", "    const fade = $('iris'); fade.classList.add('on'); await wait(600);")
s = s.replace("    fade.classList.remove('on'); await wait(500);\n    // intro", "    fade.classList.remove('on'); await wait(600);\n    // intro")
s = s.replace("    $('fade').classList.add('on'); await wait(500);\n    teardown();\n    $('fade').classList.remove('on');", "    $('iris').classList.add('on'); await wait(600);\n    teardown();\n    $('iris').classList.remove('on');")
# cursor + weakness + floating enemy plate
s = s.replace("  let camSwing = 0, fogBefore = 0.03;", "  let camSwing = 0, fogBefore = 0.03;\n  let sel = 0; const ORDER = ['fire', 'swap', 'guard', 'moss', 'run'];\n  let weakKnown = {}, resKnown = {};")
s = s.replace("    if (arena._disc) arena._disc.rotation.y += dt * 0.12;", """    if (arena._disc) arena._disc.rotation.y += dt * 0.12;
    const tgt = enemyModel ? ENEMY_POS.add(V3(0, 2.7, 0)) : enemyActor ? ENEMY_POS.add(V3(0, enemyActor.h + 0.5, 0)) : null;
    if (tgt) { const pp = projectWorld(tgt), el = $('enemyPlate'); el.style.left = Math.max(125, Math.min(innerWidth - 125, pp.x)) + 'px'; el.style.top = Math.max(70, pp.y) + 'px'; }""")
s = s.replace("    $('enStatus').innerHTML = st.map((s) => `<span>${s}</span>`).join('');", """    const wk = (weakKnown[e.name] || []).map((x) => Art.iconHtml(x)).join(' '), rs = (resKnown[e.name] || []).map((x) => Art.iconHtml(x)).join(' ');
    if (wk) st.push('weak ' + wk); if (rs) st.push('resists ' + rs);
    $('enStatus').innerHTML = st.map((s) => `<span>${s}</span>`).join('');""")
s = s.replace("    const my = b.turn === 'player' && !b.over && !busy;", "    const my = b.turn === 'player' && !b.over && !busy;\n    document.querySelectorAll('.cmd').forEach((c) => c.classList.toggle('sel', c.dataset.cmd === ORDER[sel]));")
# hit-stop + record weaknesses on impact
s = s.replace("      World3D.addShake(super_ ? 0.42 : 0.2);", "      World3D.addShake(super_ ? 0.42 : 0.2); World3D.hitStop(super_ ? 95 : 55);\n      if (super_) { (weakKnown[b.enemy.name] = weakKnown[b.enemy.name] || []).includes(el) || weakKnown[b.enemy.name].push(el); }\n      if (res) { (resKnown[b.enemy.name] = resKnown[b.enemy.name] || []).includes(el) || resKnown[b.enemy.name].push(el); }")
s = s.replace("  return { run, command, active,", """  function moveCursor(d) {
    const en = (i) => { const c = document.querySelector('.cmd[data-cmd="' + ORDER[i] + '"]'); return c && !c.disabled; };
    for (let k = 1; k <= 5; k++) { const n = (sel + d * k + 50) % 5; if (en(n)) { sel = n; break; } }
    Sound.sfx.blip(); updateHud(cur);
  }
  function confirm() { command(ORDER[sel]); }
  return { run, command, moveCursor, confirm, active,""")
open(p, 'w', encoding='utf-8').write(s)

# ---- game.js keys in battle
p = 'web/js/game.js'
s = open(p, encoding='utf-8').read()
s = s.replace("      if (k >= '1' && k <= '5') Battle.command(", "      if (k === 'ArrowUp' || k === 'w' || k === 'W') Battle.moveCursor(-1);\n      if (k === 'ArrowDown' || k === 's' || k === 'S') Battle.moveCursor(1);\n      if (k === 'Enter' || k === 'e' || k === 'E' || k === ' ') Battle.confirm();\n      if (k >= '1' && k <= '5') Battle.command(")
open(p, 'w', encoding='utf-8').write(s)
print('done')
