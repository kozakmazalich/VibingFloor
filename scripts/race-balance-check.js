// VIBER RACE balance sim: for each bot difficulty, run a 10-racer race with
// the player parked at the start and report bot finish times, respawns and
// jetpack usage. Fixed-dt stepping (independent of headless frame rate).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  for (let i = 0; i < 80 && !(window.game && window.game.island); i++) await sleep(100);
  const g = window.game;
  if (!g) return "FAIL: no window.game";
  for (let i = 0; i < 100 && g._arenaBusy; i++) await sleep(50);

  for (const difficulty of ["easy", "normal", "hard"]) {
    g.goToMenu();
    g.startRace({ racers: 10, difficulty });
    const race = g.race;
    const p = g.p1;
    const respawns = new Map();
    const orig = race.respawn.bind(race);
    race.respawn = (rc) => {
      respawns.set(rc.robot.id, (respawns.get(rc.robot.id) || 0) + 1);
      return orig(rc);
    };
    const jetUsers = new Set();
    const skyway = new Set();
    const gapJet = new Set();
    const LIMIT = 240;
    for (let i = 0; i < LIMIT * 60; i++) {
      g.update(1 / 60);
      for (const rc of race.racers) {
        if (rc.isPlayer) continue;
        const r = rc.robot;
        if (r.jetpackBurn > 0) jetUsers.add(r.id);
        if (r.isGrounded && r.pos.y > 2.9 && r.pos.x > 5.5) skyway.add(r.id);
        if (rc.jetMode && -r.pos.z > 147 && -r.pos.z < 154) gapJet.add(r.id);
      }
      p.pos.set(0, 0, 2);
      p.vel.set(0, 0);
      if (race.finishOrder.filter((rc) => !rc.isPlayer).length === race.racers.length - 1) break;
      if (i % 600 === 599) await sleep(0);
    }
    race.respawn = orig;
    const bots = race.racers.filter((rc) => !rc.isPlayer);
    const times = race.finishOrder.filter((rc) => !rc.isPlayer).map((rc) => rc.finishTime.toFixed(0));
    const stuck = bots.filter((rc) => !rc.finished).map((rc) => `${rc.robot.name}@s${(-rc.robot.pos.z).toFixed(0)}`);
    const totalRespawns = [...respawns.values()].reduce((a, b) => a + b, 0);
    out.push(
      `${difficulty.toUpperCase()}: finished ${times.length}/${bots.length} in [${times.join(", ")}]s; ` +
        `respawns=${totalRespawns}; jetpack users=${jetUsers.size}; gap-jet=${gapJet.size}; skyway=${skyway.size}` +
        (stuck.length ? `; NOT FINISHED: ${stuck.join(" ")}` : "")
    );
  }
  g.goToMenu();
  return out.join("\n");
})();
