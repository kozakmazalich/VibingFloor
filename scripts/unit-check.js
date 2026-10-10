// Unit-style check that runs INSIDE the real page (reuses the import map):
// 1. CHOG VIBER's buildViber produces 15 cone spikes.
// 2. FXManager.spawnSpikeBurst creates shards that move, expire and clear.
// 3. CHAR_TYPES.chog carries pushMult 1.8.
(async () => {
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  const THREE = await import("three");
  const { CHARACTERS, buildViber } = await import("/src/vibers.js");
  const { FXManager } = await import("/src/particles.js");
  const { CHAR_TYPES } = await import("/src/robot.js");

  // 1. Spike cones on the chog model
  const def = CHARACTERS.find((d) => d.id === "chog");
  if (!def) {
    bad("chog def missing");
  } else {
    const v = buildViber(def);
    let cones = 0;
    let boxes = 0;
    v.root.traverse((o) => {
      if (o.geometry && o.geometry.type === "ConeGeometry") cones++;
      if (o.geometry && o.geometry.type === "BoxGeometry") boxes++;
    });
    cones === def.spikes.length
      ? ok(`chog model renders ${cones} spike cones (${boxes} boxes)`)
      : bad(`expected ${def.spikes.length} cones, got ${cones}`);
  }

  // 2. Push multiplier (CHOG: 1.8 base → +40% → +50% again = 3.78)
  CHAR_TYPES.chog && CHAR_TYPES.chog.pushMult === 3.78
    ? ok("CHAR_TYPES.chog.pushMult = 3.78")
    : bad("pushMult missing/wrong");

  // 3. Spike burst FX lifecycle + symmetry requirements
  const scene = new THREE.Scene();
  const fx = new FXManager(scene);
  fx.spawnSpikeBurst(0, 1, 0, 8, 0xfdf7d3);
  const burst = fx.spikeBursts[0];
  burst && burst.spikes.length === 8
    ? ok("spike burst spawned 8 spikes")
    : bad(`expected 8 spikes, got ${burst ? burst.spikes.length : 0}`);

  // Even 360° spread: direction of spike i must be (cos a, sin a), a = i/8*2PI
  const expectedAngle = (i) => (i / 8) * Math.PI * 2;
  let evenSpread = true;
  for (let i = 0; i < 8; i++) {
    const s = burst.spikes[i];
    const dx = Math.cos(expectedAngle(i));
    const dz = Math.sin(expectedAngle(i));
    if (Math.abs(s.dx - dx) > 1e-9 || Math.abs(s.dz - dz) > 1e-9) evenSpread = false;
  }
  evenSpread ? ok("spikes evenly spaced around 360° (45° intervals)") : bad("spike directions are not even");

  // Black outline cone quills
  const hasOutline = burst.spikes.every(
    (s) => s.mesh.children.length === 1 && s.mesh.children[0].isLineSegments
  );
  hasOutline ? ok("every spike has a black outline (LineSegments)") : bad("spikes missing outlines");

  // Identical speed + travel distance: after one tick every spike moved the same
  fx.update(0.016);
  const traveled = burst.spikes.map((s) => Math.round(s.traveled * 1000));
  new Set(traveled).size === 1
    ? ok(`identical travel after one tick (${(traveled[0] / 1000).toFixed(3)} units)`)
    : bad(`spike travel differs: ${traveled.join(", ")}`);

  // Fade to zero + cleanup over ~0.4s
  fx.update(0.2);
  const midOpacity = burst.mat.opacity;
  for (let i = 0; i < 20; i++) fx.update(0.02);
  const expired = fx.spikeBursts.length === 0;
  expired
    ? ok(`ring faded (mid opacity ${midOpacity.toFixed(2)}) and was removed`)
    : bad("burst still alive after 0.6s");

  fx.clear();
  fx.spikeBursts.length === 0 && scene.children.length === 0
    ? ok("clear() empties the scene")
    : bad(`scene children left: ${scene.children.length}`);

  // 4. Music engine: starts, schedules steps, stops/restarts on mute
  const { audio } = await import("/src/audio.js");
  audio.init();
  if (!audio.ctx) {
    bad("AudioContext unavailable (headless?)");
  } else {
    audio.muted = false;
    audio.startMusic();
    audio.musicRunning && audio.musicBus
      ? ok("music starts (bus created)")
      : bad("music did not start");

    // Scheduler must advance through the 2-bar pattern without errors
    let steps = 0;
    let okTick = true;
    try {
      audio._musicTick();
      audio.musicNextTime += 10;
      audio._musicTick();
      steps = audio.musicStep;
    } catch (e) {
      okTick = false;
    }
    okTick && steps >= 0
      ? ok(`music scheduler ticks without errors (step ${steps})`)
      : bad("music tick threw");

    audio.toggleMute(); // -> muted
    audio.muted === true && !audio.musicRunning && !audio.musicBus
      ? ok("mute stops the music")
      : bad("mute did not stop the music");
    audio.toggleMute(); // -> unmuted
    audio.musicRunning
      ? ok("unmute restarts the music")
      : bad("unmute did not restart the music");
    audio.toggleMute(); // leave silent for the remaining checks
  }

  // 5. CPU difficulty presets: easy bot is deliberately timid
  const { DIFFICULTIES } = await import("/src/constants.js");
  const easy = DIFFICULTIES.easy;
  const normal = DIFFICULTIES.normal;
  easy.attackGate > 0 && easy.mistakeChance > 0 && easy.maxSpeed < normal.maxSpeed
    ? ok(`easy bot is timid (speed ${easy.maxSpeed}, attackGate ${easy.attackGate}s, mistake ${easy.mistakeChance})`)
    : bad("easy preset missing timid fields");
  normal.attackGate === undefined && normal.maxSpeed === 5.0
    ? ok("normal/hard keep the aggressive per-frame AI")
    : bad("normal preset unexpectedly changed");

  return out.join("\n");
})();
