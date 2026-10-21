// Profile flow check: open the profile, verify the 3D vault is live, stake
// (the sphere cluster grows), claim (implosion -> stock card), next day.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  const num = (s) => parseInt(s.replace(/[^0-9]/g, ""), 10) || 0;

  await sleep(1500);
  const { getVaultDebug } = await import("/src/stakingVault.js");

  document.getElementById("btn-menu-profile").click();
  await sleep(600);
  const overlay = document.getElementById("profile-overlay");
  !overlay.classList.contains("hidden") ? ok("profile overlay opens") : bad("profile overlay hidden");

  const viewport = document.getElementById("staking-viewport");
  const rect = viewport.getBoundingClientRect();
  rect.width > 50 && rect.height > 50
    ? ok(`3D vault viewport present (${rect.width.toFixed(0)}x${rect.height.toFixed(0)})`)
    : bad(`viewport missing/too small (${rect.width}x${rect.height})`);

  const dbg0 = getVaultDebug();
  dbg0.active && dbg0.phase === "IDLE"
    ? ok(`vault live (phase=${dbg0.phase}, spheres=${dbg0.sphereCount})`)
    : bad(`vault not active (${JSON.stringify(dbg0)})`);

  const avatar = document.getElementById("profile-avatar").src;
  /assets\/(robot[1-5]_portrait\.png|meta\.jpg)$/.test(avatar)
    ? ok(`random robot portrait (${avatar.split("/").pop()})`)
    : bad(`avatar wrong (${avatar})`);

  const vib0 = num(document.getElementById("profile-vib").textContent);
  document.getElementById("btn-demo-claim").click();
  await sleep(150);
  const vib1 = num(document.getElementById("profile-vib").textContent);
  vib1 - vib0 === 1000000
    ? ok(`claim +1,000,000 $VIB (${vib0} -> ${vib1})`)
    : bad(`claim wrong (${vib0} -> ${vib1})`);

  const hold0 = document.getElementById("profile-hold").textContent;
  document.getElementById("btn-demo-nextday").click();
  await sleep(150);
  const hold1 = document.getElementById("profile-hold").textContent;
  hold1 !== hold0 ? ok(`next day: ${hold0} -> ${hold1}`) : bad("hold did not advance");

  // STAKE -> the reactive 3D cluster grows
  const spheresBefore = getVaultDebug().sphereCount;
  document.getElementById("btn-demo-stake").click();
  await sleep(500);
  const dbg1 = getVaultDebug();
  dbg1.sphereCount > spheresBefore
    ? ok(`sphere cluster grew with the stake (${spheresBefore} -> ${dbg1.sphereCount})`)
    : bad(`cluster did not react (${spheresBefore} -> ${dbg1.sphereCount})`);

  // CLAIM (staked now) -> implosion -> reveal -> card collected
  const cards0 = document.querySelectorAll("#profile-cards .stock-card").length;
  document.getElementById("btn-demo-claim").click();
  await sleep(400);
  const dbg2 = getVaultDebug();
  dbg2.phase === "IMPLODING" || dbg2.phase === "REVEALING"
    ? ok(`claim triggers the implosion/reveal (phase=${dbg2.phase})`)
    : bad(`claim did not trigger (phase=${dbg2.phase})`);

  let cardCount = cards0;
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    cardCount = document.querySelectorAll("#profile-cards .stock-card").length;
    if (cardCount > cards0) break;
  }
  cardCount > cards0
    ? ok(`stock card collected (${cards0} -> ${cardCount})`)
    : bad(`no stock card after 8s (${cardCount})`);
  getVaultDebug().phase === "IDLE"
    ? ok("vault returns to the idle reactor after the claim")
    : bad(`vault stuck in ${getVaultDebug().phase}`);

  document.getElementById("btn-profile-close").click();
  await sleep(300);
  overlay.classList.contains("hidden") ? ok("profile closes") : bad("profile did not close");
  getVaultDebug().active === false
    ? ok("vault deactivates when the profile closes")
    : bad("vault still active after close");

  return out.join("\n");
})();
