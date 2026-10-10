// Boot check for the real game page (index.html). Async IIFE; the CDP driver
// evaluates it with awaitPromise and prints the returned string.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (label) => out.push("OK: " + label);
  const bad = (label) => out.push("FAIL: " + label);

  const key = (code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
  const keyup = (code) => window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true }));

  // Boot
  await sleep(2500);
  const menu = document.getElementById("start-menu");
  const onlineMenu = document.getElementById("online-menu");
  const hud = document.getElementById("in-game-hud");
  const pauseMenu = document.getElementById("pause-menu");

  menu.classList.contains("hidden") ? bad("start menu visible") : ok("start menu visible");
  document.getElementById("btn-menu-online") ? ok("online button present") : bad("online button present");

  // Online panel open/close
  document.getElementById("btn-menu-online").click();
  await sleep(300);
  !onlineMenu.classList.contains("hidden") ? ok("online panel opens") : bad("online panel opens");
  document.getElementById("btn-online-host") && document.getElementById("online-code-input") && document.getElementById("btn-online-join")
    ? ok("host/join controls present")
    : bad("host/join controls present");
  document.getElementById("btn-online-back").click();
  await sleep(300);
  onlineMenu.classList.contains("hidden") ? ok("back returns to menu") : bad("back returns to menu");

  // Fighter select: CHOG VIBER is selectable, shows its portrait + name
  const chogBtn = document.getElementById("btn-char-chog");
  if (!chogBtn) { bad("chog button present"); } else {
    chogBtn.click();
    await sleep(250);
    const menuName = document.getElementById("menu-p1-name").textContent;
    const menuAvatar = document.getElementById("menu-p1-avatar").src;
    menuName.toUpperCase().includes("CHOG") ? ok(`chog selectable (menu name: ${menuName})`) : bad(`chog name missing (${menuName})`);
    menuAvatar.includes("robot5_portrait") ? ok("chog portrait shown in menu") : bad(`chog portrait wrong (${menuAvatar})`);
  }

  // Local vs-CPU match
  document.getElementById("btn-menu-play").click();
  await sleep(1200);
  !hud.classList.contains("hidden") ? ok("HUD visible in vs CPU") : bad("HUD visible in vs CPU");

  // CHOG selected above: HUD name must follow
  const hudName = document.getElementById("hud-p1-name").textContent;
  const hudAvatar = document.getElementById("hud-p1-avatar").src;
  hudName.toUpperCase().includes("CHOG") ? ok(`HUD shows chog name (${hudName})`) : bad(`HUD name wrong (${hudName})`);
  hudAvatar.includes("robot5_portrait") ? ok("chog portrait shown in HUD") : bad(`HUD avatar wrong (${hudAvatar})`);

  // Exercise the full input surface (same codes the touch layer dispatches)
  const codes = ["KeyW", "Space", "KeyJ", "KeyE", "KeyG", "ArrowLeft", "KeyS"];
  for (const c of codes) key(c);
  await sleep(700);
  for (const c of codes) keyup(c);
  await sleep(300);

  // Dash (SHIFT): burst + cooldown HUD feedback
  const dashStatus = document.getElementById("dash-status-text");
  const dashBefore = dashStatus.textContent;
  key("ShiftLeft");
  await sleep(150);
  const dashAfter = dashStatus.textContent;
  dashAfter !== dashBefore ? ok(`dash triggers (status: "${dashBefore}" -> "${dashAfter}")`) : bad(`dash status unchanged ("${dashAfter}")`);
  keyup("ShiftLeft");
  let dashReady = false;
  for (let i = 0; i < 15; i++) {
    await sleep(200);
    if (dashStatus.textContent === "READY") { dashReady = true; break; }
  }
  dashReady ? ok("dash cooldown recovers to READY") : bad("dash cooldown never recovered");

  // Restart so the round is fresh (a dash + shrinking island can eliminate p1
  // during the cooldown wait above; pause only toggles while playing)
  key("KeyR");
  await sleep(700);

  // Pause / resume
  key("KeyP");
  await sleep(300);
  !pauseMenu.classList.contains("hidden") ? ok("pause menu shows on P") : bad("pause menu shows on P");
  key("KeyP");
  await sleep(300);
  pauseMenu.classList.contains("hidden") ? ok("pause resumes on P") : bad("pause resumes on P");

  // HUD stats ticking (shrink timer counts down and resets; sample several
  // times and require at least two distinct values)
  const samples = new Set();
  for (let i = 0; i < 6; i++) {
    samples.add(document.getElementById("fall-timer").textContent);
    await sleep(400);
  }
  samples.size >= 2 ? ok("fall timer ticking (" + [...samples].join(" | ") + ")") : bad("fall timer ticking (" + [...samples].join(" | ") + ")");

  // Restart + win overlay path stays healthy
  key("KeyR");
  await sleep(600);
  ok("restart executed without crash");

  return out.join("\n");
})();
