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
