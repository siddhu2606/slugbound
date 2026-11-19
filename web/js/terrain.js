// terrain.js - turns the engine's ASCII tile grid (pure LOGIC) into one continuous, organic landscape.
// The tiles are only sampled to make smooth scalar fields (rock, lava, water, chasm, moss). Those fields are
// warped with noise, blurred, and used to build ONE heightfield mesh plus ONE baked ground texture, so no tile
// edge is ever visible. Collision is still decided by C++ on the original grid.
const Terrain = (() => {
  const B = BABYLON;
  const R = 8;                  // field samples per tile
  const TP = 20;                // ground texture texels per tile
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  // palettes: the zone identity lives here (and in lighting), not in tile types
  const PAL = {
    grotto:  { dirt: '#2c4a46', dirt2: '#4a7a66', moss: '#3fd69a', moss2: '#1f8a64', wet: '#18343c', rock: '#3a4a6a', rock2: '#7a98b8', dust: '#8affd8', deep: '#04121a' },
    hollows: { dirt: '#34507c', dirt2: '#6a98c8', moss: '#9ad8ff', moss2: '#4a88c8', wet: '#18305c', rock: '#3a4c88', rock2: '#9cc0f0', dust: '#e0f4ff', deep: '#040c24' },
    vein:    { dirt: '#4a2e2c', dirt2: '#8a5238', moss: '#c8702a', moss2: '#7a3a18', wet: '#2a1412', rock: '#3a2226', rock2: '#9a5a44', dust: '#ffa040', deep: '#120403' },
    keep:    { dirt: '#3c3050', dirt2: '#6a5888', moss: '#8a4a7a', moss2: '#4a2a5a', wet: '#1a1228', rock: '#2c2440', rock2: '#7a6a9a', dust: '#ff5a7a', deep: '#0a0310' },
  };

  function blur(src, W, H, r, passes) {
    let a = Float32Array.from(src); const t = new Float32Array(W * H);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < H; y++) {
        const row = y * W; let s = 0;
        for (let x = -r; x <= r; x++) s += a[row + clamp(x, 0, W - 1)];
        for (let x = 0; x < W; x++) { t[row + x] = s / (2 * r + 1); s += a[row + clamp(x + r + 1, 0, W - 1)] - a[row + clamp(x - r, 0, W - 1)]; }
      }
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let y = -r; y <= r; y++) s += t[clamp(y, 0, H - 1) * W + x];
        for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * r + 1); s += t[clamp(y + r + 1, 0, H - 1) * W + x] - t[clamp(y - r, 0, H - 1) * W + x]; }
      }
    }
    return a;
  }

  function build(zone, ctx) {
    const { scene, root, effTile, objects, lights } = ctx;
    const id = zone.id, P = PAL[id];
    const pal = {}; Object.keys(P).forEach((k) => (pal[k] = hexRgb(P[k])));
    const padW = 12, padN = 16, padS = 8;
    const tx0 = -padW, ty0 = -padN, TW = zone.w + 2 * padW, TH = zone.h + padN + padS;
    const FW = TW * R, FH = TH * R;
    const nA = Art.makeNoise(64, 21), nB = Art.makeNoise(64, 55), nC = Art.makeNoise(64, 9), nD = Art.makeNoise(64, 133);
    const px = (i) => tx0 - 0.5 + (i + 0.5) / R, py = (j) => ty0 - 0.5 + (j + 0.5) / R;

    // ---- tile classification (0 open, 1 moss, 2 rock, 3 lava, 4 water, 5 chasm)
    const tileClass = (tx, ty) => {
      const inside = tx >= 0 && ty >= 0 && tx < zone.w && ty < zone.h;
      if (inside) {
        const ch = effTile(tx, ty);
        return ch === '#' ? 2 : ch === '~' ? 3 : ch === 'w' ? 4 : ch === 'g' ? 5 : ch === 'm' ? 1 : 0;
      }
      const d = Math.max(-tx, tx - (zone.w - 1), -ty, ty - (zone.h - 1));
      if (d <= 3 || d > 9) return 2;
      return Art.fbm(nC, tx * 0.16, ty * 0.16, 2) > 0.44 ? 2 : 0;
    };
    const rock = new Float32Array(FW * FH), lava = new Float32Array(FW * FH), water = new Float32Array(FW * FH), chasm = new Float32Array(FW * FH), moss = new Float32Array(FW * FH), open = new Float32Array(FW * FH);
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
      let x = px(i), y = py(j);
      // noise warp: straight tile borders become irregular before smoothing
      const wx = (Art.fbm(nA, x * 0.55, y * 0.55, 3) - 0.5) * 0.7, wy = (Art.fbm(nB, x * 0.55 + 7, y * 0.55 + 3, 3) - 0.5) * 0.7;
      const c = tileClass(Math.round(x + wx), Math.round(y + wy));
      const k = j * FW + i;
      if (c === 2) rock[k] = 1; else if (c === 3) lava[k] = 1; else if (c === 4) water[k] = 1; else if (c === 5) chasm[k] = 1; else { open[k] = 1; if (c === 1) moss[k] = 1; }
    }
    const rockB = blur(rock, FW, FH, 3, 2);
    const lavaB = blur(lava, FW, FH, 4, 3), waterB = blur(water, FW, FH, 4, 3), chasmB = blur(chasm, FW, FH, 4, 3);
    const mossB = blur(moss, FW, FH, 5, 2);
    const openB = blur(open, FW, FH, 14, 2);              // wide: used for worn paths
    const rockWide = blur(rock, FW, FH, 10, 2);           // wide: ambient occlusion
    const pitAny = new Float32Array(FW * FH);
    for (let k = 0; k < pitAny.length; k++) pitAny[k] = Math.max(lavaB[k], waterB[k], chasmB[k]);
    const wetB = blur(pitAny, FW, FH, 8, 2);

    // ---- "front wall" test: rock that has open ground to its north is kept low so the camera can see past it
    const front = new Float32Array(FW * FH);
    for (let i = 0; i < FW; i++) { let last = -9999; for (let j = 0; j < FH; j++) { if (open[j * FW + i] > 0.5) last = j; front[j * FW + i] = (j - last) < R * 2.4 ? 1 : 0; } }
    const frontB = blur(front, FW, FH, 6, 2);

    // ---- height field
    const H = new Float32Array(FW * FH);
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
      const k = j * FW + i, x = px(i), y = py(j);
      const r = smooth(0.36, 0.64, rockB[k]);
      const nz = Art.fbm(nD, x * 0.32, y * 0.32, 4);
      const far = Math.max(0, Math.max(-x, x - zone.w, -y, y - zone.h) - 3);
      let tall = 2.3 + nz * 2.4 + far * 0.32;
      const low = 0.5 + nz * 0.9;
      let h = mix(tall, low, frontB[k] * (far > 2 ? 0.3 : 1)) * r;
      const t = h * 2.6; h = (Math.floor(t) + smooth(0.3, 0.7, t - Math.floor(t))) / 2.6;   // stacked terraces
      h += Art.fbm(nA, x * 1.4, y * 1.4, 2) * 0.22 * r;
      const flat = (Art.fbm(nB, x * 0.6, y * 0.6, 2) - 0.5) * 0.07;
      const pit = Math.max(smooth(0.3, 0.75, lavaB[k]) * 0.95, smooth(0.3, 0.75, waterB[k]) * 0.85, smooth(0.25, 0.8, chasmB[k]) * 7);
      H[k] = h + flat * (1 - r) - pit;
    }

    // ---- mesh: one smooth surface
    const step = 2, VX = Math.floor((FW - 1) / step) + 1, VY = Math.floor((FH - 1) / step) + 1;
    const rkv = new Float32Array(VX * VY), pos = new Float32Array(VX * VY * 3), uv = new Float32Array(VX * VY * 2), col = new Float32Array(VX * VY * 4);
    for (let vy = 0; vy < VY; vy++) for (let vx = 0; vx < VX; vx++) {
      const i = vx * step, j = vy * step, k = j * FW + i, n = vy * VX + vx;
      pos[n * 3] = px(i); pos[n * 3 + 1] = H[k]; pos[n * 3 + 2] = -py(j); rkv[n] = rockB[k]; rkv[n] = rockB[k];
      uv[n * 2] = (i + 0.5) / FW; uv[n * 2 + 1] = 1 - (j + 0.5) / FH;
      col[n * 4] = col[n * 4 + 1] = col[n * 4 + 2] = col[n * 4 + 3] = 1;
    }
    const idx = [];
    for (let vy = 0; vy < VY - 1; vy++) for (let vx = 0; vx < VX - 1; vx++) { const a = vy * VX + vx, b = a + 1, c = a + VX, d = c + 1; idx.push(a, c, b, b, c, d); }
    const nor = new Float32Array(pos.length);
    B.VertexData.ComputeNormals(pos, idx, nor);
    for (let n = 0; n < nor.length; n += 3) if (nor[n + 1] < 0) { nor[n] *= -1; nor[n + 1] *= -1; nor[n + 2] *= -1; }
    // rock strata live in vertex colours (smooth, never stretched); flat tops get lighter
    for (let n = 0; n < VX * VY; n++) {
      const r = smooth(0.4, 0.6, rkv[n]), hy = pos[n * 3 + 1], x = pos[n * 3], z = pos[n * 3 + 2];
      const band = 0.5 + 0.5 * Math.sin(hy * 9 + Art.fbm(nC, x * 0.4, z * 0.4, 3) * 7);
      const top = smooth(0.7, 0.95, nor[n * 3 + 1]);
      const k = mix(1, 0.7 + band * 0.45 + top * 0.18, r);
      col[n * 4] = col[n * 4 + 1] = col[n * 4 + 2] = k;
    }
    // rock strata live in vertex colours (smooth, never stretched); flat tops get lighter
    for (let n = 0; n < VX * VY; n++) {
      const r = smooth(0.4, 0.6, rkv[n]), hy = pos[n * 3 + 1], x = pos[n * 3], z = pos[n * 3 + 2];
      const band = 0.5 + 0.5 * Math.sin(hy * 9 + Art.fbm(nC, x * 0.4, z * 0.4, 3) * 7);
      const top = smooth(0.7, 0.95, nor[n * 3 + 1]);
      const k = mix(1, 0.7 + band * 0.45 + top * 0.18, r);
      col[n * 4] = col[n * 4 + 1] = col[n * 4 + 2] = k;
    }
    const mesh = new B.Mesh('landscape', scene);
    const vd = new B.VertexData(); vd.positions = pos; vd.normals = nor; vd.uvs = uv; vd.colors = col; vd.indices = idx; vd.applyToMesh(mesh, false);
    mesh.parent = root; mesh.receiveShadows = true; mesh.isPickable = false;

    // ---- baked ground texture (splat blend of dirt / moss / wet stone / crystal dust / strata rock, dithered, with AO and light bounce)
    const TWt = TW * TP, THt = TH * TP;
    const cv = document.createElement('canvas'); cv.width = TWt; cv.height = THt;
    const cx = cv.getContext('2d'), img = cx.createImageData(TWt, THt), D = img.data;
    const bil = (arr, u, v) => {
      const x = clamp(u * FW - 0.5, 0, FW - 1.001), y = clamp(v * FH - 0.5, 0, FH - 1.001);
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, k = y0 * FW + x0;
      return (arr[k] * (1 - fx) + arr[k + 1] * fx) * (1 - fy) + (arr[k + FW] * (1 - fx) + arr[k + FW + 1] * fx) * fy;
    };
    const lerpC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const srcs = (lights || []).map((l) => ({ x: l.x, y: -l.z, c: hexRgb(l.color), r: l.radius, s: l.strength }));
    const lv = 10;
    for (let ty = 0; ty < THt; ty++) for (let tx = 0; tx < TWt; tx++) {
      const u = (tx + 0.5) / TWt, v = (ty + 0.5) / THt;
      const wx = tx0 - 0.5 + u * TW, wy = ty0 - 0.5 + v * TH;      // world x and tile-space y
      const rk = bil(rockB, u, v), ms = bil(mossB, u, v), ow = bil(openB, u, v), rw = bil(rockWide, u, v), wet = bil(wetB, u, v);
      const pl = bil(lavaB, u, v), pw = bil(waterB, u, v), pc = bil(chasmB, u, v), h = bil(H, u, v);
      const big = Art.fbm(nA, wx * 0.09, wy * 0.09, 3), mid = Art.fbm(nB, wx * 0.35, wy * 0.35, 3), fine = nC(wx * 2.2, wy * 2.2);
      const bay = (BAYER[(ty & 3) * 4 + (tx & 3)] / 16 - 0.5) * (1 - smooth(0.35, 0.5, bil(rockB, u, v)) * 0.9);
      // ground
      let g = lerpC(pal.dirt, pal.dirt2, smooth(0.3, 0.7, mid * 0.8 + big * 0.4));
      const worn = smooth(0.5, 0.85, ow) * (1 - ms) * smooth(0.35, 0.6, mid);
      g = lerpC(g, [g[0] * 1.35, g[1] * 1.3, g[2] * 1.2], worn * 0.55);
      const mossAmt = clamp(ms * 1.35 + (mid - 0.5) * 0.9, 0, 1);
      const mc = lerpC(pal.moss2, pal.moss, smooth(0.35, 0.8, fine * 0.6 + mid * 0.5));
      g = lerpC(g, mc, smooth(0.35, 0.65, mossAmt + bay * 0.35));
      g = lerpC(g, pal.wet, smooth(0.15, 0.55, wet + bay * 0.2) * 0.85);
      if (fine > 0.86 + (bay * 0.05)) g = lerpC(g, pal.dust, 0.75);                 // crystal dust flecks
      // rock: strata bands driven by height + noise, lighter on flat tops
      const strata = 0.5 + 0.5 * Math.sin(h * 11 + mid * 5 + big * 6);
      let rc = lerpC(pal.rock, pal.rock2, clamp(0.4 + big * 0.2 + strata * 0.1, 0, 1));
      let c = lerpC(g, rc, smooth(0.38, 0.55, rk + bay * 0.05));
      // pits: dark, wet banks fade to the deep colour
      const pit = Math.max(pl, pw, pc);
      c = lerpC(c, pal.deep, smooth(0.3, 0.9, pc) * 0.95);
      c = lerpC(c, pal.wet, smooth(0.3, 0.8, Math.max(pl, pw)) * 0.9);
      // ambient occlusion in corners and under cliffs
      const ao = 1 - 0.42 * smooth(0.12, 0.7, rw) * (1 - smooth(0.4, 0.6, rk)) - 0.35 * smooth(0.2, 0.6, pit) * (1 - smooth(0.3, 0.6, pit));
      let r = c[0] * ao, gg = c[1] * ao, b = c[2] * ao;
      // light bounce from glowing things
      for (let s = 0; s < srcs.length; s++) {
        const L = srcs[s], dx = wx - L.x, dy = wy - L.y, d2 = (dx * dx + dy * dy) / (L.r * L.r);
        if (d2 < 1) { const f = (1 - d2) * (1 - d2) * L.s; r += L.c[0] * f; gg += L.c[1] * f; b += L.c[2] * f; }
      }
      // pixel-art flavour: ordered dithering into a small palette
      r = Math.floor(clamp(r, 0, 1) * (lv - 1) + 0.5 + bay * 0.8) / (lv - 1);
      gg = Math.floor(clamp(gg, 0, 1) * (lv - 1) + 0.5 + bay * 0.8) / (lv - 1);
      b = Math.floor(clamp(b, 0, 1) * (lv - 1) + 0.5 + bay * 0.8) / (lv - 1);
      const o = (ty * TWt + tx) * 4;
      D[o] = clamp(r, 0, 1) * 255; D[o + 1] = clamp(gg, 0, 1) * 255; D[o + 2] = clamp(b, 0, 1) * 255; D[o + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    const tex = new B.DynamicTexture('groundBake', { width: TWt, height: THt }, scene, true, B.Texture.TRILINEAR_SAMPLINGMODE);
    tex.getContext().drawImage(cv, 0, 0); tex.update(true); tex.anisotropicFilteringLevel = 4;
    const mat = new B.StandardMaterial('landMat', scene);
    mat.diffuseTexture = tex; mat.specularColor = new B.Color3(0.04, 0.04, 0.05); mat.maxSimultaneousLights = 6; mat.backFaceCulling = true;
    mat.emissiveColor = new B.Color3(0.04, 0.05, 0.06);
    mesh.material = mat;
    const meshes = [mesh];

    // ---- water and lava: alpha-masked surfaces cut by the smooth fields (the shoreline is where terrain crosses the surface)
    const makeSurface = (field, level, kind) => {
      let any = false; for (let k = 0; k < field.length; k += 7) if (field[k] > 0.3) { any = true; break; }
      if (!any) return;
      const mc = document.createElement('canvas'); mc.width = FW; mc.height = FH; const mx = mc.getContext('2d'), mi = mx.createImageData(FW, FH);
      for (let k = 0; k < FW * FH; k++) { mi.data[k * 4] = mi.data[k * 4 + 1] = mi.data[k * 4 + 2] = 255; mi.data[k * 4 + 3] = smooth(0.27, 0.36, field[k]) * 255; }
      mx.putImageData(mi, 0, 0);
      const mask = new B.DynamicTexture('mask' + kind, { width: FW, height: FH }, scene, false, B.Texture.BILINEAR_SAMPLINGMODE);
      mask.getContext().drawImage(mc, 0, 0); mask.update(true); mask.hasAlpha = true;
      const plane = B.MeshBuilder.CreateGround('surf' + kind, { width: TW, height: TH, subdivisions: 1 }, scene);
      plane.position.set(tx0 - 0.5 + TW / 2, level, -(ty0 - 0.5 + TH / 2)); plane.parent = root; plane.isPickable = false;
      const sm = new B.StandardMaterial('surfMat' + kind, scene);
      const detail = kind === 'lava' ? Art.lavaTexture() : Art.waterTexture(id === 'hollows');
      const dt = ctx.texFromCanvas(detail, kind + id, { wrap: true });
      dt.uScale = TW / 5; dt.vScale = TH / 5;
      sm.diffuseTexture = dt; sm.opacityTexture = mask; sm.backFaceCulling = false;
      if (kind === 'lava') { sm.disableLighting = true; sm.emissiveTexture = dt; sm.emissiveColor = new B.Color3(1.25, 0.9, 0.7); }
      else { sm.emissiveTexture = dt; sm.emissiveColor = new B.Color3(0.5, 0.65, 0.8); sm.specularColor = new B.Color3(0.7, 0.85, 1); sm.specularPower = 60; sm.alpha = 0.9; }
      plane.material = sm; plane.receiveShadows = false;
      meshes.push(plane);
      ctx.animTex.push({ t: dt, du: kind === 'lava' ? 0.012 : -0.01, dv: kind === 'lava' ? 0.006 : 0.008 });
      // shoreline foam / glowing rim: a soft additive ring around the bank
      const rc = document.createElement('canvas'); rc.width = FW; rc.height = FH; const rx = rc.getContext('2d'), ri = rx.createImageData(FW, FH);
      for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
        const k = j * FW + i, f = field[k];
        const ring = smooth(0.2, 0.31, f) * (1 - smooth(0.36, 0.52, f));
        const n = Art.fbm(nA, px(i) * 1.6, py(j) * 1.6, 2);
        const a = ring * (kind === 'lava' ? 0.95 : 0.55 * smooth(0.35, 0.7, n));
        const o = k * 4; ri.data[o] = kind === 'lava' ? 255 : 220; ri.data[o + 1] = kind === 'lava' ? 140 : 245; ri.data[o + 2] = kind === 'lava' ? 40 : 255; ri.data[o + 3] = a * 255;
      }
      rx.putImageData(ri, 0, 0);
      const rt = new B.DynamicTexture('rim' + kind, { width: FW, height: FH }, scene, false, B.Texture.BILINEAR_SAMPLINGMODE);
      rt.getContext().drawImage(rc, 0, 0); rt.update(true); rt.hasAlpha = true;
      const rim = plane.clone('rim' + kind); rim.position.y = level + 0.012; rim.parent = root;
      const rm = new B.StandardMaterial('rimMat' + kind, scene); rm.disableLighting = true; rm.emissiveTexture = rt; rm.opacityTexture = rt; rm.emissiveColor = new B.Color3(1, 1, 1); rm.alphaMode = B.Engine.ALPHA_ADD; rm.backFaceCulling = false;
      rim.material = rm; meshes.push(rim);
    };
    makeSurface(lavaB, -0.3, 'lava');
    makeSurface(waterB, -0.22, 'water');

    // ---- queries and scatter points for decoration (not tied to tiles)
    const sampleAt = (arr, x, y) => bil(arr, (x - (tx0 - 0.5)) / TW, (y - (ty0 - 0.5)) / TH);
    const heightAt = (x, z) => sampleAt(H, x, -z);
    const scatter = (cell, fn) => {                            // jittered grid = Poisson-ish
      const out = [], rr = Art.rng(777 + id.length);
      for (let y = -2; y < zone.h + 2; y += cell) for (let x = -2; x < zone.w + 2; x += cell) {
        const sx = x + rr() * cell, sy = y + rr() * cell;
        const f = { rock: sampleAt(rockB, sx, sy), moss: sampleAt(mossB, sx, sy), wet: sampleAt(wetB, sx, sy), open: sampleAt(openB, sx, sy), pit: Math.max(sampleAt(lavaB, sx, sy), sampleAt(waterB, sx, sy), sampleAt(chasmB, sx, sy)), h: heightAt(sx, -sy), r: rr(), n: Art.fbm(nD, sx * 0.4, sy * 0.4, 2) };
        const p = fn(f); if (p) out.push({ x: sx, y: sy, z: -sy, h: f.h, f, kind: p });
      }
      return out;
    };
    return { meshes, heightAt, scatter, sampleAt, fields: { rockB, mossB }, bounds: { tx0, ty0, TW, TH } };
  }

  return { build, PAL, hexRgb };
})();
