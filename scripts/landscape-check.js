// Landscape layout probe: verify the cooldown panel does not overlap the
// touch action buttons on a short landscape phone viewport.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  await sleep(2500);
  document.getElementById("btn-menu-play").click();
  await sleep(1500);

  const vw = window.innerWidth, vh = window.innerHeight;
  out.push(`viewport: ${vw}x${vh}`);

  const panel = document.querySelector(".island-status").getBoundingClientRect();
  const actions = document.querySelector(".touch-actions").getBoundingClientRect();
  const joy = document.querySelector(".touch-joystick").getBoundingClientRect();
  out.push(`panel: left=${Math.round(panel.left)} top=${Math.round(panel.top)} right=${Math.round(panel.right)} bottom=${Math.round(panel.bottom)}`);
  out.push(`actions: top=${Math.round(actions.top)} bottom=${Math.round(actions.bottom)} right=${Math.round(actions.right)}`);
  out.push(`joystick: top=${Math.round(joy.top)} bottom=${Math.round(joy.bottom)} left=${Math.round(joy.left)}`);

  const panelOverlap = panel.bottom > actions.top;
  const actionsOverflow = actions.right > vw + 1;
  out.push(panelOverlap ? "FAIL: panel overlaps touch actions" : "OK: panel clears touch actions");
  out.push(actionsOverflow ? "FAIL: touch actions overflow right" : "OK: touch actions inside viewport");
  out.push(joy.left >= 0 ? "OK: joystick inside viewport" : "FAIL: joystick clipped left");
  return out.join("\n");
})();
