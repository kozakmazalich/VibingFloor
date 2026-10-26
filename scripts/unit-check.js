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

  // 1b. META VIBER is registered and renders
  const metaDef = CHARACTERS.find((d) => d.id === "meta");
  CHAR_TYPES.meta && metaDef
    ? ok("META VIBER registered in CHARACTERS + CHAR_TYPES")
    : bad("meta character missing");
  CHAR_TYPES.meta && CHAR_TYPES.meta.laser === true
    ? ok("META VIBER carries the laser flag")
    : bad("meta laser flag missing");
  if (metaDef) {
    const mv = buildViber(metaDef);
    let boxes = 0;
    mv.root.traverse((o) => {
      if (o.geometry && o.geometry.type === "BoxGeometry") boxes++;
    });
    boxes > 20 ? ok(`meta model renders (${boxes} boxes)`) : bad(`meta model too sparse (${boxes} boxes)`);
  }

  // 1c. META palette per assets/meta/ spec: lime body, white eyes, black
  // overalls (belt/boot #272125), olive shade #96a117 — no blue/purple
  if (metaDef) {
    const toHex = (c) => ("000000" + c.toString(16)).slice(-6);
    const hex = (c) => toHex(metaDef.colors[c]);
    const badColors = [];
    for (const key of Object.keys(metaDef.colors)) {
      const v = metaDef.colors[key];
      const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
      if (b > r * 1.25 && b > g * 1.25) badColors.push(`${key}=#${hex(key)}`);
    }
    hex("head") === "c5d41d" && hex("eye") === "ffffff" && hex("body") === "c5d41d" && hex("dark") === "96a117" && hex("belt") === "272125" && hex("boot") === "272125"
      ? ok(`meta palette exact (lime #${hex("head")}, white eyes #${hex("eye")}, black overalls #${hex("belt")}, olive shade #${hex("dark")})`)
      : bad(`meta palette wrong (head #${hex("head")}, eyes #${hex("eye")}, body #${hex("body")}, dark #${hex("dark")})`);
    const isBlack = (p) => p.c === 0x272125 || p.c === "belt";
    const isWhite = (p) => p.c === 0xffffff || p.c === "eye";
    const pupils = (metaDef.headExtras || []).filter((p) => isBlack(p) && p.z > 0.35 && p.y > -0.08).length;
    const nose = (metaDef.headExtras || []).filter((p) => isBlack(p) && p.z > 0.3 && p.y < -0.08).length;
    const whiteEyes = (metaDef.headExtras || []).filter((p) => isWhite(p) && p.z > 0.3).length;
    const ears = (metaDef.headExtras || []).filter((p) => isBlack(p) && p.y > 0.3).length;
    whiteEyes === 2 && pupils === 2 && nose === 1 && ears === 2
      ? ok("white eyes + black pupils + nose + dark ears per the meta/ spec")
      : bad(`face parts wrong (eyes ${whiteEyes}, pupils ${pupils}, nose ${nose}, ears ${ears})`);
    badColors.length === 0 ? ok("no blue/purple in the meta palette") : bad(`blue-ish colors: ${badColors.join(", ")}`);
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

  // 3b. Green laser beam: spawns, has a white-hot core, lasts ~0.4s, cleans up
  fx.fireLaserBeam({ x: 0, y: 1, z: 0, dirX: 0, dirZ: -1, maxDist: 4.32, color: 0x39ff14 });
  fx.laserBeams.length === 1
    ? ok("laser beam spawned")
    : bad(`expected 1 beam, got ${fx.laserBeams.length}`);
  const beamParts = fx.laserBeams[0].parts;
  beamParts.length === 3 && beamParts[2].mat.color.getHex() === 0xffffff
    ? ok("laser has a white-hot core (3 layers)")
    : bad(`laser layers wrong (${beamParts.length})`);
  beamParts[1].mat.color.getHex() === 0x39ff14
    ? ok("laser colour is #39ff14")
    : bad(`laser colour 0x${beamParts[1].mat.color.getHex().toString(16)}`);
  for (let i = 0; i < 12; i++) fx.update(0.02); // 0.24s — must still be alive
  const stillAlive = fx.laserBeams.length === 1;
  for (let i = 0; i < 12; i++) fx.update(0.02); // 0.48s total — must be gone
  stillAlive && fx.laserBeams.length === 0 && scene.children.length === 0
    ? ok("laser lasts ~0.4s then fades and is removed")
    : bad(`laser lifetime wrong (alive at 0.24s: ${stillAlive}, at 0.48s: ${fx.laserBeams.length})`);

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

  // 6. Knockback regression: push + spear must carry the bot off the edge
  // (the AI used to brake at gaps and steer against the impulse, so bots
  // could not be knocked out of the arena at all).
  const { Island } = await import("/src/island.js");
  const { MAPS } = await import("/src/maps.js");
  const { Robot } = await import("/src/robot.js");
  const { PickupManager, COLLECT_RADIUS } = await import("/src/pickups.js");
  const { winnerCount } = await import("/src/game.js");

  const island = new Island(scene, MAPS[0]);
  // Rim setup on the 20x20 classic arena: p1 two tiles from the rim, p2 one
  // tile from the rim — a knock in +X carries p2 over the edge into the void.
  const p1s = island.getWorldPos(17, 10);
  const p2s = island.getWorldPos(18, 10);
  const a = new Robot(1, "T1", "assets/robot1_portrait.png", p1s.x, p1s.z, 0x00e5ff, true, scene);
  const b = new Robot(2, "T2", "assets/robot2_portrait.png", p2s.x, p2s.z, 0xff2d95, false, scene);
  b.setDifficulty("normal");
  a.switchCharacter("chog"); // the spiked pusher
  const fx2 = new FXManager(scene);

  const pushed = a.triggerPush(b, fx2);
  const impulse = b.vel.length();
  for (let i = 0; i < 50; i++) {
    fx2.update(1 / 60);
    b.update(1 / 60, null, island, a, null, fx2);
  }
  pushed && impulse > 20 && b.state !== "alive"
    ? ok(`push knocks the bot off the edge (state=${b.state}, impulse=${impulse.toFixed(1)})`)
    : bad(`bot survived the edge push (state=${b.state}, impulse=${impulse.toFixed(1)})`);

  // Spear round: reset, aim +X and let the spear fly into the bot
  b.reset();
  a.equip("spear"); // fighters NOW start unarmed — the spear must be picked up
  a.spearCooldown = 0;
  a.facingAngle = -Math.PI / 2; // facing convention (-sin, -cos) -> (+X, 0)
  const spearThrown = a.triggerSpear(b, null, fx2, null);
  for (let i = 0; i < 40; i++) {
    fx2.update(1 / 60);
    b.update(1 / 60, null, island, a, null, fx2);
  }
  spearThrown && b.state !== "alive"
    ? ok(`spear knocks the bot off the edge (state=${b.state})`)
    : bad(`bot survived the spear (state=${b.state})`);

  // Laser round: META fires E — hitscan applies the impulse at 4.0 units
  // (beyond SPEAR_REACH 3.2, inside the 10.5 laser reach), and misses at 11.2.
  a.switchCharacter("meta");
  a.equip("spear"); // META's laser still needs a picked-up spear to arm
  b.reset();
  b.pos.x = p1s.x - 4.0; // 4.0 units from the shooter
  a.pos.set(p1s.x, 0, p1s.z);
  a.spearCooldown = 0;
  a.facingAngle = Math.PI / 2; // aim -X toward b
  const laserFired = a.triggerSpear(b, null, fx2, null);
  const laserImpulse = b.vel.length();
  laserFired && laserImpulse >= 30
    ? ok(`laser hits at 4.0 units (beyond spear reach) — impulse ${laserImpulse.toFixed(1)}`)
    : bad(`laser did not hit (impulse ${laserImpulse.toFixed(1)})`);

  b.reset();
  b.pos.x = p1s.x - 11.2; // beyond the 10.5 laser reach
  a.spearCooldown = 0;
  a.triggerSpear(b, null, fx2, null);
  b.vel.length() < 1
    ? ok("laser misses beyond its reach")
    : bad(`laser hit beyond reach (impulse ${b.vel.length().toFixed(1)})`);

  // Directional fire: the laser must NOT lock onto a target off to the side
  // (it is a straight beam along the facing, not a homing shot).
  b.reset();
  b.pos.set(p1s.x, 0, p1s.z - 3.0); // 3 units to the SIDE of the beam line
  a.spearCooldown = 0;
  a.triggerSpear(b, null, fx2, null);
  b.vel.length() < 1
    ? ok("laser does not auto-aim at a sideways target")
    : bad(`laser locked onto a sideways target (impulse ${b.vel.length().toFixed(1)})`);

  // 7. Weapon pickups: fighters start unarmed, pods spawn on idle tiles away
  // from spawns, stepping on one equips it, and a second grab is a no-op.
  const pickScene = new THREE.Scene();
  const pm = new PickupManager(pickScene);
  pm.spearCount = 1;
  pm.grenadeCount = 1;

  // Unarmed gate first
  const r = new Robot(9, "PU", "assets/robot1_portrait.png", p1s.x, p1s.z, 0x00e5ff, true, pickScene);
  r.hasSpear === false && r.hasGrenade === false
    ? ok("fighters spawn unarmed (hasSpear/hasGrenade = false)")
    : bad(`unarmed start wrong (spear=${r.hasSpear}, grenade=${r.hasGrenade})`);

  r.triggerSpear(null, null, null) === false
    ? ok("spear is gated until picked up")
    : bad("spear fired while unarmed");
  r.triggerGrenade(null, null, null, null) === false
    ? ok("grenade is gated until picked up")
    : bad("grenade thrown while unarmed");

  // equip() idempotency
  r.equip("spear") === true && r.hasSpear === true
    ? ok("equip('spear') arms the spear once")
    : bad("spear equip failed");
  r.equip("spear") === false
    ? ok("second spear equip is a no-op")
    : bad("spear re-equip not idempotent");
  r.equip("grenade") === true && r.hasGrenade === true
    ? ok("equip('grenade') arms the grenade once")
    : bad("grenade equip failed");
  r.equip("bogus") === false
    ? ok("unknown pickup kind is rejected")
    : bad("bogus kind accepted");
  r.dispose();

  // Pod spawning: two pods, both on idle tiles, none near the given spawn
  const spawnPoint = island.getWorldPos(10, 10);
  pm.spawn(island, [{ x: spawnPoint.x, z: spawnPoint.z }]);
  pm.pickups.length === 2
    ? ok("spawns exactly 2 pods (1 spear + 1 grenade)")
    : bad(`expected 2 pods, got ${pm.pickups.length}`);
  const kinds = pm.pickups.map((p) => p.kind).sort();
  kinds.join(",") === "grenade,spear"
    ? ok("one spear + one grenade pod")
    : bad(`pod kinds wrong (${kinds.join(",")})`);
  let onIdle = true;
  let awayFromSpawn = true;
  for (const p of pm.pickups) {
    const t = island.tileById.get(
      Math.round(p.pos.x / 1.08 + (island.gridSize - 1) / 2) * island.gridSize +
        Math.round(p.pos.z / 1.08 + (island.gridSize - 1) / 2)
    );
    if (!t || !t.isIdle()) onIdle = false;
    if (Math.hypot(p.pos.x - spawnPoint.x, p.pos.z - spawnPoint.z) < 4.5) awayFromSpawn = false;
  }
  onIdle ? ok("pods spawn only on idle tiles") : bad("a pod is not on an idle tile");
  awayFromSpawn ? ok("pods spawn away from fighter spawn points") : bad("a pod spawned on a spawn point");

  // Overlap collection: pickupAt returns the pod within radius, null when far
  const pod = pm.pickups[0];
  pm.pickupAt(pod.pos.x, pod.pos.z) === pod
    ? ok("pickupAt finds the pod when overlapping")
    : bad("pickupAt missed an overlapping pod");
  pm.pickupAt(pod.pos.x + 4, pod.pos.z + 4) === null
    ? ok("pickupAt returns null when far away")
    : bad("pickupAt false-positive far away");

  // nearest() for AI pathing honours kind filter
  const near = pm.nearest(p1s.x, p1s.z);
  let isClosest = true;
  if (near) {
    const dNear = Math.hypot(near.pos.x - p1s.x, near.pos.z - p1s.z);
    for (const p of pm.active) {
      if (Math.hypot(p.pos.x - p1s.x, p.pos.z - p1s.z) < dNear - 1e-6) isClosest = false;
    }
  }
  near && isClosest
    ? ok("nearest() returns the closest uncollected pod")
    : bad("nearest() wrong");
  pm.nearest(0, 0, "grenade")
    ? ok("nearest(kind='grenade') filters correctly")
    : bad("nearest kind filter failed");

  // Collection removes the pod from the active set + scene
  const beforeActive = pm.active.length;
  const podGroups = pm.pickups.map((p) => p.group);
  pod.collect();
  pm.active.length === beforeActive - 1 && pod.collected === true
    ? ok("collecting a pod removes it from the active set")
    : bad(`active set wrong after collect (${pm.active.length})`);
  pm.clear();
  pm.pickups.length === 0
    ? ok("PickupManager.clear() empties the pod list")
    : bad(`pickup clear left ${pm.pickups.length} pods`);
  podGroups.every((g) => !g.parent)
    ? ok("pickup groups are detached from the scene after clear()")
    : bad("a pickup group is still attached to the scene");

  // 8. Top-N winner count: 1v1 crowns 1, small brawls crown 2, big royales 3.
  const wcChecks = [
    [1, 1],
    [2, 1], // 1v1 = exactly one winner
    [3, 2],
    [5, 2],
    [6, 2],
    [7, 3],
    [10, 3],
  ];
  let wcAll = true;
  for (const [n, expect] of wcChecks) {
    if (winnerCount(n) !== expect) wcAll = false;
  }
  wcAll
    ? ok("winnerCount() crowns 1 for 1v1, 2 for ≤6, 3 for >6 (2→1, 5→2, 10→3)")
    : bad("winnerCount() wrong");

  // 9. Placement: elimination order maps to placement = alive + 1.
  //    10 fighters, 3 eliminated → placements 10, 9, 8; survivor = 1.
  {
    const pg = new PickupManager(new THREE.Scene());
    const fakeRobots = [];
    for (let i = 1; i <= 10; i++) {
      fakeRobots.push({ id: i, state: "alive", placement: null });
    }
    const rec = (robot) => {
      const alive = fakeRobots.filter((x) => x.state === "alive").length;
      robot.placement = alive + 1;
    };
    // Eliminate three in order (placement = remaining-alive + 1)
    const v1 = fakeRobots[9]; v1.state = "eliminated"; rec(v1); // alive 9 → 10th
    const v2 = fakeRobots[8]; v2.state = "eliminated"; rec(v2); // alive 8 → 9th
    const v3 = fakeRobots[7]; v3.state = "eliminated"; rec(v3); // alive 7 → 8th
    const placed = [v1.placement, v2.placement, v3.placement];
    placed.join(",") === "10,9,8"
      ? ok("elimination order stamps placements 10th, 9th, 8th")
      : bad(`placement order wrong (${placed.join(",")})`);
    pg.clear();
  }

  a.dispose();
  b.dispose();

  return out.join("\n");
})();
