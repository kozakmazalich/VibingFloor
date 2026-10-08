import * as THREE from "three";

/**
 * Animated arena props (map decorations that move).
 * Attached per-map via `props: [...]` in src/maps.js and driven by Island.
 * Each prop is purely visual: robots do not collide with props.
 */

function disposeAll(list) {
  for (const item of list) {
    try {
      item.dispose();
    } catch {
      /* ignore */
    }
  }
}

/** Map a prop definition to a live prop object: { group, update, dispose }. */
export function buildProp(def) {
  if (!def || !def.type) return null;
  switch (def.type) {
    case "elevator":
      return buildElevator(def);
    case "orb":
      return buildOrb(def);
    default:
      return null;
  }
}

// Hexagonal energy plate that rides up and down on a light pillar
function buildElevator(def) {
  const geos = [];
  const mats = [];
  const group = new THREE.Group();
  const color = def.color ?? 0x00e5ff;

  const plateGeo = new THREE.CylinderGeometry(1.15, 1.32, 0.22, 6);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x141a2e,
    metalness: 0.75,
    roughness: 0.3,
    emissive: color,
    emissiveIntensity: 0.5,
  });
  geos.push(plateGeo);
  mats.push(plateMat);
  const plate = new THREE.Mesh(plateGeo, plateMat);
  group.add(plate);

  const ringGeo = new THREE.TorusGeometry(1.45, 0.07, 8, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  geos.push(ringGeo);
  mats.push(ringMat);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.17;
  group.add(ring);

  // Faint energy pillar below the plate
  const pillarGeo = new THREE.CylinderGeometry(0.45, 1.55, 3.4, 6, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  geos.push(pillarGeo);
  mats.push(pillarMat);
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.y = -1.8;
  group.add(pillar);

  const beaconGeo = new THREE.SphereGeometry(0.17, 10, 10);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
  });
  geos.push(beaconGeo);
  mats.push(beaconMat);
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.y = 0.46;
  group.add(beacon);

  const yMin = def.yMin ?? 3.3;
  const yMax = def.yMax ?? 5.3;
  const mid = (yMin + yMax) / 2;
  const amp = (yMax - yMin) / 2;
  const speed = def.speed ?? 0.9;
  let t = Math.random() * Math.PI * 2;
  group.position.set(def.x ?? 0, mid, def.z ?? 0);

  return {
    group,
    update(dt) {
      t += dt * speed;
      group.position.y = mid + Math.sin(t) * amp;
      plate.rotation.y += dt * 0.35;
      ring.rotation.z += dt * 0.7;
      beaconMat.opacity = 0.65 + 0.35 * Math.sin(t * 2.2);
    },
    dispose() {
      disposeAll(geos);
      disposeAll(mats);
    },
  };
}

// Floating glowing orb with rotating halos (hovers + bobs)
function buildOrb(def) {
  const geos = [];
  const mats = [];
  const group = new THREE.Group();
  const color = def.color ?? 0xb46bff;

  const coreGeo = new THREE.SphereGeometry(0.85, 24, 24);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x141226,
    metalness: 0.4,
    roughness: 0.25,
    emissive: color,
    emissiveIntensity: 1.5,
  });
  geos.push(coreGeo);
  mats.push(coreMat);
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const haloGeo = new THREE.TorusGeometry(1.3, 0.05, 8, 48);
  const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  geos.push(haloGeo);
  mats.push(haloMat);
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.rotation.x = Math.PI / 2.4;
  group.add(halo);
  const halo2 = new THREE.Mesh(haloGeo, haloMat);
  halo2.scale.setScalar(1.55);
  halo2.rotation.x = Math.PI / 1.55;
  group.add(halo2);

  const yBase = def.yBase ?? 5.0;
  const bobAmp = def.bobAmp ?? 0.5;
  let t = Math.random() * Math.PI * 2;
  group.position.set(def.x ?? 0, yBase, def.z ?? 0);

  return {
    group,
    update(dt) {
      t += dt;
      group.position.y = yBase + Math.sin(t * 1.2) * bobAmp;
      core.rotation.y += dt * 0.7;
      halo.rotation.z += dt * 0.5;
      halo2.rotation.z -= dt * 0.35;
    },
    dispose() {
      disposeAll(geos);
      disposeAll(mats);
    },
  };
}
