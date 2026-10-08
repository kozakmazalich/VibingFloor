// Focused check of the 3D title: per-word gradients, flowing animation,
// extrusion filter, and that everything still fits the card.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2200);
  const out = [];
  const h1 = document.querySelector(".title-3d");
  if (!h1) return "FAIL: no .title-3d";
  out.push("h1 has filter: " + (getComputedStyle(h1).filter && getComputedStyle(h1).filter !== "none" ? "yes (bad)" : "no (good)"));
  out.push("h1 transform: " + getComputedStyle(h1).transform.slice(0, 40));

  for (const sel of [".t3d-a", ".t3d-b", ".t3d-o1", ".t3d-o2", ".t3d-c"]) {
    const el = document.querySelector(sel);
    if (!el) { out.push(`FAIL: ${sel} missing`); continue; }
    const cs = getComputedStyle(el);
    const hasGrad = cs.backgroundImage.includes("gradient");
    const clipOk = cs.webkitBackgroundClip === "text" || cs.backgroundClip === "text";
    const fillT = cs.webkitTextFillColor === "rgba(0, 0, 0, 0)";
    const anim = cs.animationName;
    const delay = cs.animationDelay;
    const extrude = (cs.filter.match(/drop-shadow/g) || []).length;
    out.push(
      `${sel}: grad=${hasGrad ? "y" : "N"} clip=${clipOk ? "y" : "N"} fillT=${fillT ? "y" : "N"} anim="${anim}" delay="${delay}" dropshadows=${extrude}`
    );
  }

  // Sequential fall: the second O must lag the first
  const d1 = getComputedStyle(document.querySelector(".t3d-o1")).animationDelay;
  const d2 = getComputedStyle(document.querySelector(".t3d-o2")).animationDelay;
  out.push("O2 delayed after O1: " + (parseFloat(d2) > parseFloat(d1) ? "yes" : "NO"));

  const card = document.querySelector(".start-card");
  const titleRect = h1.getBoundingClientRect();
  out.push(
    "title fits card: " +
      (titleRect.right <= card.getBoundingClientRect().right + 1 &&
       titleRect.left >= card.getBoundingClientRect().left - 1
        ? "yes"
        : "NO: " + Math.round(titleRect.right) + " > " + Math.round(card.getBoundingClientRect().right))
  );
  out.push("scrollWidth ok: " + (document.documentElement.scrollWidth <= innerWidth + 1));
  return out.join("\n");
})();
