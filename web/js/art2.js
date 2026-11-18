// art2.js - extra painted textures for the 3D scene (plants, light shafts, swirls, cracks, runes).
const Art2 = (() => {
  const cache = {};
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const OUT = '#160d26';

  function deco(kind) {
    if (cache['d' + kind]) return cache['d' + kind];
    const [c, x] = mk(128, 128);
    const stroke = (col, w = 4) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.stroke(); };
    x.translate(64, 120);
    if (kind === 'bulb') {            // glowing bulb plant (grotto)
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(i * 14, -40, i * 24, -34 - Math.abs(i) * -6); stroke('#1d6a4a', 7); stroke('#3fd69a', 3.5); }
      [[-16, -64, 11], [10, -86, 15], [26, -52, 9]].forEach(([bx, by, r]) => {
        x.beginPath(); x.moveTo(bx * 0.4, 0); x.quadraticCurveTo(bx, by / 2, bx, by); stroke('#1d6a4a', 4);
        const g = x.createRadialGradient(bx, by, 1, bx, by, r * 2.4); g.addColorStop(0, 'rgba(160,255,230,0.9)'); g.addColorStop(1, 'rgba(60,255,190,0)');
        x.fillStyle = g; x.beginPath(); x.arc(bx, by, r * 2.4, 0, 7); x.fill();
        x.fillStyle = '#d8fff2'; x.beginPath(); x.arc(bx, by, r * 0.8, 0, 7); x.fill();
      });
    } else if (kind === 'tuft') {     // grass tuft
      for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(i * 5, 0); x.quadraticCurveTo(i * 10, -34, i * 15 + 4, -48 + Math.abs(i) * 6); stroke('#0f4a3a', 6); stroke('#4fe0a8', 3); }
    } else if (kind === 'fern') {     // frost fern (hollows)
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(i * 16, -50, i * 30, -66 + Math.abs(i) * 8); stroke('#2a5a9a', 6); stroke('#bfe9ff', 3); for (let k = 1; k < 5; k++) { const t = k / 5; const px = i * 30 * t, py = -(66 - Math.abs(i) * 8) * t; x.beginPath(); x.moveTo(px, py); x.lineTo(px - 9, py - 7); x.moveTo(px, py); x.lineTo(px + 9, py - 7); stroke('#e9fbff', 2); } }
    } else if (kind === 'ember') {    // ember shrub (vein)
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(0, 0); x.lineTo(i * 14, -40 - (i % 2) * 14); stroke('#2a1410', 7); stroke('#7a3a22', 3); }
      [[-26, -50], [0, -64], [24, -44], [10, -40]].forEach(([ex, ey]) => { const g = x.createRadialGradient(ex, ey, 1, ex, ey, 18); g.addColorStop(0, 'rgba(255,230,120,1)'); g.addColorStop(0.4, 'rgba(255,120,40,0.8)'); g.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(ex, ey, 18, 0, 7); x.fill(); });
    } else if (kind === 'thorn') {    // thorn bone (keep)
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 6, 0); x.quadraticCurveTo(i * 14, -40, i * 22, -70 + Math.abs(i) * 10); stroke('#150a1c', 8); stroke('#a08ab8', 3.5); }
    } else if (kind === 'mushroom') { // little mushrooms (grotto)
      [[-24, 0.8, '#ff8ad8'], [4, 1.15, '#7ae8ff'], [30, 0.7, '#ffd86a']].forEach(([mx, s, col]) => {
        x.fillStyle = '#f4ecd8'; x.strokeStyle = OUT; x.lineWidth = 4; x.beginPath(); x.roundRect(mx - 6 * s, -34 * s, 12 * s, 36 * s, 4); x.fill(); x.stroke();
        const g = x.createRadialGradient(mx, -40 * s, 2, mx, -40 * s, 30 * s); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, col);
        x.fillStyle = g; x.beginPath(); x.ellipse(mx, -38 * s, 26 * s, 20 * s, 0, Math.PI, 0); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.8)'; [[-8, -44], [6, -50], [12, -40]].forEach(([dx, dy]) => { x.beginPath(); x.arc(mx + dx * s, dy * s, 3 * s, 0, 7); x.fill(); });
      });
    }
    cache['d' + kind] = c;
    return c;
  }

  function shaft() {
    if (cache.shaft) return cache.shaft;
    const [c, x] = mk(64, 256);
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0.65)'); g.addColorStop(0.6, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    const h = x.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 256);
    cache.shaft = c;
    return c;
  }

  function swirl(hue) {
    const key = 'swirl' + hue;
    if (cache[key]) return cache[key];
    const [c, x] = mk(256, 256);
    x.translate(128, 128);
    for (let i = 0; i < 90; i++) {
      const a = i * 0.34, r = 6 + i * 1.3;
      x.fillStyle = `hsla(${hue + i * 0.6},95%,${70 + (i % 3) * 8}%,${0.9 - i / 130})`;
      x.beginPath(); x.arc(Math.cos(a) * r, Math.sin(a) * r, 7 - i / 20, 0, 7); x.fill();
    }
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 128); g.addColorStop(0, `hsla(${hue},100%,85%,0.9)`); g.addColorStop(0.5, `hsla(${hue},100%,60%,0.25)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 128, 0, 7); x.fill();
    cache[key] = c;
    return c;
  }

  function cracks(color) {
    const key = 'crack' + color;
    if (cache[key]) return cache[key];
    const [c, x] = mk(256, 256);
    x.strokeStyle = color; x.lineCap = 'round'; x.shadowColor = color; x.shadowBlur = 14;
    const rnd = Art.rng(7);
    for (let k = 0; k < 6; k++) {
      let px = 128 + (rnd() - 0.5) * 80, py = 30 + rnd() * 30;
      x.lineWidth = 4 - k * 0.3; x.beginPath(); x.moveTo(px, py);
      for (let i = 0; i < 9; i++) { px += (rnd() - 0.5) * 50; py += 20 + rnd() * 14; x.lineTo(px, py); }
      x.stroke();
    }
    cache[key] = c;
    return c;
  }

  function mist() {
    if (cache.mist) return cache.mist;
    const [c, x] = mk(256, 256);
    const n = Art.makeNoise(6, 13);
    const id = x.createImageData(256, 256);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const v = Art.fbm(n, i / 256 * 6, j / 256 * 6, 4);
      const i4 = (j * 256 + i) * 4;
      id.data[i4] = id.data[i4 + 1] = id.data[i4 + 2] = 255; id.data[i4 + 3] = Math.max(0, (v - 0.35) * 2.2) * 255;
    }
    x.putImageData(id, 0, 0);
    cache.mist = c;
    return c;
  }

  function runes(color) {
    const key = 'rune' + color;
    if (cache[key]) return cache[key];
    const [c, x] = mk(256, 256);
    x.fillStyle = '#00000000';
    x.strokeStyle = color; x.lineWidth = 6; x.shadowColor = color; x.shadowBlur = 16; x.lineCap = 'round';
    const rnd = Art.rng(5);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
      const cx = 48 + col * 80, cy = 40 + row * 60;
      x.beginPath();
      for (let k = 0; k < 4; k++) { const a = rnd() * 6.28; x.moveTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); x.lineTo(cx + Math.cos(a + 2.6) * 18, cy + Math.sin(a + 2.6) * 18); }
      x.stroke();
    }
    cache[key] = c;
    return c;
  }

  function cap(c1, c2) {
    const key = 'cap' + c1 + c2;
    if (cache[key]) return cache[key];
    const [c, x] = mk(128, 128);
    const g = x.createRadialGradient(64, 40, 6, 64, 70, 90); g.addColorStop(0, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const r = Art.rng(c1.length * 7 + 3);
    x.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 12; i++) { x.beginPath(); x.arc(r() * 128, r() * 128, 3 + r() * 6, 0, 7); x.fill(); }
    cache[key] = c;
    return c;
  }

  return { deco, shaft, swirl, cracks, mist, runes, cap };
})();
