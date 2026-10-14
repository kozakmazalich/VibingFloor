// Measure each start-menu section on the wide desktop layout.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2500);
  const out = [`viewport: ${window.innerWidth}x${window.innerHeight}`];
  const ids = [
    ".menu-header", ".vs-showcase", ".menu-actions", ".menu-controls-guide",
    ".fighter-select-panel", ".map-select-panel", ".diff-select-panel",
  ];
  for (const sel of ids) {
    const r = document.querySelector(sel).getBoundingClientRect();
    out.push(`${sel}: top=${Math.round(r.top)} h=${Math.round(r.height)}`);
  }
  const card = document.querySelector(".start-card").getBoundingClientRect();
  out.push(`card: top=${Math.round(card.top)} h=${Math.round(card.height)}`);
  return out.join("\n");
})();
