// Integrated drum test: spin on the REAL game renderer, driven by the real
// animate() loop (manualLoop:true). onComplete must fire within ~7s.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(1500);
  const { showPrizeDrum } = await import("/drum.js");
  const renderer = window.__renderer;
  if (!renderer) { bad("no window.__renderer"); return out.join("\n"); }

  let won = null;
  const t0 = performance.now();
  showPrizeDrum(
    (amount) => { won = amount; },
    { renderer, manualLoop: true }
  );

  let resolved = false;
  for (let i = 0; i < 90; i++) { // up to 9s of real time
    await sleep(100);
    if (won !== null) { resolved = true; break; }
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  resolved
    ? ok(`onComplete fired on the real renderer after ${secs}s (won ${won})`)
    : bad(`onComplete never fired (${secs}s)`);
  return out.join("\n");
})();
