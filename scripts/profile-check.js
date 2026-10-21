// Profile flow: CLAIM only credits $VIB. The safe opens from the button
// under the reactor. Closing that vault (✕) delivers the RWA card.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);
  const num = (s) => parseInt(String(s).replace(/[^0-9]/g, ""), 10) || 0;

  await sleep(1500);

  document.getElementById("btn-menu-profile").click();
  await sleep(700);
  const overlay = document.getElementById("profile-overlay");
  !overlay.classList.contains("hidden") ? ok("profile overlay opens") : bad("profile overlay hidden");

  const canvasEl = document.getElementById("staking-canvas");
  const rect = canvasEl.getBoundingClientRect();
  rect.width > 50 && rect.height > 50
    ? ok(`3D vault canvas present (${rect.width.toFixed(0)}x${rect.height.toFixed(0)})`)
    : bad(`canvas missing/too small (${rect.width}x${rect.height})`);
  {
    const cs = getComputedStyle(canvasEl);
    const framed = cs.borderTopStyle !== "none" && parseFloat(cs.borderTopWidth) > 0;
    const glow = cs.boxShadow && cs.boxShadow !== "none";
    !framed && !glow
      ? ok("animation has no frame")
      : bad(`animation still framed (border ${cs.borderTopWidth} ${cs.borderTopStyle}, shadow ${cs.boxShadow})`);
  }
  canvasEl.dataset.orbitSpheres === "0"
    ? ok("no orbit spheres before staking")
    : bad(`orbit spheres before staking: ${canvasEl.dataset.orbitSpheres}`);

  const openBtn = document.getElementById("vibVaultActionBtn");
  if (!openBtn) {
    bad("open-safe button missing under the reactor");
  } else {
    const br = openBtn.getBoundingClientRect();
    const under = br.top >= rect.bottom - 8 && br.height >= 40;
    const inVault = openBtn.closest(".profile-vault") === canvasEl.parentElement;
    under && inVault
      ? ok(`open control under the reactor (btn.top ${br.top.toFixed(0)} >= canvas.bottom ${rect.bottom.toFixed(0)})`)
      : bad(`open control not under the canvas (btn ${br.top.toFixed(0)},${br.height.toFixed(0)} canvas.bottom ${rect.bottom.toFixed(0)} inVault=${inVault})`);
    openBtn.textContent.includes("OPEN SAFE")
      ? ok("open button is the safe opener")
      : bad(`open button label wrong (${openBtn.textContent})`);
  }

  {
    const { updateStakingVault } = await import("/src/stakingVault.js");
    updateStakingVault(performance.now());
    const gl = canvasEl.getContext("webgl2") || canvasEl.getContext("webgl");
    const W = canvasEl.width, H = canvasEl.height;
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let colored = 0;
    for (let i = 0; i < W * H; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      if (r > 60 || g > 60 || b > 60) colored++;
    }
    const pct = (colored / (W * H) * 100).toFixed(1);
    colored / (W * H) > 0.015
      ? ok(`3D sphere cluster renders (${pct}% coloured pixels)`)
      : bad(`canvas looks empty (${pct}% coloured pixels, buffer ${W}x${H})`);
    const corner = px[0] + px[1] + px[2];
    corner < 30
      ? ok(`animation background is black (corner ${corner})`)
      : bad(`animation background is not black (corner ${corner})`);
  }

  const avatar = document.getElementById("profile-avatar").src;
  /assets\/(robot[1-5]_portrait\.png|meta\.jpg)$/.test(avatar)
    ? ok(`random robot portrait (${avatar.split("/").pop()})`)
    : bad(`avatar wrong (${avatar})`);

  const cards0 = document.querySelectorAll("#profile-cards .stock-card").length;
  const label0 = openBtn ? openBtn.textContent : "";
  const vib0 = num(document.getElementById("profile-vib").textContent);
  document.getElementById("btn-demo-claim").click();
  await sleep(200);
  const vib1 = num(document.getElementById("profile-vib").textContent);
  vib1 - vib0 === 1000000
    ? ok(`claim +1,000,000 $VIB (${vib0} -> ${vib1})`)
    : bad(`claim wrong (${vib0} -> ${vib1})`);
  const cardsAfterClaim = document.querySelectorAll("#profile-cards .stock-card").length;
  cardsAfterClaim === cards0 && openBtn && openBtn.textContent === label0
    ? ok("claim does not open the safe")
    : bad(`claim changed the vault (cards ${cards0}->${cardsAfterClaim}, label ${label0} -> ${openBtn && openBtn.textContent})`);

  const hold0 = document.getElementById("profile-hold").textContent;
  document.getElementById("btn-demo-nextday").click();
  await sleep(150);
  const hold1 = document.getElementById("profile-hold").textContent;
  hold1 === hold0
    ? ok("next day is a no-op without a vault")
    : bad(`hold advanced with no vault (${hold0} -> ${hold1})`);

  // OPEN THE VAULT — 1M minimum, then the 24h lock starts at 0h.
  const staked0 = num(document.getElementById("profile-staked").textContent);
  document.getElementById("btn-demo-stake").click();
  await sleep(200);
  const staked1 = num(document.getElementById("profile-staked").textContent);
  staked1 - staked0 === 1000000
    ? ok(`stake +1,000,000 (${staked0} -> ${staked1})`)
    : bad(`stake wrong (${staked0} -> ${staked1})`);
  canvasEl.dataset.orbitSpheres === "1"
    ? ok("1M staked shows 1 orbit sphere")
    : bad(`orbit spheres after 1M: ${canvasEl.dataset.orbitSpheres}`);
  document.getElementById("profile-hold").textContent === "0h" &&
  document.getElementById("profile-hold-tier").textContent === "x1.00"
    ? ok("vault opens locked at 0h / x1.00 luck")
    : bad(`vault lock wrong (${document.getElementById("profile-hold").textContent}, ${document.getElementById("profile-hold-tier").textContent})`);

  const stakeSlider = document.getElementById("stake-amount");
  Number(stakeSlider.min) === 1000000
    ? ok("minimum stake is 1,000,000")
    : bad(`stake minimum is ${stakeSlider.min}`);
  stakeSlider.value = "500000";
  stakeSlider.dispatchEvent(new Event("input"));
  const snapped = document.querySelector("#btn-demo-stake .btn-text").textContent;
  snapped.includes("1,000,000")
    ? ok("stake below 1,000,000 snaps up to the minimum")
    : bad(`stake below minimum was accepted (${snapped})`);
  stakeSlider.value = "1500000";
  stakeSlider.dispatchEvent(new Event("input"));
  const stakeLabel = document.querySelector("#btn-demo-stake .btn-text").textContent;
  stakeLabel.includes("TOP UP") && stakeLabel.includes("1,500,000")
    ? ok("a second deposit is a top-up, not a new vault")
    : bad(`top-up label wrong (${stakeLabel})`);

  const chargeSlider = document.getElementById("vibVaultChargeSlider");
  const econHold = document.getElementById("vibVaultEconHold");
  const econLuck = document.getElementById("vibVaultEconLuck");
  const econBadge = document.getElementById("vibVaultEconBadge");

  document.getElementById("btn-demo-nextday").click();
  await sleep(150);
  document.getElementById("profile-hold").textContent === "1d" &&
  document.getElementById("profile-hold-tier").textContent === "x1.00"
    ? ok("24h effective hold is still x1.00 luck")
    : bad(`24h tier wrong (${document.getElementById("profile-hold").textContent}, ${document.getElementById("profile-hold-tier").textContent})`);
  Math.abs(parseFloat(chargeSlider.value) - 1) < 0.05
    ? ok("orbit charge 1 at 24h")
    : bad(`orbit charge at 24h: ${chargeSlider.value}`);

  document.getElementById("btn-demo-nextday").click();
  await sleep(120);
  Math.abs(parseFloat(chargeSlider.value) - 2) < 0.05 && chargeSlider.min === "1" && chargeSlider.max === "7"
    ? ok(`orbit charge follows 2 staked days (${chargeSlider.value})`)
    : bad(`orbit charge wrong at 2 days (${chargeSlider.value}, range ${chargeSlider.min}-${chargeSlider.max})`);

  for (let i = 0; i < 5; i++) document.getElementById("btn-demo-nextday").click();
  await sleep(120);
  document.getElementById("profile-hold-tier").textContent === "x5.00"
    ? ok("168h effective hold reaches x5.00 luck")
    : bad(`luck at 168h is ${document.getElementById("profile-hold-tier").textContent}`);
  Math.abs(parseFloat(chargeSlider.value) - 7) < 0.05
    ? ok("orbit charge caps at 7 days")
    : bad(`orbit charge did not cap at 7 (${chargeSlider.value})`);
  econHold.textContent === "168h" && econLuck.textContent === "5.00x"
    ? ok("vault HUD shows 168h / 5.00x")
    : bad(`vault HUD wrong (${econHold.textContent}, ${econLuck.textContent})`);
  econBadge.style.display === "none"
    ? ok("no pure-max badge on a 1M stake")
    : bad(`pure-max badge shown at 1M (${econBadge.style.display})`);

  // TOP-UP DILUTION — 1M added to 1M held 168h => 84h effective.
  const hudStake = document.getElementById("vibVaultStakeSlider");
  const topUpBtn = document.getElementById("vibVaultTopUpBtn");
  hudStake.value = "1000000";
  hudStake.dispatchEvent(new Event("input"));
  topUpBtn.click();
  await sleep(200);
  const stakedAfterTopUp = num(document.getElementById("profile-staked").textContent);
  stakedAfterTopUp === staked1 + 1000000
    ? ok(`top-up +1,000,000 (${staked1} -> ${stakedAfterTopUp})`)
    : bad(`top-up wrong (${staked1} -> ${stakedAfterTopUp})`);
  document.getElementById("profile-hold").textContent === "84h"
    ? ok("weighted top-up dilutes effective hold 168h -> 84h")
    : bad(`diluted hold is ${document.getElementById("profile-hold").textContent}`);
  document.getElementById("profile-hold-tier").textContent === "x2.00"
    ? ok("diluted luck drops 5.00x -> 2.00x")
    : bad(`diluted luck is ${document.getElementById("profile-hold-tier").textContent}`);
  econHold.textContent === "84h" && econLuck.textContent === "2.00x"
    ? ok("vault HUD mirrors the diluted hold and luck")
    : bad(`vault HUD did not follow dilution (${econHold.textContent}, ${econLuck.textContent})`);

  // Same-vault top-up again: 2M @ 84h + 1.5M => 48h effective.
  const stakedMid = num(document.getElementById("profile-staked").textContent);
  document.getElementById("btn-demo-stake").click();
  await sleep(200);
  const stakedHalf = num(document.getElementById("profile-staked").textContent);
  stakedHalf - stakedMid === 1500000
    ? ok(`slider top-up +1,500,000 (${stakedMid} -> ${stakedHalf})`)
    : bad(`slider top-up wrong (${stakedMid} -> ${stakedHalf})`);
  canvasEl.dataset.orbitSpheres === "6"
    ? ok("3.5M staked shows 6 orbit spheres")
    : bad(`orbit spheres after 3.5M: ${canvasEl.dataset.orbitSpheres}`);

  {
    const { isGenesisLock, luckMultiplier, weightedEffectiveHold } = await import("/src/staking.js");
    isGenesisLock(10_000_000, true) && !isGenesisLock(10_000_000, false)
      ? ok("pure 10M upfront qualifies for genesis lock")
      : bad("genesis lock detection wrong");
    Math.abs(luckMultiplier(24, 10_000_000, true) - 1.15) < 1e-9 &&
    Math.abs(luckMultiplier(24, 10_000_000, false) - 1) < 1e-9
      ? ok("genesis +15% luck applies only to a pure upfront max stake")
      : bad("genesis luck multiplier wrong");
    Math.abs(weightedEffectiveHold(2_000_000, 60, 2_000_000) - 30) < 1e-9
      ? ok("weighted top-up: 2M @ 60h + 2M = 30h effective")
      : bad(`weighted hold wrong (${weightedEffectiveHold(2_000_000, 60, 2_000_000)})`);
  }
  const overlayBg = getComputedStyle(document.getElementById("profile-overlay")).backgroundColor;
  const panelBg = getComputedStyle(document.querySelector(".profile-panel")).backgroundColor;
  overlayBg === "rgb(0, 0, 0)" && panelBg === "rgb(0, 0, 0)"
    ? ok("pilot profile background is black")
    : bad(`profile background not black (overlay ${overlayBg}, panel ${panelBg})`);

  const page = document.querySelector(".profile-card");
  page && page.scrollWidth <= page.clientWidth + 1
    ? ok("no horizontal scroll")
    : bad(`horizontal scroll (${page && page.scrollWidth} > ${page && page.clientWidth})`);

  if (openBtn) {
    const select = document.getElementById("vibVaultTickerSelect");
    select.value = "MSFT";
    select.dispatchEvent(new Event("change"));
    const vibBeforeOpen = num(document.getElementById("profile-vib").textContent);
    openBtn.click();
    await sleep(250);
    /[А-Яа-яЁё]/.test(document.querySelector(".staking-vault-hud").textContent)
      ? bad("vault controls still contain Russian text")
      : ok("vault controls are in English");
    openBtn.textContent.includes("SINGULARITY") || openBtn.textContent.includes("RETURN")
      ? ok(`open button starts the safe (${openBtn.textContent})`)
      : bad(`open button did not start the safe (${openBtn.textContent})`);

    await sleep(100);
    const wonEarly = document.querySelectorAll("#profile-cards .stock-card").length;
    wonEarly === cards0 + 1
      ? ok("won card is saved in WON RWA EQUITY as soon as the safe opens")
      : bad(`won card was not collected on open (${cards0} -> ${wonEarly})`);
    num(document.getElementById("profile-staked").textContent) === 0
      ? ok("opening the card burns the stake")
      : bad(`stake was not burnt (${document.getElementById("profile-staked").textContent})`);
    document.getElementById("profile-hold").textContent === "0h"
      ? ok("hold resets to 0h for the next cycle")
      : bad(`hold did not reset (${document.getElementById("profile-hold").textContent})`);
    num(document.getElementById("profile-vib").textContent) === vibBeforeOpen
      ? ok("burn leaves free $VIB")
      : bad(`burn changed free $VIB (${vibBeforeOpen} -> ${document.getElementById("profile-vib").textContent})`);

    const closeVault = document.getElementById("vibVaultCloseBtn");
    closeVault.click();
    let cardCount = cards0;
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      cardCount = document.querySelectorAll("#profile-cards .stock-card").length;
      if (cardCount > cards0) break;
    }
    cardCount === cards0 + 1
      ? ok(`one won card stays in the collection (${cardCount})`)
      : bad(`expected one collected card, got ${cardCount}`);
    const saved = document.querySelector("#profile-cards .stock-card");
    const savedTicker = saved && saved.querySelector(".stock-ticker").textContent;
    const savedName = saved && saved.querySelector(".stock-name").textContent;
    savedTicker === "$MSFT" && savedName === "MICROSOFT CORP."
      ? ok("Microsoft saves as an equity card ($MSFT)")
      : bad(`Microsoft card wrong (${savedTicker} ${savedName})`);
    let back = document.getElementById("vibVaultActionBtn");
    for (let i = 0; i < 15 && back && !back.textContent.includes("OPEN SAFE"); i++) {
      await sleep(200);
      back = document.getElementById("vibVaultActionBtn");
    }
    back && back.textContent.includes("OPEN SAFE")
      ? ok("reactor returns after the vault closes")
      : bad(`reactor did not return (${back && back.textContent})`);
  }

  const cardsBeforeHide = document.querySelectorAll("#profile-cards .stock-card").length;
  document.getElementById("btn-profile-close").click();
  await sleep(300);
  overlay.classList.contains("hidden") ? ok("profile closes") : bad("profile did not close");
  const cardsAfterHide = document.querySelectorAll("#profile-cards .stock-card").length;
  cardsAfterHide === cardsBeforeHide
    ? ok("profile close does not mint a card")
    : bad(`profile close minted a card (${cardsBeforeHide} -> ${cardsAfterHide})`);
  const hud = document.querySelector(".staking-vault-hud");
  !hud || getComputedStyle(hud).display === "none"
    ? ok("vault bar hides with the profile")
    : bad("vault bar still visible after profile close");

  // MAX PATH — a single 10M deposit keeps the pure-upfront +15% badge.
  document.getElementById("btn-menu-profile").click();
  await sleep(700);
  const claimBtn = document.getElementById("btn-demo-claim");
  for (let i = 0; i < 10; i++) claimBtn.click();
  await sleep(150);
  const maxStake = document.getElementById("vibVaultStakeSlider");
  const maxTopUp = document.getElementById("vibVaultTopUpBtn");
  maxStake.value = "10000000";
  maxStake.dispatchEvent(new Event("input"));
  maxTopUp.click();
  await sleep(250);
  num(document.getElementById("profile-staked").textContent) === 10000000
    ? ok("10M is accepted as the single-deposit maximum")
    : bad(`10M stake wrong (${document.getElementById("profile-staked").textContent})`);
  const maxBadge = document.getElementById("vibVaultEconBadge");
  maxBadge.style.display !== "none" && maxBadge.textContent.includes("+15%")
    ? ok("pure 10M deposit shows the +15% luck badge")
    : bad(`pure-max badge missing (${maxBadge.style.display})`);
  maxTopUp.disabled && /MAX CAP/.test(maxTopUp.textContent)
    ? ok("top-up locks at the 10M cap")
    : bad(`cap not enforced in the HUD (${maxTopUp.textContent}, disabled=${maxTopUp.disabled})`);
  document.getElementById("btn-demo-nextday").click();
  await sleep(150);
  document.getElementById("profile-hold-tier").textContent === "x1.15"
    ? ok("24h pure max luck is 1.15x")
    : bad(`pure max luck is ${document.getElementById("profile-hold-tier").textContent}`);
  document.getElementById("btn-profile-close").click();
  await sleep(200);

  return out.join("\n");
})();
