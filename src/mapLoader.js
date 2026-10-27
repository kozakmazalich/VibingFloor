/**
 * Menu backdrop: the staking vault's exoplanet with three tilted orbits.
 * It stays in the main scene for the whole main menu (including while a new
 * arena streams in) and hides once a match starts. Drawn behind the tiles,
 * parked in the upper view so it never sits inside the arena.
 * No second WebGL context.
 */
import * as THREE from "three";

const PLANET_VERT = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewDir;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    float n = noise(position * 2.8 + vec3(uTime * 0.15));
    vec3 displaced = position + normal * (n - 0.5) * 0.02;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const PLANET_FRAG = `
  uniform float uTime;
  uniform vec3 uLightDir;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewDir;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      v += amp * noise(p);
      p = p * 2.07 + vec3(0.13, 0.29, 0.17);
      amp *= 0.5;
    }
    return v;
  }
  void main() {
    vec3 norm = normalize(vNormal);
    vec3 viewDir = normalize(vViewDir);
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 2.6);
    vec3 light = normalize(uLightDir);
    float dayLight = smoothstep(-0.25, 0.65, dot(norm, light));
    vec3 p = normalize(vPosition);
    vec3 warp = vec3(
      fbm(p * 2.2 + vec3(uTime * 0.08, 0.0, 0.0)),
      fbm(p * 2.2 + vec3(0.0, uTime * 0.08, 0.0)),
      fbm(p * 2.2 + vec3(0.0, 0.0, uTime * 0.08))
    );
    float continent = fbm(p * 2.6 + warp * 0.85);
    float detail = fbm(p * 7.5 - warp * 1.4 + vec3(uTime * 0.18));
    vec3 deepOcean = vec3(0.02, 0.09, 0.24);
    vec3 shallowSea = vec3(0.0, 0.48, 0.72);
    vec3 landLow = vec3(0.08, 0.26, 0.28);
    vec3 landHigh = vec3(0.22, 0.35, 0.42);
    vec3 iceCap = vec3(0.75, 0.92, 1.0);
    float seaMask = smoothstep(0.47, 0.51, continent);
    vec3 oceanCol = mix(deepOcean, shallowSea, smoothstep(0.28, 0.48, continent));
    vec3 landCol = mix(landLow, landHigh, smoothstep(0.5, 0.75, continent + detail * 0.2));
    landCol = mix(landCol, iceCap, smoothstep(0.76, 0.88, abs(p.y) + detail * 0.15));
    vec3 surface = mix(oceanCol, landCol, seaMask);
    float clouds = smoothstep(0.52, 0.76, fbm(p * 3.4 + vec3(uTime * 0.06, -uTime * 0.03, 0.0)));
    surface = mix(surface, vec3(0.82, 0.96, 1.0), clouds * 0.55);
    float cities = smoothstep(0.64, 0.72, detail) * seaMask * (1.0 - dayLight);
    vec3 color = surface * (0.16 + 0.84 * dayLight);
    color += vec3(0.0, 0.85, 1.0) * cities * 0.8;
    color += vec3(0.15, 0.75, 1.0) * fresnel * 0.85;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const ATMO_VERT = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const ATMO_FRAG = `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.2);
    gl_FragColor = vec4(uColor, rim * 0.95);
  }
`;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const rad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  rad.addColorStop(0, "rgba(255,255,255,0.95)");
  rad.addColorStop(0.35, "rgba(180,240,255,0.45)");
  rad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ORBITS = [
  { radius: 2.35, tiltX: 1.12, tiltZ: 0.28, color: 0x00e5ff, speed: 0.85 },
  { radius: 2.95, tiltX: -0.95, tiltZ: 0.52, color: 0xff2d95, speed: -0.62 },
  { radius: 3.55, tiltX: 0.42, tiltZ: -1.1, color: 0xffd700, speed: 0.48 },
];

// Camera-space anchor: up a little, far enough that the orbit rings stay
// inside the far plane and behind a fully zoomed-out 40-grid.
const BACKDROP_OFFSET = new THREE.Vector3(0, 7.4, -48);
const _anchor = new THREE.Vector3();

export function createArenaLoader(scene, camera) {
  const root = new THREE.Group();
  root.name = "arena-loader-planet";
  root.visible = true;
  root.scale.setScalar(8.5);
  scene.add(root);

  const uniforms = {
    uTime: { value: 0 },
    uLightDir: { value: new THREE.Vector3(1.0, 0.45, 0.85).normalize() },
  };
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1.28, 64, 64),
    new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms,
    })
  );
  root.add(planet);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.48, 48, 48),
    new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: { uColor: { value: new THREE.Color(0x00e5ff) } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  root.add(atmo);

  const sprite = glowTexture();
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sprite,
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  halo.scale.setScalar(2.15);
  root.add(halo);

  const bodies = [];
  const satGeo = new THREE.SphereGeometry(0.11, 16, 16);
  const trailGeo = new THREE.SphereGeometry(0.07, 10, 10);

  ORBITS.forEach((cfg) => {
    const holder = new THREE.Group();
    holder.rotation.x = cfg.tiltX;
    holder.rotation.z = cfg.tiltZ;
    root.add(holder);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(cfg.radius, 0.016, 8, 96),
      new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    holder.add(ring);

    for (let n = 0; n < 4; n++) {
      const mesh = new THREE.Mesh(
        satGeo,
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: cfg.color,
          emissiveIntensity: 1.35,
          roughness: 0.15,
        })
      );
      const satHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: sprite,
          color: cfg.color,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      satHalo.scale.setScalar(0.7);
      mesh.add(satHalo);
      holder.add(mesh);

      const trails = [];
      for (let t = 1; t <= 3; t++) {
        const tr = new THREE.Mesh(
          trailGeo,
          new THREE.MeshBasicMaterial({
            color: cfg.color,
            transparent: true,
            opacity: (1 - t / 4) * 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        tr.scale.setScalar(1 - t * 0.18);
        holder.add(tr);
        trails.push(tr);
      }
      bodies.push({
        mesh,
        trails,
        radius: cfg.radius,
        speed: cfg.speed,
        angle: (n / 4) * Math.PI * 2 + cfg.tiltZ,
      });
    }
  });

  // Opaque pass, before the arena, and no depth write: tiles paint over the
  // planet wherever there is floor, and the planet shows through the voids.
  // Custom and basic materials both ignore fog so the backdrop stays bright.
  root.traverse((obj) => {
    obj.renderOrder = -2;
    const mats = obj.material;
    if (!mats) return;
    const list = Array.isArray(mats) ? mats : [mats];
    for (const m of list) {
      m.fog = false;
      m.depthWrite = false;
      m.transparent = false;
    }
  });
  planet.renderOrder = -3;

  let time = 0;
  return {
    setVisible(visible) {
      root.visible = visible;
    },
    update(dt) {
      if (!root.visible) return;
      if (camera) {
        _anchor.copy(BACKDROP_OFFSET).applyQuaternion(camera.quaternion);
        root.position.copy(camera.position).add(_anchor);
      }
      time += dt;
      uniforms.uTime.value = time;
      planet.rotation.y += dt * 0.18;
      root.rotation.y += dt * 0.05;
      for (const b of bodies) {
        b.angle += dt * b.speed;
        b.mesh.position.set(Math.cos(b.angle) * b.radius, Math.sin(b.angle) * b.radius, 0);
        b.trails.forEach((tr, i) => {
          const lag = b.angle - (i + 1) * 0.09;
          tr.position.set(Math.cos(lag) * b.radius, Math.sin(lag) * b.radius, 0);
        });
      }
    },
  };
}
