import re
p = 'web/js/terrain.js'
s = open(p, encoding='utf-8').read()
a = s.index("  function blur(src, W, H, r, passes) {")
b = s.index("  function build(zone, ctx) {")
s = s[:a] + '''  function blur(src, W, H, r, passes) {
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

''' + s[b:]
open(p, 'w', encoding='utf-8').write(s)

p = 'web/js/scene.js'
s = open(p, encoding='utf-8').read()
a = s.index("  function buildTerrain() {")
b = s.index("  function lightPool(")
new = open('tools/scene_terrain_part.js', encoding='utf-8').read()
s = s[:a] + new + s[b:]
s = s.replace("p.rotation.x = Math.PI / 2; p.position = new B.Vector3(x, 0.025, z);", "p.rotation.x = Math.PI / 2; p.position = new B.Vector3(x, 0.07, z);")
s = s.replace("root.position = new B.Vector3(o.x, 0, -o.y);\n    const entry", "root.position = new B.Vector3(o.x, groundY(o.x, -o.y), -o.y);\n    const entry")
s = s.replace("root.parent = rootNode; root.position = new B.Vector3(x, 0, -y);\n      const add", "root.parent = rootNode; root.position = new B.Vector3(x + (r() - 0.5) * 0.22, groundY(x, -y), -y + (r() - 0.5) * 0.22); root.rotation.y = r() * 6.28; root.scaling.setAll(0.88 + r() * 0.5);\n      const add")
open(p, 'w', encoding='utf-8').write(s)
print('patched')
