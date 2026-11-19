  let terr = null;
  function glowSources() {
    const P = PRESETS[zone.id], L = [];
    zone.rows.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch === 'T') L.push({ x, z: -y, color: P.accent, radius: 2.6, strength: 0.42 }); }));
    const map = { spring: ['#ff8ac8', 3.4, 0.6], altar: ['#ffd86a', 3, 0.5], fusionstone: ['#b070ff', 3.2, 0.5], keepgate: ['#ff3a5a', 3.4, 0.5], boss: ['#ff2a4a', 4.2, 0.5], heartcrystal: ['#ff8ac8', 4, 0.5], wall: ['#ffb040', 2.4, 0.3], mossback: ['#c8ff9a', 2.2, 0.3], rival: ['#7ac4ff', 2.2, 0.3], chest: ['#ffd86a', 1.6, 0.25] };
    zone.objects.forEach((o) => { const m = map[o.kind]; if (m) L.push({ x: o.x, z: -o.y, color: m[0], radius: m[1], strength: m[2] }); });
    zone.exits.forEach((e) => L.push({ x: e.x, z: -e.y, color: P.accent, radius: 3.4, strength: 0.55 }));
    return L;
  }
  function buildTerrain() {
    terrainNodes.forEach((m) => m && m.dispose());
    terrainNodes = [];
    terr = Terrain.build(zone, { scene, root: rootNode, effTile, objects: zone.objects, lights: glowSources(), texFromCanvas, animTex });
    terrainNodes = terr.meshes.slice();
    // ice that bridges lava or water once Frostmaw has frozen it
    zone.objects.filter((o) => o.kind === 'bridge' && o.done).forEach((o) => {
      const slab = B.MeshBuilder.CreateBox('iceSlab' + o.id, { width: 1.0, height: 0.1, depth: 1.0 }, scene);
      slab.position = new B.Vector3(o.x, 0.03, -o.y);
      const im = std('iceMat', '#bfe8ff', { alpha: 0.9, spec: '#ffffff' });
      im.emissiveColor = hex('#4a98c8'); im.diffuseTexture = texFromCanvas(Art.iceTexture(), 'ice', { wrap: true });
      slab.material = im; slab.parent = rootNode; terrainNodes.push(slab);
    });
  }
  const groundY = (x, z) => (terr ? terr.heightAt(x, z) : 0);

  // =========================================================
  //  decoration: noise-driven scatter that follows the smooth fields, not the tiles
  // =========================================================
  let decorMgrs = [], decorNodes = [];
  function buildDecor() {
    decorMgrs.forEach((m) => m.dispose()); decorMgrs = [];
    decorNodes.forEach((m) => m.dispose()); decorNodes = [];
    const P = PRESETS[zone.id], id = zone.id;
    const mgrs = {};
    P.deco.forEach((k) => {
      const m = new B.SpriteManager('deco' + k, Art.pixelize(Art2.deco(k), 32, 32).toDataURL(), 900, 32, scene);
      m.isPickable = false; m.fogEnabled = true; m.texture.updateSamplingMode(B.Texture.NEAREST_SAMPLINGMODE); decorMgrs.push(m); mgrs[k] = m;
    });
    const near = (x, y, d) => zone.objects.some((o) => o.kind !== 'patch' && Math.abs(o.x - x) < d && Math.abs(o.y - y) < d) || zone.exits.some((e) => Math.abs(e.x - x) < d && Math.abs(e.y - y) < d);
    const r = Art.rng(555 + id.length);
    const pts = terr.scatter(0.4, (f) => {
      if (f.pit > 0.18 || f.rock > 0.62) return null;
      if (f.moss > 0.3 && f.r < 0.85) return 'moss';
      if (f.wet > 0.25 && f.r < 0.3) return 'wet';
      if (f.rock > 0.08 && f.r < 0.4) return 'edge';
      if (f.n > 0.52 && f.r < 0.16) return 'open';
      return null;
    });
    const kinds = P.deco;
    pts.forEach((p) => {
      if (near(p.x, p.y, 0.55) || p.kind === 'edge') return;
      const k = p.kind === 'moss' ? kinds[0] : p.kind === 'wet' ? kinds[Math.min(1, kinds.length - 1)] : kinds[Math.floor(r() * kinds.length)];
      const s = new B.Sprite('d', mgrs[k]);
      const size = (p.kind === 'moss' ? 0.5 : 0.42) + r() * 0.5;
      s.position = new B.Vector3(p.x, p.h + size * 0.42, p.z); s.width = size; s.height = size;
      const k2 = 0.78 + r() * 0.4; s.color = new B.Color4(k2, k2, k2, 1);
    });
    // pebbles and boulders along the cliff foot, random scale and overlap
    const mk = (name) => { const m = B.MeshBuilder.CreatePolyhedron(name, { type: 3, size: 0.5 }, scene); m.convertToFlatShadedMesh(); m.isVisible = false; m.parent = rootNode; decorNodes.push(m); return m; };
    const rockMat = std('boulderMat' + id, '#ffffff', {});
    if (!rockMat.diffuseTexture) { rockMat.diffuseTexture = texFromCanvas(Art.rockTexture(id), 'rock' + id, { wrap: true }); rockMat.emissiveColor = new B.Color3(0.05, 0.06, 0.09); }
    const masters = [mk('b0'), mk('b1'), mk('b2')];
    masters.forEach((m) => { m.material = rockMat; });
    pts.forEach((p) => {
      if (p.kind !== 'edge' || near(p.x, p.y, 0.7)) return;
      const big = p.f.rock > 0.3 && r() < 0.35, sz = big ? 0.5 + r() * 0.9 : 0.07 + r() * 0.16;
      const inst = masters[Math.floor(r() * 3)].createInstance('bd'); inst.parent = rootNode; inst.position.set(p.x, p.h + sz * 0.15, p.z);
      inst.scaling.set(sz * (0.8 + r() * 0.6), sz * (0.55 + r() * 0.5), sz * (0.8 + r() * 0.6)); inst.rotation.set(r() * 0.5, r() * 6.28, r() * 0.5); inst.isPickable = false;
      decorNodes.push(inst);
    });
    // large dark foreground rocks near the camera edge (the tilt-shift blurs them)
    for (let i = 0; i < 9; i++) {
      const x = -3 + i * (zone.w + 6) / 8 + (r() - 0.5) * 2, z = -(zone.h + 2.4 + r() * 3), sz = 1.2 + r() * 1.8;
      const inst = masters[i % 3].createInstance('fg'); inst.parent = rootNode; inst.position.set(x, terr.heightAt(x, z) + sz * 0.2, z); inst.scaling.set(sz * 1.3, sz * 0.9, sz); inst.rotation.y = r() * 6; inst.isPickable = false;
      decorNodes.push(inst);
    }
    buildProps();
  }

