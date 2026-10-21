// Profile demo check: open the profile, verify the random robot avatar,
// claim 1M $VIB, advance a day, stake 1M (overlay hides while the 3D vault
// plays), and verify a tier-coloured stock card lands in the grid.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  const num = (s) => parseInt(s.replace(/[^0-9]/g, ""), 10) || 0;

  await sleep(1500);
  document.getElementById("btn-menu-profile").click();
  await sleep(500);
  const overlay = document.getElementById("profile-overlay");
  !overlay.classList.contains("hidden") ? ok("profile overlay opens") : bad("profile overlay hidden");

  const avatar = document.getElementById("profile-avatar").src;
  /assets\/(robot[1-5]_portrait\.png|meta\.jpg)$/.test(avatar)
    ? ok(`random robot portrait shown (${avatar.split("/").pop()})`)
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
  hold1 !== hold0 ? ok(`next day: ${hold0} -> ${hold1}`) : bad("hold time did not advance");

  const staked0 = num(document.getElementById("profile-staked").textContent);
  const cards0 = document.querySelectorAll("#profile-cards .stock-card").length;
  document.getElementById("btn-demo-stake").click();
  await sleep(300);
  const staked1 = num(document.getElementById("profile-staked").textContent);
  staked1 - staked0 === 1000000
    ? ok(`staked +1,000,000 (${staked0} -> ${staked1})`)
    : bad(`stake wrong (${staked0} -> ${staked1})`);
  overlay.classList.contains("hidden")
    ? ok("profile hides while the 3D vault plays")
    : bad("profile still visible during the vault");

  // Vault: 2.5s reactor + 0.8s implode + 4.3s reveal + 0.4s fade
  let cardCount = cards0;
  for (let i = 0; i < 70; i++) {
    await sleep(200);
    cardCount = document.querySelectorAll("#profile-cards .stock-card").length;
    if (cardCount > cards0) break;
  }
  cardCount > cards0
    ? ok(`stock card collected after the vault (${cards0} -> ${cardCount})`)
    : bad(`no stock card after 14s (${cardCount})`);
  !overlay.classList.contains("hidden")
    ? ok("profile reopens after the vault")
    : bad("profile did not reopen");

  document.getElementById("btn-profile-close").click();
  await sleep(150);
  overlay.classList.contains("hidden") ? ok("profile closes") : bad("profile did not close");
  return out.join("\n");
})();
