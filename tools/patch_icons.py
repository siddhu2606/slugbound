import re
p = 'web/js/art.js'
s = open(p, encoding='utf-8').read()
icons = r'''
  // small pixel icons (drawn big, reduced to 16x16 pixel art) that replace every emoji in the UI
  function drawIcon(ctx, n) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const F = (path, fill, lw) => P(ctx, path, fill, lw === undefined ? 0 : lw);
    if (n === 'Fire' || n === 'fire') {
      F((c) => { c.moveTo(32, 4); c.bezierCurveTo(44, 18, 56, 26, 52, 42); c.bezierCurveTo(50, 56, 38, 60, 32, 60); c.bezierCurveTo(24, 60, 12, 54, 12, 40); c.bezierCurveTo(12, 30, 20, 24, 22, 16); c.bezierCurveTo(28, 22, 28, 12, 32, 4); }, '#ff7a2a');
      F((c) => { c.moveTo(32, 28); c.bezierCurveTo(40, 38, 44, 44, 38, 54); c.bezierCurveTo(30, 58, 22, 50, 26, 42); c.bezierCurveTo(28, 38, 30, 34, 32, 28); }, '#ffe36a');
    } else if (n === 'Ice' || n === 'ice') {
      ctx.strokeStyle = '#bfeaff'; ctx.lineWidth = 7;
      for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(32, 32); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, 26); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-8, -18); ctx.lineTo(0, -10); ctx.lineTo(8, -18); ctx.stroke(); ctx.restore(); }
    } else if (n === 'Air' || n === 'air') {
      ctx.strokeStyle = '#9ef0d8'; ctx.lineWidth = 7; ctx.beginPath();
      for (let a = 0; a < 11; a += 0.2) { const r = 3 + a * 2.6; ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } ctx.stroke();
    } else if (n === 'Earth' || n === 'earth') {
      F((c) => { c.moveTo(8, 48); c.lineTo(16, 24); c.lineTo(30, 12); c.lineTo(46, 18); c.lineTo(58, 36); c.lineTo(52, 52); c.lineTo(24, 56); c.closePath(); }, '#c49a5a');
      F((c) => { c.moveTo(24, 30); c.lineTo(34, 22); c.lineTo(44, 30); c.lineTo(34, 38); c.closePath(); }, '#e8c88a');
    } else if (n === 'Energy' || n === 'energy' || n === 'bolt') {
      F((c) => { c.moveTo(38, 2); c.lineTo(14, 36); c.lineTo(28, 36); c.lineTo(22, 62); c.lineTo(50, 24); c.lineTo(34, 24); c.closePath(); }, '#ffe14a');
    } else if (n === 'Ghoul' || n === 'ghoul') {
      F((c) => { c.moveTo(12, 56); c.lineTo(12, 28); c.bezierCurveTo(12, 8, 52, 8, 52, 28); c.lineTo(52, 56); c.lineTo(44, 48); c.lineTo(36, 56); c.lineTo(28, 48); c.lineTo(20, 56); c.closePath(); }, '#d46aff');
      F(ell(25, 28, 5, 7), '#1a0a2a'); F(ell(40, 28, 5, 7), '#1a0a2a');
    } else if (n === 'ammo') {
      F((c) => { c.rect(8, 22, 40, 14); c.rect(8, 22, 10, 30); c.rect(46, 18, 12, 22); }, '#c0c8d8');
      F((c) => { c.rect(10, 24, 36, 4); }, '#fff');
    } else if (n === 'moss') {
      F((c) => { c.moveTo(10, 54); c.bezierCurveTo(10, 20, 30, 8, 54, 8); c.bezierCurveTo(56, 34, 40, 54, 10, 54); }, '#6fe05a');
      ctx.strokeStyle = '#1d6a2a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(12, 52); ctx.lineTo(42, 22); ctx.stroke();
    } else if (n === 'key') {
      F(ell(20, 32, 14, 14), '#ffd23f'); F(ell(20, 32, 6, 6), '#000');
      F((c) => { c.rect(30, 28, 30, 8); c.rect(46, 34, 6, 14); c.rect(56, 34, 6, 10); }, '#ffd23f');
    } else if (n === 'heart') {
      F((c) => { c.moveTo(32, 56); c.bezierCurveTo(-4, 30, 10, 6, 32, 22); c.bezierCurveTo(54, 6, 68, 30, 32, 56); }, '#ff5a7a');
    } else if (n === 'shield') {
      F((c) => { c.moveTo(32, 6); c.lineTo(56, 14); c.lineTo(52, 40); c.lineTo(32, 58); c.lineTo(12, 40); c.lineTo(8, 14); c.closePath(); }, '#ffd98a');
    } else if (n === 'check') {
      ctx.strokeStyle = '#6fe05a'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(10, 34); ctx.lineTo(26, 50); ctx.lineTo(54, 14); ctx.stroke();
    } else if (n === 'hand') {
      F((c) => { c.moveTo(6, 14); c.lineTo(58, 32); c.lineTo(6, 50); c.lineTo(18, 32); c.closePath(); }, '#ffffff');
    } else if (n === 'down') {
      F((c) => { c.moveTo(8, 18); c.lineTo(56, 18); c.lineTo(32, 52); c.closePath(); }, '#ffffff');
    } else F(ell(32, 32, 18, 18), '#fff');
  }
  const iconCache = {};
  function icon(name) {
    if (iconCache[name]) return iconCache[name];
    const [c, ctx] = mk(64, 64);
    drawIcon(ctx, name);
    iconCache[name] = pixelize(c, 16, 16, { levels: 6 }).toDataURL();
    return iconCache[name];
  }
  const iconHtml = (name) => '<img class="ico" alt="" src="' + icon(name) + '">';
'''
s = s.replace("  function elementEmoji(el) {", icons + "  function elementEmoji(el) { return iconHtml(el); }\n  function _oldEmoji(el) {", 1)
s = s.replace("return { pixelize,", "return { icon, iconHtml, pixelize,", 1)
open(p, 'w', encoding='utf-8').write(s)

# UI js
p = 'web/js/ui.js'
s = open(p, encoding='utf-8').read()
s = s.replace("'All 11 OOP cards found ✔'", "'All 11 OOP cards found'")
s = s.replace("${s.blaster.some((x) => x.element === e && x.hp > 0) ? ' ✔' : ''}", "${s.blaster.some((x) => x.element === e && x.hp > 0) ? ' ' + Art.iconHtml('check') : ''}")
s = s.replace("<p>🔥 Fire → ❄️ Ice → 🌪️ Air → 🪨 Earth → ⚡ Energy → 🔥 Fire.", "<p>${Art.iconHtml('Fire')} Fire → ${Art.iconHtml('Ice')} Ice → ${Art.iconHtml('Air')} Air → ${Art.iconHtml('Earth')} Earth → ${Art.iconHtml('Energy')} Energy → ${Art.iconHtml('Fire')} Fire.")
s = s.replace("  const sleep = (ms) =>", "  document.querySelectorAll('[data-ico]').forEach((el) => (el.src = Art.icon(el.dataset.ico)));\n  const sleep = (ms) =>", 1)
open(p, 'w', encoding='utf-8').write(s)

# battle js
p = 'web/js/battle.js'
s = open(p, encoding='utf-8').read()
s = s.replace("$('enElem').textContent = Art.elementEmoji(e.element) + ' ' + e.element;", "$('enElem').innerHTML = Art.elementEmoji(e.element) + ' ' + e.element;")
s = s.replace("$('plElem').textContent = Art.elementEmoji(f.element) + ' ' + f.element;", "$('plElem').innerHTML = Art.elementEmoji(f.element) + ' ' + f.element;")
s = s.replace("if (e.burn > 0) st.push('🔥 burning'); if (e.slow > 0) st.push('❄ slowed'); if (e.stunned) st.push('⚡ stunned');", "if (e.burn > 0) st.push(Art.iconHtml('Fire') + ' burning'); if (e.slow > 0) st.push(Art.iconHtml('Ice') + ' slowed'); if (e.stunned) st.push(Art.iconHtml('Energy') + ' stunned');")
s = s.replace("floater('🛡 -' + m.shieldAbsorbed,", "floater('shield -' + m.shieldAbsorbed,")
s = s.replace("${Art.elementEmoji(e.element)} ${e.element}${e.warning", "${Art.elementEmoji(e.element)} ${e.element}${e.warning")
open(p, 'w', encoding='utf-8').write(s)

# html
p = 'web/index.html'
s = open(p, encoding='utf-8').read()
s = s.replace('<span class="stat-ico">❤</span>', '<img class="ico" data-ico="heart" alt="">')
s = s.replace('<span class="chip">🔫 <b id="hudAmmo">', '<span class="chip"><img class="ico" data-ico="ammo" alt=""> <b id="hudAmmo">')
s = s.replace('<span class="chip">🌿 <b id="hudMoss">', '<span class="chip"><img class="ico" data-ico="moss" alt=""> <b id="hudMoss">')
s = s.replace('<span class="chip">🗝 <b id="hudKeys">', '<span class="chip"><img class="ico" data-ico="key" alt=""> <b id="hudKeys">')
s = s.replace('<span>🧑 <b id="slHp">', '<span><img class="ico" data-ico="heart" alt=""> <b id="slHp">')
s = s.replace('<span>🔫 <b id="slAmmo">', '<span><img class="ico" data-ico="ammo" alt=""> <b id="slAmmo">')
s = s.replace('<span>🌿 <b id="slMoss">', '<span><img class="ico" data-ico="moss" alt=""> <b id="slMoss">')
s = s.replace('<span id="slShield" class="shield hidden">🛡 <b></b></span>', '<span id="slShield" class="shield hidden"><img class="ico" data-ico="shield" alt=""> <b></b></span>')
s = s.replace('<div class="dlg-next">▼ <kbd>E</kbd></div>', '<div class="dlg-next"><img class="ico" data-ico="down" alt=""></div>')
open(p, 'w', encoding='utf-8').write(s)
print(len(re.findall('[\U0001F300-\U0001FAFF]', s)))
