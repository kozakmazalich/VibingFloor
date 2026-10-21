// Button wiring verification: PROFILE opens the profile ONLY; INITIALIZE
// BATTLE starts a match ONLY (and never opens the profile).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(1500);
  const profile = document.getElementById("profile-overlay");
  const menu = document.getElementById("start-menu");
  const game = window.game;

  // 1. PROFILE button -> profile opens, battle does NOT start
  document.getElementById("btn-menu-profile").click();
  await sleep(400);
  !profile.classList.contains("hidden")
    ? ok("PROFILE button opens the profile overlay")
    : bad("profile overlay did not open");
  game.state === "playing"
    ? bad("PROFILE button started a battle")
    : ok("PROFILE button did NOT start a battle");
  !menu.classList.contains("hidden")
    ? ok("start menu still visible behind the profile")
    : bad("start menu unexpectedly hidden");

  document.getElementById("btn-profile-close").click();
  await sleep(300);
  profile.classList.contains("hidden") ? ok("profile closes") : bad("profile did not close");

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
