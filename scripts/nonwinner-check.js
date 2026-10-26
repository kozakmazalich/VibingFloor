(async () => {
  const out = [];
  const g = window.game;
  if (!g) return "no game";

  // 10 fighters → winnerCount 3. Eliminate the player EARLY so it places 10th
  // (not in top-3) → isPlayerWinner must be false, winnerId 2.
  g.setBotCount(9);
  g.goToMenu();
  g.startGame();
  await new Promise((r) => setTimeout(r, 150));

  let captured = null;
  const prevCb = g.ui.onRoundEnd;
  g.ui.onRoundEnd = (o) => { captured = o; if (prevCb) prevCb(o); };

  // Drop the player straight away → placement 10 of 10.
  g.p1.pos.y = -20;
  g.p1.state = "falling";
  const tick = async () => { g.update(1/60); await new Promise(r=>setTimeout(r,0)); };
  for (let i = 0; i < 10; i++) await tick();

  // Now eliminate remaining 9 bots over time so the round concludes.
  let guard = 0;
  while (g.state === "playing" && guard < 400) {
    const aliveBots = g.bots.filter((b) => b.state === "alive");
    if (aliveBots.length > 1) {
      // drop one bot per few ticks
      aliveBots[0].pos.y = -20; aliveBots[0].state = "falling";
    } else if (aliveBots.length === 1) {
      // leave the last bot standing as the sole survivor isn't needed — drop it too
      // actually to end we need <=1 remaining; drop the last bot to force a draw? No.
      // Keep iterating: the round ends when <=1 alive. Drop all but one then drop the last.
      aliveBots[0].pos.y = -20; aliveBots[0].state = "falling";
    }
    await tick(); guard++;
  }

  if (captured) {
    out.push("place=" + captured.placement + "/" + captured.totalFighters + " isWinner=" + captured.isPlayerWinner + " winnerId=" + captured.winnerId);
  } else {
    out.push("no capture (state=" + g.state + ")");
  }
  out.push("winnerCount=" + g.winnerCountThisRound());

  return "NONWIN: " + out.join(" | ");
})();
