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
  //  build one slug.  The model faces +Z, about 1.1 units tall.
  // ---------------------------------------------------------
  function create(element, o = {}) {
    const P = PAL[element], root = new B.TransformNode('slug3d_' + element, scene);
    const parts = {};
    const meshes = [];
    const mat = toon(P.base, P.shade, P.rim, { stripe: element === 'Energy' ? 1 : 0 });
    const matBelly = toon(P.belly, P.base, P.rim);
    const add = (m, parent) => { m.parent = parent || root; m.isPickable = false; m.metadata = { caster: true }; meshes.push(m); return m; };

    const body = add(B.MeshBuilder.CreateSphere('body', { diameter: 1, segments: 20 }, scene));
    body.scaling.set(1.12, 0.86, 1.3); body.position.y = 0.46; body.material = mat;
    const belly = add(B.MeshBuilder.CreateSphere('belly', { diameter: 0.8, segments: 14 }, scene));
    belly.scaling.set(0.95, 0.5, 1.15); belly.position.set(0, 0.26, 0.12); belly.material = matBelly;
    const head = add(B.MeshBuilder.CreateSphere('head', { diameter: 0.86, segments: 20 }, scene));
    head.scaling.set(1.0, 0.92, 0.95); head.position.set(0, 0.84, 0.36); head.material = mat;
    parts.body = body; parts.head = head;
    // tail
    const tail = add(B.MeshBuilder.CreateSphere('tail', { diameter: 0.5, segments: 10 }, scene));
    tail.scaling.set(0.7, 0.55, 1.3); tail.position.set(0, 0.24, -0.7); tail.material = mat;
    // eyes
    const eyeWhite = glowStd('#ffffff'); eyeWhite.disableLighting = false; eyeWhite.diffuseColor = new B.Color3(1, 1, 1); eyeWhite.emissiveColor = new B.Color3(0.75, 0.75, 0.8);
    const pupilM = element === 'Ghoul' ? glowStd(P.eye) : darkStd(P.eye);
    parts.eyes = [];
    [-1, 1].forEach((s) => {
      const eye = add(B.MeshBuilder.CreateSphere('eye', { diameter: 0.3, segments: 12 }, scene), head);
      eye.position.set(s * 0.2, 0.08, 0.34); eye.scaling.set(1, 1.18, 0.7); eye.material = eyeWhite;
      const pupil = add(B.MeshBuilder.CreateSphere('pupil', { diameter: 0.18, segments: 10 }, scene), eye);
      pupil.position.set(s * 0.01, -0.02, 0.38); pupil.scaling.set(1, 1.15, 0.7); pupil.material = pupilM;
      const hi = add(B.MeshBuilder.CreateSphere('hi', { diameter: 0.07, segments: 6 }, scene), pupil);
      hi.position.set(-0.2, 0.28, 0.5); hi.material = glowStd('#ffffff');
      parts.eyes.push(eye);
      const cheek = add(B.MeshBuilder.CreateSphere('cheek', { diameter: 0.16 }, scene), head);
      cheek.position.set(s * 0.33, -0.12, 0.3); cheek.scaling.set(1, 0.6, 0.4); cheek.material = glowStd('#ff7aa0', 0.55);
    });
    // mouth
    const mouth = add(B.MeshBuilder.CreateTorus('mouth', { diameter: 0.18, thickness: 0.025, tessellation: 14 }, scene), head);
    mouth.position.set(0, -0.14, 0.43); mouth.scaling.set(1, 0.5, 1); mouth.rotation.x = Math.PI / 2 - 0.5; mouth.material = darkStd('#2a0e18');
    // element features
    const feat = [];
    if (element === 'Fire') {
      [[-0.2, 0.28], [0, 0.42], [0.2, 0.28]].forEach(([dx, h], i) => {
        const f = add(B.MeshBuilder.CreateCylinder('flame', { diameterTop: 0, diameterBottom: 0.24, height: h, tessellation: 7 }, scene), head);
        f.position.set(dx, 0.5 + h / 2 - 0.02, 0); f.rotation.z = -dx * 0.8; f.material = glowStd(i === 1 ? '#ffe36a' : '#ff8a2a'); feat.push(f);
      });
      [-1, 1].forEach((s) => { const e = add(B.MeshBuilder.CreateSphere('ember', { diameter: 0.14 }, scene), body); e.position.set(s * 0.5, 0.2, 0.2); e.material = glowStd('#ffcf4a'); });
    } else if (element === 'Ice') {
      const iceM = new B.StandardMaterial('iceM', scene); iceM.diffuseColor = new B.Color3(0.7, 0.9, 1); iceM.emissiveColor = new B.Color3(0.25, 0.5, 0.8); iceM.specularColor = new B.Color3(1, 1, 1); iceM.alpha = 0.92;
      [[-0.22, 0.3, -0.25], [0, 0.46, 0], [0.22, 0.3, 0.25]].forEach(([dx, h, rz]) => {
        const f = add(B.MeshBuilder.CreateCylinder('spike', { diameterTop: 0, diameterBottom: 0.22, height: h, tessellation: 5 }, scene), head);
        f.position.set(dx, 0.52 + h / 2 - 0.03, -0.05); f.rotation.z = rz; f.material = iceM; feat.push(f);
      });
      [-0.7, -0.2, 0.3].forEach((z, i) => { const f = add(B.MeshBuilder.CreateCylinder('bspike', { diameterTop: 0, diameterBottom: 0.2, height: 0.3 - i * 0.04, tessellation: 5 }, scene)); f.position.set(0, 0.88 - i * 0.05, z - 0.2); f.rotation.x = -0.3; f.material = iceM; });
      [-1, 1].forEach((s) => { const fg = add(B.MeshBuilder.CreateCylinder('fang', { diameterTop: 0, diameterBottom: 0.07, height: 0.13, tessellation: 5 }, scene), head); fg.position.set(s * 0.07, -0.19, 0.42); fg.rotation.x = Math.PI; fg.material = glowStd('#ffffff'); });
    } else if (element === 'Earth') {
      const rock = new B.StandardMaterial('rockM', scene); rock.diffuseColor = new B.Color3(0.55, 0.52, 0.5); rock.emissiveColor = new B.Color3(0.12, 0.1, 0.09); rock.specularColor = new B.Color3(0.1, 0.1, 0.1);
      const shell = add(B.MeshBuilder.CreateSphere('shell', { diameter: 1.05, segments: 7, slice: 0.55 }, scene));
      shell.position.set(0, 0.56, -0.15); shell.scaling.set(1.1, 0.95, 1.25); shell.rotation.x = -0.1; shell.material = rock; shell.convertToFlatShadedMesh();
      for (let i = 0; i < 5; i++) { const c = add(B.MeshBuilder.CreatePolyhedron('chunk', { type: 2, size: 0.1 + (i % 3) * 0.03 }, scene)); const a = i * 1.3; c.position.set(Math.cos(a) * 0.38, 0.95 + (i % 2) * 0.05, -0.15 + Math.sin(a) * 0.42); c.material = rock; }
      const moss = glowStd('#7ac45a'); [[-0.2, 1.0, -0.3], [0.25, 0.98, 0.0]].forEach(([x, y, z]) => { const m2 = add(B.MeshBuilder.CreateSphere('moss', { diameter: 0.22 }, scene)); m2.position.set(x, y, z); m2.scaling.y = 0.4; m2.material = moss; });
    } else if (element === 'Air') {
      parts.wings = [];
      [-1, 1].forEach((s) => {
        const wing = add(B.MeshBuilder.CreateSphere('wing', { diameter: 1, segments: 10 }, scene));
        wing.scaling.set(0.9, 0.06, 0.38); wing.position.set(s * 0.62, 0.7, -0.05); wing.rotation.z = s * -0.35; wing.material = toon('#ffffff', '#8adfd0', '#ffffff');
        parts.wings.push({ m: wing, s });
      });
      [-1, 1].forEach((s) => { const a = add(B.MeshBuilder.CreateCylinder('ant', { diameterTop: 0.02, diameterBottom: 0.04, height: 0.4, tessellation: 6 }, scene), head); a.position.set(s * 0.14, 0.52, 0.02); a.rotation.z = -s * 0.5; a.material = glowStd('#bff4ff'); });
    } else if (element === 'Energy') {
      const ant = add(B.MeshBuilder.CreateCylinder('ant', { diameter: 0.04, height: 0.45, tessellation: 6 }, scene), head); ant.position.set(0, 0.62, 0); ant.material = darkStd('#3a2a10');
      const bulb = add(B.MeshBuilder.CreateSphere('bulb', { diameter: 0.2 }, scene), head); bulb.position.set(0, 0.9, 0); bulb.material = glowStd('#fff6a0'); feat.push(bulb);
      const bolt = glowStd('#ffffff');
      for (let i = 0; i < 4; i++) { const b = add(B.MeshBuilder.CreateBox('bolt', { width: 0.34, height: 0.06, depth: 0.05 }, scene)); b.position.set(0.56 * (i % 2 ? 1 : 1), 0.3 + i * 0.13, 0.05 - i * 0.05); b.rotation.z = i % 2 ? 0.7 : -0.7; b.material = bolt; }
    } else if (element === 'Ghoul') {
      [-1, 1].forEach((s) => { const h2 = add(B.MeshBuilder.CreateCylinder('horn', { diameterTop: 0, diameterBottom: 0.2, height: 0.5, tessellation: 6 }, scene), head); h2.position.set(s * 0.26, 0.5, 0); h2.rotation.z = -s * 0.5; h2.material = darkStd('#d8d0f0'); });
      for (let i = 0; i < 4; i++) { const sp = add(B.MeshBuilder.CreateCylinder('bsp', { diameterTop: 0, diameterBottom: 0.2, height: 0.34, tessellation: 5 }, scene)); sp.position.set(0, 0.88 - i * 0.04, -0.15 - i * 0.28); sp.rotation.x = -0.35; sp.material = darkStd('#d8d0f0'); }
      [-1, 1].forEach((s) => { const t = add(B.MeshBuilder.CreateCylinder('tusk', { diameterTop: 0, diameterBottom: 0.07, height: 0.2, tessellation: 5 }, scene), head); t.position.set(s * 0.14, -0.16, 0.42); t.rotation.x = Math.PI; t.material = darkStd('#ffffff'); });
    }
    // outline (inked look)
    meshes.forEach((m) => { if (m.name === 'body' || m.name === 'head' || m.name === 'belly' || m.name === 'tail' || m.name === 'shell' || m.name === 'wing') { m.renderOutline = true; m.outlineWidth = 0.028; m.outlineColor = new B.Color3(0.08, 0.04, 0.14); } });

    const state = { t0: Math.random() * 6, squash: 0, flash: 0, hurt: 0 };
    const api = {
      root, element, parts, meshes, mats: [mat, matBelly], state, glowColor: P.glow,
      idle(t) {
        const s = Math.sin(t * 2.4 + state.t0);
        const sq = state.squash;
        root.scaling.set(1 - s * 0.018 + sq * 0.3, 1 + s * 0.035 - sq * 0.34, 1 - s * 0.018 + sq * 0.3);
        head.position.y = 0.84 + s * 0.015; head.rotation.z = Math.sin(t * 1.3 + state.t0) * 0.04;
        if (parts.wings) parts.wings.forEach((w) => { w.m.rotation.z = w.s * (-0.35 - Math.sin(t * 9 + state.t0) * 0.35); });
        feat.forEach((f, i) => { if (element === 'Fire') f.scaling.y = 1 + Math.sin(t * 11 + i * 2) * 0.18; if (element === 'Energy') f.scaling.setAll(1 + Math.sin(t * 14) * 0.25); });
        const blink = (Math.sin(t * 0.8 + state.t0 * 3) > 0.985) ? 0.12 : 1;
        parts.eyes.forEach((e) => { e.scaling.y = 1.18 * blink; });
        if (state.flash > 0) state.flash = Math.max(0, state.flash - 0.06);
        mat.setFloat('flashAmt', state.flash); matBelly.setFloat('flashAmt', state.flash);
        if (state.squash > 0) state.squash = Math.max(0, state.squash - 0.045);
      },
      flashWhite(v = 0.8) { state.flash = v; },
      squashHit(v = 0.5) { state.squash = v; },
      setGlow(v) { mat.setFloat('glowAmt', v); matBelly.setFloat('glowAmt', v * 0.7); },
      setVisible(v) { root.setEnabled(v); },
      dispose() { meshes.forEach((m) => m.dispose()); root.dispose(); const i1 = toonMats.indexOf(mat); if (i1 >= 0) toonMats.splice(i1, 1); const i2 = toonMats.indexOf(matBelly); if (i2 >= 0) toonMats.splice(i2, 1); },
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
