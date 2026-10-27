// Menu planet stays up for the whole main menu. Maps enlarge in place:
// honeycomb keeps its ring, Twin Citadels keep their buildings, and a burst
// of tab clicks never leaves two arenas in the scene.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const fail = (m) => out.push("FAIL " + m);
  const ok = (m) => out.push("OK " + m);

  for (let i = 0; i < 80 && !(window.game && window.game.island); i++) await sleep(100);
  const game = window.game;
  if (!game) return "FAIL game never booted";

  const waitIdle = async () => {
    for (let i = 0; i < 160; i++) {
      if (!game._arenaBusy) return true;
      await sleep(50);
    }
    return false;
  };
  const planet = () => game.scene.getObjectByName("arena-loader-planet");
  const loaderHidden = () => {
    const el = document.getElementById("arena-loader");
    return !el || el.classList.contains("hidden");
  };
  const strayTiles = () => {
    const live = new Set(game.island.allTiles.map((t) => t.group));
    let n = 0;
    game.scene.traverse((o) => {
      if (o.userData && o.userData.isTile && !live.has(o)) n++;
    });
    return n;
  };
  const citadelMeshes = () => {
    let n = 0;
    game.scene.traverse((o) => {
      if (o.userData && o.userData.decorType === "citadel") n++;
    });
    return n;
  };
  const tabs = [...document.querySelectorAll(".map-tab-btn")];
  const bots = (n) => document.querySelector(`.bot-tab-btn[data-bots="${n}"]`).click();

  if (!(await waitIdle())) fail("boot load timed out");
  planet() && planet().visible ? ok("planet is visible on the idle menu") : fail("planet hidden on the idle menu");
  loaderHidden() ? ok("LOADING label hides once the menu is idle") : fail("LOADING label stuck after boot");
  game.state === "menu" ? ok("boot stays on the menu") : fail("state " + game.state);

  // 1v1 honeycomb — launched ring.
  tabs[3].click();
  if (!(await waitIdle())) fail("1v1 honeycomb load timed out");
  const duel = game.island.mapDef;
  const mask =
    duel.gridSize === 20 &&
    duel.isTileActive(0, 0) &&
    !duel.isTileActive(3, 3) &&
    duel.isTileActive(9, 9) &&
    duel.elevationAt(9, 9) === 4 &&
    duel.p1Spawn[0] === 1 &&
    game.island.allTiles.length === 208;
  mask ? ok("1v1 honeycomb is the launched ring (208 tiles)") : fail(`1v1 mask grid=${duel.gridSize} tiles=${game.island.allTiles.length}`);
  strayTiles() === 0 ? ok("no stray tiles after 1v1 honeycomb") : fail("stray tiles after 1v1 " + strayTiles());
  planet() && planet().visible ? ok("planet still visible after honeycomb settled") : fail("planet hid after honeycomb settled");

  // 5 and 10 fighters — same ring, bigger even grid, spire still in the middle.
  const expectRing = (label) => {
    const map = game.island.mapDef;
    const g = map.gridSize;
    const mid = (g - 1) / 2;
    let spire = false;
    let far = 0;
    for (let x = 0; x < g; x++) {
      for (let z = 0; z < g; z++) {
        if (!map.isTileActive(x, z) || map.elevationAt(x, z) !== 4) continue;
        spire = true;
        far = Math.max(far, Math.hypot(x - mid, z - mid));
      }
    }
    const lim = Math.floor(g * 0.35);
    let hole = false;
    for (let x = 0; x < lim && !hole; x++) {
      for (let z = 0; z < lim; z++) if (!map.isTileActive(x, z)) hole = true;
    }
    const good = g % 2 === 0 && g > 20 && map.isTileActive(0, 0) && hole && spire && far < g * 0.28;
    good
      ? ok(`${label} honeycomb ${g}x${g} tiles=${game.island.allTiles.length} spireR=${far.toFixed(1)}`)
      : fail(`${label} grid=${g} hole=${hole} spire=${spire} far=${far.toFixed(1)} tiles=${game.island.allTiles.length}`);
  };
  bots(4);
  if (!(await waitIdle())) fail("5p load timed out");
  expectRing("5p");
  const g5 = game.island.mapDef.gridSize;
  bots(9);
  if (!(await waitIdle())) fail("10p load timed out");
  expectRing("10p");
  game.island.mapDef.gridSize > g5 ? ok("10p honeycomb is larger than 5p") : fail("10p did not grow");
  planet() && planet().visible ? ok("planet stayed up through roster changes") : fail("planet hid during roster changes");

  // Twin Citadel buildings, on the big roster too.
  tabs[2].click();
  if (!(await waitIdle())) fail("twin load timed out");
  const meshes = citadelMeshes();
  const defCount = (() => {
    const map = game.island.mapDef;
    let n = 0;
    for (let x = 0; x < map.gridSize; x++) {
      for (let z = 0; z < map.gridSize; z++) {
        if (map.decorAt(x, z)?.type === "citadel" && map.isTileActive(x, z)) n++;
      }
    }
    return n;
  })();
  meshes === 4 && defCount === 4
    ? ok(`twin citadel has 4 buildings on ${game.island.mapDef.gridSize}x${game.island.mapDef.gridSize}`)
    : fail(`twin buildings meshes=${meshes} def=${defCount}`);

  // Hammer every map. Planet never drops while the menu is up.
  let hid = false;
  const watch = setInterval(() => {
    const p = planet();
    if (!p || !p.visible) hid = true;
  }, 16);
  tabs[0].click();
  tabs[1].click();
  tabs[2].click();
  tabs[0].click();
  await sleep(40);
  if (!(await waitIdle())) fail("rapid switch timed out");
  clearInterval(watch);
  hid ? fail("planet disappeared during map switches") : ok("planet stayed visible through map switches");
  game.currentMapIndex === 0 && game.island.mapDef.id === "classic"
    ? ok("rapid switches settled on the last map (classic)")
    : fail(`settled on ${game.island.mapDef && game.island.mapDef.id}`);
  const stray = strayTiles();
  stray === 0 ? ok("no leaked tiles after shrinking arenas") : fail(`leaked tile groups: ${stray}`);
  game.island.allTiles.every((t) => t.group.visible)
    ? ok("settled tiles are visible")
    : fail("some settled tiles stayed hidden");
  document.body.classList.contains("arena-loading")
    ? fail("loading class stuck on")
    : ok("loading class cleared");
  loaderHidden() ? ok("LOADING label hidden after settle") : fail("LOADING label still showing");
  planet() && planet().visible ? ok("planet still visible with the menu up") : fail("planet hidden on the settled menu");

  // A match hides the backdrop; coming back to the menu shows it again.
  game.startGame();
  await sleep(80);
  game.state === "playing" && planet() && !planet().visible
    ? ok("planet hides when the match starts")
    : fail(`after start state=${game.state} planet=${planet() && planet().visible}`);
  game.goToMenu();
  await sleep(80);
  game.state === "menu" && planet() && planet().visible
    ? ok("planet returns with the main menu")
    : fail(`after menu state=${game.state} planet=${planet() && planet().visible}`);

  // Leave the menu on the big Twin Citadel so the screenshot shows the keeps.
  bots(9);
  tabs[2].click();
  if (!(await waitIdle())) fail("final twin shot load timed out");
  citadelMeshes() === 4 ? ok("screenshot arena has 4 citadel meshes") : fail("screenshot citadels " + citadelMeshes());
  planet() && planet().visible ? ok("planet visible behind the final menu") : fail("planet missing on final menu");

  return out.join("\n");
})();
