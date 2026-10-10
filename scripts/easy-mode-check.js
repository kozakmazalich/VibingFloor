// Easy-mode smoke check: select EASY difficulty, start a match and let the
// timid CPU play for a while. Verifies the gated AI branch runs without
// errors (the aggressive per-frame branch is covered by boot-check on NORMAL).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(2500);

  const easyBtn = document.querySelectorAll(".diff-tab-btn")[0];
  if (!easyBtn) {
    bad("difficulty tabs missing");
    return out.join("\n");
  }
  easyBtn.click();
  await sleep(250);
  const activeLabel = document.querySelector(".diff-tab-btn.active .tab-name");
  activeLabel && activeLabel.textContent.includes("EASY")
    ? ok("easy difficulty selected")
    : bad(`easy not selected (${activeLabel && activeLabel.textContent})`);

  document.getElementById("btn-menu-play").click();
  await sleep(9000); // ~3+ combat decision windows on EASY

  const hud = document.getElementById("in-game-hud");
  !hud.classList.contains("hidden") ? ok("easy match running") : bad("HUD hidden");
  const p2 = document.getElementById("hud-p2-name").textContent;
  out.push(`vs ${p2}`);

  return out.join("\n");
})();
