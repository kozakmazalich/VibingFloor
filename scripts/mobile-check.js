// Mobile check for the real game page: runs under CDP phone emulation.
// Verifies the touch layer, joystick, action buttons and responsive layout.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(2500); // boot

  const vw = window.innerWidth, vh = window.innerHeight;
  out.push(`viewport: ${vw}x${vh} (dpr ${window.devicePixelRatio})`);

  // 1. Touch layer activated
  const isTouch = document.documentElement.classList.contains("touch-device");
  isTouch ? ok("touch-device class set") : bad("touch-device class set");

  // 2. 3D title + animated OO
  const title = document.querySelector(".title-3d");
  const oo = document.querySelector(".title-oo");
  if (!title || !oo) {
    bad("3D title markup");
  } else {
    const cs = getComputedStyle(oo);
    cs.animationName && cs.animationName !== "none"
      ? ok("OO animation running: " + cs.animationName)
      : bad("OO animation running: " + cs.animationName);
  }

  // 3. No horizontal overflow in the menu (tabs must shrink, not clip)
  const noOverflow = document.documentElement.scrollWidth <= vw + 1;
  noOverflow ? ok("no horizontal overflow (menu)") : bad("horizontal overflow (menu): " + document.documentElement.scrollWidth);

  // 3b. Tab rows must fit inside the menu card
  const card = document.querySelector(".start-card");
  const cardRight = card.getBoundingClientRect().right;
  let tabsFit = true;
  document.querySelectorAll(".fighter-tabs .char-tab-btn, .map-tabs .map-tab-btn, .diff-tabs .diff-tab-btn").forEach((b) => {
    if (b.getBoundingClientRect().right > cardRight + 1) tabsFit = false;
  });
  tabsFit ? ok("menu tabs fit the card") : bad("menu tabs clip beyond the card");

  // 4. Start the game
  document.getElementById("btn-menu-play").click();
  await sleep(1200);

  const touchUi = document.getElementById("touch-ui");
  const hudVisible = !document.getElementById("in-game-hud").classList.contains("hidden");
  const touchVisible = touchUi && getComputedStyle(touchUi).display !== "none";
  hudVisible ? ok("HUD visible") : bad("HUD visible");
  touchVisible ? ok("touch UI visible in game") : bad("touch UI visible in game");
  const noOverflow2 = document.documentElement.scrollWidth <= vw + 1;
  noOverflow2 ? ok("no horizontal overflow (game)") : bad("horizontal overflow (game): " + document.documentElement.scrollWidth);

  // 5. Joystick: pointer down + move -> knob tracks + movement keys pressed
  const joy = document.getElementById("touch-joystick");
  const knob = document.getElementById("joy-knob");
  const rect = joy.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const fire = (el, type, x, y) => {
    el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
      clientX: x, clientY: y,
    }));
  };
  fire(joy, "pointerdown", cx, cy);
  fire(joy, "pointermove", cx + 40, cy - 45); // push up-right
  await sleep(120);
  const knobMoved = knob.style.transform.includes("px");
  knobMoved ? ok("joystick knob tracks drag") : bad("joystick knob tracks drag");
  fire(joy, "pointerup", cx + 40, cy - 45);
  await sleep(120);

  // 6. PUSH touch button -> cooldown HUD reacts (READY -> charging)
  const pushStatus = document.getElementById("push-status-text");
  const before = pushStatus.textContent;
  const pushBtn = document.getElementById("touch-push");
  fire(pushBtn, "pointerdown", 0, 0);
  await sleep(350); // hold like a real thumb
  fire(pushBtn, "pointerup", 0, 0);
  await sleep(250);
  const after = pushStatus.textContent;
  out.push(`push status: "${before}" -> "${after}"`);
  before !== after ? ok("PUSH button triggers the ability") : bad("PUSH button triggers the ability");

  // 7. SPEAR touch button -> spear cooldown reacts
  const spearStatus = document.getElementById("spear-status-text");
  const sBefore = spearStatus.textContent;
  const spearBtn = document.getElementById("touch-spear");
  fire(spearBtn, "pointerdown", 0, 0);
  await sleep(350);
  fire(spearBtn, "pointerup", 0, 0);
  await sleep(250);
  const sAfter = spearStatus.textContent;
  sBefore !== sAfter ? ok("SPEAR button triggers the ability") : bad("SPEAR button triggers the ability");

  // 8. Pause via touch
  const pauseBtn = document.getElementById("touch-pause");
  fire(pauseBtn, "pointerdown", 0, 0);
  await sleep(300);
  const paused = !document.getElementById("pause-menu").classList.contains("hidden");
  paused ? ok("touch PAUSE opens pause menu") : bad("touch PAUSE opens pause menu");
  document.getElementById("btn-pause-resume").click();
  await sleep(300);

  return out.join("\n");
})();
