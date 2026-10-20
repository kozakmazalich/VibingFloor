// Mobile camera gesture check: a two-finger touch drag on the canvas must
// ROTATE the camera (azimuth changes), not just zoom/pan.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(1500);
  document.getElementById("btn-menu-play").click();
  await sleep(1200);

  // Synthetic pointer events need a working setPointerCapture (OrbitControls
  // calls it on pointerdown; a no-op stub lets synthetic sequences through).
  const canvas = document.getElementById("game-canvas");
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};

  const cam = window.__camera || null;
  const readCam = () => {
    const c = window.__camera;
    if (!c) return null;
    return { x: c.position.x, y: c.position.y, z: c.position.z };
  };

  const before = readCam();
  if (!before) { bad("no window.__camera"); return out.join("\n"); }

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  function ptr(type, id, x, y) {
    canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: id,
      pointerType: "touch",
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      isPrimary: id === 1,
      bubbles: true,
      cancelable: true,
    }));
  }

  // Two fingers: both move left together (a rotate gesture, not a pinch)
  ptr("pointerdown", 1, cx + 30, cy);
  ptr("pointerdown", 2, cx - 30, cy);
  for (let i = 1; i <= 8; i++) {
    ptr("pointermove", 1, cx + 30 - i * 12, cy + i * 6);
    ptr("pointermove", 2, cx - 30 - i * 12, cy + i * 6);
    await sleep(16);
  }
  ptr("pointerup", 1, cx + 30 - 96, cy + 48);
  ptr("pointerup", 2, cx - 30 - 96, cy + 48);
  await sleep(300);

  const after = readCam();
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const dz = after.z - before.z;
  const distBefore = Math.hypot(before.x, before.y, before.z);
  const distAfter = Math.hypot(after.x, after.y, after.z);
  const orbitMoved = Math.abs(dx) + Math.abs(dz) > 0.15;
  const distDelta = Math.abs(distAfter - distBefore);
  ok(`camera delta: (${dx.toFixed(2)}, ${dy.toFixed(2)}, ${dz.toFixed(2)}), radius ${distBefore.toFixed(2)} -> ${distAfter.toFixed(2)}`);
  orbitMoved
    ? ok("two-finger gesture ROTATED the camera")
    : bad("camera did not rotate");
  ok(`radius delta ${distDelta.toFixed(2)} (zoom only when pinching)`);
  return out.join("\n");
})();
