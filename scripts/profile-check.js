// Profile demo check: open the overlay, claim 1M $VIB, advance a day,
// stake 1M, wait for the 3D vault to finish, and verify a stock card lands
// in the inventory grid.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  const num = (s) => parseInt(s.replace(/[^0-9]/g, ""), 10) || 0;

  await sleep(1500);
  document.getElementById("btn-menu-profile").click();
  await sleep(400);
  const overlay = document.getElementById("profile-overlay");
  !overlay.classList.contains("hidden") ? ok("profile overlay opens") : bad("profile overlay hidden");

  const name = document.getElementById("profile-name").textContent;
  name.length > 0 ? ok(`robot shown: ${name}`) : bad("no robot name");

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
  hold1 !== hold0 ? ok(`next day: ${hold0} -> ${hold1}`) : bad("hold time did not advance");

  const staked0 = num(document.getElementById("profile-staked").textContent);
  const cards0 = document.querySelectorAll("#profile-cards .stock-card").length;
  document.getElementById("btn-demo-stake").click();
  await sleep(300);
  const staked1 = num(document.getElementById("profile-staked").textContent);
  staked1 - staked0 === 1000000
    ? ok(`staked +1,000,000 (${staked0} -> ${staked1})`)
    : bad(`stake wrong (${staked0} -> ${staked1})`);

  // The 3D vault runs its own RAF (implode 0.8s + reveal 3.5s + fade 0.4s)
  let cardCount = cards0;
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    cardCount = document.querySelectorAll("#profile-cards .stock-card").length;
    if (cardCount > cards0) break;
  }
  cardCount > cards0
    ? ok(`stock card collected after the vault (${cards0} -> ${cardCount})`)
    : bad(`no stock card after 12s (${cardCount})`);

  document.getElementById("btn-profile-close").click();
  await sleep(150);
  overlay.classList.contains("hidden") ? ok("profile closes") : bad("profile did not close");
  return out.join("\n");
})();
