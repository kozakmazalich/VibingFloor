import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";

/**
 * Halloween asset kit (Neon-Cyberpunk 3D set).
 *
 * Loads the six generated assets once and hands out normalized templates that
 * raceCourse.js / main.js clone. Everything is cached at module level: clones
 * share geometry + materials, so a whole track costs only a handful of MB and
 * a few extra draw calls.
 *
 *   assets/halloween/pumpkin.png       2D reference / UI use
 *   assets/halloween/cobweb.png        ground + HUD corner web
 *   assets/halloween/bat.png           UI fallback
 *   assets/halloween/ghost.png         UI fallback
 *   assets/halloween/moon.png          moon surface (spherical-mapped)
 *   assets/halloween/button-frame.png  menu CTA frame
 *   assets/halloween/models/*.obj/mtl  3D props
 */

const ROOT = "assets/halloween/";
const OBJ_ROOT = `${ROOT}models/`;

const MODEL_FILES = {
  pumpkin: "01_jack_o_lantern",
  cobweb: "02_cobweb_corner",
  bat: "03_neon_bat",
  ghost: "04_glowing_ghost",
  moon: "05_full_moon",
  frame: "06_viber_race_button_frame",
};

let assetsPromise = null;

function loadTexture(loader, file) {
  return new Promise((resolve) => {
    loader.load(
      ROOT + file,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

async function loadObj(name) {
  const mtlLoader = new MTLLoader().setPath(OBJ_ROOT);
  const materials = await mtlLoader.loadAsync(`${name}.mtl`);
  materials.preload();
  const objLoader = new OBJLoader().setMaterials(materials).setPath(OBJ_ROOT);
  return objLoader.loadAsync(`${name}.obj`);
}

/** Scale an object to `height` world units with its base at y = 0 and its
 *  footprint centred on the XZ origin. */
function normalizeToBase(obj, height) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const s = height / (size.y || 1);
  obj.scale.setScalar(s);
  obj.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  const group = new THREE.Group();
  group.add(obj);
  return { group, scale: s, box: new THREE.Box3().setFromObject(group) };
}

/** Centre an object on the origin (used for the sky moon sphere). */
function centerOnOrigin(obj, diameter) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const s = diameter / (Math.max(size.x, size.y, size.z) || 1);
  obj.scale.setScalar(s);
  obj.position.set(-center.x * s, -center.y * s, -center.z * s);
  const group = new THREE.Group();
  group.add(obj);
  return group;
}

/** Emissive channels in the .mtl files are authored for bloom; push them a
 *  little so the pumpkin face, bat wings and ghost rim actually glow. */
function prepMaterials(root, materialsByName) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!m) continue;
      m.side = THREE.DoubleSide;
      if (m.name) materialsByName[m.name] = m;
      if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.12) {
        m.emissive.multiplyScalar(1.4);
        if (m.emissiveIntensity !== undefined) m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.1);
      }
    }
  });
}

/** The bat's wing membrane is one flat mesh; split it down the spine so each
 *  side can flap independently around the body. */
function splitBatWings(template) {
  const wing = template.getObjectByName("Bat_Wing_Membranes");
  if (!wing || !wing.parent) return;
  const geo = wing.geometry;
  const pos = geo.getAttribute("position");
  if (!pos) return;

  const left = [];
  const right = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const target = cx < 0 ? left : right;
    for (let k = 0; k < 3; k++) {
      target.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
    }
  }
  if (!left.length || !right.length) return;

  const makeGeo = (points) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    g.computeVertexNormals();
    return g;
  };

  const parent = wing.parent;
  const material = wing.material;
  wing.removeFromParent();

  for (const [name, points] of [
    ["wingL", left],
    ["wingR", right],
  ]) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.add(new THREE.Mesh(makeGeo(points), material));
    parent.add(pivot);
  }
}

/** Spherical UVs for the moon sphere (the generated OBJ has no UV channel). */
function applySphericalUVs(geo) {
  const pos = geo.getAttribute("position");
  if (!pos) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z) || 1;
    uv[i * 2] = 0.5 + Math.atan2(x, z) / (Math.PI * 2);
    uv[i * 2 + 1] = 0.5 - Math.asin(Math.max(-1, Math.min(1, y / r))) / Math.PI;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function softGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.42)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function buildAssets() {
  const texLoader = new THREE.TextureLoader();
  const [pumpkinTex, cobwebTex, batTex, ghostTex, moonTex, frameTex] = await Promise.all([
    loadTexture(texLoader, "pumpkin.png"),
    loadTexture(texLoader, "cobweb.png"),
    loadTexture(texLoader, "bat.png"),
    loadTexture(texLoader, "ghost.png"),
    loadTexture(texLoader, "moon.png"),
    loadTexture(texLoader, "button-frame.png"),
  ]);

  const loaded = await Promise.all(
    Object.entries(MODEL_FILES).map(async ([key, file]) => {
      try {
        return [key, await loadObj(file)];
      } catch (err) {
        console.warn(`[halloween] could not load ${file}.obj`, err);
        return [key, null];
      }
    })
  );
  const objs = Object.fromEntries(loaded);

  const materials = {};
  const models = {};

  if (objs.pumpkin) {
    const { group } = normalizeToBase(objs.pumpkin, 1.15);
    prepMaterials(group, materials);
    models.pumpkin = group;
  }

  if (objs.bat) {
    const { group } = normalizeToBase(objs.bat, 0.95);
    prepMaterials(group, materials);
    splitBatWings(group);
    models.bat = group;
  }

  if (objs.ghost) {
    const { group } = normalizeToBase(objs.ghost, 1.5);
    prepMaterials(group, materials);
    group.traverse((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (!m) continue;
        m.transparent = true;
        m.opacity = 0.85;
        m.depthWrite = false;
      }
    });
    models.ghost = group;
  }

  if (objs.moon) {
    objs.moon.traverse((o) => {
      if (!o.isMesh) return;
      applySphericalUVs(o.geometry);
    });
    models.moon = centerOnOrigin(objs.moon, 2);
  }

  return {
    textures: {
      pumpkin: pumpkinTex,
      cobweb: cobwebTex,
      bat: batTex,
      ghost: ghostTex,
      moon: moonTex,
      frame: frameTex,
      glow: softGlowTexture(),
    },
    models,
    materials,
  };
}

/**
 * Load the kit once. Resolves to `null` if the assets cannot be fetched, so a
 * failed decoration never takes the race down (the plain neon theme remains).
 */
export function preloadHalloweenAssets() {
  if (!assetsPromise) {
    assetsPromise = buildAssets().catch((err) => {
      console.warn("[halloween] asset kit failed", err);
      assetsPromise = null;
      return null;
    });
  }
  return assetsPromise;
}

/** Build a moon object ready to live in the sky group (centred, diameter 2). */
export function buildMoonMesh(assets) {
  if (!assets || !assets.models.moon) return null;
  const moon = assets.models.moon.clone(true);
  const material = new THREE.MeshBasicMaterial({
    map: assets.textures.moon,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    depthTest: false, // sky backdrop: draw above the course void, under the HUD
    fog: false,
    side: THREE.DoubleSide, // generated sphere winding is inverted
    toneMapped: false,
  });
  moon.traverse((o) => {
    if (o.isMesh) {
      o.material = material;
      o.renderOrder = 1001;
      o.frustumCulled = false;
    }
  });

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: assets.textures.glow,
      color: 0x7b2ff7,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.scale.set(2.2, 2.2, 1);
  halo.position.z = -0.4;
  halo.renderOrder = 1000;

  const group = new THREE.Group();
  group.add(halo, moon);
  return group;
}

/** Small additive halo used behind ghosts / bats. */
export function makeHalo(assets, color, opacity, size) {
  if (!assets || !assets.textures.glow) return null;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: assets.textures.glow,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })
  );
  sprite.scale.set(size, size, 1);
  return sprite;
}
