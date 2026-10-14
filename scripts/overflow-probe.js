// Diagnostic: list elements whose right edge exceeds the viewport width.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2500);
  const vw = window.innerWidth;
  const out = [`viewport: ${vw}x${window.innerHeight}, scrollWidth=${document.documentElement.scrollWidth}`];
  const bad = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      bad.push(`${el.tagName}#${el.id || ""}.${(el.className || "").toString().slice(0, 40)} L=${Math.round(r.left)} R=${Math.round(r.right)}`);
    }
  }
  out.push(...bad.slice(0, 12));
  return out.join("\n");
})();
