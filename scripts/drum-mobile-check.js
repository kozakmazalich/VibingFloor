// Mobile drum fit check: spin the standalone drum on a portrait phone and
// verify the neon rims/pointers (cyan) appear on BOTH sides of the frame.
// readPixels must run synchronously right after the drum's render (the
// drawing buffer is cleared after compositing otherwise).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);

  await sleep(1200);
  ok(`viewport ${window.innerWidth}x${window.innerHeight}`);

  const { showPrizeDrum, updatePrizeDrum } = await import("/drum.js");
  showPrizeDrum(() => {}, { manualLoop: true });

  // Render + read in the same task so the buffer survives
  updatePrizeDrum(performance.now());
  const canvases = [...document.querySelectorAll("canvas")];
  const canvas = canvases[canvases.length - 1];
  if (!canvas) { bad("no standalone drum canvas"); return out.join("\n"); }
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  const W = canvas.width, H = canvas.height;
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);

  const isCyan = (r, g, b) => b > 150 && g > 120 && r < 120;
  const isMagenta = (r, g, b) => r > 150 && b > 100 && g < 110;
  let cyanL = 0, cyanR = 0, magentaL = 0, magentaR = 0, total = 0;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const left = x < W / 3;
      if (isCyan(r, g, b)) { left ? cyanL++ : cyanR++; total++; }
      if (isMagenta(r, g, b)) { left ? magentaL++ : magentaR++; total++; }
    }
  }
  ok(`cyan L/R: ${cyanL}/${cyanR}, magenta L/R: ${magentaL}/${magentaR}`);
  (cyanL > 0 || magentaL > 0) && (cyanR > 0 || magentaR > 0)
    ? ok("drum rims/window visible on BOTH sides — fits the portrait screen")
    : bad("drum is cut off on a portrait phone");
  return out.join("\n");
})();
