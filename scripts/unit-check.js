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

  // 2. Push multiplier
  CHAR_TYPES.chog && CHAR_TYPES.chog.pushMult === 1.8
    ? ok("CHAR_TYPES.chog.pushMult = 1.8")
    : bad("pushMult missing/wrong");

  // 3. Spike burst FX lifecycle
  const scene = new THREE.Scene();
  const fx = new FXManager(scene);
  fx.spawnSpikeBurst(0, 1, 0, 9, 0xfdf7d3);
  const spawned = fx.spikeShards.length;
  spawned === 9 ? ok("spike burst spawned 9 shards") : bad(`expected 9 shards, got ${spawned}`);

  const xBefore = fx.spikeShards[0].mesh.position.x;
  fx.update(0.016);
  const moved = Math.abs(fx.spikeShards[0].mesh.position.x - xBefore) > 0.001;
  moved ? ok("shards move with velocity") : bad("shards did not move");

  for (let i = 0; i < 160; i++) fx.update(0.016);
  fx.spikeShards.length === 0
    ? ok("shards expire and are removed from the scene")
    : bad(`${fx.spikeShards.length} shards still alive after 2.5s`);

  fx.clear();
  fx.spikeShards.length === 0 && scene.children.length === 0
    ? ok("clear() empties the scene")
    : bad(`scene children left: ${scene.children.length}`);

  return out.join("\n");
})();
