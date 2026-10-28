// VIBER RACE check (run against the live page via cdp-test.mjs).
// Drives the menu, then steps the simulation with a fixed dt so bot AI,
// respawns, checkpoints, batteries, jetpack and the finish can be verified
// independently of headless frame rate.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);
  const check = (cond, l) => (cond ? ok(l) : bad(l));
  const key = (c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, bubbles: true, cancelable: true }));
  const keyup = (c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, bubbles: true, cancelable: true }));

  for (let i = 0; i < 80 && !(window.game && window.game.island); i++) await sleep(100);
  const g = window.game;
  if (!g) return "FAIL: no window.game";
  for (let i = 0; i < 100 && g._arenaBusy; i++) await sleep(50);

  // Step the game synchronously with a fixed dt (in chunks so the page breathes).
  const step = async (seconds, each) => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      g.update(1 / 60);
      if (each) each(i);
      if (i % 600 === 599) await sleep(0);
    }
  };

  // ---- Menu ----
  const raceBtn = document.getElementById("btn-menu-race");
  check(!!raceBtn, "VIBER RACE button present");
  const playBtn = document.getElementById("btn-menu-play");
  check(raceBtn && playBtn && raceBtn.previousElementSibling === playBtn, "race button sits next to INITIALIZE BATTLE");
  raceBtn.click();
  await sleep(200);
  const raceMenu = document.getElementById("race-menu");
  check(!raceMenu.classList.contains("hidden"), "race setup panel opens");
  document.querySelector('.race-size-btn[data-racers="10"]').click();
  document.querySelector('.race-diff-btn[data-diff="hard"]').click();
  check(document.querySelector('.race-size-btn[data-racers="10"]').classList.contains("active"), "10 racers selectable");
  document.getElementById("btn-race-start").click();
  for (let i = 0; i < 60 && g.mode !== "race"; i++) await sleep(50);

  check(g.mode === "race" && g.state === "playing", `race started (mode=${g.mode} state=${g.state})`);
  check(document.body.classList.contains("race-mode"), "HUD in race mode");
  check(raceMenu.classList.contains("hidden"), "race panel hidden after start");
  const race = g.race;
  check(race.racers.length === 10, `10 racers (${race.racers.length})`);
  check(race.phase === "countdown", "3-2-1 countdown running");
  check(!document.getElementById("race-countdown").classList.contains("hidden"), "countdown overlay visible");
  check(g.island.allTiles.length === 0, "battle arena cleared during race");
  const course = race.course;
  check(course.platforms.length > 30 && course.spinners.length === 4 && course.batteries.length > 10, `course built (${course.platforms.length} platforms, ${course.spinners.length} spinners, ${course.batteries.length} batteries)`);

  const p = g.p1;
  const z0 = p.pos.z;
  key("KeyW");
  await step(1.5);
  check(Math.abs(p.pos.z - z0) < 0.01, "racers frozen during countdown");
  await step(2.0);
  check(race.phase === "racing", "GO -> racing");

  // ---- Player movement ----
  const zStart = p.pos.z;
  await step(2.0);
  keyup("KeyW");
  const ran = zStart - p.pos.z;
  check(ran > 6, `player runs forward (${ran.toFixed(2)}u in 2s)`);

  // ---- Combat disabled ----
  key("KeyJ");
  key("KeyE");
  key("KeyG");
  await step(0.1);
  keyup("KeyJ");
  keyup("KeyE");
  keyup("KeyG");
  check(p.pushCooldown === 0 && p.spearCooldown === 0 && p.grenadeCooldown === 0, "push/spear/grenade disabled in race");

  // ---- Battery pickup ----
  const pRc = race.playerRc;
  // A battery on a wide platform with floor ahead, so the jetpack hop lands safely.
  const floorAhead = (x) => [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5].every((d) => course.getSurfaceAt(x.x, x.z - d));
  const b = course.batteries.find((x) => x.grounded && !x.collected && Math.abs(x.x) <= 3 && floorAhead(x));
  p.facingAngle = 0;
  race.setCharges(p, 0);
  p.pos.set(b.x, b.groundY, b.z);
  p.isGrounded = true;
  await step(0.05);
  check(p.jetpackCharges === 1 && p.heldItem === "jetpack", `battery = +1 charge (${p.jetpackCharges})`);
  check(b.collected, "battery consumed");
  const hudBatt = document.getElementById("race-batt").textContent;
  check(hudBatt.startsWith("1"), `HUD battery counter (${hudBatt})`);

  // ---- Jetpack (Q) ----
  key("KeyQ");
  await step(1 / 60);
  keyup("KeyQ");
  check(p.vy > 0 && p.jetpackBurn > 0 && p.jetpackCharges === 0, "Q fires jetpack burst and spends the battery");
  check(!!(p.jetpack && p.jetpack.visible), "3D jetpack visible while firing");
  await step(1.5);

  // ---- Checkpoint ----
  for (let i = 0; i < 5 && p.state !== "alive"; i++) await step(0.5);
  check(p.state === "alive", "player landed the jetpack hop");
  pRc.cp = 0; // the battery test may have passed later checkpoints
  p.pos.set(0, 0, -47);
  p.isGrounded = true;
  p.vy = 0;
  await step(0.1);
  check(pRc.cp === 1, `checkpoint 1 activated (cp=${pRc.cp})`);

  // ---- Fall + respawn at last checkpoint ----
  p.pos.set(0, 0, -73); // over the gap after the sweepers
  p.isGrounded = true;
  await step(0.1);
  check(p.state === "falling", `walking into the void falls (${p.state})`);
  await step(1.4);
  check(p.state === "alive" && Math.abs(-p.pos.z - 46) < 1.5, `respawned at checkpoint 1 (s=${(-p.pos.z).toFixed(1)})`);

  // ---- Spinner knockback ----
  const sp = course.spinners[0];
  await step(1.3); // let the respawn shield expire
  p.vel.set(0, 0);
  // Put the player on the bar's sweep line just ahead of it.
  const a = sp.angle + Math.sign(sp.speed) * 0.12;
  p.pos.set(sp.x + Math.cos(a) * 3, 0, sp.z + Math.sin(a) * 3);
  p.isGrounded = true;
  let hit = false;
  await step(0.6, () => {
    if (p.hitShakeTimer > 0) hit = true;
  });
  check(hit, "spinning bar knocks the racer");

  // ---- Bot AI: full race simulation ----
  p.pos.set(0, 0, -45);
  const respawns = new Map();
  const orig = race.respawn.bind(race);
  race.respawn = (rc) => {
    respawns.set(rc.robot.id, (respawns.get(rc.robot.id) || 0) + 1);
    return orig(rc);
  };
  const best = new Map();
  let shortcutUses = 0;
  const jetUsers = new Set();
  await step(150, () => {
    for (const rc of race.racers) {
      if (rc.isPlayer) continue;
      const s = -rc.robot.pos.z;
      if (s > (best.get(rc.robot.id) || -99)) best.set(rc.robot.id, s);
      if (rc.robot.jetpackBurn > 0) jetUsers.add(rc.robot.id);
      if (rc.jetMode) shortcutUses++;
    }
    // Keep the player parked on checkpoint 1 so the race ends via 3 bot finishes.
    if (p.state === "alive") {
      p.pos.set(0, 0, -45);
      p.vel.set(0, 0);
    }
  });
  race.respawn = orig;
  const finished = race.finishOrder.filter((rc) => !rc.isPlayer).length;
  const bestList = [...best.values()].map((s) => s.toFixed(0)).join(",");
  check(finished >= 3, `bots finish the course (${finished} finished; best s: ${bestList})`);
  const totalRespawns = [...respawns.values()].reduce((x, y) => x + y, 0);
  out.push(`INFO: bot respawns=${totalRespawns}, jetpack users=${jetUsers.size}, jet-mode frames=${shortcutUses}`);
  check(race.ended, "round ends after 3 bots finish");

  // Win overlay after the grace delay.
  await sleep(2400);
  const winTitle = document.getElementById("win-title").textContent;
  const winOverlay = document.getElementById("win-overlay");
  check(/YOU PLACED #\d+ \/ 10/.test(winTitle), `win screen placement (${winTitle})`);
  check(!winOverlay.classList.contains("hidden") || g.drumActive, "win overlay shown");

  // ---- Restart (R) ----
  key("KeyR");
  keyup("KeyR");
  await sleep(100);
  check(race.phase === "countdown" && g.state === "playing" && race.finishOrder.length === 0, "R restarts the race");

  // ---- Player finish -> placement ----
  await step(3.2);
  p.pos.set(0, 0, -211.5);
  p.isGrounded = true;
  key("KeyW");
  await step(0.6);
  keyup("KeyW");
  check(pRc.finished && pRc.placement === 1, `player finish recorded (#${pRc.placement})`);
  check(g.state === "round_over", "player finishing ends the round");
  await sleep(2400);
  if (g.drumActive) {
    // Winner path spins the prize drum first; let it run out.
    for (let i = 0; i < 160 && g.drumActive; i++) await sleep(100);
  }
  check(/YOU PLACED #1 \/ 10/.test(document.getElementById("win-title").textContent), "win screen shows #1 / 10");

  // ---- Back to menu: battle mode intact ----
  document.getElementById("btn-win-menu").click();
  await sleep(300);
  check(g.mode === "cpu" && g.state === "menu", "back to menu");
  check(!document.body.classList.contains("race-mode"), "race HUD mode cleared");
  check(g.island.allTiles.length > 0, `battle arena rebuilt (${g.island.allTiles.length} tiles)`);
  check(!g.race.course && g.race.racers.length === 0, "race objects disposed");
  check(p.speedMult === 1 && !p.combatDisabled, "player robot restored for battle");
  check(!g.scene.getObjectByName("viber-race-course"), "course removed from scene");

  document.getElementById("btn-menu-play").click();
  for (let i = 0; i < 60 && g.state !== "playing"; i++) await sleep(50);
  check(g.state === "playing" && g.mode === "cpu", "INITIALIZE BATTLE still starts a battle");
  key("KeyJ");
  await sleep(150);
  keyup("KeyJ");
  check(p.pushCooldown > 0, "push works again in battle");

  return out.join("\n");
})();
