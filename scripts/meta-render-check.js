// Render META VIBER from the front and verify the pixel palette matches the
// assets/meta/ spec: lime body dominant, black overalls, white eyes + pupils.
// The model's face points +Z (default), so the camera sits at +Z without any
// root rotation. Runs inside the page.
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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8899cc); // light-blue: distinct from every part
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
  cam.position.set(0, h * 0.78, h * 1.9); // slightly above, facing the +Z face
  cam.lookAt(0, h * 0.5, 0);
  renderer.render(scene, cam);

  const gl = renderer.getContext();
  const px = new Uint8Array(W * W * 4);
  gl.readPixels(0, 0, W, W, gl.RGBA, gl.UNSIGNED_BYTE, px);

  let lime = 0, black = 0, white = 0, other = 0, total = 0;
  for (let i = 0; i < W * W; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    if (b > r + 30 && b > 120) continue; // light-blue background
    total++;
    const lum = (r + g + b) / 3;
    if (lum < 100) black++;
    else if (lum > 215 && r > 200 && g > 200 && b > 190) white++;
    else if (b < 70 && g > 110) lime++;
    else other++;
  }
  const pct = (n) => (n / Math.max(total, 1) * 100).toFixed(1);
  ok(`rendered ${total} character pixels`);
  lime / total > 0.4 ? ok(`lime body dominant (${pct(lime)}%)`) : bad(`lime too low (${pct(lime)}%)`);
  black / total > 0.15 ? ok(`black overalls/legs present (${pct(black)}%)`) : bad(`black too low (${pct(black)}%)`);
  white / total > 0.02 ? ok(`white eyes/inserts/button present (${pct(white)}%)`) : bad(`white too low (${pct(white)}%)`);
  ok(`other tones (${pct(other)}%)`);
  renderer.dispose();
  return out.join("\n");
})();
