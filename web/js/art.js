// art.js - all pictures are painted in code (no image files): character sprites, slug portraits and terrain textures.
const Art = (() => {
  const OUT = '#160d26';
  const cache = {};

  // turn a smooth drawing into pixel art: shrink, hard alpha, posterise, 1px dark outline
  function pixelize(src, W, H, opts) {
    opts = opts || {};
    const [c, ctx] = mk(W, H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, W, H);
    const id = ctx.getImageData(0, 0, W, H), d = id.data, lv = opts.levels || 7;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 120) { d[i + 3] = 0; continue; }
      d[i + 3] = 255;
      for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] / 255 * (lv - 1)) / (lv - 1) * 255;
    }
    if (opts.outline !== false) {
      const a = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) a[i] = d[i * 4 + 3] ? 1 : 0;
      const oc = opts.outlineColor || [22, 13, 38];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (a[i]) continue;
        if ((x > 0 && a[i - 1]) || (x < W - 1 && a[i + 1]) || (y > 0 && a[i - W]) || (y < H - 1 && a[i + W])) { d[i * 4] = oc[0]; d[i * 4 + 1] = oc[1]; d[i * 4 + 2] = oc[2]; d[i * 4 + 3] = 255; }
      }
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  // ---------- tiny drawing helpers ----------
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }
  function P(ctx, fn, fill, lw = 6, stroke = OUT) {
    ctx.beginPath(); fn(ctx);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  function lg(ctx, x0, y0, x1, y1, ...stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c));
    return g;
  }
  function rgr(ctx, x, y, r0, r1, ...stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c));
    return g;
  }
  const ell = (x, y, rx, ry, rot = 0) => (c) => c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  const rr = (x, y, w, h, r) => (c) => {
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  };
  const poly = (pts) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };

  // ---------- seeded random + tileable noise ----------
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
  }
  function makeNoise(period, seed) {
    const r = rng(seed), g = [];
    for (let i = 0; i < period * period; i++) g.push(r());
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
      const a = (xx, yy) => g[(((yy % period) + period) % period) * period + (((xx % period) + period) % period)];
      const top = a(xi, yi) * (1 - xf) + a(xi + 1, yi) * xf;
      const bot = a(xi, yi + 1) * (1 - xf) + a(xi + 1, yi + 1) * xf;
      return top * (1 - yf) + bot * yf;
    };
  }
  function fbm(noise, x, y, oct = 4) {
    let v = 0, a = 0.5, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) { v += noise(x * f, y * f) * a; tot += a; a *= 0.5; f *= 2; }
    return v / tot;
  }

  // =========================================================
  //  CHARACTERS  (canvas 256 x 384, feet at y = 356)
  // =========================================================
  function human(ctx, o, view, walk) {
    walk = walk || 0;
    const cx = 128;
    const side = view === 'side', back = view === 'back';
    // behind-the-body things
    if (o.cape) {
      P(ctx, poly([[84, 190], [172, 190], [190, 330], [66, 330]]), lg(ctx, 0, 190, 0, 330, o.cape, o.capeDark || o.cape), 6);
    }
    if (o.backpack && !back) {
      P(ctx, rr(side ? 70 : 150, 200, side ? 50 : 54, 80, 18), lg(ctx, 0, 200, 0, 280, o.backpack, o.backpackDark), 6);
    }
    if (o.blaster && !back) {
      ctx.save(); ctx.translate(side ? 86 : 178, 220); ctx.rotate(side ? -0.5 : 0.5);
      P(ctx, rr(-9, -60, 18, 120, 8), '#5b6b86', 5);
      P(ctx, rr(-14, -70, 28, 30, 10), o.accent, 5);
      ctx.restore();
    }
    // legs
    const legW = side ? 34 : 26;
    const legXs = side ? [cx - 22, cx - 2] : [cx - 32, cx + 6];
    const lift = walk === 1 ? [16, 0] : walk === 2 ? [0, 16] : [0, 0];
    legXs.forEach((lx0, i) => {
      const ly = lift[i], lx = side ? lx0 + (walk === 1 ? (i ? 12 : -12) : walk === 2 ? (i ? -12 : 12) : 0) : lx0;
      P(ctx, rr(lx, 298 - ly, legW, 56, 12), lg(ctx, 0, 298, 0, 354, o.pants, o.pantsDark), 6);
      P(ctx, rr(lx - 3, 330 - ly, legW + 8 + (side ? 6 : 0), 26, 11), lg(ctx, 0, 330, 0, 356, o.boots, '#20142e'), 6);
    });
    // body
    const bw = side ? 64 : 86;
    P(ctx, rr(cx - bw / 2, 186, bw, 122, 26), lg(ctx, cx - bw / 2, 0, cx + bw / 2, 0, o.top, o.topDark), 6);
    P(ctx, rr(cx - bw / 2 + 2, 278, bw - 4, 15, 5), o.belt || '#3c2a1c', 4);
    if (o.scarf) {
      P(ctx, rr(cx - 36, 176, 72, 28, 13), o.scarf, 6);
      if (!back && !side) P(ctx, poly([[cx + 10, 196], [cx + 36, 196], [cx + 46, 262], [cx + 18, 258]]), o.scarf, 5);
    }
    if (o.robeTrim) P(ctx, rr(cx - bw / 2 + 4, 292, bw - 8, 12, 5), o.robeTrim, 3);
    // arms
    if (!side) {
      const sw = walk === 1 ? [-12, 10] : walk === 2 ? [10, -12] : [0, 0];
      [[cx - 52, -1], [cx + 52, 1]].forEach(([ax, s], i) => {
        ctx.save(); ctx.translate(ax, 198 + sw[i]); ctx.rotate(0.14 * s);
        P(ctx, ell(0, 36, 16, 42), lg(ctx, -16, 0, 16, 0, o.top, o.topDark), 6);
        P(ctx, ell(0, 76, 12, 12), o.skin, 5);
        ctx.restore();
      });
    } else {
      // side view: the arm swings opposite to the front leg
      ctx.save(); ctx.translate(cx + 2, 198); ctx.rotate(-0.1 + (walk === 1 ? -0.22 : walk === 2 ? 0.22 : 0));
      P(ctx, ell(0, 38, 17, 42), lg(ctx, -16, 0, 16, 0, o.top, o.topDark), 6);
      P(ctx, ell(0, 78, 12, 12), o.skin, 5);
      ctx.restore();
    }
    // head
    const hx = side ? cx + 6 : cx, hy = 122;
    if (o.ponytail && !o.hood && (back || side)) P(ctx, poly([[hx - 30, 96], [hx - 2, 90], [hx - 14, 220], [hx - 52, 196]]), lg(ctx, 0, 90, 0, 220, o.hair, o.hairDark || o.hair), 6);
    P(ctx, ell(hx, hy, 62, 58), rgr(ctx, hx - 14, hy - 18, 6, 80, o.skinLight || o.skin, o.skin, o.skinDark || o.skin), 6);
    if (!back) {
      P(ctx, ell(hx - 62, hy + 10, 9, 13), o.skin, 4);
      P(ctx, ell(hx + 62, hy + 10, 9, 13), o.skin, 4);
    }
    // hair (back layer + front)
    const hair = o.hair, hairD = o.hairDark || o.hair;
    if (!o.hood) {
      if (o.ponytail && !side && !back) P(ctx, ell(hx + 62, 100, 14, 40, 0.3), hair, 5);
      P(ctx, (c) => { c.moveTo(hx - 66, hy + 4); c.bezierCurveTo(hx - 80, hy - 70, hx - 20, hy - 92, hx, hy - 90); c.bezierCurveTo(hx + 30, hy - 94, hx + 84, hy - 70, hx + 66, hy + 4); if (back) { c.bezierCurveTo(hx + 62, hy + 40, hx - 62, hy + 40, hx - 66, hy + 4); } else { c.bezierCurveTo(hx + 58, hy - 18, hx + 38, hy - 34, hx + 26, hy - 20); c.lineTo(hx + 12, hy - 36); c.lineTo(hx - 6, hy - 18); c.lineTo(hx - 24, hy - 38); c.lineTo(hx - 40, hy - 16); c.bezierCurveTo(hx - 52, hy - 22, hx - 62, hy - 10, hx - 66, hy + 4); } c.closePath(); }, lg(ctx, 0, hy - 90, 0, hy + 10, hair, hairD), 6);
      if (o.tuft) P(ctx, poly([[hx - 8, hy - 86], [hx + 14, hy - 120], [hx + 28, hy - 84]]), hair, 5);
    } else {
      // hood
      P(ctx, (c) => { c.moveTo(hx - 74, hy + 34); c.bezierCurveTo(hx - 92, hy - 60, hx - 30, hy - 104, hx, hy - 102); c.bezierCurveTo(hx + 34, hy - 104, hx + 92, hy - 60, hx + 74, hy + 34); c.lineTo(hx + 52, hy + 20); c.bezierCurveTo(hx + 40, hy - 40, hx - 40, hy - 40, hx - 52, hy + 20); c.closePath(); }, lg(ctx, 0, hy - 100, 0, hy + 30, o.hood, o.hoodDark || o.hood), 6);
      if (o.hoodMoss) for (let i = 0; i < 7; i++) P(ctx, ell(hx - 50 + i * 17, hy - 70 + Math.abs(i - 3) * 9, 10, 7), '#8fe05a', 3);
    }
    // face
    if (!back) {
      const ex = side ? [hx + 18] : [hx - 24, hx + 24];
      ex.forEach((x) => {
        P(ctx, ell(x, hy + 16, 12, 17), '#1b1230', 0);
        P(ctx, ell(x - 3, hy + 9, 5, 6.5), '#ffffff', 0);
        P(ctx, ell(x + 4, hy + 23, 2.8, 3.2), '#ffffffaa', 0);
        ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 14, hy - 4); ctx.quadraticCurveTo(x, hy - 12, x + 14, hy - 4); ctx.stroke();
      });
      if (!side) {
        P(ctx, ell(hx - 40, hy + 40, 11, 6), '#ff7aa044', 0);
        P(ctx, ell(hx + 40, hy + 40, 11, 6), '#ff7aa044', 0);
      } else P(ctx, ell(hx + 34, hy + 38, 9, 5), '#ff7aa044', 0);
      ctx.strokeStyle = '#5a2a2a'; ctx.lineWidth = 4;
      ctx.beginPath();
      if (o.frown) { ctx.moveTo(hx - 10, hy + 46); ctx.quadraticCurveTo(hx, hy + 40, hx + 10, hy + 46); }
      else { ctx.moveTo(hx - 10 + (side ? 14 : 0), hy + 42); ctx.quadraticCurveTo(hx + (side ? 14 : 0), hy + 52, hx + 10 + (side ? 14 : 0), hy + 42); }
      ctx.stroke();
    }
    if (o.beard && !back) {
      P(ctx, (c) => { c.moveTo(hx - 50, hy + 30); c.bezierCurveTo(hx - 56, hy + 120, hx + 56, hy + 120, hx + 50, hy + 30); c.bezierCurveTo(hx + 30, hy + 52, hx - 30, hy + 52, hx - 50, hy + 30); c.closePath(); }, lg(ctx, 0, hy + 30, 0, hy + 100, '#f4f0e6', '#c9c2b4'), 6);
    }
    if (o.goggles) {
      const gy = hy - 46;
      P(ctx, rr(hx - 64, gy + 8, 128, 12, 6), '#3a2b4d', 5);
      if (!back) [-30, 30].forEach((dx) => { P(ctx, ell(hx + (side ? dx * 0.4 : dx), gy, 20, 20), rgr(ctx, hx + (side ? dx * 0.4 : dx) - 5, gy - 6, 2, 22, '#d6fff7', o.accent, '#0c5a52'), 6); });
    }
    if (o.hat) {
      P(ctx, ell(hx, hy - 52, 80, 22), o.hat, 6);
      P(ctx, (c) => { c.moveTo(hx - 52, hy - 54); c.bezierCurveTo(hx - 50, hy - 124, hx + 50, hy - 124, hx + 52, hy - 54); c.closePath(); }, lg(ctx, 0, hy - 120, 0, hy - 50, o.hat, o.hatDark), 6);
      P(ctx, rr(hx - 52, hy - 74, 104, 14, 4), o.hatBand || '#7a2d2d', 4);
      P(ctx, (c) => { c.moveTo(hx + 30, hy - 78); c.quadraticCurveTo(hx + 80, hy - 150, hx + 96, hy - 80); c.quadraticCurveTo(hx + 66, hy - 112, hx + 30, hy - 78); }, '#f2e46a', 4);
    }
    if (o.staff) {
      const sx = side ? cx - 40 : cx + 84;
      P(ctx, rr(sx - 6, 130, 12, 226, 5), lg(ctx, sx - 6, 0, sx + 6, 0, '#8a6a3a', '#5a3f1e'), 5);
      P(ctx, ell(sx, 120, 24, 24), rgr(ctx, sx - 6, 112, 2, 30, '#f4ffd8', '#9dff6a', '#2c8a2c'), 5);
      ctx.fillStyle = '#9dff6a33'; ctx.beginPath(); ctx.arc(sx, 120, 44, 0, 7); ctx.fill();
    }
    if (o.emblem && !back && !side) P(ctx, poly([[cx, 214], [cx + 14, 232], [cx, 252], [cx - 14, 232]]), o.emblem, 4);
  }

  const HUMANS = {
    kai: { skin: '#f6cfa6', skinLight: '#ffe6c6', skinDark: '#e0a77c', hair: '#6a3a22', hairDark: '#3e2013', top: '#3dc9b4', topDark: '#1b7d78', pants: '#8a5a38', pantsDark: '#5a3a22', boots: '#4a3326', belt: '#2a1c14', scarf: '#ff9a3c', accent: '#35e0cf', goggles: true, blaster: true, tuft: true, emblem: '#ffd23f' },
    mossback: { skin: '#e8c19a', skinLight: '#f7dcba', skinDark: '#c79872', hair: '#d9d4c8', top: '#4f8f4a', topDark: '#2a5a2f', pants: '#3b5a3a', pantsDark: '#26402a', boots: '#4a3b2a', hood: '#5e9a52', hoodDark: '#2d6a35', hoodMoss: true, beard: true, staff: true, robeTrim: '#d9f08a', cape: '#3f7a40', capeDark: '#255a2e', frown: false },
    pim: { skin: '#f0c49a', skinLight: '#ffe0bb', skinDark: '#d19c70', hair: '#c4582a', top: '#e8a43a', topDark: '#b3701c', pants: '#5a4a7a', pantsDark: '#3a2f5a', boots: '#5a3f2a', belt: '#7a2d2d', hat: '#d65a3a', hatDark: '#9a3320', hatBand: '#ffd23f', backpack: '#8a5a38', backpackDark: '#5a3a22', accent: '#ffd23f' },
    kessa: { skin: '#f4d6c4', skinLight: '#ffeade', skinDark: '#d9a99a', hair: '#7ac4ff', hairDark: '#3c86d6', ponytail: true, top: '#eaf6ff', topDark: '#8fb8e6', pants: '#34507a', pantsDark: '#223a5a', boots: '#d9e8ff', belt: '#c43b4a', scarf: '#e0384a', accent: '#7ae0ff', blaster: true, frown: true, emblem: '#7ac4ff' },
  };

  // ghouls: a hooded, floating shade
  function ghoul(ctx, tint, view) {
    const cx = 128;
    P(ctx, (c) => { c.moveTo(cx - 70, 170); c.bezierCurveTo(cx - 90, 270, cx - 70, 330, cx - 44, 352); c.quadraticCurveTo(cx - 20, 330, cx, 356); c.quadraticCurveTo(cx + 20, 330, cx + 44, 352); c.bezierCurveTo(cx + 70, 330, cx + 90, 270, cx + 70, 170); c.closePath(); }, lg(ctx, 0, 150, 0, 356, '#4a3a6e', '#150d2a'), 6);
    // wisps
    for (let i = 0; i < 4; i++) P(ctx, ell(cx - 60 + i * 40, 340, 14, 22, 0.2 * (i - 1.5)), '#2a1d4aaa', 0);
    // claws
    [[cx - 78, 250, -1], [cx + 78, 250, 1]].forEach(([x, y, s]) => {
      P(ctx, ell(x, y, 16, 38, 0.2 * s), '#2b1f4c', 5);
      for (let k = -1; k <= 1; k++) P(ctx, poly([[x + k * 7 - 3, y + 34], [x + k * 9, y + 62], [x + k * 7 + 4, y + 34]]), '#d8d0f0', 3);
    });
    // hood
    P(ctx, (c) => { c.moveTo(cx - 76, 170); c.bezierCurveTo(cx - 96, 40, cx - 20, 14, cx, 12); c.bezierCurveTo(cx + 20, 14, cx + 96, 40, cx + 76, 170); c.bezierCurveTo(cx + 40, 200, cx - 40, 200, cx - 76, 170); c.closePath(); }, lg(ctx, 0, 10, 0, 200, '#5c4a88', '#1d1236'), 6);
    // horns
    P(ctx, poly([[cx - 50, 40], [cx - 78, -4], [cx - 30, 28]]), '#cfc6e8', 5);
    P(ctx, poly([[cx + 50, 40], [cx + 78, -4], [cx + 30, 28]]), '#cfc6e8', 5);
    if (view !== 'back') {
      P(ctx, ell(cx, 118, 52, 46), '#0b0617', 5);
      [-1, 1].forEach((s) => {
        ctx.fillStyle = tint + '55'; ctx.beginPath(); ctx.arc(cx + s * 24, 112, 26, 0, 7); ctx.fill();
        P(ctx, ell(cx + s * 24, 112, 12, 17, s * 0.25), tint, 0);
        P(ctx, ell(cx + s * 24 - 2, 106, 4, 5), '#ffffff', 0);
      });
      ctx.strokeStyle = '#d8d0f0'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx - 22, 152); for (let i = 0; i <= 6; i++) ctx.lineTo(cx - 22 + i * 7.3, 152 + (i % 2 ? 7 : -3)); ctx.stroke();
    }
  }

  function gorvax(ctx, view) {
    // canvas 384 x 448
    const cx = 192;
    P(ctx, poly([[cx - 100, 150], [cx + 100, 150], [cx + 150, 420], [cx - 150, 420]]), lg(ctx, 0, 150, 0, 420, '#5b0f2a', '#1d0510'), 7);
    P(ctx, rr(cx - 62, 316, 52, 110, 14), lg(ctx, 0, 316, 0, 426, '#3a3550', '#14111f'), 7);
    P(ctx, rr(cx + 10, 316, 52, 110, 14), lg(ctx, 0, 316, 0, 426, '#3a3550', '#14111f'), 7);
    P(ctx, rr(cx - 70, 408, 62, 34, 12), '#241d33', 7);
    P(ctx, rr(cx + 8, 408, 62, 34, 12), '#241d33', 7);
    P(ctx, rr(cx - 88, 150, 176, 180, 40), lg(ctx, cx - 88, 0, cx + 88, 0, '#4a4668', '#1a1730'), 7);
    P(ctx, rr(cx - 78, 296, 156, 22, 8), '#8a1f3a', 5);
    // armour plates
    for (let i = 0; i < 3; i++) P(ctx, rr(cx - 64 + i * 4, 176 + i * 36, 128 - i * 8, 26, 10), '#6a6490', 4);
    P(ctx, ell(cx, 236, 18, 22), rgr(ctx, cx, 232, 2, 22, '#ffd0a0', '#ff3a3a', '#7a0a14'), 5);
    // shoulders
    [-1, 1].forEach((s) => {
      P(ctx, ell(cx + s * 108, 172, 46, 38, s * 0.3), lg(ctx, 0, 140, 0, 210, '#6a6490', '#1d1a33'), 7);
      for (let k = 0; k < 3; k++) P(ctx, poly([[cx + s * (84 + k * 22) - 10, 146 + k * 6], [cx + s * (96 + k * 24), 98 - k * 14], [cx + s * (84 + k * 22) + 12, 146 + k * 6]]), '#cfc6e8', 5);
      P(ctx, ell(cx + s * 124, 272, 24, 62, s * 0.12), '#2e2748', 6);
      for (let k = -1; k <= 1; k++) P(ctx, poly([[cx + s * 124 + k * 11 - 5, 326], [cx + s * 124 + k * 13, 372], [cx + s * 124 + k * 11 + 6, 326]]), '#e8e0ff', 4);
    });
    // head
    P(ctx, ell(cx, 112, 68, 64), lg(ctx, 0, 50, 0, 170, '#7a6aa8', '#2a2048'), 7);
    if (view !== 'back') {
      P(ctx, (c) => { c.moveTo(cx - 52, 112); c.quadraticCurveTo(cx, 86, cx + 52, 112); c.quadraticCurveTo(cx + 40, 166, cx, 168); c.quadraticCurveTo(cx - 40, 166, cx - 52, 112); }, '#0b0617', 5);
      [-1, 1].forEach((s) => {
        ctx.fillStyle = '#ff2a3a55'; ctx.beginPath(); ctx.arc(cx + s * 26, 126, 30, 0, 7); ctx.fill();
        P(ctx, poly([[cx + s * 6, 120], [cx + s * 46, 108], [cx + s * 40, 140], [cx + s * 10, 138]]), '#ff3b4a', 0);
        P(ctx, ell(cx + s * 30, 124, 4, 5), '#ffffff', 0);
      });
      ctx.strokeStyle = '#e8e0ff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 34, 156); for (let i = 0; i <= 8; i++) ctx.lineTo(cx - 34 + i * 8.5, 156 + (i % 2 ? 9 : -2)); ctx.stroke();
    }
    // crown
    P(ctx, poly([[cx - 70, 70], [cx - 66, 8], [cx - 36, 44], [cx - 14, -6], [cx + 6, 40], [cx + 34, -2], [cx + 44, 46], [cx + 72, 10], [cx + 72, 70]]), lg(ctx, 0, 0, 0, 70, '#f5c542', '#a8761a'), 7);
    [-1, 1].forEach((s) => P(ctx, poly([[cx + s * 56, 70], [cx + s * 100, 30], [cx + s * 96, -30], [cx + s * 66, 40]]), '#e8e0ff', 6));
    P(ctx, ell(cx, 56, 9, 9), rgr(ctx, cx, 54, 1, 10, '#fff', '#ff3a6a'), 4);
  }

  function minion(ctx) {
    const cx = 128;
    P(ctx, (c) => { c.moveTo(cx - 54, 240); c.bezierCurveTo(cx - 70, 150, cx - 40, 110, cx, 108); c.bezierCurveTo(cx + 40, 110, cx + 70, 150, cx + 54, 240); c.quadraticCurveTo(cx + 30, 224, cx + 18, 250); c.quadraticCurveTo(cx, 226, cx - 18, 250); c.quadraticCurveTo(cx - 30, 224, cx - 54, 240); c.closePath(); }, lg(ctx, 0, 110, 0, 250, '#6a4a98', '#25133f'), 6);
    [-1, 1].forEach((s) => {
      ctx.fillStyle = '#ff3df244'; ctx.beginPath(); ctx.arc(cx + s * 18, 168, 20, 0, 7); ctx.fill();
      P(ctx, ell(cx + s * 18, 168, 9, 13), '#ff6af6', 0);
    });
    P(ctx, poly([[cx - 30, 124], [cx - 44, 90], [cx - 14, 114]]), '#d8d0f0', 4);
    P(ctx, poly([[cx + 30, 124], [cx + 44, 90], [cx + 14, 114]]), '#d8d0f0', 4);
  }

  // Every character is drawn large, then reduced to real pixel art (48x72, hard alpha, small palette, 1px outline)
  function sprite(name, view, frame) {
    frame = frame || 0;
    const key = name + ':' + view + ':' + frame;
    if (cache[key]) return cache[key];
    let c, ctx, W = 48, H = 72;
    if (name === 'gorvax') { [c, ctx] = mk(384, 448); gorvax(ctx, view); W = 80; H = 93; }
    else if (name === 'minion') { [c, ctx] = mk(256, 384); minion(ctx); }
    else if (name.startsWith('ghoul')) {
      const tint = { ice: '#7ae0ff', fire: '#ff9a3c', ghoul: '#ff3df2', air: '#bff4ff', earth: '#9dff6a', energy: '#fff06a' }[name.split('_')[1] || 'ghoul'] || '#ff3df2';
      [c, ctx] = mk(256, 384); ghoul(ctx, tint, view);
    } else { [c, ctx] = mk(256, 384); human(ctx, HUMANS[name], view, frame); }
    cache[key] = pixelize(c, W, H, { levels: 8 });
    return cache[key];
  }

  // =========================================================
  //  SLUG PORTRAITS (2D, used in menus and cards)
  // =========================================================
  const PAL = {
    Fire:   { a: '#ffb25a', b: '#e8431e', belly: '#ffe0a8', acc: '#ffd23f', glow: '#ff7a2a', dark: '#6a1a0c' },
    Ice:    { a: '#d8f4ff', b: '#4f9de6', belly: '#f4fcff', acc: '#e9fbff', glow: '#7ae0ff', dark: '#1d4a8a' },
    Earth:  { a: '#d8b07a', b: '#7a5a38', belly: '#f0dcb0', acc: '#7ac45a', glow: '#9dff6a', dark: '#3a2a16' },
    Air:    { a: '#ffffff', b: '#7fdcc8', belly: '#ffffff', acc: '#bff4ff', glow: '#bff4ff', dark: '#1d6a62' },
    Energy: { a: '#fff08a', b: '#f0a01e', belly: '#fff9c8', acc: '#ffffff', glow: '#fff06a', dark: '#7a4a08' },
    Ghoul:  { a: '#9a6ad0', b: '#2d1650', belly: '#b88ae8', acc: '#ff3df2', glow: '#ff3df2', dark: '#0e0620' },
  };

  function slugPortrait(ctx, el, S) {
    const p = PAL[el], k = S / 256;
    ctx.save(); ctx.scale(k, k);
    ctx.fillStyle = p.glow + '22'; ctx.beginPath(); ctx.arc(128, 150, 112, 0, 7); ctx.fill();
    // back features
    if (el === 'Air') [-1, 1].forEach((s) => { P(ctx, (c) => { c.moveTo(128 + s * 70, 150); c.bezierCurveTo(128 + s * 140, 60, 128 + s * 150, 150, 128 + s * 112, 190); c.bezierCurveTo(128 + s * 110, 170, 128 + s * 90, 170, 128 + s * 70, 170); c.closePath(); }, lg(ctx, 0, 90, 0, 190, '#ffffff', '#9eeed8'), 6); });
    if (el === 'Energy') P(ctx, (c) => { c.moveTo(168, 190); c.lineTo(214, 170); c.lineTo(196, 150); c.lineTo(236, 112); c.lineWidth = 8; }, null, 8, '#ffd23f');
    if (el === 'Earth') P(ctx, (c) => { c.moveTo(48, 190); c.bezierCurveTo(30, 70, 226, 70, 208, 190); c.closePath(); }, lg(ctx, 0, 70, 0, 190, '#a0a0a8', '#5a5a64'), 7);
    // body
    P(ctx, ell(128, 168, 88, 68), lg(ctx, 0, 100, 0, 236, p.a, p.b), 7);
    P(ctx, ell(128, 196, 58, 36), p.belly, 0);
    if (el === 'Energy') { ctx.strokeStyle = '#7a4a08'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(190, 128); ctx.lineTo(172, 152); ctx.lineTo(194, 160); ctx.lineTo(170, 190); ctx.stroke(); }
    // head bump
    P(ctx, ell(128, 118, 58, 52), lg(ctx, 0, 70, 0, 170, p.a, p.b), 7);
    // features on top
    if (el === 'Fire') [[-26, 0.9], [0, 1.25], [26, 0.9]].forEach(([dx, sc]) => P(ctx, (c) => { c.moveTo(128 + dx - 16 * sc, 76); c.quadraticCurveTo(128 + dx - 20 * sc, 40, 128 + dx, 14 * (2 - sc)); c.quadraticCurveTo(128 + dx + 18 * sc, 44, 128 + dx + 16 * sc, 76); c.closePath(); }, lg(ctx, 0, 20, 0, 80, '#fff2a8', '#ff6a1e'), 5));
    if (el === 'Ice') [[-32, 38], [0, 56], [32, 38]].forEach(([dx, h]) => P(ctx, poly([[128 + dx - 13, 78], [128 + dx, 76 - h], [128 + dx + 13, 78]]), lg(ctx, 0, 20, 0, 80, '#ffffff', '#7ac4ff'), 5));
    if (el === 'Earth') { P(ctx, (c) => { c.moveTo(78, 100); c.bezierCurveTo(88, 40, 168, 40, 178, 100); c.closePath(); }, lg(ctx, 0, 40, 0, 100, '#b0b0b8', '#6a6a74'), 6); P(ctx, ell(112, 62, 16, 7), '#7ac45a', 3); P(ctx, ell(146, 72, 12, 6), '#7ac45a', 3); }
    if (el === 'Energy') { P(ctx, (c) => { c.moveTo(128, 70); c.lineTo(128, 36); c.lineWidth = 6; }, null, 6, OUT); ctx.fillStyle = '#fffbc0'; ctx.beginPath(); ctx.arc(128, 30, 14, 0, 7); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.stroke(); }
    if (el === 'Ghoul') { [-1, 1].forEach((s) => P(ctx, poly([[128 + s * 20, 76], [128 + s * 52, 22], [128 + s * 46, 84]]), '#d8d0f0', 5)); }
    if (el === 'Air') [-1, 1].forEach((s) => P(ctx, (c) => { c.moveTo(128 + s * 10, 74); c.quadraticCurveTo(128 + s * 44, 24, 128 + s * 62, 54); c.quadraticCurveTo(128 + s * 36, 50, 128 + s * 10, 74); }, '#ffffff', 5));
    // eyes
    const eyeCol = el === 'Ghoul' ? '#ff3df2' : '#1b1230';
    [-1, 1].forEach((s) => {
      P(ctx, ell(128 + s * 26, 126, 17, 22), '#ffffff', 5);
      P(ctx, ell(128 + s * 26, 130, 11, 15), eyeCol, 0);
      P(ctx, ell(128 + s * 26 - 3, 123, 4.5, 5.5), '#ffffff', 0);
    });
    P(ctx, ell(128 - 50, 156, 11, 6), '#ff7aa066', 0); P(ctx, ell(128 + 50, 156, 11, 6), '#ff7aa066', 0);
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    if (el === 'Ghoul' || el === 'Ice') { ctx.moveTo(108, 160); ctx.quadraticCurveTo(128, 174, 148, 160); ctx.stroke(); P(ctx, poly([[112, 162], [118, 180], [124, 166]]), '#fff', 3); P(ctx, poly([[132, 166], [138, 180], [144, 162]]), '#fff', 3); }
    else { ctx.moveTo(112, 160); ctx.quadraticCurveTo(128, 178, 144, 160); ctx.stroke(); }
    ctx.restore();
  }

  const portraitCache = {};
  function slugSprite(el) {
    const key = 'slugspr' + el;
    if (cache[key]) return cache[key];
    const [c, ctx] = mk(256, 256);
    slugPortrait(ctx, el, 256);
    cache[key] = pixelize(c, 40, 40, { levels: 8 });
    return cache[key];
  }
  function portrait(el, size) {
    const key = el;
    if (portraitCache[key]) return portraitCache[key];
    portraitCache[key] = slugSprite(el).toDataURL();
    return portraitCache[key];
  }
  function portraitFor(name, size) {
    const map = { Pyrolisk: 'Fire', Frostmaw: 'Ice', Boulderback: 'Earth', Zephyra: 'Air', Voltick: 'Energy', Umbrafang: 'Ghoul' };
    return portrait(map[name] || name, size);
  }
  function dataUrl(name, view) { return sprite(name, view).toDataURL(); }

  // =========================================================
  //  TERRAIN TEXTURES
  // =========================================================
  const ZONE_COLORS = {
    grotto:  { floor: [46, 78, 80], floor2: [78, 128, 112], rock: [62, 82, 110], rock2: [118, 150, 176], vein: [90, 255, 190] },
    hollows: { floor: [54, 82, 124], floor2: [112, 162, 214], rock: [58, 76, 130], rock2: [130, 170, 230], vein: [160, 230, 255] },
    vein:    { floor: [78, 48, 46], floor2: [128, 76, 58], rock: [70, 42, 44], rock2: [140, 82, 66], vein: [255, 120, 40] },
    keep:    { floor: [58, 48, 78], floor2: [98, 82, 122], rock: [52, 44, 72], rock2: [100, 84, 130], vein: [255, 60, 80] },
  };

  function floorTexture(zone) {
    const key = 'floor' + zone;
    if (cache[key]) return cache[key];
    const Z = ZONE_COLORS[zone], S = 256;
    const [c, ctx] = mk(S, S);
    const id = ctx.createImageData(S, S);
    const n1 = makeNoise(8, 11 + zone.length), n2 = makeNoise(16, 33), n3 = makeNoise(4, 7);
    const r = rng(99);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const f = fbm((a, b) => n1(a, b), u * 8, v * 8, 3);
      const d = n2(u * 16, v * 16);
      // flagstones: cell borders from a warped grid
      const gx = (u * 4 + (n3(u * 4, v * 4) - 0.5) * 0.35) * 1, gy = (v * 4 + (n3(u * 4 + 3, v * 4 + 7) - 0.5) * 0.35);
      const fx = Math.abs((((gx % 1) + 1) % 1) - 0.5) * 2, fy = Math.abs((((gy % 1) + 1) % 1) - 0.5) * 2;
      const edge = Math.max(fx, fy);
      const crack = edge > 0.955 ? Math.min(1, (edge - 0.955) / 0.045) : 0;
      const t = f * 0.8 + d * 0.2;
      let cr = Z.floor[0] + (Z.floor2[0] - Z.floor[0]) * t;
      let cg = Z.floor[1] + (Z.floor2[1] - Z.floor[1]) * t;
      let cb = Z.floor[2] + (Z.floor2[2] - Z.floor[2]) * t;
      const shade = 1 - crack * 0.3;
      cr *= shade; cg *= shade; cb *= shade;
      const i = (y * S + x) * 4;
      id.data[i] = cr; id.data[i + 1] = cg; id.data[i + 2] = cb; id.data[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    // pebbles and glowing flecks
    for (let i = 0; i < 70; i++) {
      const x = r() * S, y = r() * S, rad = 1.5 + r() * 3;
      ctx.fillStyle = `rgba(${Z.rock2[0]},${Z.rock2[1]},${Z.rock2[2]},0.35)`;
      ctx.beginPath(); ctx.ellipse(x, y, rad * 1.4, rad, 0, 0, 7); ctx.fill();
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * S, y = r() * S;
      ctx.fillStyle = `rgba(${Z.vein[0]},${Z.vein[1]},${Z.vein[2]},0.5)`;
      ctx.fillRect(x, y, 2, 2);
    }
    cache[key] = c;
    return c;
  }

  function rockTexture(zone) {
    const key = 'rock' + zone;
    if (cache[key]) return cache[key];
    const Z = ZONE_COLORS[zone], S = 256;
    const [c, ctx] = mk(S, S);
    const id = ctx.createImageData(S, S);
    const n1 = makeNoise(6, 5), n2 = makeNoise(12, 17);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const strata = Math.sin((v * 14 + n1(u * 6, v * 6) * 3) * Math.PI) * 0.5 + 0.5;
      const t = fbm(n2, u * 12, v * 12, 3) * 0.6 + strata * 0.4;
      const i = (y * S + x) * 4;
      id.data[i] = Z.rock[0] + (Z.rock2[0] - Z.rock[0]) * t;
      id.data[i + 1] = Z.rock[1] + (Z.rock2[1] - Z.rock[1]) * t;
      id.data[i + 2] = Z.rock[2] + (Z.rock2[2] - Z.rock[2]) * t;
      id.data[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    cache[key] = c;
    return c;
  }

  function lavaTexture() {
    if (cache.lava) return cache.lava;
    const S = 256, [c, ctx] = mk(S, S), id = ctx.createImageData(S, S);
    const n1 = makeNoise(8, 3), n2 = makeNoise(16, 9);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const w = fbm(n1, u * 8, v * 8, 4);
      const crust = Math.abs(fbm(n2, u * 8 + w * 2, v * 8 + w * 2, 3) - 0.5) * 2;
      const hot = Math.pow(1 - Math.min(1, crust * 2.2), 1.6);
      const i = (y * S + x) * 4;
      id.data[i] = 60 + hot * 195; id.data[i + 1] = 14 + hot * 150; id.data[i + 2] = 8 + hot * 30; id.data[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    cache.lava = c;
    return c;
  }

  function waterTexture(frost) {
    const key = 'water' + (frost ? 1 : 0);
    if (cache[key]) return cache[key];
    const S = 256, [c, ctx] = mk(S, S), id = ctx.createImageData(S, S);
    const n1 = makeNoise(8, 4), n2 = makeNoise(16, 12);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const w = fbm(n1, u * 8, v * 8, 3);
      const ripple = Math.abs(fbm(n2, u * 8 + w * 1.5, v * 8, 3) - 0.5) * 2;
      const hi = Math.pow(1 - Math.min(1, ripple * 2.5), 3);
      const i = (y * S + x) * 4;
      id.data[i] = (frost ? 40 : 20) + hi * 120; id.data[i + 1] = (frost ? 110 : 90) + hi * 120; id.data[i + 2] = (frost ? 190 : 150) + hi * 60; id.data[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    cache[key] = c;
    return c;
  }

  function iceTexture() {
    if (cache.ice) return cache.ice;
    const S = 256, [c, ctx] = mk(S, S), id = ctx.createImageData(S, S);
    const n1 = makeNoise(6, 21), n2 = makeNoise(14, 5);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const t = fbm(n1, u * 6, v * 6, 4);
      const cr = Math.pow(Math.abs(fbm(n2, u * 14, v * 14, 2) - 0.5) * 2, 0.4);
      const i = (y * S + x) * 4;
      id.data[i] = 150 + t * 90 + (1 - cr) * 30; id.data[i + 1] = 210 + t * 40; id.data[i + 2] = 245; id.data[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    cache.ice = c;
    return c;
  }

  function glowDot() {
    if (cache.dot) return cache.dot;
    const [c, ctx] = mk(64, 64);
    ctx.fillStyle = rgr(ctx, 32, 32, 0, 32, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)');
    ctx.fillRect(0, 0, 64, 64);
    cache.dot = c;
    return c;
  }

  function blobShadow() {
    if (cache.blob) return cache.blob;
    const [c, ctx] = mk(128, 128);
    ctx.fillStyle = rgr(ctx, 64, 64, 0, 62, 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)');
    ctx.fillRect(0, 0, 128, 128);
    cache.blob = c;
    return c;
  }

  function sparkTexture() {
    if (cache.spark) return cache.spark;
    const [c, ctx] = mk(64, 64);
    ctx.translate(32, 32);
    ctx.fillStyle = rgr(ctx, 0, 0, 0, 30, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    [0, Math.PI / 2].forEach((a) => { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(0, -3); ctx.lineTo(30, 0); ctx.lineTo(0, 3); ctx.fill(); ctx.restore(); });
    cache.spark = c;
    return c;
  }

  // title-screen / UI backdrop

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
  function elementEmoji(el) { return iconHtml(el); }
  const ELEMENT_COLOR = { Fire: '#ff7a2a', Ice: '#6fd0ff', Air: '#9ef0d8', Earth: '#c49a5a', Energy: '#ffe14a', Ghoul: '#d46aff' };

  return { icon, iconHtml, pixelize, slugSprite, sprite, dataUrl, portrait, portraitFor, floorTexture, rockTexture, lavaTexture, waterTexture, iceTexture, glowDot, blobShadow, sparkTexture, makeNoise, fbm, rng, elementEmoji, ELEMENT_COLOR, ZONE_COLORS, PAL };
})();
