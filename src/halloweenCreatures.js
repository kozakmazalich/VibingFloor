import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Procedural "HD" Halloween creatures.
 *
 * The generated bat/ghost OBJ files were too low-detail for the close-up
 * fly-bys in VIBER RACE, so both are rebuilt here as chunky stylized meshes:
 * merged geometry (one draw call per material), shared materials between
 * clones, and named groups for animation.
 *
 * Both templates face +Z, stand on y = 0 and are roughly one world unit tall.
 * raceCourse.js clones them and animates:
 *   bat   -> body bob + wingL/wingR flap (Z and Y axes)
 *   ghost -> body hover + body sway on Z
 */

const BLACK = 0x0a0612;
const PURPLE = 0x7b2ff7;
const WING_PURPLE = 0x8c38fa;
const EYE_WARM = 0xffe8d6;

/**
 * Merge a list of { geometry, position, rotation, scale } parts into one
 * BufferGeometry. UVs are dropped: none of these materials use textures, and
 * dropping them guarantees a consistent attribute layout for mergeGeometries.
 */
function mergeParts(parts) {
  const geos = parts.map((part) => {
    const geo = part.geometry.clone();
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...(part.position || [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation || [0, 0, 0]))),
      new THREE.Vector3(...(part.scale || [1, 1, 1]))
    );
    geo.applyMatrix4(matrix);
    geo.deleteAttribute("uv");
    if (geo.groups && geo.groups.length) geo.clearGroups();
    return geo;
  });

  const merged = mergeGeometries(geos, false);
  for (const geo of geos) geo.dispose();
  return merged;
}

/** Tube along a Catmull-Rom curve whose radius tapers from base to tip. */
function taperedTube(curve, segments, radial, radiusAt) {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const normal = frames.normals[i];
    const binormal = frames.binormals[i];
    const radius = radiusAt(t);

    for (let j = 0; j <= radial; j++) {
      const angle = (j / radial) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const nx = normal.x * cos + binormal.x * sin;
      const ny = normal.y * cos + binormal.y * sin;
      const nz = normal.z * cos + binormal.z * sin;
      positions.push(point.x + nx * radius, point.y + ny * radius, point.z + nz * radius);
      normals.push(nx, ny, nz);
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

// ---------------------------------------------------------------------------
// BAT
// ---------------------------------------------------------------------------
function buildBatWing(side, wingMaterial, boneMaterial) {
  const wing = new THREE.Group();
  wing.name = side > 0 ? "wingR" : "wingL";
  wing.position.set(side * 0.25, 0.68, 0);

  const sx = (x) => x * side;
  const V = (x, y, z = 0) => new THREE.Vector3(sx(x), y, z);
  const bone = (points, radius) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, radius, 6, false);

  // Leading arm + thumb edge, three finger ribs and a little thumb claw.
  const boneParts = [
    { geometry: bone([V(0, 0.1, 0.05), V(0.24, 0.17, 0.07), V(0.48, 0.26, 0.08), V(0.64, 0.3, 0.06)], 0.024) },
    { geometry: bone([V(0.64, 0.3, 0.06), V(0.66, 0.05, 0.05), V(0.6, -0.34, 0.05)], 0.021) },
    { geometry: bone([V(0.47, 0.26, 0.06), V(0.47, 0, 0.05), V(0.38, -0.5, 0.04)], 0.02) },
    { geometry: bone([V(0.28, 0.18, 0.055), V(0.24, -0.02, 0.045), V(0.14, -0.44, 0.035)], 0.019) },
    {
      geometry: new THREE.ConeGeometry(0.032, 0.11, 7),
      position: [sx(0.68), 0.36, 0.07],
      rotation: [0, 0, side * -0.85],
    },
  ];
  wing.add(new THREE.Mesh(mergeParts(boneParts), boneMaterial));

  // Three scalloped membrane panels, bent slightly in Z so they catch light.
  const panelShapes = [
    (s) => {
      s.moveTo(sx(0.64), 0.3);
      s.lineTo(sx(0.6), -0.34);
      s.quadraticCurveTo(sx(0.5), -0.28, sx(0.38), -0.5);
      s.lineTo(sx(0.47), 0.26);
      s.quadraticCurveTo(sx(0.56), 0.28, sx(0.64), 0.3);
    },
    (s) => {
      s.moveTo(sx(0.47), 0.26);
      s.lineTo(sx(0.38), -0.5);
      s.quadraticCurveTo(sx(0.27), -0.3, sx(0.14), -0.44);
      s.lineTo(sx(0.28), 0.18);
      s.quadraticCurveTo(sx(0.38), 0.24, sx(0.47), 0.26);
    },
    (s) => {
      s.moveTo(sx(0.28), 0.18);
      s.lineTo(sx(0.14), -0.44);
      s.quadraticCurveTo(sx(0.04), -0.22, sx(0), -0.14);
      s.lineTo(sx(0), 0.1);
      s.closePath();
    },
  ];

  const panelGeos = panelShapes.map((draw, panelIndex) => {
    const shape = new THREE.Shape();
    draw(shape);
    const geo = new THREE.ShapeGeometry(shape, 12);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const t = Math.min(1, Math.abs(x) / 0.64);
      const z = -panelIndex * 0.009 + 0.045 * Math.sin(t * Math.PI) * (0.55 + 0.45 * Math.cos((y + 0.1) * 2.2));
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return { geometry: geo };
  });
  wing.add(new THREE.Mesh(mergeParts(panelGeos), wingMaterial));

  wing.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return wing;
}

export function buildNeonBat() {
  const root = new THREE.Group();
  root.name = "neon-bat";

  const body = new THREE.Group();
  body.name = "body";
  root.add(body);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: BLACK,
    roughness: 0.22,
    metalness: 0.15,
    emissive: 0x1a0b2e,
    emissiveIntensity: 0.35,
  });
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: WING_PURPLE,
    emissive: PURPLE,
    emissiveIntensity: 1.6,
    roughness: 0.2,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: EYE_WARM,
    emissive: EYE_WARM,
    emissiveIntensity: 2.5,
    roughness: 0.25,
    toneMapped: false,
  });
  const fangMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const innerEarMaterial = new THREE.MeshStandardMaterial({
    color: PURPLE,
    emissive: PURPLE,
    emissiveIntensity: 1.2,
    roughness: 0.25,
  });
  const boneMaterial = new THREE.MeshStandardMaterial({
    color: BLACK,
    roughness: 0.24,
    metalness: 0.25,
    emissive: 0x12061f,
    emissiveIntensity: 0.25,
  });

  // Chubby pear body + rounded head, stubby feet and cupped outer ears.
  const bodyProfile = [
    [0.0, 0.08],
    [0.1, 0.1],
    [0.18, 0.16],
    [0.26, 0.28],
    [0.31, 0.44],
    [0.33, 0.58],
    [0.3, 0.7],
    [0.24, 0.8],
    [0.14, 0.88],
    [0.0, 0.92],
  ].map(([r, y]) => new THREE.Vector2(r, y));

  const bodyGeo = new THREE.LatheGeometry(bodyProfile, 24);
  const headGeo = new THREE.SphereGeometry(0.26, 20, 16);
  const footGeo = new THREE.SphereGeometry(0.095, 12, 10);
  const earGeo = new THREE.SphereGeometry(0.11, 12, 10);
  const innerEarGeo = new THREE.SphereGeometry(0.055, 10, 8);
  const eyeGeo = new THREE.SphereGeometry(0.055, 12, 10);
  const fangGeo = new THREE.ConeGeometry(0.019, 0.078, 8);

  const blackGeo = mergeParts([
    { geometry: bodyGeo },
    { geometry: headGeo, position: [0, 0.78, 0] },
    { geometry: footGeo, position: [-0.14, 0.08, 0.09], scale: [1, 0.8, 1.5] },
    { geometry: footGeo, position: [0.14, 0.08, 0.09], scale: [1, 0.8, 1.5] },
    { geometry: earGeo, position: [-0.15, 0.98, -0.01], rotation: [0, 0, 0.25], scale: [0.75, 1.4, 0.45] },
    { geometry: earGeo, position: [0.15, 0.98, -0.01], rotation: [0, 0, -0.25], scale: [0.75, 1.4, 0.45] },
  ]);
  body.add(new THREE.Mesh(blackGeo, bodyMaterial));

  body.add(
    new THREE.Mesh(
      mergeParts([
        { geometry: innerEarGeo, position: [-0.15, 0.98, 0.045], rotation: [0, 0, 0.25], scale: [0.55, 1, 0.28] },
        { geometry: innerEarGeo, position: [0.15, 0.98, 0.045], rotation: [0, 0, -0.25], scale: [0.55, 1, 0.28] },
      ]),
      innerEarMaterial
    )
  );

  body.add(
    new THREE.Mesh(
      mergeParts([
        { geometry: eyeGeo, position: [-0.105, 0.85, 0.252], rotation: [0, 0, 0.5], scale: [0.85, 1.3, 0.5] },
        { geometry: eyeGeo, position: [0.105, 0.85, 0.252], rotation: [0, 0, -0.5], scale: [0.85, 1.3, 0.5] },
      ]),
      eyeMaterial
    )
  );

  body.add(
    new THREE.Mesh(
      mergeParts([
        { geometry: fangGeo, position: [-0.055, 0.68, 0.275], rotation: [Math.PI, 0, 0] },
        { geometry: fangGeo, position: [0.055, 0.68, 0.275], rotation: [Math.PI, 0, 0] },
      ]),
      fangMaterial
    )
  );

  // Cheap purple rim: a slightly enlarged, back-side additive shell. The
  // opaque body hides its centre, leaving a #7b2ff7 edge glow.
  const rimGeo = blackGeo.clone();
  rimGeo.applyMatrix4(
    new THREE.Matrix4()
      .makeTranslation(0, 0.55, 0)
      .multiply(new THREE.Matrix4().makeScale(1.085, 1.085, 1.085))
      .multiply(new THREE.Matrix4().makeTranslation(0, -0.55, 0))
  );
  const rim = new THREE.Mesh(
    rimGeo,
    new THREE.MeshBasicMaterial({
      color: PURPLE,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  body.add(rim);

  body.add(buildBatWing(1, wingMaterial, boneMaterial));
  body.add(buildBatWing(-1, wingMaterial, boneMaterial));

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return root;
}

/** Normalize a loaded glTF scene into a wrapper: `height` world units tall,
 *  base at y = 0, footprint centred on XZ. */
function normalizeHdScene(scene, height) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const scale = height / (size.y || 1);

  const norm = new THREE.Group();
  norm.add(scene);
  norm.scale.setScalar(scale);
  norm.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  return norm;
}

/** Give the authored bat the exact neon-PBR materials from the brief. */
function applyHdBatMaterials(scene) {
  const materials = {
    Bat_Obsidian_Body: new THREE.MeshStandardMaterial({
      color: BLACK,
      roughness: 0.22,
      metalness: 0.15,
      emissive: 0x1a0b2e,
      emissiveIntensity: 0.35,
    }),
    Witch_Purple_Emissive: new THREE.MeshStandardMaterial({
      color: WING_PURPLE,
      emissive: PURPLE,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
    Bat_Glowing_Eyes: new THREE.MeshStandardMaterial({
      color: EYE_WARM,
      emissive: EYE_WARM,
      emissiveIntensity: 2.5,
      roughness: 0.25,
      toneMapped: false,
    }),
    Bat_White_Fangs: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  };

  scene.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material && o.material.name;
    if (materials[name]) o.material = materials[name];
    o.castShadow = false;
    o.receiveShadow = false;
  });
}

/** Give the authored ghost the two-layer glow and draw-order rules. */
function applyHdGhostMaterials(scene) {
  // No `transmission` here on purpose: three.js renders the whole scene into a
  // transmission buffer once per transmissive mesh, which halved the frame rate
  // on the race track (7 floating ghosts = 7 extra full-scene passes). A plain
  // translucent Standard material reads the same at this size.
  const shell = new THREE.MeshStandardMaterial({
    color: 0xdcc7ff,
    emissive: 0x613db8,
    emissiveIntensity: 0.65,
    transparent: true,
    opacity: 0.82,
    roughness: 0.15,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const core = new THREE.MeshStandardMaterial({
    color: 0xf2e6ff,
    emissive: 0xb894fa,
    emissiveIntensity: 1.8,
    roughness: 0.35,
    metalness: 0,
  });
  const eyes = new THREE.MeshPhysicalMaterial({
    color: 0x1f0f38,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const mouth = new THREE.MeshStandardMaterial({
    color: 0x1f0f38,
    roughness: 0.35,
    transparent: true,
    depthWrite: false,
  });

  scene.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material && o.material.name;
    if (name === "Ghost_Translucent_Shell") {
      o.material = shell;
      o.renderOrder = 1;
    } else if (name === "Ghost_Core_Emissive") {
      o.material = core;
    } else if (name === "Ghost_Dark_Eyes") {
      o.material = eyes;
      o.renderOrder = 2;
    } else if (name === "Ghost_Mouth_Mat") {
      o.material = mouth;
      o.renderOrder = 2;
    }
    o.castShadow = false;
    o.receiveShadow = false;
  });
}

/** Split the authored bat's wing meshes into left/right pivots so the race
 *  animation can flap them independently around the shoulders. */
function groupHdBatWings(scene) {
  scene.updateMatrixWorld(true);
  const fullBox = new THREE.Box3().setFromObject(scene);
  const fullSize = new THREE.Vector3();
  const fullCenter = new THREE.Vector3();
  fullBox.getSize(fullSize);
  fullBox.getCenter(fullCenter);

  const wings = { L: [], R: [] };
  const meshes = [];
  scene.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });

  for (const mesh of meshes) {
    const box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    // Wing pieces are the only parts far from the spine with a wide span.
    if (Math.abs(center.x) < fullSize.x * 0.15) continue;
    if (size.x < fullSize.x * 0.15) continue;
    wings[center.x > 0 ? "R" : "L"].push(mesh);
  }

  const shoulderY = fullBox.min.y + fullSize.y * 0.7;
  const shoulderX = fullSize.x * 0.065;
  const shoulderZ = fullCenter.z;

  for (const [side, list] of Object.entries(wings)) {
    if (!list.length) continue;
    const pivot = new THREE.Group();
    pivot.name = side === "R" ? "wingR" : "wingL";
    scene.add(pivot);

    const worldPivot = new THREE.Vector3(side === "R" ? shoulderX : -shoulderX, shoulderY, shoulderZ);
    pivot.position.copy(scene.worldToLocal(worldPivot.clone()));
    pivot.updateMatrixWorld(true);

    for (const mesh of list) pivot.attach(mesh);
  }
}

/** Build the template used by raceCourse from the authored HD bat GLB. */
export function prepareHdBat(scene) {
  groupHdBatWings(scene);
  applyHdBatMaterials(scene);

  // Collapse the wing pivots and the body separately so the flap animation
  // keeps working while each part drops to one draw call per material.
  const pivots = [];
  scene.traverse((o) => {
    if (o.name === "wingL" || o.name === "wingR") pivots.push(o);
  });
  for (const pivot of pivots) mergeMeshesUnder(pivot);
  mergeMeshesUnder(scene, pivots);

  const body = new THREE.Group();
  body.name = "body";
  body.add(normalizeHdScene(scene, 1.1));

  const template = new THREE.Group();
  template.name = "hd-bat";
  template.add(body);
  return template;
}

/** Build the template used by raceCourse from the authored HD ghost GLB. */
export function prepareHdGhost(scene) {
  applyHdGhostMaterials(scene);
  mergeMeshesUnder(scene);

  const body = new THREE.Group();
  body.name = "body";
  body.add(normalizeHdScene(scene, 1.1));

  const template = new THREE.Group();
  template.name = "hd-ghost";
  template.add(body);
  return template;
}

/**
 * Collapse every static mesh under `root` into one mesh per material.
 *
 * The authored props ship as a dozen small material groups each; with up to 14
 * of them drifting along the track that was ~180 draw calls and 200k triangles
 * of pure decoration — enough to cost ~20fps on a fanless M1. Merging is
 * visually identical and cuts each prop to a handful of draws. Meshes inside
 * `exclude` subtrees (the animated wing pivots) are left untouched.
 */
function mergeMeshesUnder(root, exclude = []) {
  const skip = new Set();
  for (const node of exclude) node.traverse((o) => skip.add(o));

  root.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !o.material) return;
    if (skip.has(o)) return;
    const sig = Object.keys(o.geometry.attributes).sort().join("|");
    const key = `${o.material.uuid}:${sig}:${o.renderOrder}`;
    if (!buckets.has(key)) {
      buckets.set(key, { mat: o.material, renderOrder: o.renderOrder, meshes: [], geos: [] });
    }
    const bucket = buckets.get(key);
    const geo = o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().copy(invRoot).multiply(o.matrixWorld));
    bucket.meshes.push(o);
    bucket.geos.push(geo);
  });

  for (const bucket of buckets.values()) {
    if (bucket.meshes.length === 0) continue;
    let merged = null;
    if (bucket.geos.length === 1) {
      merged = bucket.geos[0];
    } else {
      const flat = bucket.geos.map((g) => {
        if (!g.index) return g;
        const ng = g.toNonIndexed();
        g.dispose();
        return ng;
      });
      merged = mergeGeometries(flat, false);
      for (const g of flat) g.dispose();
    }
    // Leave the originals alone if the merge failed for any reason.
    if (!merged) {
      for (const g of bucket.geos) g.dispose();
      continue;
    }
    for (const mesh of bucket.meshes) {
      if (mesh.parent) mesh.parent.remove(mesh);
      mesh.geometry.dispose();
    }
    const mesh = new THREE.Mesh(merged, bucket.mat);
    mesh.renderOrder = bucket.renderOrder;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
  }
}
export function buildNeonGhost() {
  const root = new THREE.Group();
  root.name = "neon-ghost";

  const body = new THREE.Group();
  body.name = "body";
  root.add(body);

  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0xdcc7ff,
    emissive: 0x613db8,
    emissiveIntensity: 0.65,
    transparent: true,
    opacity: 0.82,
    roughness: 0.15,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2e6ff,
    emissive: 0xb894fa,
    emissiveIntensity: 1.8,
    roughness: 0.35,
    metalness: 0,
  });
  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1f0f38,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const mouthMaterial = new THREE.MeshStandardMaterial({
    color: 0x1f0f38,
    roughness: 0.35,
    transparent: true,
    depthWrite: false,
  });

  // Dome head + plump torso.
  const bodyProfile = [
    [0.0, 0.12],
    [0.2, 0.14],
    [0.28, 0.18],
    [0.36, 0.26],
    [0.42, 0.4],
    [0.43, 0.58],
    [0.4, 0.76],
    [0.3, 0.9],
    [0.16, 0.99],
    [0.0, 1.02],
  ].map(([r, y]) => new THREE.Vector2(r, y));

  const domeGeo = new THREE.LatheGeometry(bodyProfile, 32);

  // Tail: sweeps out to the bottom-left (-X), then curls up at the tip.
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.02, 0.24, 0.1),
    new THREE.Vector3(-0.12, 0.14, 0.14),
    new THREE.Vector3(-0.3, 0.0, 0.17),
    new THREE.Vector3(-0.46, -0.18, 0.15),
    new THREE.Vector3(-0.56, -0.04, 0.1),
    new THREE.Vector3(-0.52, 0.1, 0.08),
  ]);
  const tailGeo = taperedTube(tailCurve, 28, 8, (t) => THREE.MathUtils.lerp(0.15, 0.03, t));
  const tailTip = tailCurve.getPointAt(1);

  // Stubby arms + hands.
  const armGeo = new THREE.SphereGeometry(0.11, 14, 12);
  const handGeo = new THREE.SphereGeometry(0.07, 12, 10);

  const shellGeo = mergeParts([
    { geometry: domeGeo },
    { geometry: tailGeo },
    { geometry: new THREE.SphereGeometry(0.045, 10, 8), position: [tailTip.x, tailTip.y, tailTip.z] },
    { geometry: armGeo, position: [-0.4, 0.6, 0.12], rotation: [0, 0, 0.4], scale: [1.5, 0.6, 0.75] },
    { geometry: armGeo, position: [0.4, 0.6, 0.12], rotation: [0, 0, -0.4], scale: [1.5, 0.6, 0.75] },
    { geometry: handGeo, position: [-0.54, 0.68, 0.13], scale: [1, 0.85, 0.9] },
    { geometry: handGeo, position: [0.54, 0.68, 0.13], scale: [1, 0.85, 0.9] },
  ]);

  const shell = new THREE.Mesh(shellGeo, shellMaterial);
  shell.renderOrder = 1;
  body.add(shell);

  // Faint purple rim so the translucent silhouette still reads at race distance.
  const rimGeo = shellGeo.clone();
  rimGeo.applyMatrix4(
    new THREE.Matrix4()
      .makeTranslation(0, 0.55, 0)
      .multiply(new THREE.Matrix4().makeScale(1.035, 1.035, 1.035))
      .multiply(new THREE.Matrix4().makeTranslation(0, -0.55, 0))
  );
  const rim = new THREE.Mesh(
    rimGeo,
    new THREE.MeshBasicMaterial({
      color: PURPLE,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  rim.renderOrder = 0;
  body.add(rim);

  // Glowing inner core, visible through the translucent shell.
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 18), coreMaterial);
  core.scale.setScalar(0.72);
  core.position.y = 0.58;
  body.add(core);

  // Glossy dark-purple oval eyes and a tiny "o" mouth on +Z. Both are drawn
  // after the shell (renderOrder 2) so they never z-fight with it.
  const eyeGeo = new THREE.SphereGeometry(0.06, 14, 12);
  const eyes = new THREE.Mesh(
    mergeParts([
      { geometry: eyeGeo, position: [-0.12, 0.72, 0.355], scale: [0.95, 1.35, 0.55] },
      { geometry: eyeGeo, position: [0.12, 0.72, 0.355], scale: [0.95, 1.35, 0.55] },
    ]),
    eyeMaterial
  );
  eyes.renderOrder = 2;
  body.add(eyes);

  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.01, 8, 16), mouthMaterial);
  mouth.position.set(0, 0.59, 0.4);
  mouth.scale.set(1, 1.15, 1);
  mouth.renderOrder = 2;
  body.add(mouth);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return root;
}
