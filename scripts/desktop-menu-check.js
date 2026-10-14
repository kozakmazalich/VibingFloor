// Desktop menu check (run at a wide viewport): verifies the wide two-column
// grid layout, the aurora shine background and that the card fits on screen.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(2500);
  const vw = window.innerWidth;
  out.push(`viewport: ${vw}x${window.innerHeight}`);

  const card = document.querySelector(".start-card");
  if (!card) {
    bad("start card missing");
    return out.join("\n");
  }

  const cs = getComputedStyle(card);
  const areas = (cs.gridTemplateAreas || "").replace(/\s+/g, " ").trim();
  areas.includes("fighters") && areas.includes("showcase")
    ? ok(`desktop grid layout active (areas: ${areas})`)
    : bad(`grid layout missing (areas: "${areas}")`);

  const w = card.getBoundingClientRect().width;
  w > 800 ? ok(`wide desktop card (w=${Math.round(w)})`) : bad(`card still narrow (w=${Math.round(w)})`);

  const aurora = document.querySelector(".menu-aurora");
  aurora && getComputedStyle(aurora).animationName !== "none"
    ? ok("aurora shine background running")
    : bad("aurora missing or static");

  const h = card.getBoundingClientRect().height;
  h <= window.innerHeight - 24
    ? ok(`card fits vertically (h=${Math.round(h)})`)
    : bad(`card too tall (h=${Math.round(h)} of ${window.innerHeight})`);

  document.documentElement.scrollWidth <= vw + 1
    ? ok("no horizontal overflow")
    : bad(`horizontal overflow: ${document.documentElement.scrollWidth}`);

  // Selectors live in the right column; title in the left column
  const title = document.querySelector(".menu-header").getBoundingClientRect();
  const fighters = document.querySelector(".fighter-select-panel").getBoundingClientRect();
  fighters.left > title.left + 200
    ? ok(`two-column split (title left=${Math.round(title.left)}, selectors left=${Math.round(fighters.left)})`)
    : bad("columns overlap");

  return out.join("\n");
})();
