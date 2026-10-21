// Button wiring + real visibility verification: PROFILE opens the profile
// overlay ON TOP (elementFromPoint sees profile content, not the menu);
// INITIALIZE BATTLE starts a match only.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(1500);
  const profile = document.getElementById("profile-overlay");
  const menu = document.getElementById("start-menu");
  const game = window.game;

  // 1. PROFILE button -> profile opens, VISIBLY on top, battle does NOT start
  document.getElementById("btn-menu-profile").click();
  await sleep(500);
  !profile.classList.contains("hidden")
    ? ok("PROFILE button opens the profile overlay")
    : bad("profile overlay did not open");
  game.state === "playing"
    ? bad("PROFILE button started a battle")
    : ok("PROFILE button did NOT start a battle");
  menu.classList.contains("hidden")
    ? ok("start menu is hidden behind the profile page")
    : bad("start menu still visible");

  // The real-visibility check: at the overlay's center the topmost element
  // must belong to the profile (z-order proof — catches z-index regressions).
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const top = document.elementFromPoint(cx, cy);
  top && profile.contains(top)
    ? ok("profile is the TOPMOST layer at screen center (z-order correct)")
    : bad(`something else is on top: ${top ? top.id || top.className : "null"}`);

  document.getElementById("btn-profile-close").click();
  await sleep(300);
  profile.classList.contains("hidden") ? ok("profile closes") : bad("profile did not close");
  !menu.classList.contains("hidden")
    ? ok("start menu returns after closing the profile")
    : bad("menu did not return");

  // 2. INITIALIZE BATTLE -> battle starts, profile stays closed
  document.getElementById("btn-menu-play").click();
  await sleep(1200);
  game.state === "playing"
    ? ok("INITIALIZE BATTLE starts a battle (state=playing)")
    : bad(`battle did not start (state=${game.state})`);
  profile.classList.contains("hidden")
    ? ok("INITIALIZE BATTLE did NOT open the profile")
    : bad("INITIALIZE BATTLE opened the profile");

  return out.join("\n");
})();
