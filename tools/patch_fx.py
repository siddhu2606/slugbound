p = 'web/js/terrain.js'
t = open(p, encoding='utf-8').read()
t = t.replace("clamp(0.42 + big * 0.35 + strata * 0.12, 0, 1)", "clamp(0.4 + big * 0.2 + strata * 0.1, 0, 1)")
open(p, 'w', encoding='utf-8').write(t)

p = 'web/js/scene.js'
s = open(p, encoding='utf-8').read()
# colour grade: split toning (warm highlights, teal/violet shadows) + contrast curve
s = s.replace("        col *= tint;\n", """        col *= tint;
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 shadowTone = vec3(0.86, 1.0, 1.12), lightTone = vec3(1.1, 1.02, 0.88);
        col *= mix(shadowTone, lightTone, smoothstep(0.18, 0.72, lum));
        col = (col - 0.5) * 1.08 + 0.5;
""", 1)
s = s.replace("_tilt: 2.4,", "_tilt: 4.2,").replace("World3D._tilt = lo ? 0 : (hi ? 2.4 : 1.8);", "World3D._tilt = lo ? 0 : (hi ? 4.2 : 3.2);")
s = s.replace("e.setFloat('band', 0.24);", "e.setFloat('band', 0.16);")
s = s.replace("_vig: 0.55,", "_vig: 0.72,")
# camera: look-ahead and soft bounds
s = s.replace("""      camTarget.x += (target.x - camTarget.x) * Math.min(1, dt * 6);
      camTarget.z += (target.z - camTarget.z) * Math.min(1, dt * 6);""", """      const dirv = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[player.dir] || [0, 0];
      lookAhead.x += (dirv[0] * 1.1 - lookAhead.x) * Math.min(1, dt * 1.6); lookAhead.z += (dirv[1] * 1.1 - lookAhead.z) * Math.min(1, dt * 1.6);
      const tx = Math.min(zone.w + 1, Math.max(-1, target.x + lookAhead.x)), tz = Math.min(1, Math.max(-(zone.h + 1), target.z + lookAhead.z));
      camTarget.x += (tx - camTarget.x) * Math.min(1, dt * 5);
      camTarget.z += (tz - camTarget.z) * Math.min(1, dt * 5);""")
s = s.replace("  let camSway = 0;", "  let camSway = 0;\n  const lookAhead = { x: 0, z: 0 };")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
