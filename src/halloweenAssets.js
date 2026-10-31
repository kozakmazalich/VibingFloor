import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  buildNeonBat,
  buildNeonGhost,
  prepareHdBat,
  prepareHdGhost,
} from "./halloweenCreatures.js";

/**
 * Halloween asset kit (Neon-Cyberpunk 3D set).
 *
 * Loads the generated props once and hands out normalized templates that
 * raceCourse.js / main.js clone. Everything is cached at module level: clones
 * share geometry + materials, so a whole track costs only a handful of MB and
 * a few extra draw calls.
 *
 *   assets/halloween/pumpkin.png       2D reference / UI use
 *   assets/halloween/cobweb.png        ground + HUD corner web
 *   assets/halloween/moon.png          moon surface (spherical-mapped)
 *   assets/halloween/button-frame.png  menu CTA frame (CSS)
 *   assets/halloween/models/*.obj/mtl  pumpkin + moon props
 *   assets/halloween/hd/*.glb          authored HD bat + ghost
 *
 * The bat and ghost use the authored GLB models; the procedural builders in
 * halloweenCreatures.js remain as a fallback if a GLB cannot be fetched.
 */

const ROOT = "assets/halloween/";
const OBJ_ROOT = `${ROOT}models/`;
const HD_ROOT = `${ROOT}hd/`;

const MODEL_FILES = {
  pumpkin: "01_jack_o_lantern",
  moon: "05_full_moon",
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

function loadGltf(file) {
  return new Promise((resolve) => {
    new GLTFLoader().load(
      HD_ROOT + file,
      (gltf) => resolve(gltf),
      undefined,
      (err) => {
        console.warn(`[halloween] could not load ${file}, using procedural fallback`, err);
        resolve(null);
      }
    );
  });
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
 *  little so the pumpkin face actually glows. */
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
  const [cobwebTex, moonTex, batGltf, ghostGltf] = await Promise.all([
    loadTexture(texLoader, "cobweb.png"),
    loadTexture(texLoader, "moon.png"),
    loadGltf("03_neon_bat_hd.glb"),
    loadGltf("04_glowing_ghost_hd.glb"),
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

  // Authored HD creatures, with the procedural versions as a safety net.
  try {
    models.bat = batGltf ? prepareHdBat(batGltf.scene) : buildNeonBat();
  } catch (err) {
    console.warn("[halloween] HD bat prep failed, using procedural fallback", err);
    models.bat = buildNeonBat();
  }
  try {
    models.ghost = ghostGltf ? prepareHdGhost(ghostGltf.scene) : buildNeonGhost();
  } catch (err) {
    console.warn("[halloween] HD ghost prep failed, using procedural fallback", err);
    models.ghost = buildNeonGhost();
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
      cobweb: cobwebTex,
      moon: moonTex,
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
    // Depth-tested sky object: banners, pylons and the finish gate in front of
    // it now correctly occlude the disc instead of the moon painting over them.
    depthTest: true,
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

/** Build a moon object ready to live in the sky group (centred, diameter 2). */