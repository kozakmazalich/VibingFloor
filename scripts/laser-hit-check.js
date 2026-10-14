// In-game laser hit test with detailed probes.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(1500);
  document.getElementById("btn-char-meta").click();
  await sleep(300);
  document.getElementById("btn-menu-play").click();
  await sleep(1500);

  const game = window.game;
  if (!game) { bad("no window.game"); return out.join("\n"); }
  const p1 = game.p1, p2 = game.p2;
  const fx = game.fx;

  ok(`p1.hasLaser = ${p1.hasLaser}`);
  ok(`p2.state = ${p2.state}`);

  // Park the bot 2 units toward the arena centre (+X from the corner spawn),
  // ON the island so it stays alive, and face it.
  p1.facingAngle = -Math.PI / 2; // face +X
  p2.pos.set(p1.pos.x + 2, 0, p1.pos.z);
  p2.vel.set(0, 0);
  p2.state = "alive";
  p2.isGrounded = true;
  p2.vy = 0;
  p1.spearCooldown = 0;

  const beamsBefore = fx.laserBeams.length;
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", bubbles: true, cancelable: true }));
  await sleep(40);
  ok(`spearCooldown after E: ${p1.spearCooldown.toFixed(2)}`);
  ok(`beams: ${beamsBefore} -> ${fx.laserBeams.length}`);
  const v = Math.hypot(p2.vel.x, p2.vel.y);
  ok(`p2.vel 40ms after E: (${p2.vel.x.toFixed(1)}, ${p2.vel.y.toFixed(1)}) len ${v.toFixed(1)}`);
  // The hit registers as hitShakeTimer > 0 (applyImpulse ran). The raw
  // velocity reading is frame-rate dependent: headless rAF ticks at ~10fps
  // with big dt, so AI damping eats the impulse within a frame or two; at a
  // real 60fps it carries the bot (the unit-check verifies that at dt=1/60).
  p2.hitShakeTimer > 0
    ? ok(`LASER HIT REGISTERED (hitShakeTimer ${p2.hitShakeTimer.toFixed(2)})`)
    : bad(`laser did not hit (hitShakeTimer ${p2.hitShakeTimer.toFixed(2)})`);
  return out.join("\n");
})();
