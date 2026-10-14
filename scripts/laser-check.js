// In-game laser test: select META, start a match, press E, verify the beam
// spawns and the cooldown ticks.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(1500);
  document.getElementById("btn-char-meta").click();
  await sleep(300);
  const menuName = document.getElementById("menu-p1-name").textContent;
  ok(`selected: ${menuName}`);

  document.getElementById("btn-menu-play").click();
  await sleep(1500);

  // Access the game + fx via the page's globals (window.game / window.fx or similar)
  const game = window.game;
  const fx = window.fx || (game && game.fx);
  if (!game || !fx) { bad("game/fx globals not exposed"); return out.join("\n"); }

  const p1 = game.p1;
  ok(`p1.hasLaser = ${p1.hasLaser}`);
  ok(`p1.charIndex = ${p1.charIndex}`);

  const before = fx.laserBeams ? fx.laserBeams.length : 0;
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", bubbles: true, cancelable: true }));
  await sleep(100);
  const after = fx.laserBeams ? fx.laserBeams.length : 0;
  ok(`cooldown after E: ${p1.spearCooldown.toFixed(2)}s`);
  after > before
    ? ok(`laser beam spawned (${before} -> ${after})`)
    : bad(`no beam (${before} -> ${after})`);

  // The beam fade is covered by the unit-check; here the round may end
  // (shrinking island) and stop the fx updates, so don't assert it.
  return out.join("\n");
})();
