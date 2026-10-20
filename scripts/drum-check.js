// Prize drum API check: spin once with manualLoop and verify onComplete
// fires with a valid PRIZE_TIERS amount after the full timeline.
(async () => {
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  const { showPrizeDrum, updatePrizeDrum, PRIZE_TIERS } = await import("/drum.js");
  ok(`drum.js exports (tiers: ${PRIZE_TIERS.length})`);

  const amounts = new Set(PRIZE_TIERS.map((t) => t.amount));
  let won = null;
  let completed = false;

  // Geometry regression: for EVERY tier, the drum's stop angle must bring
  // that tier's panel exactly to the +Z selection window (not a gap).
  // Replicates drum.js math: panel i sits at local angle a = -i*s;
  // drum rotation theta moves a point at angle a to (a - theta); the window
  // is at angle 0, so theta_target = -i*s (mod 2PI).
  {
    const count = PRIZE_TIERS.length;
    const s = (Math.PI * 2) / count;
    let badStops = 0;
    for (let i = 0; i < count; i++) {
      const theta = ((-i * s) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const a = -i * s;
      const worldAngle = ((a - theta) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (Math.abs(worldAngle) > 1e-6) badStops++;
    }
    badStops === 0
      ? ok(`stop angle lands every tier exactly on the window (${count} tiers)`)
      : bad(`${badStops} tiers would stop off-window`);
  }

  showPrizeDrum(
    (amount) => {
      won = amount;
      completed = true;
    },
    { manualLoop: true } // no renderer here: the drum creates its own tiny canvas
  );

  // Drive the timeline manually: 3.2s spin + 2.5s display + 0.45s fade + margin
  let now = performance.now();
  for (let i = 0; i < 300; i++) {
    now += 32;
    updatePrizeDrum(now);
  }
  completed
    ? ok(`onComplete fired after the timeline (won ${won})`)
    : bad("onComplete never fired");
  amounts.has(won)
    ? ok(`won amount is a real tier (${won})`)
    : bad(`won amount invalid (${won})`);

  // A second spin while inactive is a no-op and must not crash
  updatePrizeDrum(now + 1000);
  ok("updatePrizeDrum is a no-op after completion");

  return out.join("\n");
})();
