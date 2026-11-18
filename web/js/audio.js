// audio.js - all sound is synthesised with the Web Audio API (no sound files): effects and a small generative soundtrack.
const Sound = (() => {
  let ctx = null, master = null, musicBus = null, sfxBus = null, muted = false;
  let timer = null, step = 0, nextTime = 0, mode = 'off', speed = 1;
  const MIDI = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const SONGS = {
    grotto:  { bpm: 72, root: 48, scale: [0, 2, 4, 7, 9], prog: [0, 5, 3, 4], wave: 'triangle', arp: 0.5, pad: 'sine', drums: 0 },
    hollows: { bpm: 66, root: 50, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 2, 4, 1], wave: 'sine', arp: 0.6, pad: 'sine', drums: 0 },
    vein:    { bpm: 92, root: 45, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 5, 3, 6], wave: 'square', arp: 0.35, pad: 'sawtooth', drums: 1 },
    keep:    { bpm: 70, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 5, 0], wave: 'sawtooth', arp: 0.3, pad: 'sawtooth', drums: 1 },
    battle:  { bpm: 138, root: 52, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], wave: 'square', arp: 0.35, pad: 'sawtooth', drums: 2 },
    boss:    { bpm: 160, root: 45, scale: [0, 1, 3, 5, 7, 8, 11], prog: [0, 5, 0, 6], wave: 'sawtooth', arp: 0.32, pad: 'sawtooth', drums: 3 },
    title:   { bpm: 64, root: 48, scale: [0, 2, 4, 7, 9], prog: [0, 3, 5, 4], wave: 'triangle', arp: 0.5, pad: 'sine', drums: 0 },
    win:     { bpm: 100, root: 55, scale: [0, 2, 4, 7, 9], prog: [0, 3, 4, 0], wave: 'triangle', arp: 0.7, pad: 'sine', drums: 0 },
  };

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.38; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type = 'sine', vol = 0.15, when = 0, slideTo = null, bus = null) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol = 0.1, when = 0, hp = 800, bus = null) {
    if (!ensure()) return;
    const t = ctx.currentTime + when, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(bus || sfxBus); s.start(t);
  }

  const sfx = {
    step() { noise(0.05, 0.05, 0, 1500); tone(110 + Math.random() * 30, 0.06, 'sine', 0.04); },
    blip() { tone(660, 0.07, 'square', 0.05); },
    select() { tone(520, 0.06, 'square', 0.06); tone(780, 0.09, 'square', 0.06, 0.06); },
    back() { tone(420, 0.08, 'square', 0.05, 0, 260); },
    bump() { tone(120, 0.1, 'triangle', 0.1, 0, 70); },
    card() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, 'sine', 0.07, i * 0.06)); },
    text() { tone(300 + Math.random() * 120, 0.03, 'square', 0.018); },
    chest() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, i * 0.07)); },
    heal() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, 'sine', 0.08, i * 0.09)); },
    gate() { noise(0.7, 0.18, 0, 200); tone(80, 0.8, 'sawtooth', 0.12, 0, 40); [262, 330, 392, 523].forEach((f, i) => tone(f, 0.4, 'triangle', 0.07, 0.4 + i * 0.1)); },
    locked() { tone(140, 0.18, 'sawtooth', 0.1); tone(110, 0.28, 'sawtooth', 0.1, 0.16); },
    keystone() { [523, 659, 784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.5, 'triangle', 0.09, i * 0.1)); },
    encounter() { [220, 262, 330, 440, 523].forEach((f, i) => tone(f, 0.12, 'square', 0.07, i * 0.05)); noise(0.3, 0.1, 0.1, 400); },
    fire() { noise(0.25, 0.12, 0, 600); tone(180, 0.25, 'sawtooth', 0.08, 0, 700); },
    hit() { noise(0.18, 0.2, 0, 300); tone(160, 0.18, 'square', 0.12, 0, 60); },
    superHit() { noise(0.35, 0.28, 0, 200); tone(120, 0.35, 'sawtooth', 0.16, 0, 40); [659, 880, 1175].forEach((f, i) => tone(f, 0.2, 'square', 0.07, 0.05 + i * 0.05)); },
    resisted() { tone(200, 0.18, 'triangle', 0.1, 0, 120); noise(0.1, 0.06, 0, 2000); },
    hurt() { noise(0.2, 0.18, 0, 250); tone(140, 0.25, 'sawtooth', 0.1, 0, 50); },
    guard() { tone(330, 0.12, 'triangle', 0.1); tone(494, 0.2, 'triangle', 0.1, 0.08); },
    swap() { tone(440, 0.07, 'square', 0.05, 0, 880); tone(660, 0.07, 'square', 0.05, 0.07, 330); },
    faint() { tone(330, 0.5, 'sawtooth', 0.1, 0, 60); },
    levelup() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'square', 0.06, i * 0.07)); },
    win() { [523, 523, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'square', 0.07, i * 0.11)); },
    lose() { [392, 349, 330, 262].forEach((f, i) => tone(f, 0.5, 'sawtooth', 0.08, i * 0.28)); },
    warning() { for (let i = 0; i < 4; i++) tone(i % 2 ? 330 : 440, 0.14, 'sawtooth', 0.12, i * 0.16); },
    mega() { noise(1.2, 0.3, 0, 100); tone(70, 1.1, 'sawtooth', 0.2, 0, 25); },
    fuse() { for (let i = 0; i < 10; i++) tone(200 + i * 90, 0.2, 'sine', 0.07, i * 0.06); noise(0.8, 0.1, 0.5, 600); tone(110, 0.9, 'sawtooth', 0.1, 0.55, 220); },
    save() { [659, 784, 988].forEach((f, i) => tone(f, 0.2, 'sine', 0.08, i * 0.08)); },
    catch() { [523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, i * 0.08)); },
  };

  // ---------- generative music ----------
  function scheduleStep(song, s, t) {
    const beat = 60 / (song.bpm * speed);
    const sixteenth = beat / 2;
    const chordIdx = Math.floor(s / 16) % song.prog.length;
    const deg = song.prog[chordIdx];
    const sc = song.scale;
    const noteAt = (d, oct = 0) => song.root + sc[((d % sc.length) + sc.length) % sc.length] + 12 * (Math.floor(d / sc.length) + oct);
    const play = (m, dur, vol, type, when) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = type; o.frequency.value = MIDI(m);
      f.type = 'lowpass'; f.frequency.value = type === 'sawtooth' || type === 'square' ? 1800 : 5000;
      g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol, when + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(f); f.connect(g); g.connect(musicBus); o.start(when); o.stop(when + dur + 0.05);
    };
    if (s % 16 === 0) {                                  // pad chord
      [0, 2, 4].forEach((k) => play(noteAt(deg + k, 0), beat * 7.5, 0.05, song.pad, t));
      play(noteAt(deg, -1), beat * 7.5, 0.09, 'sine', t);
    }
    if (s % 2 === 0 && Math.random() < song.arp + 0.35) {   // arpeggio
      const pat = [0, 2, 4, 2, 5, 4, 2, 1];
      const d = deg + pat[(s / 2) % 8] + (Math.random() < 0.15 ? 2 : 0);
      play(noteAt(d, 1), sixteenth * 1.8, 0.045, song.wave, t);
    }
    if (song.drums) {
      if (s % 8 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.2); }
      if (s % 8 === 4 && song.drums >= 2) noise(0.1, 0.1, t - ctx.currentTime, 1800, musicBus);
      if (song.drums >= 2 && s % 2 === 1) noise(0.03, 0.04, t - ctx.currentTime, 5000, musicBus);
      if (song.drums === 3 && s % 16 === 14) noise(0.1, 0.12, t - ctx.currentTime, 1800, musicBus);
    }
  }

  function loop() {
    if (!ctx || mode === 'off' || !SONGS[mode]) return;
    const song = SONGS[mode];
    const sixteenth = 60 / (song.bpm * speed) / 2;
    while (nextTime < ctx.currentTime + 0.25) {
      scheduleStep(song, step, Math.max(nextTime, ctx.currentTime + 0.02));
      nextTime += sixteenth; step++;
    }
  }

  function music(name, spd = 1) {
    if (mode === name && speed === spd) return;
    mode = name; speed = spd; step = 0;
    if (!ensure()) return;
    nextTime = ctx.currentTime + 0.1;
    if (!timer) timer = setInterval(loop, 80);
  }
  function setSpeed(v) { speed = v; }
  function stopMusic() { mode = 'off'; }
  function toggleMute() {
    muted = !muted;
    if (ctx) master.gain.value = muted ? 0 : 0.8;
    return muted;
  }

  return { ensure, sfx, music, stopMusic, toggleMute, setSpeed, tone, get muted() { return muted; } };
})();
