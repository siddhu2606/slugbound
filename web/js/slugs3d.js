// slugs3d.js - the six slugs as real 3D toon models (stepped cel-shading, rim light, inked outline) plus the particle effects they use.
const Slugs3D = (() => {
  const B = BABYLON;
  let scene = null, camera = null;
  const toonMats = [];

  const PAL = {
    Fire:   { base: '#ff9a50', shade: '#b8341a', rim: '#ffd890', glow: '#ff7a2a', belly: '#ffe3b0', eye: '#2a0e08' },
    Ice:    { base: '#a8e4ff', shade: '#3a7ac8', rim: '#ffffff', glow: '#7ae0ff', belly: '#f2fbff', eye: '#10244a' },
    Earth:  { base: '#c89a62', shade: '#6a4a2a', rim: '#ffe0a0', glow: '#9dff6a', belly: '#f0d8a8', eye: '#2a1a0c' },
    Air:    { base: '#f6fffc', shade: '#6ac8b8', rim: '#ffffff', glow: '#bff4ff', belly: '#ffffff', eye: '#103a3a' },
    Energy: { base: '#ffe45a', shade: '#d88a10', rim: '#ffffff', glow: '#fff06a', belly: '#fff6b0', eye: '#3a2406' },
    Ghoul:  { base: '#8a58c0', shade: '#2a1048', rim: '#ff9af8', glow: '#ff3df2', belly: '#b080e0', eye: '#ff3df2' },
  };

  function init(sc, cam) {
    scene = sc; camera = cam;
    B.Effect.ShadersStore.toonVertexShader = `
      precision highp float;
      attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
      uniform mat4 world; uniform mat4 worldViewProjection;
      varying vec3 vN; varying vec3 vW; varying vec2 vUV;
      void main(void) {
        vec4 w = world * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(world) * normal); vUV = uv;
        gl_Position = worldViewProjection * vec4(position, 1.0);
      }`;
    B.Effect.ShadersStore.toonFragmentShader = `
      precision highp float;
      varying vec3 vN; varying vec3 vW; varying vec2 vUV;
      uniform vec3 base; uniform vec3 shade; uniform vec3 rim; uniform vec3 lightDir; uniform vec3 camPos;
      uniform float glowAmt; uniform float flashAmt; uniform float stripe;
      void main(void) {
        vec3 n = normalize(vN);
        vec3 L = normalize(-lightDir);
        float ndl = dot(n, L);
        float band = ndl > 0.45 ? 1.0 : (ndl > -0.1 ? 0.62 : 0.3);
        vec3 col = mix(shade, base, band);
        vec3 v = normalize(camPos - vW);
        float r = 1.0 - max(dot(n, v), 0.0);
        col += rim * smoothstep(0.55, 0.72, r) * 0.65;
        float spec = pow(max(dot(reflect(-L, n), v), 0.0), 40.0);
        col += vec3(1.0) * step(0.55, spec) * 0.4;
        col *= 1.0 + stripe * step(0.5, fract(vW.y * 5.0)) * 0.08;
        col += base * glowAmt + vec3(flashAmt);
        gl_FragColor = vec4(col, 1.0);
      }`;
    scene.onBeforeRenderObservable.add(() => {
      toonMats.forEach((m) => { m.setVector3('camPos', camera.position); });
    });
  }

  function toon(base, shade, rim, opts = {}) {
    const m = new B.ShaderMaterial('toon', scene, { vertex: 'toon', fragment: 'toon' }, {
      attributes: ['position', 'normal', 'uv'],
      uniforms: ['world', 'worldViewProjection', 'base', 'shade', 'rim', 'lightDir', 'camPos', 'glowAmt', 'flashAmt', 'stripe'],
    });
    const h = B.Color3.FromHexString;
    m.setColor3('base', h(base)); m.setColor3('shade', h(shade)); m.setColor3('rim', h(rim));
    m.setVector3('lightDir', new B.Vector3(-0.45, -0.8, 0.5)); m.setVector3('camPos', camera.position);
    m.setFloat('glowAmt', opts.glow || 0); m.setFloat('flashAmt', 0); m.setFloat('stripe', opts.stripe || 0);
    m.backFaceCulling = true;
    toonMats.push(m);
    return m;
  }
  function glowStd(color, a = 1) {
    const m = new B.StandardMaterial('gl', scene);
    m.emissiveColor = B.Color3.FromHexString(color); m.disableLighting = true; m.alpha = a;
    return m;
  }
  function darkStd(color) {
    const m = new B.StandardMaterial('dk', scene);
    m.diffuseColor = B.Color3.FromHexString(color); m.specularColor = new B.Color3(0.6, 0.6, 0.6); m.emissiveColor = B.Color3.FromHexString(color).scale(0.25);
    return m;
  }

  // ---------------------------------------------------------
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
    const base = slugMat(element);                         // (Material.clone would blank the dynamic texture, so build a fresh one)
    const mat = new B.StandardMaterial('slugInst', scene);
    mat.diffuseTexture = base.diffuseTexture; mat.useAlphaFromDiffuseTexture = true; mat.transparencyMode = B.Material.MATERIAL_ALPHATEST; mat.alphaCutOff = 0.5;
    mat.specularColor = new B.Color3(0, 0, 0); mat.emissiveColor = new B.Color3(0.28, 0.28, 0.3); mat.backFaceCulling = false;
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

  // ---------------------------------------------------------
  //  particle effects
  // ---------------------------------------------------------
  const dotTex = () => World3D.texFromCanvas(Art.glowDot(), 'dot', { alpha: true });
  const sparkTex = () => World3D.texFromCanvas(Art.sparkTexture(), 'spark', { alpha: true });

  const FX = {
    Fire:   { c1: [1, 0.55, 0.1], c2: [1, 0.85, 0.3], size: [0.15, 0.5], grav: 1.8, power: [2, 5] },
    Ice:    { c1: [0.5, 0.85, 1], c2: [1, 1, 1], size: [0.1, 0.4], grav: -1.5, power: [2, 5] },
    Earth:  { c1: [0.7, 0.55, 0.35], c2: [0.5, 0.8, 0.3], size: [0.12, 0.4], grav: -5, power: [3, 6] },
    Air:    { c1: [0.8, 1, 0.95], c2: [1, 1, 1], size: [0.1, 0.35], grav: 0.2, power: [3, 7] },
    Energy: { c1: [1, 0.95, 0.3], c2: [1, 1, 1], size: [0.08, 0.3], grav: 0, power: [4, 9] },
    Ghoul:  { c1: [0.9, 0.3, 1], c2: [0.4, 0.1, 0.6], size: [0.15, 0.5], grav: 0.5, power: [2, 5] },
  };

  function burst(pos, element, n = 40, scale = 1) {
    const f = FX[element] || FX.Fire;
    const ps = new B.ParticleSystem('burst', n + 20, scene);
    ps.particleTexture = element === 'Energy' || element === 'Ice' ? sparkTex() : dotTex();
    ps.emitter = pos.clone();
    ps.minEmitBox = new B.Vector3(-0.1, 0, -0.1); ps.maxEmitBox = new B.Vector3(0.1, 0.1, 0.1);
    ps.color1 = new B.Color4(...f.c1, 1); ps.color2 = new B.Color4(...f.c2, 1); ps.colorDead = new B.Color4(f.c1[0], f.c1[1], f.c1[2], 0);
    ps.minSize = f.size[0] * scale; ps.maxSize = f.size[1] * scale; ps.minLifeTime = 0.35; ps.maxLifeTime = 0.9;
    ps.manualEmitCount = n; ps.emitRate = 0; ps.gravity = new B.Vector3(0, f.grav, 0);
    ps.direction1 = new B.Vector3(-1, 0.4, -1); ps.direction2 = new B.Vector3(1, 1.6, 1);
    ps.minEmitPower = f.power[0] * scale; ps.maxEmitPower = f.power[1] * scale;
    ps.blendMode = element === 'Earth' ? B.ParticleSystem.BLENDMODE_STANDARD : B.ParticleSystem.BLENDMODE_ADD;
    ps.targetStopDuration = 1.2; ps.disposeOnStop = true;
    ps.start();
    return ps;
  }

  function ring(pos, color, maxScale = 3.2, dur = 0.55) {
    const r = B.MeshBuilder.CreateTorus('ring', { diameter: 1, thickness: 0.06, tessellation: 36 }, scene);
    r.position.copyFrom(pos); r.rotation.x = Math.PI / 2;
    const m = new B.StandardMaterial('ringM', scene); m.emissiveColor = B.Color3.FromHexString(color); m.disableLighting = true; m.alpha = 0.9; r.material = m; r.isPickable = false;
    World3D.tween(dur, (k) => { r.scaling.setAll(0.2 + k * maxScale); m.alpha = 0.9 * (1 - k); }, World3D.easeOut).then(() => { r.dispose(); m.dispose(); });
  }

  function trail(node, element) {
    const f = FX[element] || FX.Fire;
    const ps = new B.ParticleSystem('trail', 120, scene);
    ps.particleTexture = dotTex(); ps.emitter = node;
    ps.minEmitBox = new B.Vector3(-0.1, 0, -0.1); ps.maxEmitBox = new B.Vector3(0.1, 0.2, 0.1);
    ps.color1 = new B.Color4(...f.c1, 0.9); ps.color2 = new B.Color4(...f.c2, 0.8); ps.colorDead = new B.Color4(f.c1[0], f.c1[1], f.c1[2], 0);
    ps.minSize = 0.12; ps.maxSize = 0.34; ps.minLifeTime = 0.25; ps.maxLifeTime = 0.55; ps.emitRate = 160;
    ps.blendMode = B.ParticleSystem.BLENDMODE_ADD; ps.gravity = new B.Vector3(0, 0.2, 0);
    ps.direction1 = new B.Vector3(-0.3, 0, -0.3); ps.direction2 = new B.Vector3(0.3, 0.3, 0.3); ps.minEmitPower = 0.1; ps.maxEmitPower = 0.6;
    ps.start();
    return ps;
  }

  function bolt(a, b, color = '#fff06a') {
    const pts = [a.clone()];
    for (let i = 1; i < 8; i++) { const p = B.Vector3.Lerp(a, b, i / 8); p.x += (Math.random() - 0.5) * 0.6; p.y += (Math.random() - 0.5) * 0.6; p.z += (Math.random() - 0.5) * 0.6; pts.push(p); }
    pts.push(b.clone());
    const l = B.MeshBuilder.CreateLines('bolt', { points: pts }, scene);
    l.color = B.Color3.FromHexString(color); l.isPickable = false;
    const t = B.MeshBuilder.CreateTube('boltT', { path: pts, radius: 0.05, tessellation: 5 }, scene);
    const m = new B.StandardMaterial('boltM', scene); m.emissiveColor = B.Color3.FromHexString(color); m.disableLighting = true; t.material = m; t.isPickable = false;
    World3D.wait(140).then(() => { l.dispose(); t.dispose(); m.dispose(); });
  }

  return { init, create, burst, ring, trail, bolt, PAL, toon };
})();
