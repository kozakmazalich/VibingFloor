import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const BLACK = 0x0a0612;
const WING = 0x8c38fa;
const PURPLE = 0x7b2ff7;
const ORANGE = 0xff6a00;

const IDLE_FLAP_SPEED = 6.5;
const BOOST_FLAP_SPEED = 18.0;
const IDLE_AMPLITUDE = 0.22;
const BOOST_AMPLITUDE = 0.55;

/** Merge transformed parts into one geometry (no UVs: these materials are flat colour). */
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

function bendMembrane(geo, panelIndex) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = Math.min(1, Math.abs(x) / 1.08);
    const z =
      -panelIndex * 0.008 +
      0.05 * Math.sin(t * Math.PI) * (0.6 + 0.4 * Math.cos((y + 0.1) * 2.2));
    pos.setZ(i, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Wearable bat-wing jetpack for the Halloween race.
 *
 * The root is a compact back harness with an orange glowing core. The two
 * wings each have merged black tube bones (leading arm, three finger rays,
 * thumb claw) and three scalloped purple membrane panels. wingL/wingR are
 * pivots at the shoulders so the whole wing flaps as one piece.
 *
 *   const wings = new HalloweenBatWingsJetpack();
 *   playerMesh.add(wings.root);
 *   wings.update(elapsedTime, isJetpackActive);
 */
export class HalloweenBatWingsJetpack {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = "HalloweenBatWingsJetpack";
    this.root.visible = false;

    this._geos = [];
    this._mats = [];
    this.emitters = [];

    this.boneMat = new THREE.MeshStandardMaterial({
      color: BLACK,
      roughness: 0.22,
      metalness: 0.18,
    });
    this.membraneMat = new THREE.MeshStandardMaterial({
      color: WING,
      emissive: PURPLE,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.coreMat = new THREE.MeshStandardMaterial({
      color: ORANGE,
      emissive: ORANGE,
      emissiveIntensity: 2.2,
      roughness: 0.3,
      metalness: 0.1,
      toneMapped: false,
    });
    this._mats.push(this.boneMat, this.membraneMat, this.coreMat);

    this._buildHarness();
    this.wingL = this._buildWing(-1);
    this.wingR = this._buildWing(1);
    this.root.add(this.wingL, this.wingR);

    // Raw (rest-pose) bounds: Robot uses these to scale/seat the pet pack.
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.root);
    const size = new THREE.Vector3();
    box.getSize(size);
    this.rawSize = { width: size.x || 1, height: size.y || 1, depth: size.z || 0.2 };

    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        this._geos.push(o.geometry);
      }
    });
  }

  _buildHarness() {
    // Compact black mount + orange core.
    const plate = new THREE.BoxGeometry(0.42, 0.5, 0.16);
    const rail = new THREE.BoxGeometry(0.06, 0.62, 0.1);
    const bar = new THREE.BoxGeometry(0.5, 0.055, 0.1);
    const ring = new THREE.TorusGeometry(0.145, 0.025, 8, 20);

    const harnessGeo = mergeParts([
      { geometry: plate },
      { geometry: rail, position: [-0.25, 0, 0.02] },
      { geometry: rail, position: [0.25, 0, 0.02] },
      { geometry: bar, position: [0, 0.28, 0.02] },
      { geometry: bar, position: [0, -0.28, 0.02] },
      { geometry: ring, position: [0, 0, 0.11] },
    ]);
    const harness = new THREE.Mesh(harnessGeo, this.boneMat);
    this.root.add(harness);

    const coreGeo = new THREE.SphereGeometry(0.105, 16, 12);
    this.coreMesh = new THREE.Mesh(coreGeo, this.coreMat);
    this.coreMesh.position.set(0, 0, 0.12);
    this.root.add(this.coreMesh);
  }

  _buildWing(side) {
    const wing = new THREE.Group();
    wing.name = side > 0 ? "wingR" : "wingL";
    wing.position.set(side * 0.2, 0.12, 0.02);

    const sx = (x) => x * side;
    const V = (x, y, z = 0) => new THREE.Vector3(sx(x), y, z);
    const bone = (points, radius) =>
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, radius, 6, false);

    const boneParts = [
      // Leading arm / thumb edge.
      { geometry: bone([V(0.02, 0.06, 0.05), V(0.35, 0.22, 0.07), V(0.75, 0.32, 0.08), V(1.08, 0.28, 0.06)], 0.032) },
      // Three finger rays.
      { geometry: bone([V(1.08, 0.28, 0.06), V(1.1, 0.02, 0.04), V(1.02, -0.5, 0.02)], 0.026) },
      { geometry: bone([V(0.78, 0.26, 0.06), V(0.8, -0.02, 0.04), V(0.68, -0.64, 0.02)], 0.024) },
      { geometry: bone([V(0.46, 0.18, 0.05), V(0.44, -0.04, 0.03), V(0.3, -0.56, 0.01)], 0.022) },
      // Thumb claw on the upper bend.
      {
        geometry: new THREE.ConeGeometry(0.04, 0.13, 7),
        position: [sx(1.13), 0.38, 0.08],
        rotation: [0, 0, side * -0.85],
      },
    ];
    const bones = new THREE.Mesh(mergeParts(boneParts), this.boneMat);
    bones.castShadow = false;
    wing.add(bones);

    const panelShapes = [
      (s) => {
        s.moveTo(sx(1.08), 0.28);
        s.lineTo(sx(1.02), -0.5);
        s.quadraticCurveTo(sx(0.88), -0.38, sx(0.68), -0.64);
        s.lineTo(sx(0.78), 0.26);
        s.quadraticCurveTo(sx(0.95), 0.3, sx(1.08), 0.28);
      },
      (s) => {
        s.moveTo(sx(0.78), 0.26);
        s.lineTo(sx(0.68), -0.64);
        s.quadraticCurveTo(sx(0.48), -0.48, sx(0.3), -0.56);
        s.lineTo(sx(0.46), 0.18);
        s.quadraticCurveTo(sx(0.62), 0.24, sx(0.78), 0.26);
      },
      (s) => {
        s.moveTo(sx(0.46), 0.18);
        s.lineTo(sx(0.3), -0.56);
        s.quadraticCurveTo(sx(0.12), -0.38, sx(0.02), -0.18);
        s.lineTo(sx(0.02), 0.1);
        s.closePath();
      },
    ];

    const panelGeos = panelShapes.map((draw, panelIndex) => {
      const shape = new THREE.Shape();
      draw(shape);
      return { geometry: bendMembrane(new THREE.ShapeGeometry(shape, 12), panelIndex) };
    });
    const membranes = new THREE.Mesh(mergeParts(panelGeos), this.membraneMat);
    membranes.castShadow = false;
    wing.add(membranes);

    // Boost trail origin at the trailing wing tip.
    const emitter = new THREE.Object3D();
    emitter.position.set(sx(0.98), -0.42, 0.06);
    wing.add(emitter);
    this.emitters.push(emitter);

    wing.rotation.x = -0.06;
    return wing;
  }

  /** Object3D emitters for the purple/orange boost trail. */
  getBoostEmitters() {
    return this.emitters;
  }

  /** @param {number} elapsedTime seconds @param {boolean} isJetpackActive */
  update(elapsedTime, isJetpackActive) {
    if (!this.root.visible) return;

    const active = !!isJetpackActive;
    const speed = active ? BOOST_FLAP_SPEED : IDLE_FLAP_SPEED;
    const amplitude = active ? BOOST_AMPLITUDE : IDLE_AMPLITUDE;
    const flap = Math.sin(elapsedTime * speed) * amplitude;

    if (this.wingL) {
      this.wingL.rotation.z = -flap;
      this.wingL.rotation.y = -flap * 0.35;
    }
    if (this.wingR) {
      this.wingR.rotation.z = flap;
      this.wingR.rotation.y = flap * 0.35;
    }

    // Membranes flare from the resting neon to the boosted neon.
    this.membraneMat.emissiveIntensity = active ? 2.8 : 1.6;

    // Harness core pulses a little faster while the pack is firing.
    const pulse = Math.sin(elapsedTime * (active ? 14 : 4.5)) * 0.3;
    this.coreMat.emissiveIntensity = (active ? 3.2 : 2.0) + pulse;
    if (this.coreMesh) {
      const s = active ? 1.16 + pulse * 0.05 : 1 + pulse * 0.04;
      this.coreMesh.scale.setScalar(s);
    }
  }

  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    const geos = new Set(this._geos);
    const mats = new Set(this._mats);
    this.root.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) if (m) mats.add(m);
      }
    });
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    this._geos.length = 0;
    this._mats.length = 0;
    this.emitters.length = 0;
  }
}
