// Render META VIBER from the front and verify the pixel palette matches
// assets/meta.jpg: lime #c4d41c dominant, beige #cfcbbf present, black suit
// present, no blue/purple, no large pure-white areas. Runs inside the page.
(async () => {
  const out = [];
  const ok = (l) => out.push("OK: " + l);
  const bad = (l) => out.push("FAIL: " + l);
  const THREE = await import("three");
  const { CHARACTERS, buildViber } = await import("/src/vibers.js");

  const def = CHARACTERS.find((d) => d.id === "meta");
  const v = buildViber(def);
  const box = new THREE.Box3().setFromObject(v.root);
  const size = new THREE.Vector3();
  box.getSize(size);
  v.root.position.y = -box.min.y;
  v.root.rotation.y = Math.PI; // face -Z like in-game

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a14);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 2.2);
  dir.position.set(3, 6, 4);
  scene.add(dir);
  scene.add(v.root);

  const W = 256;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, W);
  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
  const h = size.y;
  cam.position.set(0, h * 0.62, h * 1.7);
  cam.lookAt(0, h * 0.55, 0);
  renderer.render(scene, cam);

  const gl = renderer.getContext();
  const px = new Uint8Array(W * W * 4);
  gl.readPixels(0, 0, W, W, gl.RGBA, gl.UNSIGNED_BYTE, px);

  let lime = 0, beige = 0, black = 0, blue = 0, white = 0, other = 0, total = 0;
  for (let i = 0; i < W * W; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    // skip background (navy #0a0a14)
    if (r < 30 && g < 30 && b < 40) continue;
    total++;
    const lum = (r + g + b) / 3;
    if (b > r * 1.2 && b > g * 1.1) blue++;
    else if (lum < 90) black++;
    else if (lum > 220 && r > 200 && g > 200 && b > 190) white++;
    else if (b < 60 && g > 150 && r < 230) lime++;
    else if (r > 130 && g > 125 && b > 110 && r > g && r < 225 && (r - b) < 40) beige++;
    else other++;
  }
  const pct = (n) => (n / Math.max(total, 1) * 100).toFixed(1);
  ok(`rendered ${total} character pixels`);

  // Report the top rendered colours for diagnosis
  const hist = new Map();
  for (let i = 0; i < W * W; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    if (r < 30 && g < 30 && b < 40) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); // 4-bit buckets
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [k, n] of top) {
    const r = (k >> 8) << 4, g = ((k >> 4) & 15) << 4, b = (k & 15) << 4;
    out.push(`  top #${(r.toString(16).padStart(2, "0") + g.toString(16).padStart(2, "0") + b.toString(16).padStart(2, "0"))} ${(n / total * 100).toFixed(1)}%`);
  }
  lime / total > 0.15 ? ok(`lime dominant (${pct(lime)}%)`) : bad(`lime too low (${pct(lime)}%)`);
  beige / total > 0.03 ? ok(`beige face/hands present (${pct(beige)}%)`) : bad(`beige too low (${pct(beige)}%)`);
  black / total > 0.12 ? ok(`black suit present (${pct(black)}%)`) : bad(`black too low (${pct(black)}%)`);
  blue / total < 0.02 ? ok(`no blue/purple (${pct(blue)}%)`) : bad(`blue pixels found (${pct(blue)}%)`);
  white / total < 0.05 ? ok(`no white-eye blobs (${pct(white)}%)`) : bad(`white blobs present (${pct(white)}%)`);
  ok(`other tones (${pct(other)}%)`);

  // Glow panels must render yellow-green
  let glow = 0;
  for (let i = 0; i < W * W; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    if (g > 200 && r > 230 && b < 120) glow++;
  }
  glow / total > 0.01 ? ok(`yellow-green glow panels visible (${pct(glow)}%)`) : bad(`glow not visible (${pct(glow)}%)`);

  renderer.dispose();
  return out.join("\n");
})();
