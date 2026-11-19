p = 'web/js/slugs3d.js'
s = open(p, encoding='utf-8').read()
a = s.index("  // ---------------------------------------------------------\n  //  build one slug.")
b = s.index("  // ---------------------------------------------------------\n  //  particle effects")
new = """  // ---------------------------------------------------------
  //  one slug = one pixel-art billboard (same art direction as the characters), squashed and flashed in code
  // ---------------------------------------------------------
  const slugMats = {};
  function slugMat(element) {
    if (slugMats[element]) return slugMats[element];
    const c = Art.slugSprite(element);
    const t = World3D.texFromCanvas(c, 'slugspr' + element, { alpha: true, noMip: true, sampling: B.Texture.NEAREST_SAMPLINGMODE });
    const m = new B.StandardMaterial('slugM' + element, scene);
    m.diffuseTexture = t; m.useAlphaFromDiffuseTexture = true; m.transparencyMode = B.Material.MATERIAL_ALPHATEST; m.alphaCutOff = 0.5;
    m.specularColor = new B.Color3(0, 0, 0); m.emissiveColor = new B.Color3(0.28, 0.28, 0.3); m.backFaceCulling = false;
    slugMats[element] = m;
    return m;
  }

  function create(element, o = {}) {
    const P = PAL[element], root = new B.TransformNode('slug_' + element, scene);
    const plane = B.MeshBuilder.CreatePlane('slugPlane', { width: 1.5, height: 1.5 }, scene);
    plane.parent = root; plane.position.y = 0.72; plane.billboardMode = B.Mesh.BILLBOARDMODE_Y; plane.isPickable = false; plane.metadata = { caster: true };
    const mat = slugMat(element).clone('slugInst');
    plane.material = mat;
    const state = { t0: Math.random() * 6, squash: 0, flash: 0 };
    let glow = 0;
    const api = {
      root, element, parts: {}, meshes: [plane], state, glowColor: P.glow,
      idle(t) {
        const s = Math.sin(t * 3 + state.t0), sq = state.squash;
        plane.scaling.set(1 - s * 0.03 + sq * 0.3, 1 + s * 0.05 - sq * 0.34, 1);
        plane.position.y = 0.72 * plane.scaling.y;
        if (state.flash > 0) state.flash = Math.max(0, state.flash - 0.06);
        const e = 0.28 + state.flash + glow * 0.5;
        mat.emissiveColor.set(e, e, e + 0.02);
        if (state.squash > 0) state.squash = Math.max(0, state.squash - 0.045);
      },
      flashWhite(v = 0.8) { state.flash = v; },
      squashHit(v = 0.5) { state.squash = v; },
      setGlow(v) { glow = v; },
      setVisible(v) { root.setEnabled(v); },
      dispose() { plane.dispose(); mat.dispose(); root.dispose(); },
    };
    return api;
  }

"""
s = s[:a] + new + s[b:]
open(p, 'w', encoding='utf-8').write(s)
print('ok')
