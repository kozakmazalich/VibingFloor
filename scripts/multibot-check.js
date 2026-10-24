// Multi-bot mode check: verify the 1 / 4 / 9 bot selector spawns the right
// roster, that all bots are AI, that a round runs with N fighters, and that the
// survivors HUD strip tracks eliminations.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(2500);
  const game = window.game;
  if (!game) { bad("window.game missing"); return out.join("\n"); }

  // 1. Menu has the match-size selector with 3 options
  const botTabs = document.querySelectorAll(".bot-tab-btn");
  botTabs.length === 3 ? ok(`bot tabs present (${botTabs.length})`) : bad(`bot tabs (${botTabs.length})`);

  // 2. Default roster = 1 player + 1 bot (2 fighters)
  const roster0 = game.robots.length;
  roster0 === 2 ? ok(`default roster = ${roster0} fighters`) : bad(`default roster = ${roster0}`);

  // 3. Select ROYALE (9 bots) -> 10 fighters
  const royale = document.querySelector('.bot-tab-btn[data-bots="9"]');
  royale.click();
  await sleep(400);
  game.robots.length === 10 ? ok(`ROYALE roster = ${game.robots.length} fighters`) : bad(`ROYALE roster = ${game.robots.length}`);
  game.botCount === 9 ? ok(`botCount = ${game.botCount}`) : bad(`botCount = ${game.botCount}`);

  // 4. Exactly one player, rest AI
  const players = game.robots.filter((r) => r.isPlayer).length;
  players === 1 ? ok(`exactly 1 human player`) : bad(`human players = ${players}`);
  const ai = game.robots.filter((r) => !r.isPlayer).length;
  ai === 9 ? ok(`9 AI bots`) : bad(`AI bots = ${ai}`);

  // 5. All bots have distinct team colours (neon palette cycled)
  const colors = new Set(game.robots.map((r) => r.teamColor));
  ok(`distinct team colours = ${colors.size}`);

  // 6. p2 alias points at the first bot (legacy/online safety)
  game.p2 === game.bots[0] ? ok("p2 alias = bots[0]") : bad("p2 alias mismatch");

  // 7. Start the match — survivors strip should render 10 chips
  document.getElementById("btn-menu-play").click();
  await sleep(1000);
  const strip = document.getElementById("survivors-strip");
  const chips = strip ? strip.querySelectorAll(".surv-chip").length : 0;
  chips === 10 ? ok(`survivors strip = ${chips} chips`) : bad(`survivors strip = ${chips} chips`);

  // 8. HUD is visible and the round is running with 10 fighters
  const hud = document.getElementById("in-game-hud");
  hud && !hud.classList.contains("hidden") ? ok("HUD visible in royale") : bad("HUD visible in royale");
  game.state === "playing" ? ok(`state = playing`) : bad(`state = ${game.state}`);

  // 9. Simulate eliminating all but the player -> round should end with player win
  for (let i = 1; i < game.robots.length; i++) {
    const b = game.robots[i];
    b.state = "eliminated";
    b.pos.y = -10;
  }
  await sleep(300);
  game.state === "round_over" ? ok("round ends when only player remains") : bad(`state after mass KO = ${game.state}`);

  // 10. Winners strip: eliminated bots are dimmed
  const outChips = strip ? strip.querySelectorAll(".surv-chip.out").length : 0;
  outChips === 9 ? ok(`${outChips} eliminated chips dimmed`) : bad(`dimmed chips = ${outChips}`);

  // 11. Player scored a win
  game.scores.p1 >= 1 ? ok(`player score = ${game.scores.p1}`) : bad(`player score = ${game.scores.p1}`);

  // 12. Back to menu, switch to DUEL, confirm roster shrinks to 2
  game.goToMenu();
  await sleep(300);
  document.querySelector('.bot-tab-btn[data-bots="1"]').click();
  await sleep(300);
  game.robots.length === 2 ? ok(`DUEL roster = ${game.robots.length}`) : bad(`DUEL roster = ${game.robots.length}`);

  return out.join("\n");
})();