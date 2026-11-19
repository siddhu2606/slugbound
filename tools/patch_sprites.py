p = 'web/js/art.js'
s = open(p, encoding='utf-8').read()

# 1. walk frames in the human drawing
s = s.replace("function human(ctx, o, view) {", "function human(ctx, o, view, walk) {\n    walk = walk || 0;", 1)
s = s.replace("""    legXs.forEach((lx, i) => {
      P(ctx, rr(lx, 298, legW, 56, 12), lg(ctx, 0, 298, 0, 354, o.pants, o.pantsDark), 6);
      P(ctx, rr(lx - 3, 330, legW + 8 + (side ? 6 : 0), 26, 11), lg(ctx, 0, 330, 0, 356, o.boots, '#20142e'), 6);
    });""", """    const lift = walk === 1 ? [16, 0] : walk === 2 ? [0, 16] : [0, 0];
    legXs.forEach((lx0, i) => {
      const ly = lift[i], lx = side ? lx0 + (walk === 1 ? (i ? 12 : -12) : walk === 2 ? (i ? -12 : 12) : 0) : lx0;
      P(ctx, rr(lx, 298 - ly, legW, 56, 12), lg(ctx, 0, 298, 0, 354, o.pants, o.pantsDark), 6);
      P(ctx, rr(lx - 3, 330 - ly, legW + 8 + (side ? 6 : 0), 26, 11), lg(ctx, 0, 330, 0, 356, o.boots, '#20142e'), 6);
    });""", 1)
s = s.replace("ctx.save(); ctx.translate(ax, 234); ctx.rotate(0.14 * s);", "ctx.save(); ctx.translate(ax, 234 - (walk ? 6 : 0)); ctx.rotate(0.14 * s + (walk === 1 ? 0.4 * s : walk === 2 ? -0.4 * s : 0));", 1)

# 2. sprites are pixel art now
a = s.index("  function sprite(name, view) {")
b = s.index("  // =========================================================\n  //  SLUG PORTRAITS")
s = s[:a] + """  // Every character is drawn large, then reduced to real pixel art (48x72, hard alpha, small palette, 1px outline)
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

""" + s[b:]

# 3. slug portraits are pixel art too
a = s.index("  const portraitCache = {};")
b = s.index("  function portraitFor(name, size) {")
s = s[:a] + """  const portraitCache = {};
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
""" + s[b:]
s = s.replace("return { pixelize, sprite, dataUrl,", "return { pixelize, slugSprite, sprite, dataUrl,")

open(p, 'w', encoding='utf-8').write(s)

# 4. calmer ground bake: less dither, smoother rock
p2 = 'web/js/terrain.js'
t = open(p2, encoding='utf-8').read()
t = t.replace("const bay = BAYER[(ty & 3) * 4 + (tx & 3)] / 16 - 0.5;", "const bay = (BAYER[(ty & 3) * 4 + (tx & 3)] / 16 - 0.5) * (1 - smooth(0.35, 0.5, bil(rockB, u, v)) * 0.9);")
t = t.replace("const lv = 7;", "const lv = 10;")
t = t.replace("let rc = lerpC(pal.rock, pal.rock2, clamp(strata * 0.55 + mid * 0.5 + (h > 1.2 ? 0.1 : 0), 0, 1));\n      if (fine > 0.9) rc = lerpC(rc, pal.dust, 0.35);", "let rc = lerpC(pal.rock, pal.rock2, clamp(0.42 + big * 0.35 + strata * 0.12, 0, 1));")
t = t.replace("pos[n * 3] = px(i); pos[n * 3 + 1] = H[k]; pos[n * 3 + 2] = -py(j);", "pos[n * 3] = px(i); pos[n * 3 + 1] = H[k]; pos[n * 3 + 2] = -py(j); rkv[n] = rockB[k];")
t = t.replace("const pos = new Float32Array(VX * VY * 3),", "const rkv = new Float32Array(VX * VY), pos = new Float32Array(VX * VY * 3),")
t = t.replace("    const mesh = new B.Mesh('landscape', scene);", """    // rock strata live in vertex colours (smooth, never stretched); flat tops get lighter
    for (let n = 0; n < VX * VY; n++) {
      const r = smooth(0.4, 0.6, rkv[n]), hy = pos[n * 3 + 1], x = pos[n * 3], z = pos[n * 3 + 2];
      const band = 0.5 + 0.5 * Math.sin(hy * 9 + Art.fbm(nC, x * 0.4, z * 0.4, 3) * 7);
      const top = smooth(0.7, 0.95, nor[n * 3 + 1]);
      const k = mix(1, 0.7 + band * 0.45 + top * 0.18, r);
      col[n * 4] = col[n * 4 + 1] = col[n * 4 + 2] = k;
    }
    const mesh = new B.Mesh('landscape', scene);""")
open(p2, 'w', encoding='utf-8').write(t)

# 5. scene: pixel sprites, frames, nearest filtering
p3 = 'web/js/scene.js'
u = open(p3, encoding='utf-8').read()
a = u.index("  const spriteMats = {};")
b = u.index("  class Actor {")
u = u[:a] + """  const spriteMats = {};
  function spriteMat(name, view, frame) {
    const key = name + ':' + view + ':' + (frame || 0);
    if (spriteMats[key]) return spriteMats[key];
    const c = Art.sprite(name, view, frame || 0);
    const t = texFromCanvas(c, 'spr' + key, { alpha: true, noMip: true, sampling: B.Texture.NEAREST_SAMPLINGMODE });
    const m = new B.StandardMaterial('spr' + key, scene);
    m.diffuseTexture = t; m.useAlphaFromDiffuseTexture = true; m.transparencyMode = B.Material.MATERIAL_ALPHATEST; m.alphaCutOff = 0.5;
    m.specularColor = new B.Color3(0, 0, 0); m.emissiveColor = new B.Color3(0.3, 0.3, 0.34); m.backFaceCulling = false; m.maxSimultaneousLights = 6;
    spriteMats[key] = m;
    return m;
  }

""" + u[b:]
u = u.replace("this.plane.material = spriteMat(name, 'front'); this.plane.isPickable = false;", "this.plane.material = spriteMat(name, 'front', 0); this.plane.isPickable = false; this.view = 'front'; this.frame = 0;")
u = u.replace("""      const view = d === 'up' ? 'back' : d === 'down' ? 'front' : 'side';
      this.plane.material = spriteMat(this.name, view);
      this.plane.scaling.x = d === 'left' ? -1 : 1;""", """      this.view = d === 'up' ? 'back' : d === 'down' ? 'front' : 'side';
      this.plane.material = spriteMat(this.name, this.view, this.frame);
      this.plane.scaling.x = d === 'left' ? -1 : 1;""")
u = u.replace("""        this.walk += dt * 14;""", """        this.walk += dt * 14;
        if (this.hasViews) { const f = 1 + (Math.floor(this.walk / 2.2) % 2); if (f !== this.frame) { this.frame = f; this.plane.material = spriteMat(this.name, this.view, f); } }""")
u = u.replace("""      if (this.hop > 0)""", """      if (!this.walking && this.frame && this.hasViews) { this.frame = 0; this.plane.material = spriteMat(this.name, this.view, 0); }
      if (this.hop > 0)""")
open(p3, 'w', encoding='utf-8').write(u)
print('ok')
