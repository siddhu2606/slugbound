// scene.js - the 2.5D HD-2D world: real 3D terrain and props, lit and shadowed billboard sprites,
// fog, coloured lights, glow, tilt-shift and a film grade. All geometry is built in code from the zone layout the C++ engine sends.
const World3D = {};
(() => {
  const B = BABYLON;
  let engine, scene, camera, sun, hemi, lantern, glow, shadowGen, canvas;
  let quality = 'high';
  let rootNode = null;                // everything that belongs to the current zone
  let terrainNodes = [];
  let zone = null;
  let objs = {};                      // id -> {data, root, update}
  let actors = [];
  let particleSystems = [];
  let lavaTex = null, waterTex = null, animTex = [];
  let shafts = [];
  let time = 0;
  let shake = 0, shakeDecay = 4;
  let camTarget = new B.Vector3(0, 0, 0);
  let camLook = new B.Vector3(0, 0, 0);
  let camMode = 'follow';             // follow, title, battle
  let camSway = 0;
  const lookAhead = { x: 0, z: 0 };
  let hitStopT = 0;
  let battleRig = null;
  const tweens = [];
  const matCache = {};
  const texCache = {};
  let tiltPass = null, gradePass = null, tiltPass2 = null;
  let flashEl = null;
  const hooks = { frame: [] };

  const tileToWorld = (x, y) => new B.Vector3(x, 0, -y);
  const hex = (h) => B.Color3.FromHexString(h);
  const rnd = Art.rng(1234);

  // =========================================================
  //  presets per zone
  // =========================================================
  const PRESETS = {
    grotto:  { clear: '#06161a', fog: '#0a2a2c', density: 0.030, hemiSky: '#8fe8e0', hemiGround: '#14303a', hemiI: 0.8, sun: '#ffe6bc', sunI: 0.95, lantern: '#ffe0a8', glow: 0.5, mote: '#a8ffe0', motes: 70, accent: '#5affbe', deco: ['bulb', 'tuft', 'mushroom'], prop: 'mushroom', lights: 3, exposure: 1.0 },
    hollows: { clear: '#050c20', fog: '#0a1840', density: 0.030, hemiSky: '#9cc8ff', hemiGround: '#18284a', hemiI: 1.0, sun: '#cfe6ff', sunI: 1.1, lantern: '#cfe8ff', glow: 0.55, mote: '#d8f0ff', motes: 90, accent: '#7ae0ff', deco: ['fern', 'tuft'], prop: 'crystal', lights: 3, exposure: 0.88 },
    vein:    { clear: '#140503', fog: '#2e0c06', density: 0.030, hemiSky: '#ff9a6a', hemiGround: '#3a1208', hemiI: 0.9, sun: '#ffb070', sunI: 1.1, lantern: '#ffc890', glow: 0.6, mote: '#ff9a3c', motes: 80, accent: '#ff8a3a', deco: ['ember', 'tuft'], prop: 'spire', lights: 3, exposure: 1.05 },
    keep:    { clear: '#0e030a', fog: '#1e0612', density: 0.034, hemiSky: '#d08aa8', hemiGround: '#220a18', hemiI: 0.8, sun: '#ff8a9a', sunI: 0.95, lantern: '#ffb0b0', glow: 0.55, mote: '#ff5a6a', motes: 60, accent: '#ff4a6a', deco: ['thorn'], prop: 'pillar', lights: 3, exposure: 1.12 },
  };

  // =========================================================
  //  helpers
  // =========================================================
  function std(name, color, opt = {}) {
    const key = name;
    if (matCache[key]) return matCache[key];
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = hex(color);
    m.specularColor = hex(opt.spec || '#000000');
    if (opt.emissive) m.emissiveColor = hex(opt.emissive);
    if (opt.alpha !== undefined) m.alpha = opt.alpha;
    if (opt.add) m.alphaMode = B.Engine.ALPHA_ADD;
    if (opt.noLight) m.disableLighting = true;
    m.backFaceCulling = opt.cull === undefined ? true : opt.cull;
    m.maxSimultaneousLights = 6;
    matCache[key] = m;
    return m;
  }

  function texFromCanvas(c, key, opts = {}) {
    if (texCache[key]) return texCache[key];
    const t = new B.DynamicTexture(key, { width: c.width, height: c.height }, scene, !opts.noMip, opts.sampling || B.Texture.TRILINEAR_SAMPLINGMODE);
    t.getContext().drawImage(c, 0, 0);
    t.update(true);
    t.hasAlpha = !!opts.alpha;
    if (opts.wrap) { t.wrapU = B.Texture.WRAP_ADDRESSMODE; t.wrapV = B.Texture.WRAP_ADDRESSMODE; }
    if (opts.aniso) t.anisotropicFilteringLevel = opts.aniso;
    texCache[key] = t;
    return t;
  }

  function tween(dur, fn, ease) {
    return new Promise((resolve) => tweens.push({ t: 0, dur, fn, ease: ease || ((t) => t), resolve }));
  }
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // flat-shaded geometry collector
  class Geo {
    constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = []; }
    tri(a, b, c, ca, cb, cc, hint, ua, ub, uc) {
      let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { [b, c] = [c, b]; [cb, cc] = [cc, cb]; [ub, uc] = [uc, ub]; nx = -nx; ny = -ny; nz = -nz; }
      const base = this.pos.length / 3;
      [[a, ca, ua], [b, cb, ub], [c, cc, uc]].forEach(([p, co, u]) => {
        this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.col.push(co[0], co[1], co[2], 1);
        const uu = u || [p[0] * 0.22 + p[1] * 0.1, p[2] * 0.22 + p[1] * 0.18]; this.uv.push(uu[0], uu[1]);
      });
      this.idx.push(base, base + 1, base + 2);
    }
    quad(a, b, c, d, ca, cb, cc, cd, hint, uvs) {
      this.tri(a, b, c, ca, cb, cc, hint, uvs && uvs[0], uvs && uvs[1], uvs && uvs[2]);
      this.tri(a, c, d, ca, cc, cd, hint, uvs && uvs[0], uvs && uvs[2], uvs && uvs[3]);
    }
    build(name, material, receive = true) {
      if (!this.pos.length) return null;
      const m = new B.Mesh(name, scene);
      const vd = new B.VertexData();
      vd.positions = this.pos; vd.normals = this.nor; vd.colors = this.col; vd.uvs = this.uv; vd.indices = this.idx;
      vd.applyToMesh(m);
      m.material = material; m.receiveShadows = receive; m.isPickable = false;
      return m;
    }
  }
  const mulc = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const c255 = (arr) => [arr[0] / 255, arr[1] / 255, arr[2] / 255];

  // =========================================================
  //  init
  // =========================================================
  function init(cv, q) {
    canvas = cv;
    quality = q || 'high';
    engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
    scene = new B.Scene(engine);
    scene.fogMode = B.Scene.FOGMODE_EXP2;
    scene.skipPointerMovePicking = true;
    scene.autoClear = true;

    camera = new B.UniversalCamera('cam', new B.Vector3(0, 9, -9), scene);
    camera.fov = 0.46;
    camera.minZ = 0.3;
    camera.maxZ = 140;

    hemi = new B.HemisphericLight('hemi', new B.Vector3(0.2, 1, -0.3), scene);
    sun = new B.DirectionalLight('sun', new B.Vector3(-0.45, -1, 0.55), scene);
    lantern = new B.PointLight('lantern', new B.Vector3(0, 2, 0), scene);
    lantern.range = 10;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.contrast = 1.25;

    setupShadows();
    setupGlow();
    setupPost();
    applyQuality(quality);

    scene.onBeforeRenderObservable.add(update);
    window.addEventListener('resize', () => engine.resize());
    engine.runRenderLoop(() => scene.render());
    return { engine, scene, camera };
  }

  function setupShadows() {
    if (shadowGen) { shadowGen.dispose(); shadowGen = null; }
    if (quality === 'low') { sun.shadowEnabled = false; return; }
    const size = quality === 'high' ? 2048 : 1024;
    shadowGen = new B.ShadowGenerator(size, sun);
    shadowGen.usePercentageCloserFiltering = true;
    shadowGen.filteringQuality = quality === 'high' ? B.ShadowGenerator.QUALITY_MEDIUM : B.ShadowGenerator.QUALITY_LOW;
    shadowGen.bias = 0.0008;
    shadowGen.normalBias = 0.03;
    shadowGen.setDarkness(0.25);
    sun.shadowEnabled = true;
    sun.autoCalcShadowZBounds = true;
    sun.autoUpdateExtends = true;
  }

  function setupGlow() {
    glow = new B.GlowLayer('glow', scene, { mainTextureFixedSize: quality === 'high' ? 1024 : 512, blurKernelSize: quality === 'high' ? 48 : 32 });
    glow.intensity = 0.9;
  }

  function setupPost() {
    B.Effect.ShadersStore.tiltFragmentShader = `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform vec2 dir;
      uniform float focus;
      uniform float amount;
      uniform float band;
      void main(void) {
        float d = abs(vUV.y - focus);
        float k = smoothstep(band, 0.62, d) * amount;
        vec4 c = texture2D(textureSampler, vUV) * 0.2270270270;
        c += texture2D(textureSampler, vUV + dir * k * 1.3846153846) * 0.3162162162;
        c += texture2D(textureSampler, vUV - dir * k * 1.3846153846) * 0.3162162162;
        c += texture2D(textureSampler, vUV + dir * k * 3.2307692308) * 0.0702702703;
        c += texture2D(textureSampler, vUV - dir * k * 3.2307692308) * 0.0702702703;
        gl_FragColor = c;
      }`;
    B.Effect.ShadersStore.gradeFragmentShader = `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform float time;
      uniform float vig;
      uniform float grain;
      uniform float aberr;
      uniform float sat;
      uniform vec3 tint;
      uniform float flash;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(void) {
        vec2 c = vUV - 0.5;
        float r2 = dot(c, c);
        vec2 off = c * r2 * aberr;
        vec3 col;
        col.r = texture2D(textureSampler, vUV + off).r;
        col.g = texture2D(textureSampler, vUV).g;
        col.b = texture2D(textureSampler, vUV - off).b;
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, sat);
        col *= tint;
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 shadowTone = vec3(0.86, 1.0, 1.12), lightTone = vec3(1.1, 1.02, 0.88);
        col *= mix(shadowTone, lightTone, smoothstep(0.18, 0.72, lum));
        col = (col - 0.5) * 1.08 + 0.5;
        col *= 1.0 - smoothstep(0.12, 0.62, r2) * vig;
        col += (h(vUV * 900.0 + time) - 0.5) * grain;
        col += vec3(flash);
        gl_FragColor = vec4(col, 1.0);
      }`;
    tiltPass = new B.PostProcess('tiltH', 'tilt', ['dir', 'focus', 'amount', 'band'], null, 1.0, camera, B.Texture.BILINEAR_SAMPLINGMODE, engine, false, null, B.Engine.TEXTURETYPE_UNSIGNED_BYTE);
    tiltPass.samples = 4;
    tiltPass.onApply = (e) => { e.setFloat2('dir', 1.0 / engine.getRenderWidth(), 0); e.setFloat('focus', World3D._focus); e.setFloat('amount', World3D._tilt); e.setFloat('band', 0.16); };
    tiltPass2 = new B.PostProcess('tiltV', 'tilt', ['dir', 'focus', 'amount', 'band'], null, 1.0, camera, B.Texture.BILINEAR_SAMPLINGMODE, engine);
    tiltPass2.onApply = (e) => { e.setFloat2('dir', 0, 1.0 / engine.getRenderHeight()); e.setFloat('focus', World3D._focus); e.setFloat('amount', World3D._tilt); e.setFloat('band', 0.16); };
    gradePass = new B.PostProcess('grade', 'grade', ['time', 'vig', 'grain', 'aberr', 'sat', 'tint', 'flash'], null, 1.0, camera, B.Texture.BILINEAR_SAMPLINGMODE, engine);
    gradePass.onApply = (e) => {
      e.setFloat('time', time % 100); e.setFloat('vig', World3D._vig); e.setFloat('grain', World3D._grain);
      e.setFloat('aberr', World3D._aberr); e.setFloat('sat', World3D._sat); e.setFloat3('tint', World3D._tintR, World3D._tintG, World3D._tintB);
      e.setFloat('flash', World3D._flash);
    };
    Object.assign(World3D, { _focus: 0.52, _tilt: 4.2, _vig: 0.72, _grain: 0.035, _aberr: 0.012, _sat: 1.18, _tintR: 1, _tintG: 1, _tintB: 1, _flash: 0 });
  }

  function applyQuality(q) {
    quality = q;
    const hi = q === 'high', lo = q === 'low';
    engine.setHardwareScalingLevel(lo ? 1.5 : 1);
    World3D._tilt = lo ? 0 : (hi ? 4.2 : 3.2);
    World3D._grain = lo ? 0 : 0.035;
    World3D._aberr = hi ? 0.006 : 0.002;
    glow.intensity = lo ? 0 : (PRESETS[zone ? zone.id : 'grotto'].glow);
    setupShadows();
    if (zone && shadowGen) rootNode.getChildMeshes().forEach((m) => { if (m.metadata && m.metadata.caster) shadowGen.addShadowCaster(m, true); });
    World3D.quality = q;
  }

  // =========================================================
  //  zone building
  // =========================================================
  function clearZone() {
    tweens.length = 0;
    particleSystems.forEach((p) => p.dispose());
    particleSystems = [];
    actors = [];
    shafts = [];
    animTex = [];
    objs = {};
    terrainNodes.forEach((m) => m && m.dispose());
    terrainNodes = [];
    if (rootNode) rootNode.dispose(false, false);
    rootNode = new B.TransformNode('zoneRoot', scene);
  }

  function applyPreset(id) {
    const p = PRESETS[id];
    scene.clearColor = B.Color4.FromColor3(hex(p.clear), 1);
    scene.fogColor = hex(p.fog);
    scene.fogDensity = p.density;
    hemi.diffuse = hex(p.hemiSky); hemi.groundColor = hex(p.hemiGround); hemi.intensity = p.hemiI;
    sun.diffuse = hex(p.sun); sun.intensity = p.sunI;
    lantern.diffuse = hex(p.lantern); lantern.intensity = 1.0;
    scene.imageProcessingConfiguration.exposure = p.exposure;
    glow.intensity = quality === 'low' ? 0 : p.glow;
    const tints = { grotto: [0.96, 1.04, 1.02], hollows: [0.94, 1.0, 1.1], vein: [1.1, 0.98, 0.9], keep: [1.08, 0.94, 1.0] };
    const t = tints[id];
    World3D._tintR = t[0]; World3D._tintG = t[1]; World3D._tintB = t[2];
  }

  function buildZone(z, state) {
    zone = z;
    clearZone();
    applyPreset(z.id);
    z.objects.forEach((o) => (o._data = o));
    buildTerrain();
    buildDecor();
    z.objects.forEach(buildObject);
    buildExits();
    buildAmbience();
    buildPlayer(state);
    refreshKeepGate(state);
    if (shadowGen) rootNode.getChildMeshes().forEach((m) => { if (m.metadata && m.metadata.caster) shadowGen.addShadowCaster(m, true); });
  }

  const tileAt = (x, y) => (x < 0 || y < 0 || x >= zone.w || y >= zone.h ? '#' : zone.rows[y][x]);
  const objAtTile = (x, y) => zone.objects.find((o) => o.x === x && o.y === y && o.kind !== 'patch');
  const isPitChar = (ch) => ch === '~' || ch === 'w' || ch === 'g';
  // what is really drawn on a tile, taking gate states into account
  function effTile(x, y) {
    const ch = tileAt(x, y);
    const o = objAtTile(x, y);
    if (o && !o.done) {
      if (o.kind === 'gap') return 'g';
      if (o.kind === 'bridge') {
        const l = tileAt(x - 1, y), r = tileAt(x + 1, y), u = tileAt(x, y - 1), d = tileAt(x, y + 1);
        return [l, r, u, d].find((c) => c === '~' || c === 'w') || '~';
      }
    }
    return ch;
  }
  const isFloorish = (ch) => ch === '.' || ch === 'm' || ch === 'T';

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
      if (f.moss > 0.3 && f.r < 0.5) return 'moss';
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
      const big = p.f.rock > 0.3 && r() < 0.3 && p.y < zone.h - 3, sz = big ? 0.4 + r() * 0.5 : 0.07 + r() * 0.16;
      const inst = masters[Math.floor(r() * 3)].createInstance('bd'); inst.parent = rootNode; inst.position.set(p.x, p.h + sz * 0.15, p.z);
      inst.scaling.set(sz * (0.8 + r() * 0.6), sz * (0.55 + r() * 0.5), sz * (0.8 + r() * 0.6)); inst.rotation.set(r() * 0.5, r() * 6.28, r() * 0.5); inst.isPickable = false;
      decorNodes.push(inst);
    });
    buildProps();
  }

  function lightPool(x, z, color, size, alpha) {
    const p = B.MeshBuilder.CreatePlane('pool', { size }, scene);
    p.rotation.x = Math.PI / 2; p.position = new B.Vector3(x, 0.07, z);
    const m = std('pool' + color + alpha, '#000000', { noLight: true, add: true });
    m.emissiveColor = hex(color); m.opacityTexture = texFromCanvas(Art.glowDot(), 'dot', { alpha: true }); m.alpha = alpha;
    p.material = m; p.parent = rootNode; p.isPickable = false;
    return p;
  }

  // =========================================================
  //  big props on 'T' tiles
  // =========================================================
  function capMat(name, c1, c2) {
    if (matCache[name]) return matCache[name];
    const m = new B.StandardMaterial(name, scene);
    m.diffuseTexture = texFromCanvas(Art2.cap(c1, c2), 'cap' + name);
    m.emissiveColor = hex(c2).scale(0.22); m.specularColor = new B.Color3(0.25, 0.25, 0.25); m.specularPower = 24; m.maxSimultaneousLights = 6;
    matCache[name] = m;
    return m;
  }
  function buildProps() {
    const kind = PRESETS[zone.id].prop;
    const r = Art.rng(31 + zone.id.length);
    const mats = {
      cyan: std('crystalCyan', '#7ae0ff', { emissive: '#1f6a8c', alpha: 0.95, spec: '#ffffff' }),
      white: std('crystalWhite', '#e9fbff', { emissive: '#5a8ab0', alpha: 0.95, spec: '#ffffff' }),
      violet: std('crystalViolet', '#b890ff', { emissive: '#4a3090', alpha: 0.95, spec: '#ffffff' }),
      stem: std('stemMat', '#d8d0bc', { emissive: '#2a2820' }),
      capA: capMat('capA', '#8af0ff', '#2a98b8'),
      capB: capMat('capB', '#ffa0e0', '#b0409a'),
      capC: capMat('capC', '#ffe08a', '#c8841a'),
      obs: std('obsidian', '#2a2236', { emissive: '#1a1020', spec: '#8a70c0' }),
      ember: std('emberMat', '#ff7a2a', { emissive: '#ff6a1a', noLight: true }),
      stone: std('pillarStone', '#4a4262', { emissive: '#120e22' }),
      rune: std('pillarRune', '#ff4a6a', { emissive: '#ff3a5a', noLight: true }),
    };
    const tiles = [];
    zone.rows.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch === 'T') tiles.push([x, y]); }));
    tiles.forEach(([x, y]) => {
      const root = new B.TransformNode('prop', scene); root.parent = rootNode; root.position = new B.Vector3(x + (r() - 0.5) * 0.22, groundY(x, -y), -y + (r() - 0.5) * 0.22); root.rotation.y = r() * 6.28; root.scaling.setAll(0.88 + r() * 0.5);
      const add = (m, castShadow = true) => { m.parent = root; m.isPickable = false; if (castShadow) m.metadata = { caster: true }; return m; };
      if (kind === 'crystal') {
        const n = 4 + Math.floor(r() * 3);
        const base = add(B.MeshBuilder.CreateCylinder('cb', { diameterTop: 0.5, diameterBottom: 0.95, height: 0.35, tessellation: 7 }, scene)); base.position.y = 0.1; base.material = std('crystalBase', '#3a4a7a', { emissive: '#101a3a' });
        for (let i = 0; i < n; i++) {
          const h = 0.8 + r() * 1.7, w = 0.22 + r() * 0.22;
          const c = add(B.MeshBuilder.CreateCylinder('cr', { diameterTop: 0, diameterBottom: w * 2, height: h, tessellation: 6 }, scene));
          c.position = new B.Vector3((r() - 0.5) * 0.65, h / 2 + 0.1, (r() - 0.5) * 0.65);
          c.rotation = new B.Vector3((r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5);
          c.material = [mats.cyan, mats.white, mats.violet][i % 3 === 2 ? 2 : (r() < 0.6 ? 0 : 1)];
        }
        lightPool(x, -y, '#7ae0ff', 2.4, 0.22);
      } else if (kind === 'mushroom') {
        const sizes = [1.5, 0.8, 0.65], offs = [[0, 0], [-0.4, 0.3], [0.38, 0.25]], caps = [mats.capA, mats.capB, mats.capC];
        const pick = Math.floor(r() * 3);
        sizes.forEach((s, i) => {
          const st = add(B.MeshBuilder.CreateCylinder('st', { diameterTop: 0.2 * s, diameterBottom: 0.3 * s, height: 0.7 * s, tessellation: 8 }, scene));
          st.position = new B.Vector3(offs[i][0], 0.35 * s, offs[i][1]); st.material = mats.stem;
          const cap = add(B.MeshBuilder.CreateSphere('cap', { diameter: 1.05 * s, slice: 0.55, segments: 10 }, scene));
          cap.position = new B.Vector3(offs[i][0], 0.7 * s, offs[i][1]); cap.scaling.y = 0.75; cap.material = caps[(i + pick) % 3]; cap.rotation.x = 0;
        });
        lightPool(x, -y, '#7affd8', 2.2, 0.2);
      } else if (kind === 'spire') {
        const n = 3 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++) {
          const h = 1.0 + r() * 2.0, w = 0.28 + r() * 0.22;
          const c = add(B.MeshBuilder.CreateCylinder('sp', { diameterTop: 0, diameterBottom: w * 2, height: h, tessellation: 5 }, scene));
          c.position = new B.Vector3((r() - 0.5) * 0.7, h / 2 - 0.05, (r() - 0.5) * 0.7); c.rotation = new B.Vector3((r() - 0.5) * 0.35, r() * 6, (r() - 0.5) * 0.35);
          c.convertToFlatShadedMesh(); c.material = mats.obs;
        }
        const ring = add(B.MeshBuilder.CreateTorus('ring', { diameter: 1.2, thickness: 0.07, tessellation: 18 }, scene), false); ring.position.y = 0.04; ring.material = mats.ember;
        lightPool(x, -y, '#ff7a2a', 2.6, 0.3);
      } else {
        const col = add(B.MeshBuilder.CreateCylinder('pil', { diameterTop: 0.7, diameterBottom: 0.85, height: 2.4, tessellation: 8 }, scene)); col.position.y = 1.2; col.material = mats.stone;
        const cap = add(B.MeshBuilder.CreateBox('pcap', { width: 1.05, height: 0.2, depth: 1.05 }, scene)); cap.position.y = 2.5; cap.material = mats.stone;
        const baseB = add(B.MeshBuilder.CreateBox('pbase', { width: 1.0, height: 0.22, depth: 1.0 }, scene)); baseB.position.y = 0.11; baseB.material = mats.stone;
        const ring = add(B.MeshBuilder.CreateTorus('prune', { diameter: 0.88, thickness: 0.06, tessellation: 20 }, scene), false); ring.position.y = 1.5; ring.material = mats.rune;
        const ring2 = add(B.MeshBuilder.CreateTorus('prune2', { diameter: 0.84, thickness: 0.05, tessellation: 20 }, scene), false); ring2.position.y = 0.7; ring2.material = mats.rune;
        const fire = flame(root, '#ff5a2a', 0.5); fire.emitter = new B.Vector3(x, 2.65, -y);
        lightPool(x, -y, '#ff3a5a', 2.4, 0.22);
      }
    });
  }

  function flame(root, color, size) {
    const ps = new B.ParticleSystem('flame', 60, scene);
    ps.particleTexture = texFromCanvas(Art.glowDot(), 'dot', { alpha: true });
    ps.minEmitBox = new B.Vector3(-0.12, 0, -0.12); ps.maxEmitBox = new B.Vector3(0.12, 0, 0.12);
    ps.color1 = B.Color4.FromColor3(hex(color), 1); ps.color2 = new B.Color4(1, 0.8, 0.3, 0.8); ps.colorDead = new B.Color4(0.4, 0, 0, 0);
    ps.minSize = 0.15 * size * 2; ps.maxSize = 0.4 * size * 2; ps.minLifeTime = 0.4; ps.maxLifeTime = 0.9;
    ps.emitRate = 26; ps.blendMode = B.ParticleSystem.BLENDMODE_ADD; ps.gravity = new B.Vector3(0, 1.4, 0);
    ps.direction1 = new B.Vector3(-0.1, 1, -0.1); ps.direction2 = new B.Vector3(0.1, 1, 0.1); ps.minEmitPower = 0.3; ps.maxEmitPower = 0.9;
    ps.start(); particleSystems.push(ps);
    return ps;
  }

  // =========================================================
  //  sprites and actors
  // =========================================================
  const spriteMats = {};
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

  class Actor {
    constructor(name, o = {}) {
      this.name = name; this.h = o.h || 1.7; this.float = o.float || 0; this.dir = 'down';
      const view = name === 'gorvax' || name === 'minion' || name.startsWith('ghoul') ? 'front' : 'front';
      const c = Art.sprite(name, 'front');
      this.w = this.h * (c.width / c.height);
      this.node = new B.TransformNode('actor_' + name, scene); this.node.parent = rootNode;
      this.plane = B.MeshBuilder.CreatePlane('spr_' + name, { width: this.w, height: this.h }, scene);
      this.plane.parent = this.node; this.plane.position.y = this.h / 2 + this.float;
      this.plane.billboardMode = B.Mesh.BILLBOARDMODE_Y;
      this.plane.material = spriteMat(name, 'front', 0); this.plane.isPickable = false; this.view = 'front'; this.frame = 0;
      this.plane.metadata = { caster: true };
      this.hasViews = ['kai', 'kessa'].includes(name);
      this.blob = B.MeshBuilder.CreatePlane('blob', { size: this.w * 1.25 }, scene);
      this.blob.rotation.x = Math.PI / 2; this.blob.position.y = 0.02; this.blob.parent = this.node; this.blob.isPickable = false;
      const bm = std('blobMat', '#000000', { noLight: true, alpha: 0.6 }); bm.opacityTexture = texFromCanvas(Art.blobShadow(), 'blob', { alpha: true });
      this.blob.material = bm;
      this.phase = Math.random() * 6; this.walk = 0; this.walking = false; this.hop = 0; this.fade = 1; this.glowAura = null;
      this.tint = o.tint || null;
      if (o.aura) {
        const a = B.MeshBuilder.CreatePlane('aura', { size: this.h * 1.3 }, scene); a.parent = this.node; a.position.y = this.h * 0.55 + this.float; a.billboardMode = B.Mesh.BILLBOARDMODE_Y; a.isPickable = false;
        const am = std('aura' + o.aura, '#000000', { noLight: true, add: true }); am.emissiveColor = hex(o.aura).scale(0.55); am.opacityTexture = texFromCanvas(Art.glowDot(), 'dot', { alpha: true }); am.alpha = 0.55;
        a.material = am; this.glowAura = a;
      }
      actors.push(this);
      if (shadowGen) shadowGen.addShadowCaster(this.plane);
    }
    setDir(d) {
      this.dir = d;
      if (!this.hasViews) { this.plane.scaling.x = d === 'left' ? -1 : 1; return; }
      this.view = d === 'up' ? 'back' : d === 'down' ? 'front' : 'side';
      this.plane.material = spriteMat(this.name, this.view, this.frame);
      this.plane.scaling.x = d === 'left' ? -1 : 1;
    }
    setPos(x, y) { this.node.position.set(x, 0, -y); }
    update(dt, t) {
      const bob = Math.sin(t * 2.2 + this.phase);
      let yOff = this.float ? bob * 0.08 : 0;
      let sy = 1 + bob * 0.012, sx = 1 - bob * 0.008;
      if (this.walking) {
        this.walk += dt * 14;
        if (this.hasViews) { const f = [1, 0, 2, 0][Math.floor(this.walk / 1.6) % 4]; if (f !== this.frame) { this.frame = f; this.plane.material = spriteMat(this.name, this.view, f); } }
        yOff += Math.abs(Math.sin(this.walk)) * 0.06;
        sy = 1; sx = 1;
      }
      if (!this.walking && this.frame && this.hasViews) { this.frame = 0; this.plane.material = spriteMat(this.name, this.view, 0); }
      if (this.hop > 0) { this.hop -= dt * 3; yOff += Math.sin(Math.max(0, this.hop) * Math.PI) * 0.45; }
      this.plane.position.y = this.h / 2 + this.float + yOff;
      this.plane.scaling.y = sy; this.plane.scaling.x = (this.dir === 'left' ? -1 : 1) * sx;
      this.blob.scaling.setAll(1 - yOff * 0.6);
      if (this.glowAura) this.glowAura.material.alpha = 0.4 + Math.sin(t * 3 + this.phase) * 0.15;
      if (this.fade < 1) { this.plane.visibility = Math.max(0, this.fade); this.blob.visibility = Math.max(0, this.fade); }
    }
    remove() { const i = actors.indexOf(this); if (i >= 0) actors.splice(i, 1); this.node.dispose(); }
  }

  let player = null;
  function buildPlayer(state) {
    player = new Actor('kai', { h: 1.65 });
    const p = state.player;
    player.setPos(p.x, p.y); player.setDir(p.dir || 'down');
    camTarget.set(p.x, 0, -p.y);
    camLook.copyFrom(camTarget);
  }

  // =========================================================
  //  interactable objects
  // =========================================================
  function glowMat(name, color, alpha = 1, add = false) {
    const m = std(name, '#000000', { noLight: true, add });
    m.emissiveColor = hex(color).scale(0.8); m.alpha = alpha;
    return m;
  }

  function buildObject(o) {
    if (o.kind === 'patch') return;
    const root = new B.TransformNode('obj_' + o.id, scene); root.parent = rootNode; root.position = new B.Vector3(o.x, groundY(o.x, -o.y), -o.y);
    const entry = { data: o, root, parts: {}, update: null, actor: null };
    objs[o.id] = entry;
    const add = (m, caster = true) => { m.parent = root; m.isPickable = false; if (caster) m.metadata = { caster: true }; return m; };
    const kind = o.kind;
    if (kind === 'mossback' || kind === 'trader' || kind === 'rival' || kind === 'ghoul' || kind === 'boss') {
      const name = kind === 'mossback' ? 'mossback' : kind === 'trader' ? 'pim' : kind === 'rival' ? 'kessa' : kind === 'boss' ? 'gorvax' : 'ghoul_' + (({ Ice: 'ice', Fire: 'fire', Ghoul: 'ghoul' })[(o.extra && o.extra.element)] || 'ghoul');
      const h = kind === 'boss' ? 2.9 : kind === 'ghoul' ? 1.75 : kind === 'mossback' ? 1.5 : 1.65;
      const a = new Actor(name, { h, float: kind === 'ghoul' ? 0.3 : 0, aura: kind === 'ghoul' ? (({ Ice: '#7ae0ff', Fire: '#ff9a3c', Ghoul: '#ff3df2' })[(o.extra && o.extra.element)] || '#ff3df2') : (kind === 'boss' ? '#ff2a3a' : null) });
      a.node.parent = root; a.node.position.set(0, 0, 0);
      a.setDir('down');
      entry.actor = a;
      if (kind === 'boss') {
        const dais = add(B.MeshBuilder.CreateCylinder('dais', { diameter: 2.4, height: 0.22, tessellation: 10 }, scene), false); dais.position.y = 0.1; dais.material = std('daisMat', '#3a2a4a', { emissive: '#1a0a20' });
        const ring = add(B.MeshBuilder.CreateTorus('daisRing', { diameter: 2.2, thickness: 0.05, tessellation: 30 }, scene), false); ring.position.y = 0.24; ring.material = glowMat('daisRingMat', '#ff2a4a');
        lightPool(o.x, -o.y, '#ff2a4a', 4.5, 0.4);
      }
      entry.update = (d) => { if (d.done && kind !== 'rival') { a.fade = 0; a.plane.visibility = 0; a.blob.visibility = 0; if (a.glowAura) a.glowAura.visibility = 0; root.getChildMeshes().forEach((m) => { if (m.name === 'dais' || m.name === 'daisRing') m.visibility = 0; }); } };
      if (kind === 'rival' || kind === 'mossback' || kind === 'trader') lightPool(o.x, -o.y, kind === 'rival' ? '#7ac4ff' : '#c8ff9a', 1.6, 0.18);
    } else if (kind === 'chest') {
      const rare = o.extra && o.extra.rare;
      const wood = std('wood' + (rare ? 'R' : ''), rare ? '#5a3a7a' : '#8a5a2e', { emissive: rare ? '#3a1a5a' : '#2a1608' });
      const gold = std('gold', '#f5c542', { emissive: '#6a4a08', spec: '#ffffff' });
      const body = add(B.MeshBuilder.CreateBox('cbody', { width: 0.78, height: 0.38, depth: 0.52 }, scene)); body.position.y = 0.21; body.material = wood;
      const lidPivot = new B.TransformNode('lidPivot', scene); lidPivot.parent = root; lidPivot.position.set(0, 0.4, 0.26);
      const lid = B.MeshBuilder.CreateCylinder('lid', { diameter: 0.52, height: 0.78, tessellation: 14 }, scene);
      lid.rotation.z = Math.PI / 2; lid.rotation.y = 0; lid.parent = lidPivot; lid.position.set(0, 0.0, -0.26); lid.material = wood; lid.metadata = { caster: true }; lid.isPickable = false; lid.scaling.z = 1;
      const band1 = add(B.MeshBuilder.CreateBox('band', { width: 0.82, height: 0.12, depth: 0.1 }, scene), false); band1.position.set(0, 0.21, -0.27); band1.material = gold;
      const clasp = add(B.MeshBuilder.CreateSphere('clasp', { diameter: 0.12 }, scene), false); clasp.position.set(0, 0.34, -0.28); clasp.material = gold;
      const aura = lightPool(o.x, -o.y, rare ? '#c08aff' : '#ffd86a', rare ? 2.4 : 1.4, rare ? 0.4 : 0.16);
      entry.parts = { lidPivot, aura };
      lidPivot.rotation.x = 0;
      entry.update = (d) => { lidPivot.rotation.x = d.done ? -1.3 : 0; aura.visibility = d.done ? 0.2 : 1; };
      entry.update(o);
    } else if (kind === 'spring') {
      const gem = add(B.MeshBuilder.CreatePolyhedron('gem', { type: 1, size: 0.34 }, scene)); gem.position.y = 1.15; gem.scaling.y = 1.6; gem.material = glowMat('gemPink', '#ff8ac8');
      const ring = add(B.MeshBuilder.CreateTorus('gring', { diameter: 0.9, thickness: 0.05, tessellation: 24 }, scene), false); ring.position.y = 1.15; ring.material = glowMat('gemRing', '#9affff');
      const base = add(B.MeshBuilder.CreateCylinder('gbase', { diameterTop: 0.5, diameterBottom: 0.7, height: 0.3, tessellation: 8 }, scene)); base.position.y = 0.15; base.material = std('gbaseM', '#4a4a6a', { emissive: '#101030' });
      lightPool(o.x, -o.y, '#ff8ac8', 3.0, 0.45);
      const sp = new B.ParticleSystem('springP', 40, scene); sp.particleTexture = texFromCanvas(Art.sparkTexture(), 'spark', { alpha: true });
      sp.emitter = new B.Vector3(o.x, 0.4, -o.y); sp.minEmitBox = new B.Vector3(-0.3, 0, -0.3); sp.maxEmitBox = new B.Vector3(0.3, 0, 0.3);
      sp.color1 = new B.Color4(1, 0.6, 0.9, 1); sp.color2 = new B.Color4(0.6, 1, 1, 1); sp.colorDead = new B.Color4(1, 1, 1, 0);
      sp.minSize = 0.08; sp.maxSize = 0.2; sp.minLifeTime = 1; sp.maxLifeTime = 2.2; sp.emitRate = 14; sp.gravity = new B.Vector3(0, 0.5, 0); sp.blendMode = B.ParticleSystem.BLENDMODE_ADD;
      sp.start(); particleSystems.push(sp);
      entry.parts = { gem, ring };
      entry.spin = (t) => { gem.rotation.y = t * 1.2; gem.position.y = 1.15 + Math.sin(t * 2) * 0.08; ring.rotation.x = Math.PI / 2 + Math.sin(t) * 0.3; ring.rotation.y = t * 0.6; };
    } else if (kind === 'fusionstone') {
      const st = std('fuseStone', '#2e2048', { emissive: '#180c30', spec: '#a070ff' });
      const ob = add(B.MeshBuilder.CreateCylinder('obel', { diameterTop: 0.25, diameterBottom: 0.8, height: 1.9, tessellation: 4 }, scene)); ob.position.y = 0.95; ob.rotation.y = 0.78; ob.material = st;
      const rp = B.MeshBuilder.CreatePlane('runes', { width: 0.7, height: 1.4 }, scene); rp.parent = root; rp.position.set(0, 1.0, 0.41); rp.isPickable = false;
      const rm = std('runeGlow', '#000000', { noLight: true, add: true, cull: false }); rm.emissiveTexture = texFromCanvas(Art2.runes('#c08aff'), 'runesP', { alpha: true }); rm.opacityTexture = rm.emissiveTexture; rm.emissiveColor = new B.Color3(1, 1, 1); rp.material = rm;
      const orbs = [0, 1, 2].map((i) => { const o2 = add(B.MeshBuilder.CreateSphere('orb', { diameter: 0.2 }, scene), false); o2.material = glowMat('orbM', i === 1 ? '#7affd8' : '#d08aff'); return o2; });
      lightPool(o.x, -o.y, '#b070ff', 3.0, 0.4);
      entry.spin = (t) => orbs.forEach((orb, i) => { const a = t * 1.1 + (i * Math.PI * 2) / 3; orb.position.set(Math.cos(a) * 0.62, 1.1 + Math.sin(t * 1.6 + i) * 0.25, Math.sin(a) * 0.62); });
    } else if (kind === 'altar') {
      const stone = std('altarStone', '#6a6890', { emissive: '#14122a' });
      const b1 = add(B.MeshBuilder.CreateCylinder('ab1', { diameterTop: 0.8, diameterBottom: 1.0, height: 0.3, tessellation: 8 }, scene)); b1.position.y = 0.15; b1.material = stone;
      const b2 = add(B.MeshBuilder.CreateCylinder('ab2', { diameterTop: 0.5, diameterBottom: 0.7, height: 0.6, tessellation: 8 }, scene)); b2.position.y = 0.6; b2.material = stone;
      const gem = add(B.MeshBuilder.CreatePolyhedron('keystone', { type: 1, size: 0.3 }, scene), false); gem.position.y = 1.3; gem.scaling.y = 1.7; gem.material = glowMat('keyM', '#ffd86a');
      const pool = lightPool(o.x, -o.y, '#ffd86a', 3.0, 0.4);
      entry.parts = { gem, pool };
      entry.spin = (t) => { gem.rotation.y = t * 1.6; gem.position.y = 1.3 + Math.sin(t * 2.2) * 0.1; };
      entry.update = (d) => { gem.setEnabled(!d.done); pool.visibility = d.done ? 0.15 : 1; };
      entry.update(o);
    } else if (kind === 'wall') {
      const rock = std('wallRock' + zone.id, '#e8d6bc', { emissive: '#2a1a0c' });
      if (!rock.diffuseTexture) rock.diffuseTexture = texFromCanvas(Art.rockTexture(zone.id), 'rock' + zone.id, { wrap: true });
      const wallGroup = new B.TransformNode('wallG', scene); wallGroup.parent = root;
      for (let i = 0; i < 6; i++) {
        const b = B.MeshBuilder.CreateBox('wb', { width: 0.7, height: 0.78, depth: 0.82 }, scene);
        b.parent = wallGroup; b.position.set((i % 2 - 0.5) * 0.52, 0.39 + Math.floor(i / 2) * 0.7, (r2(i) - 0.5) * 0.16); b.rotation.set((r2(i + 4) - 0.5) * 0.18, (r2(i + 9) - 0.5) * 0.4, (r2(i + 3) - 0.5) * 0.14);
        b.material = rock; b.metadata = { caster: true }; b.isPickable = false;
      }
      const cp = B.MeshBuilder.CreatePlane('cracks', { width: 1.25, height: 2.0 }, scene); cp.parent = wallGroup; cp.position.set(0, 1.05, -0.45); cp.isPickable = false; cp.billboardMode = B.Mesh.BILLBOARDMODE_Y;
      const cm = std('crackM', '#000000', { noLight: true, add: true, cull: false }); cm.emissiveTexture = texFromCanvas(Art2.cracks('#ffb040'), 'cracksT', { alpha: true }); cm.opacityTexture = cm.emissiveTexture; cm.emissiveColor = new B.Color3(1, 1, 1); cp.material = cm;
      const rubble = new B.TransformNode('rubble', scene); rubble.parent = root;
      for (let i = 0; i < 7; i++) { const b = B.MeshBuilder.CreateBox('rb', { size: 0.18 + r2(i) * 0.2 }, scene); b.parent = rubble; b.position.set((r2(i + 1) - 0.5) * 0.9, 0.1, (r2(i + 2) - 0.5) * 0.7); b.rotation.set(r2(i) * 3, r2(i + 5) * 3, 0); b.material = rock; b.isPickable = false; }
      lightPool(o.x, -o.y, '#ffb040', 2.6, 0.3);
      entry.update = (d) => { wallGroup.setEnabled(!d.done); rubble.setEnabled(!!d.done); };
      entry.update(o);
    } else if (kind === 'gap') {
      const sw = B.MeshBuilder.CreatePlane('gapSwirl', { size: 0.95 }, scene); sw.parent = root; sw.rotation.x = Math.PI / 2; sw.position.y = 0.05; sw.isPickable = false;
      const sm = std('gapSwirlM', '#000000', { noLight: true, add: true, cull: false }); sm.emissiveTexture = texFromCanvas(Art2.swirl(170), 'swirl170', { alpha: true }); sm.opacityTexture = sm.emissiveTexture; sm.emissiveColor = new B.Color3(1, 1, 1); sw.material = sm;
      const icon = B.MeshBuilder.CreatePlane('gapIcon', { size: 0.8 }, scene); icon.parent = root; icon.position.y = 1.0; icon.billboardMode = B.Mesh.BILLBOARDMODE_Y; icon.isPickable = false; icon.material = sm;
      entry.parts = { sw, icon };
      entry.spin = (t) => { sw.rotation.y = t * 0.9; icon.scaling.setAll(0.85 + Math.sin(t * 2) * 0.1); };
      entry.update = (d) => { icon.setEnabled(!d.done); sm.alpha = d.done ? 0.55 : 0.9; };
      entry.update(o);
    } else if (kind === 'bridge') {
      const icon = B.MeshBuilder.CreatePlane('brIcon', { size: 0.7 }, scene); icon.parent = root; icon.position.y = 0.9; icon.billboardMode = B.Mesh.BILLBOARDMODE_Y; icon.isPickable = false;
      const im = std('brIconM', '#000000', { noLight: true, add: true, cull: false }); im.emissiveTexture = texFromCanvas(Art2.swirl(200), 'swirl200', { alpha: true }); im.opacityTexture = im.emissiveTexture; im.emissiveColor = new B.Color3(0.7, 1, 1); icon.material = im;
      entry.spin = (t) => { icon.rotation.z = t * 0.7; icon.position.y = 0.9 + Math.sin(t * 2) * 0.06; };
      entry.update = (d) => icon.setEnabled(!d.done);
      entry.update(o);
    } else if (kind === 'door') {
      const stone = std('doorStone', '#5a5478', { emissive: '#14102a' });
      [-0.55, 0.55].forEach((dx) => { const p = add(B.MeshBuilder.CreateBox('dp', { width: 0.3, height: 2.2, depth: 0.5 }, scene)); p.position.set(dx, 1.1, 0); p.material = stone; });
      const lint = add(B.MeshBuilder.CreateBox('dl', { width: 1.4, height: 0.3, depth: 0.5 }, scene)); lint.position.set(0, 2.2, 0); lint.material = stone;
      const panel = add(B.MeshBuilder.CreateBox('dpanel', { width: 0.8, height: 2.0, depth: 0.2 }, scene)); panel.position.set(0, 1.0, 0); panel.material = std('doorPanel', '#2a2440', { emissive: '#0c0a1a', spec: '#8080ff' });
      const crystal = add(B.MeshBuilder.CreatePolyhedron('dc', { type: 1, size: 0.22 }, scene), false); crystal.position.set(0, 1.3, -0.16); crystal.scaling.y = 1.5; crystal.material = glowMat('dcM', '#8a7a30');
      entry.parts = { panel, crystal };
      entry.update = (d) => { panel.position.y = d.done ? 2.4 : 1.0; panel.visibility = d.done ? 0 : 1; crystal.material = glowMat(d.done ? 'dcOn' : 'dcM', d.done ? '#ffe44a' : '#8a7a30'); };
      entry.update(o);
      entry.spin = (t) => { crystal.rotation.y = t * 1.5; };
    } else if (kind === 'keepgate') {
      const stone = std('kgStone', '#3a3252', { emissive: '#120a20' });
      [-0.65, 0.65].forEach((dx) => { const p = add(B.MeshBuilder.CreateBox('kp', { width: 0.4, height: 3.0, depth: 0.7 }, scene)); p.position.set(dx, 1.5, 0); p.material = stone; });
      const lint = add(B.MeshBuilder.CreateBox('kl', { width: 1.7, height: 0.45, depth: 0.7 }, scene)); lint.position.set(0, 3.0, 0); lint.material = stone;
      const panel = add(B.MeshBuilder.CreateBox('kpanel', { width: 0.95, height: 2.8, depth: 0.25 }, scene)); panel.position.set(0, 1.4, 0); panel.material = std('kgPanel', '#1e1830', { emissive: '#08040e', spec: '#ff6080' });
      const sockets = [0, 1, 2].map((i) => { const s = add(B.MeshBuilder.CreateSphere('sock' + i, { diameter: 0.22 }, scene), false); s.position.set((i - 1) * 0.3, 2.1, -0.17); s.material = glowMat('sockOff', '#3a1a2a'); return s; });
      const rp = B.MeshBuilder.CreatePlane('kgrunes', { width: 0.8, height: 1.4 }, scene); rp.parent = root; rp.position.set(0, 1.1, -0.15); rp.isPickable = false;
      const rm = std('kgRuneGlow', '#000000', { noLight: true, add: true, cull: false }); rm.emissiveTexture = texFromCanvas(Art2.runes('#ff4a6a'), 'runesR', { alpha: true }); rm.opacityTexture = rm.emissiveTexture; rm.emissiveColor = new B.Color3(1, 1, 1); rp.material = rm;
      lightPool(o.x, -o.y, '#ff3a5a', 3.2, 0.35);
      entry.parts = { panel, sockets };
      entry.update = (d) => { panel.position.y = d.done ? 3.6 : 1.4; panel.visibility = d.done ? 0 : 1; rp.setEnabled(!d.done); };
      entry.update(o);
    } else if (kind === 'heartcrystal') {
      const gem = add(B.MeshBuilder.CreatePolyhedron('heart', { type: 1, size: 0.55 }, scene), false); gem.position.y = 1.6; gem.scaling.y = 1.9;
      const pool = lightPool(o.x, -o.y, '#ff8ac8', 4.2, 0.5);
      entry.parts = { gem, pool };
      entry.spin = (t) => { gem.rotation.y = t * 0.8; gem.position.y = 1.6 + Math.sin(t * 1.5) * 0.12; };
      entry.update = () => {};
      entry.relight = (lit) => { gem.material = lit ? glowMat('heartOn', '#ffd0f0') : glowMat('heartOff', '#3a1a4a'); pool.visibility = lit ? 1 : 0.1; };
      entry.relight(false);
    }
  }
  const r2 = (i) => { const x = Math.sin(i * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };

  function refreshKeepGate(state) {
    const e = objs['v_keepgate'];
    if (e && e.parts.sockets) e.parts.sockets.forEach((s, i) => { s.material = glowMat(i < state.player.keystones ? 'sockOn' : 'sockOff', i < state.player.keystones ? '#ffd86a' : '#3a1a2a'); });
    const h = objs['k_heart'];
    if (h && h.relight) h.relight(!!(state.victory || state.bossDown));
  }

  function refreshObject(o) {
    const e = objs[o.id];
    if (!e) return;
    e.data = o;
    if (e.update) e.update(o);
  }
  function rebuildTerrain() {
    terrainNodes.forEach((m) => m && m.dispose());
    terrainNodes = [];
    buildTerrain();
  }

  // =========================================================
  //  exits and ambience
  // =========================================================
  function buildExits() {
    zone.exits.forEach((e) => {
      const col = PRESETS[zone.id].accent;
      const disc = B.MeshBuilder.CreatePlane('exitDisc', { size: 1.5 }, scene); disc.rotation.x = Math.PI / 2; disc.position = new B.Vector3(e.x, 0.04, -e.y); disc.parent = rootNode; disc.isPickable = false;
      const dm = std('exitDiscM', '#000000', { noLight: true, add: true, cull: false }); dm.emissiveTexture = texFromCanvas(Art2.swirl(50), 'swirl50', { alpha: true }); dm.opacityTexture = dm.emissiveTexture; dm.emissiveColor = new B.Color3(1, 1, 1);
      disc.material = dm;
      animTex.push({ mesh: disc, spin: 0.7 });
      const sp = new B.ParticleSystem('exitP', 50, scene); sp.particleTexture = texFromCanvas(Art.sparkTexture(), 'spark', { alpha: true });
      sp.emitter = new B.Vector3(e.x, 0.1, -e.y); sp.minEmitBox = new B.Vector3(-0.4, 0, -0.4); sp.maxEmitBox = new B.Vector3(0.4, 0, 0.4);
      sp.color1 = B.Color4.FromColor3(hex(col), 1); sp.color2 = new B.Color4(1, 1, 1, 1); sp.colorDead = new B.Color4(0, 0, 0, 0);
      sp.minSize = 0.08; sp.maxSize = 0.22; sp.minLifeTime = 0.8; sp.maxLifeTime = 1.8; sp.emitRate = 22; sp.gravity = new B.Vector3(0, 1.1, 0); sp.blendMode = B.ParticleSystem.BLENDMODE_ADD;
      sp.start(); particleSystems.push(sp);
      lightPool(e.x, -e.y, col, 3.0, 0.35);
    });
  }

  function buildAmbience() {
    const P = PRESETS[zone.id];
    // floating motes that follow the player
    const motes = new B.ParticleSystem('motes', 200, scene);
    motes.particleTexture = texFromCanvas(Art.glowDot(), 'dot', { alpha: true });
    motes.emitter = camTargetNode();
    motes.minEmitBox = new B.Vector3(-10, 0, -9); motes.maxEmitBox = new B.Vector3(10, 5, 9);
    motes.color1 = B.Color4.FromColor3(hex(P.mote), 0.9); motes.color2 = new B.Color4(1, 1, 1, 0.7); motes.colorDead = new B.Color4(0, 0, 0, 0);
    motes.minSize = 0.05; motes.maxSize = 0.16; motes.minLifeTime = 4; motes.maxLifeTime = 9; motes.emitRate = quality === 'low' ? 8 : P.motes / 4;
    motes.blendMode = B.ParticleSystem.BLENDMODE_ADD; motes.gravity = new B.Vector3(0, zone.id === 'vein' ? 0.45 : (zone.id === 'keep' ? -0.15 : 0.04), 0);
    motes.direction1 = new B.Vector3(-0.3, 0.1, -0.3); motes.direction2 = new B.Vector3(0.3, 0.4, 0.3); motes.minEmitPower = 0.1; motes.maxEmitPower = 0.5;
    motes.preWarmCycles = 60; motes.preWarmStepOffset = 4; motes.start(); particleSystems.push(motes);
    // light shafts (additive cones of light)
    const shaftTex = texFromCanvas(Art2.shaft(), 'shaft', { alpha: true });
    const spots = { grotto: [[6, 5], [16, 11], [10, 12]], hollows: [[6, 8], [14, 9], [20, 6]], vein: [[5, 10], [13, 8], [20, 10]], keep: [[7, 8], [15, 8], [11, 5]] }[zone.id];
    if (quality !== 'low') spots.forEach(([sx, sy], i) => {
      const m = B.MeshBuilder.CreatePlane('shaft', { width: 3.2, height: 9 }, scene);
      m.position = new B.Vector3(sx + 1.2, 4.0, -sy + 1); m.rotation.z = -0.28; m.billboardMode = B.Mesh.BILLBOARDMODE_Y; m.isPickable = false; m.parent = rootNode;
      const sm = std('shaftM' + zone.id, '#000000', { noLight: true, add: true, cull: false }); sm.emissiveTexture = shaftTex; sm.opacityTexture = shaftTex; sm.emissiveColor = hex(P.mote).scale(0.5); sm.alpha = 0.5;
      m.material = sm; shafts.push({ m, phase: i * 2 });
    });
    if (zone.id === 'vein') {
      const lavaTiles = [];
      zone.rows.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch === '~') lavaTiles.push([x, y]); }));
      if (lavaTiles.length) {
        const em = new B.ParticleSystem('embers', 160, scene); em.particleTexture = texFromCanvas(Art.sparkTexture(), 'spark', { alpha: true });
        const xs = lavaTiles.map((t) => t[0]), ys = lavaTiles.map((t) => t[1]);
        em.emitter = new B.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, -(Math.min(...ys) + Math.max(...ys)) / 2);
        em.minEmitBox = new B.Vector3(-0.5, 0, -(Math.max(...ys) - Math.min(...ys)) / 2); em.maxEmitBox = new B.Vector3(0.5, 0.2, (Math.max(...ys) - Math.min(...ys)) / 2);
        em.color1 = new B.Color4(1, 0.6, 0.15, 1); em.color2 = new B.Color4(1, 0.3, 0.05, 1); em.colorDead = new B.Color4(0.3, 0, 0, 0);
        em.minSize = 0.05; em.maxSize = 0.16; em.minLifeTime = 1.5; em.maxLifeTime = 3.5; em.emitRate = 40; em.gravity = new B.Vector3(0, 1.2, 0); em.blendMode = B.ParticleSystem.BLENDMODE_ADD;
        em.direction1 = new B.Vector3(-0.6, 1, -0.3); em.direction2 = new B.Vector3(0.6, 2, 0.3); em.start(); particleSystems.push(em);
      }
    }
  }
  let camNode = null;
  function camTargetNode() {
    if (!camNode || camNode.isDisposed()) camNode = new B.TransformNode('camNode', scene);
    return camNode;
  }

  // =========================================================
  //  per-frame update
  // =========================================================
  function update() {
    let dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    if (hitStopT > 0) { hitStopT -= engine.getDeltaTime() / 1000; dt = 0; }
    time += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k));
      if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
    animTex.forEach((a) => { if (a.t) { a.t.uOffset += a.du * dt * 6; a.t.vOffset += a.dv * dt * 6; } if (a.mesh) a.mesh.rotation.y += a.spin * dt; });
    actors.forEach((a) => a.update(dt, time));
    Object.values(objs).forEach((e) => { if (e.spin) e.spin(time); });
    shafts.forEach((s) => { s.m.material.alpha = 0.35 + Math.sin(time * 0.6 + s.phase) * 0.15; });
    if (player && camMode === 'follow') {
      const target = player.node.position;
      const dirv = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[player.dir] || [0, 0];
      lookAhead.x += (dirv[0] * 1.1 - lookAhead.x) * Math.min(1, dt * 1.6); lookAhead.z += (dirv[1] * 1.1 - lookAhead.z) * Math.min(1, dt * 1.6);
      const tx = Math.min(zone.w + 1, Math.max(-1, target.x + lookAhead.x)), tz = Math.min(1, Math.max(-(zone.h + 1), target.z + lookAhead.z));
      camTarget.x += (tx - camTarget.x) * Math.min(1, dt * 5);
      camTarget.z += (tz - camTarget.z) * Math.min(1, dt * 5);
      camTarget.y = 0;
      lantern.position.set(target.x, 2.2, target.z - 0.8);
      lantern.intensity = 0.95 + Math.sin(time * 5) * 0.04;
      if (camNode) camNode.position.set(camTarget.x, 0, camTarget.z);
    }
    if (camMode === 'follow') {
      const sway = Math.sin(time * 0.3) * 0.02;
      const dist = 17, pitch = 0.74;
      const px = camTarget.x + Math.sin(sway) * dist * 0.4;
      camera.position.set(px, camTarget.y + Math.sin(pitch) * dist + 0.4, camTarget.z - Math.cos(pitch) * dist);
      camLook.set(camTarget.x, 0.55, camTarget.z + 0.3);
      if (shake > 0.002) {
        camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; camera.position.z += (Math.random() - 0.5) * shake;
        shake = Math.max(0, shake - shakeDecay * dt * shake - dt * 0.4);
      }
      camera.setTarget(camLook);
    }
    hooks.frame.forEach((f) => f(dt, time));
    if (camMode === 'free' && shake > 0.002) {
      camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; camera.position.z += (Math.random() - 0.5) * shake;
      shake = Math.max(0, shake - shakeDecay * dt * shake - dt * 0.4);
    }
    if (World3D._flash > 0) World3D._flash = Math.max(0, World3D._flash - dt * 2.2);
  }

  // =========================================================
  //  public helpers
  // =========================================================
  async function stepPlayer(dir, nx, ny, dur = 0.17) {
    player.setDir(dir);
    player.walking = true;
    const sx = player.node.position.x, sz = player.node.position.z, tx = nx, tz = -ny;
    await tween(dur, (k) => { player.node.position.x = sx + (tx - sx) * k; player.node.position.z = sz + (tz - sz) * k; });
    player.node.position.set(tx, 0, tz);
    player.walking = false;
  }
  function setPlayer(x, y, dir) { player.setPos(x, y); if (dir) player.setDir(dir); camTarget.set(x, 0, -y); }
  function project(x, y, z) {
    const w = tileToWorld(x, y); w.y = z;
    const m = scene.getTransformMatrix(), vp = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const p = B.Vector3.Project(w, B.Matrix.Identity(), m, vp);
    const k = engine.getHardwareScalingLevel();
    return { x: p.x * k, y: p.y * k, visible: p.z > 0 && p.z < 1 };
  }
  function addShake(a) { shake = Math.max(shake, a); }
  function flash(v) { World3D._flash = Math.max(World3D._flash, v); }
  function actorFor(id) { return objs[id] && objs[id].actor; }
  const API = {
    init, buildZone, applyQuality, stepPlayer, setPlayer, project, refreshObject, rebuildTerrain, refreshKeepGate, addShake, flash, tween, wait, easeOut, easeInOut, actorFor, std, hex, texFromCanvas, glowMat, lightPool, Actor,
    get player() { return player; }, get scene() { return scene; }, get engine() { return engine; }, get camera() { return camera; }, get zone() { return zone; },
    get rootNode() { return rootNode; }, get shadowGen() { return shadowGen; }, get glow() { return glow; }, get sun() { return sun; }, get hemi() { return hemi; }, get lantern() { return lantern; },
    get objects() { return objs; }, get time() { return time; }, get PRESETS() { return PRESETS; }, get quality() { return quality; },
    hitStop(ms) { hitStopT = ms / 1000; }, setCamMode(m) { camMode = m; }, get camMode() { return camMode; }, hooks, flame, particleSystems: () => particleSystems, applyPreset,
    pushParticles(ps) { particleSystems.push(ps); }, hexColor: hex, tweens,
  };
  Object.defineProperties(World3D, Object.getOwnPropertyDescriptors(API));
})();
