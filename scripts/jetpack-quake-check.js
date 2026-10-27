// Jetpack + Quake feature check (run against the live game page via cdp-test.mjs).
// Drives the real match, then inspects the Robot and FXManager state plus HUD DOM.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);
  const key = (c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, bubbles: true, cancelable: true }));
  const keyup = (c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, bubbles: true, cancelable: true }));

  const g = window.game;
  if (!g) return "FAIL: no window.game";
  ok("window.game present");

  // Boot into a local vs-CPU match
  const menu = document.getElementById("start-menu");
  if (!menu.classList.contains("hidden")) {
    document.getElementById("btn-menu-play").click();
  }
  await sleep(1300);
  g.state === "playing" ? ok("game playing") : bad("game state=" + g.state);

  const p1 = g.p1;
  const fx = g.fx;
  if (!p1) return out.join("\n") + "\nFAIL: no p1";
  ok("p1 robot present");

  // --- JETPACK ---
  p1.equipConsumable("jetpack");
  await sleep(80);
  p1.heldItem === "jetpack" ? ok("p1 holds jetpack") : bad("p1 heldItem=" + p1.heldItem);
  p1.jetpackCharges === 5 ? ok("jetpack starts with 5 charges") : bad("jetpack charges=" + p1.jetpackCharges);
  p1.jetpack && p1.jetpack.visible ? ok("jetpack mesh visible on player") : bad("jetpack mesh not visible");
  p1.jpFlames && p1.jpFlames.length === 4 ? ok("4 flame cones built (2 per thruster)") : bad("flame cones=" + (p1.jpFlames && p1.jpFlames.length));

  const yBefore = p1.pos.y;
  const used = p1.useItem(fx, () => {}, g.handleQuake.bind(g));
  await sleep(80);
  used ? ok("jetpack useItem returned true") : bad("jetpack useItem returned false");
  p1.jetpackCharges === 4 ? ok("1 charge spent (4 left)") : bad("charges after press=" + p1.jetpackCharges);
  p1.jetpackBurn > 0 ? ok("flame burn active") : bad("jetpackBurn=0 after press");
  p1.vy > 0 ? ok("hop velocity positive (vy=" + p1.vy.toFixed(2) + ")") : bad("no hop vy=" + p1.vy);

  // Flame cone visible during burn
  let anyFlame = false;
  for (const f of p1.jpFlames) if (f.mesh.visible) { anyFlame = true; break; }
  anyFlame ? ok("flame cones visible during burn") : bad("flame cones hidden during burn");

  // let burn resolve
  await sleep(700);
  p1.jetpackBurn <= 0 ? ok("burn resolved") : bad("burn still active");

  // Empty the remaining 4 charges
  let usedCount = 0;
  for (let i = 0; i < 6; i++) {
    if (p1.heldItem === "jetpack" && p1.jetpackCharges > 0) {
      p1.useItem(fx, () => {}, g.handleQuake.bind(g));
      usedCount++;
    }
    await sleep(80);
  }
  p1.jetpackCharges === 0 ? ok("all 5 charges drained") : bad("charges leftover=" + p1.jetpackCharges);
  p1.heldItem === null ? ok("jetpack removed when empty") : bad("heldItem=" + p1.heldItem + " after empty");

  // --- QUAKE ---
  // Teleport back onto a safe walkable tile, then give quake and slam.
  const safe = g.nearestSafeSpawn(p1.pos.x, p1.pos.z);
  p1.pos.x = safe.x;
  p1.pos.z = safe.z;
  p1.pos.y = safe.y;
  p1.vel.set(0, 0, 0);
  p1.vy = 0;
  p1.state = "alive";
  p1.isGrounded = true;
  p1.equipConsumable("quake");
  await sleep(60);
  p1.heldItem === "quake" ? ok("p1 holds quake") : bad("p1 heldItem=" + p1.heldItem);

  // Count idle tiles under/around the player before the slam.
  const island = g.island;
  const beforeTiles = island.allTiles.filter((t) => t && t.state === "idle").length;
  const quakeUsed = p1.useItem(fx, () => {}, g.handleQuake.bind(g));
  quakeUsed ? ok("quake useItem returned true") : bad("quake useItem returned false state=" + p1.state + " grounded=" + p1.isGrounded);
  p1.heldItem === null ? ok("quake consumed after use") : bad("quake still held");

  // cracking tiles should appear immediately (QUAKE_CRACK_TIME ~0.13s)
  const cracking = island.allTiles.filter((t) => t && t.state === "cracking").length;
  cracking > 0 ? ok("tiles cracking after quake (" + cracking + ")") : bad("no cracking tiles (may have already shattered)");

  // let them shatter and debris spawn
  await sleep(420);
  const nowCracking = island.allTiles.filter((t) => t && t.state === "cracking").length;
  const activeDebris = (fx.debris || []).filter((d) => d.active).length;
  activeDebris > 0 ? ok("debris chunks flying (" + activeDebris + ")") : bad("no active debris chunks");
  nowCracking === 0 ? ok("crack phase completed") : bad("still cracking=" + nowCracking);

  // --- HUD ---
  const slot = document.getElementById("item-slot-block");
  const fuelBar = document.getElementById("item-fuel-bar");
  slot ? ok("item slot block present") : bad("item slot block missing");
  fuelBar ? ok("fuel bar present") : bad("fuel bar missing");
  const fuelSegs = fuelBar ? fuelBar.children.length : 0;
  fuelSegs === 5 ? ok("fuel bar has 5 segments") : bad("fuel bar segments=" + fuelSegs);

  // Trigger HUD with a fresh jetpack and confirm the 5 segments light.
  p1.equipConsumable("jetpack");
  await sleep(120);
  const litNow = fuelBar ? Array.from(fuelBar.children).filter((s) => s.classList.contains("lit")).length : 0;
  litNow === 5 ? ok("HUD shows 5 lit fuel segments") : bad("HUD lit segments=" + litNow);
  const icon = document.getElementById("item-slot-icon");
  icon && icon.src.includes("Jetpack.png") && icon.style.display === "block"
    ? ok("HUD jetpack icon shown")
    : bad("HUD jetpack icon wrong");

  return out.join("\n");
})();
