import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { COLORS } from "./constants.js";
import { Game } from "./game.js";
import { CHAR_TYPES } from "./robot.js";
import { MAPS, scaledMap } from "./maps.js";
import { buildViber, CHARACTERS } from "./vibers.js";
import { createArenaLoader } from "./mapLoader.js";
import { audio } from "./audio.js";
import { isTouchDevice, setupTouchControls } from "./touch.js";
import { walletState, signWinMessage } from "./wallet.js";
import { Net } from "./net.js";
import { showPrizeDrum, updatePrizeDrum } from "../drum.js";
import { openProfile, wireProfileButtons } from "./profile.js";
import { addWin, setSyncedVibBalance } from "./staking.js";
import { initPrivyAuth, creditWinToPrivyWallet } from "./privyAuth.js";
import { formatRaceTime } from "./race.js";
import { preloadHalloweenAssets, buildMoonMesh } from "./halloweenAssets.js";

// DOM Elements: Menus & Overlays
const startMenuEl = document.getElementById("start-menu");
const pauseMenuEl = document.getElementById("pause-menu");
const winOverlayEl = document.getElementById("win-overlay");
const inGameHudEl = document.getElementById("in-game-hud");
const touchUiEl = document.getElementById("touch-ui");

// Online 1V1 panel (PeerJS)
const onlineMenuEl = document.getElementById("online-menu");
const btnMenuOnlineEl = document.getElementById("btn-menu-online");
const btnOnlineHostEl = document.getElementById("btn-online-host");
const btnOnlineJoinEl = document.getElementById("btn-online-join");
const btnOnlineBackEl = document.getElementById("btn-online-back");
const onlineCodeDisplayEl = document.getElementById("online-code-display");
const onlineCodeEl = document.getElementById("online-code");
const onlineCodeInputEl = document.getElementById("online-code-input");
const onlineStatusEl = document.getElementById("online-status");

// PeerJS networking (online 1v1). Inactive until the player uses it.
const net = new Net();

// VIBER RACE: setup panel + race HUD
const raceMenuEl = document.getElementById("race-menu");
const btnMenuRaceEl = document.getElementById("btn-menu-race");
const btnRaceStartEl = document.getElementById("btn-race-start");
const btnRaceBackEl = document.getElementById("btn-race-back");
const raceSizeEls = Array.from(document.querySelectorAll(".race-size-btn"));
const raceDiffEls = Array.from(document.querySelectorAll(".race-diff-btn"));
const raceMapEls = Array.from(document.querySelectorAll(".race-map-btn"));
const raceThemeEls = Array.from(document.querySelectorAll(".race-theme-btn"));
const btnRaceGlowEl = document.getElementById("btn-race-glow");
const raceGlowStateEl = document.getElementById("race-glow-state");
const raceCountdownEl = document.getElementById("race-countdown");
const raceMapEl = document.getElementById("race-map");
const raceLightEl = document.getElementById("race-light");
const racePlaceEl = document.getElementById("race-place");
const racePlaceTotalEl = document.getElementById("race-place-total");
const raceTimeEl = document.getElementById("race-time");
const raceCpEl = document.getElementById("race-cp");
const raceBattEl = document.getElementById("race-batt");
const raceTrackFillEl = document.getElementById("race-track-fill");
const raceTrackDotsEl = document.getElementById("race-track-dots");
const hudTitleBadgeEl = document.getElementById("hud-title-badge");

// Map 3 audio clickers (music / voice tag on-off)
const raceAudioControlsEl = document.getElementById("race-audio-controls");
const raceToggleMusicEl = document.getElementById("race-toggle-music");
const raceToggleVoiceEl = document.getElementById("race-toggle-voice");
let lastRaceLight = "green";

function syncRaceAudioButtons() {
  if (raceToggleMusicEl) raceToggleMusicEl.classList.toggle("active", audio.musicEnabled);
  if (raceToggleVoiceEl) raceToggleVoiceEl.classList.toggle("active", audio.voiceEnabled);
}
if (raceToggleMusicEl) {
  raceToggleMusicEl.addEventListener("click", () => {
    audio.toggleMusicEnabled();
    syncRaceAudioButtons();
  });
}
if (raceToggleVoiceEl) {
  raceToggleVoiceEl.addEventListener("click", () => {
    const on = audio.toggleVoiceEnabled();
    syncRaceAudioButtons();
    // Immediate confirmation when switching the voice tags back on.
    if (on) audio.playVoice(lastRaceLight === "red" ? "red" : "green");
  });
}
syncRaceAudioButtons();

// Buttons: Start Menu
const btnMenuPlayEl = document.getElementById("btn-menu-play");
const btnMenuSoundEl = document.getElementById("btn-menu-sound");
const menuSoundIconEl = document.getElementById("menu-sound-icon");
const menuSoundTextEl = document.getElementById("menu-sound-text");

// Fighter selection buttons (6 Viber robots + 6 cutout agents on page 2)
const btnCharJpgEl = document.getElementById("btn-char-jpg");
const btnCharMossEl = document.getElementById("btn-char-moss");
const btnCharMechaEl = document.getElementById("btn-char-mecha");
const btnCharPhantomEl = document.getElementById("btn-char-phantom");
const btnCharChogEl = document.getElementById("btn-char-chog");
const btnCharMetaEl = document.getElementById("btn-char-meta");
const btnCharAgent103El = document.getElementById("btn-char-agent103");
const btnCharAgent107El = document.getElementById("btn-char-agent107");
const btnCharAgent111El = document.getElementById("btn-char-agent111");
const btnCharAgent116El = document.getElementById("btn-char-agent116");
const btnCharAgent120El = document.getElementById("btn-char-agent120");
const btnCharAgent123El = document.getElementById("btn-char-agent123");
const charPage1El = document.getElementById("char-page-1");
const charPage2El = document.getElementById("char-page-2");
const charPagerPrevEl = document.getElementById("char-pager-prev");
const charPagerNextEl = document.getElementById("char-pager-next");
const charPagerLabelEl = document.getElementById("char-pager-label");
const menuP1AvatarEl = document.getElementById("menu-p1-avatar"); // legacy <img> (may be absent)
const menuP1AvatarCanvasEl = document.getElementById("menu-p1-avatar-canvas");
const menuP1NameEl = document.getElementById("menu-p1-name");
const hudP1AvatarEl = document.getElementById("hud-p1-avatar");
const hudP1NameEl = document.getElementById("hud-p1-name");

// Arena (map) selection buttons
const mapTabEls = Array.from(document.querySelectorAll(".map-tab-btn"));
const arenaNameEl = document.getElementById("arena-name");

// CPU difficulty buttons
const diffTabEls = Array.from(document.querySelectorAll(".diff-tab-btn"));
const hudP2NameEl = document.getElementById("hud-p2-name");

// Buttons: Pause Menu
const btnPauseResumeEl = document.getElementById("btn-pause-resume");
const btnPauseRestartEl = document.getElementById("btn-pause-restart");
const btnPauseSoundEl = document.getElementById("btn-pause-sound");
const btnPauseMenuEl = document.getElementById("btn-pause-menu");
const pauseSoundIconEl = document.getElementById("pause-sound-icon");
const pauseSoundTextEl = document.getElementById("pause-sound-text");

// Elements: Win Screen
const winTitleEl = document.getElementById("win-title");
const winSubtitleEl = document.getElementById("win-subtitle");
const winAvatarEl = document.getElementById("win-avatar");
const winAvatarFrameEl = document.getElementById("win-avatar-frame");
const winScoreEl = document.getElementById("win-score");
const btnWinRestartEl = document.getElementById("btn-win-restart");
const btnWinMenuEl = document.getElementById("btn-win-menu");

// Elements: In-Game HUD
const canvas = document.getElementById("game-canvas");
const scoreP1El = document.getElementById("score-p1");
const scoreP2El = document.getElementById("score-p2");
const tileCountEl = document.getElementById("tile-count");
const fallTimerEl = document.getElementById("fall-timer");
const fallProgressBarEl = document.getElementById("fall-progress-bar");
const aliveCountEl = document.getElementById("alive-count");
const placementLabelEl = document.getElementById("placement-label");
const itemStatusTextEl = document.getElementById("item-status-text");
const itemSlotIconEl = document.getElementById("item-slot-icon");
const itemSlotHintEl = document.getElementById("item-slot-hint");
const itemFuelBarEl = document.getElementById("item-fuel-bar");
const itemFuelSegs = itemFuelBarEl ? Array.from(itemFuelBarEl.children) : [];
let prevFuelCharges = null;
const pushProgressBarEl = document.getElementById("push-progress-bar");
const pushStatusTextEl = document.getElementById("push-status-text");
const spearProgressBarEl = document.getElementById("spear-progress-bar");
const spearStatusTextEl = document.getElementById("spear-status-text");
const grenadeProgressBarEl = document.getElementById("grenade-progress-bar");
const grenadeStatusTextEl = document.getElementById("grenade-status-text");
const dashProgressBarEl = document.getElementById("dash-progress-bar");
const dashStatusTextEl = document.getElementById("dash-status-text");

const btnHudPauseEl = document.getElementById("btn-hud-pause");
const btnSoundEl = document.getElementById("btn-sound");
const btnResetCamEl = document.getElementById("btn-reset-cam");
const btnHudRestartEl = document.getElementById("btn-hud-restart");

// Wallet UI (Solana Mobile Wallet Adapter) removed — the connect button is
// gone from the menu. The crypto hook itself stays in src/wallet.js (used
// only if a wallet was ever connected, which the UI no longer offers).
const hudWalletEl = document.getElementById("hud-wallet");
const toastEl = document.getElementById("toast");
let toastTimer = 0;
let winStreak = 0;

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

function updateWalletUI() {
  if (walletState.status === "connected" && hudWalletEl) {
    hudWalletEl.textContent = `◈ ${walletState.displayAddress}`;
    hudWalletEl.classList.remove("hidden");
  }
}

// ---- Online 1v1 panel helpers ----
function setOnlineStatus(text, kind = "") {
  if (!onlineStatusEl) return;
  onlineStatusEl.textContent = text;
  onlineStatusEl.className = "online-status" + (kind ? " " + kind : "");
}

function updateOnlineHud() {
  // Re-label the scoreboard for the online match
  if (hudP1NameEl) hudP1NameEl.textContent = `YOU · ${game.p1.name}`;
  if (hudP2NameEl) hudP2NameEl.textContent = `RIVAL · ${game.p2.name}`;
  const p2Avatar = document.querySelector(".p2-team .team-avatar");
  if (p2Avatar) p2Avatar.src = game.p2.portraitPath;
  // The host picks the arena — keep the HUD label in sync with it
  const mapDef = MAPS[game.currentMapIndex];
  if (arenaNameEl && mapDef) arenaNameEl.textContent = mapDef.name;
}

net.onStatus = (status, info) => {
  switch (status) {
    case "starting":
      setOnlineStatus("CONTACTING PEER SERVER…");
      break;
    case "waiting":
      setOnlineStatus("WAITING FOR OPPONENT…");
      if (onlineCodeDisplayEl) onlineCodeDisplayEl.classList.remove("hidden");
      if (onlineCodeEl) onlineCodeEl.textContent = info;
      break;
    case "connecting":
      setOnlineStatus(`JOINING ${info}…`);
      break;
    case "connected":
      setOnlineStatus("CONNECTED — MATCH STARTING", "ok");
      break;
    case "error":
      setOnlineStatus(info || "NETWORK ERROR", "error");
      break;
    case "closed":
      setOnlineStatus(info || "DISCONNECTED", "error");
      break;
    default:
      setOnlineStatus("PEER NETWORK IDLE");
  }
};

net.onMessage = (msg) => game.handleNetMessage(msg);

net.onOpen = () => {
  if (net.role === "host") {
    // Host runs the simulation and announces the arena + its fighter
    net.send({ t: "hello", char: game.selectedChar, map: game.currentMapIndex });
    game.startOnlineGame("host");
    net.send({ t: "start", map: game.currentMapIndex, round: game.roundNumber });
    updateOnlineHud();
  } else {
    // Guest: route messages to the game, then introduce ourselves.
    // The host's "start" message actually begins the round.
    game.setOnlineRole("guest");
    net.send({ t: "hello", char: game.selectedChar });
  }
};

net.onClosed = () => {
  showToast("Opponent disconnected");
  game.goToMenu();
  net.leave();
};

// Touch controls (mobile): mark the document and wire the joystick/buttons.
// On desktop nothing is shown and the keyboard keeps working unchanged.
if (isTouchDevice()) {
  document.documentElement.classList.add("touch-device");
}
setupTouchControls();

// 1. Scene setup — Neon Cyberpunk Arena Art Direction
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.voidBg); // #0a0a14
scene.fog = new THREE.FogExp2(COLORS.voidFog, 0.018);

// 2. Camera setup - angled down ~60°, framing 10x10 grid
const camera = new THREE.PerspectiveCamera(
  46,
  window.innerWidth / window.innerHeight,
  0.1,
  900
);

// Initial camera transform
const DEFAULT_CAM_POS = new THREE.Vector3(0, 20, 14);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 0, 0);
camera.position.copy(DEFAULT_CAM_POS);
camera.lookAt(DEFAULT_CAM_TARGET);

// Screen shake variables
let screenShakeAmount = 0;
const camShakeOffset = new THREE.Vector3();

// 3. Renderer setup
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// 3.5 Optional bloom for the Halloween race theme.
// Loaded lazily (and only while racing) so the battle arena and the menu keep
// the original no-post-processing budget. Bloom itself runs at half resolution
// with 2x MSAA on the composer target to stay 60fps-friendly on an M1 Air.
const BLOOM = { strength: 1.4, radius: 0.7, threshold: 0.85 };
let composer = null;
let bloomPass = null;
let bloomTried = false;
let bloomFailed = false;
let raceLowDpr = false;

function ensureComposer() {
  if (composer || bloomTried) return composer;
  bloomTried = true;

  Promise.all([
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/OutputPass.js"),
  ])
    .then(([{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }]) => {
      composer = new EffectComposer(renderer);
      // Multisampled composer target: the default framebuffer's MSAA does not
      // carry over to a render target, so without this the race looks jagged.
      composer.renderTarget1.samples = 2;
      composer.renderTarget2.samples = 2;
      composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        BLOOM.strength,
        BLOOM.radius,
        BLOOM.threshold
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      resizeComposer();
    })
    .catch((err) => {
      bloomFailed = true;
      composer = null;
      console.warn("[bloom] post-processing unavailable, using direct render", err);
    });

  return null;
}

function resizeComposer() {
  if (!composer || !bloomPass) return;
  const ratio = Math.min(window.devicePixelRatio, 1.5);
  composer.setPixelRatio(ratio);
  composer.setSize(window.innerWidth, window.innerHeight);
  // EffectComposer.setSize pushes the full effective size into every pass;
  // shrink the bloom mips back to half resolution.
  bloomPass.setSize((window.innerWidth * ratio) / 2, (window.innerHeight * ratio) / 2);
}

/** Bloom is the only extra full-screen pass left in the race, but it is still
 *  the most expensive thing on screen: cap the race canvas at 1.5x DPR while it
 *  is on so the bloom mips and the effects stay inside the M1 frame budget. */
function setRaceRenderScale(low, force = false) {
  const ratio = Math.min(window.devicePixelRatio, low ? 1.5 : 2);
  if (!force && low === raceLowDpr && renderer.getPixelRatio() === ratio) return;
  raceLowDpr = low;
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) resizeComposer();
}

function renderFrame() {
  const useBloom =
    raceBloom &&
    raceHalloween &&
    game.mode === "race" &&
    game.state !== "menu" &&
    !bloomFailed;

  setRaceRenderScale(useBloom);

  if (useBloom) {
    if (!composer) ensureComposer();
    if (composer) {
      composer.render();
      return;
    }
  }
  renderer.render(scene, camera);
}

// 4. OrbitControls with smooth auto-orbit during Start Menu
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(DEFAULT_CAM_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 45;
controls.maxPolarAngle = Math.PI / 2 - 0.08; // Don't orbit below ground
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;
// Mobile: a two-finger gesture should ALSO rotate the camera (pinch still
// zooms). The OrbitControls default (two fingers = dolly + pan) made trying
// to rotate the view zoom/pan instead, which felt broken on a phone.
if (isTouchDevice()) {
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
}

// 5. High-Impact Cyber Arena Lighting
const ambientLight = new THREE.AmbientLight(0x10152a, 1.4);
scene.add(ambientLight);

// Crisp top directional key light
const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
dirLight.position.set(18, 30, 14);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 5;
dirLight.shadow.camera.far = 60;
const d = 16;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// Neon cyan edge rim light
const cyanRim = new THREE.DirectionalLight(COLORS.accentCyan, 2.2);
cyanRim.position.set(-26, 14, -18);
scene.add(cyanRim);

// Laser magenta contrast fill light
const magentaRim = new THREE.DirectionalLight(COLORS.accentMagenta, 1.7);
magentaRim.position.set(24, 9, -22);
scene.add(magentaRim);

// 6. Cyberpunk Neon Background Environment
// A. Infinite Cyber Grid in the Abyss Floor
const cyberGrid = new THREE.GridHelper(200, 100, COLORS.gridMajor, COLORS.gridMinor);
cyberGrid.position.y = -12;
cyberGrid.material.transparent = true;
cyberGrid.material.opacity = 0.55;
scene.add(cyberGrid);

// B. Faint Glowing Grid Horizon
function createGridHorizon() {
  const horizonGeo = new THREE.CylinderGeometry(80, 80, 16, 64, 4, true);
  const horizonMat = new THREE.MeshBasicMaterial({
    color: COLORS.accentCyan,
    wireframe: true,
    transparent: true,
    opacity: 0.1,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(horizonGeo, horizonMat);
  mesh.position.y = -3.5;
  scene.add(mesh);
  return mesh;
}
const horizonGrid = createGridHorizon();

// C. Floating Holographic Arena Halo Rings
const haloGroup = new THREE.Group();

const haloGeo1 = new THREE.TorusGeometry(22, 0.06, 16, 120);
const haloMat1 = new THREE.MeshBasicMaterial({
  color: COLORS.accentCyan,
  transparent: true,
  opacity: 0.65,
});
const haloMesh1 = new THREE.Mesh(haloGeo1, haloMat1);
haloMesh1.rotation.x = Math.PI / 2;
haloMesh1.position.y = -1.2;
haloGroup.add(haloMesh1);

const haloGeo2 = new THREE.TorusGeometry(28, 0.045, 16, 120);
const haloMat2 = new THREE.MeshBasicMaterial({
  color: COLORS.accentMagenta,
  transparent: true,
  opacity: 0.45,
});
const haloMesh2 = new THREE.Mesh(haloGeo2, haloMat2);
haloMesh2.rotation.x = Math.PI / 2;
haloMesh2.position.y = -3.2;
haloGroup.add(haloMesh2);

scene.add(haloGroup);

// D. Dual-Color Drifting Cyber Embers (Cyan & Magenta Sparks)
function createCyberEmbers() {
  const count = 340;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  const cCyan = new THREE.Color(COLORS.accentCyan);
  const cMag = new THREE.Color(COLORS.accentMagenta);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = -16.0 + Math.random() * 26;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 60;

    const pick = Math.random() > 0.45 ? cCyan : cMag;
    colors[i * 3 + 0] = pick.r;
    colors[i * 3 + 1] = pick.g;
    colors[i * 3 + 2] = pick.b;

    speeds[i] = 0.5 + Math.random() * 0.9;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.16,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, geo, positions, speeds, count };
}
const embers = createCyberEmbers();

// 6.5 Halloween sky: the generated full moon (OBJ sphere + PNG surface) rides
// with the race camera, far enough out to read as a skybox dome.
function createMoon() {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  preloadHalloweenAssets().then((assets) => {
    const moon = buildMoonMesh(assets);
    if (!moon) return;
    moon.scale.setScalar(22); // sphere diameter 2 -> 44 world units
    group.add(moon);
  });

  return group;
}
const moonGroup = createMoon();
// The Halloween moon is a real object on the MAP: one fixed world position per
// race, parked far down the track. It is never re-anchored to the camera, so
// running forward leaves it exactly where it is (only camera rotation moves it
// across the view, like any distant object).
const MOON_FAR_AHEAD = 420; // extra distance beyond the finish line
const MOON_HEIGHT = 13;
const MOON_SIDE = -0.16; // fraction of the forward distance, to the left

// Saved arena atmosphere, so the Halloween theme can switch it on and off.
const _atmo = {
  bg: scene.background.getHex(),
  fogColor: scene.fog.color.getHex(),
  fogDensity: scene.fog.density,
  ambient: ambientLight.color.getHex(),
  ambientInt: ambientLight.intensity,
  dir: dirLight.color.getHex(),
};

function applyRaceAtmosphere(hal) {
  if (hal) {
    scene.background.setHex(0x0a0612); // deep black
    scene.fog.color.setHex(0x0a0612);
    scene.fog.density = 0.03; // darker, thicker fog
    ambientLight.color.setHex(0x2a1440); // witch-purple fill
    ambientLight.intensity = 1.5;
    dirLight.color.setHex(0xffd9b0); // warm moonlight key
  } else {
    scene.background.setHex(_atmo.bg);
    scene.fog.color.setHex(_atmo.fogColor);
    scene.fog.density = _atmo.fogDensity;
    ambientLight.color.setHex(_atmo.ambient);
    ambientLight.intensity = _atmo.ambientInt;
    dirLight.color.setHex(_atmo.dir);
  }
}

// 7. Sound State Sync
function syncSoundUI(isMuted) {
  const icon = isMuted ? "🔇" : "🔊";
  const label = isMuted ? "AUDIO SYNTH: MUTED" : "AUDIO SYNTH: ACTIVE";

  if (menuSoundIconEl) menuSoundIconEl.textContent = icon;
  if (menuSoundTextEl) menuSoundTextEl.textContent = label;

  if (pauseSoundIconEl) pauseSoundIconEl.textContent = icon;
  if (pauseSoundTextEl) pauseSoundTextEl.textContent = label;

  if (btnSoundEl) btnSoundEl.textContent = `${icon} Sound`;
}

function handleSoundToggle() {
  const isMuted = audio.toggleMute();
  syncSoundUI(isMuted);
  audio.playClick();
}

// 8. Initialize Game Engine
let maxFallInterval = 2.2;

const arenaLoader = createArenaLoader(scene, camera);
const arenaLoaderEl = document.getElementById("arena-loader");
const arenaLoaderNameEl = document.getElementById("arena-loader-name");

function frameMenuCamera(gridSize) {
  const g = gridSize || 20;
  if (g <= 22) {
    camera.position.copy(DEFAULT_CAM_POS);
  } else {
    const s = Math.min(1.7, g / 20);
    camera.position.set(DEFAULT_CAM_POS.x * s, DEFAULT_CAM_POS.y * s, DEFAULT_CAM_POS.z * s);
  }
  controls.target.set(0, 0, 0);
  controls.update();
}

// The arena is gameplay-only now: the start menu shows the aurora backdrop and
// the planet instead of a live board preview.
function setArenaPreviewVisible(visible) {
  if (game.island && game.island.setArenaVisible) game.island.setArenaVisible(visible);
  for (const r of game.robots || []) {
    if (r && r.group) r.group.visible = visible;
  }
}

// The abyss floor grid and the wireframe horizon are part of the playable
// scene, but from the menu camera they read as a stray grid over the whole
// background — park them while the start screen is up.
function setMenuBackdropHidden(hidden) {
  const show = !hidden;
  if (cyberGrid) cyberGrid.visible = show;
  if (horizonGrid) horizonGrid.visible = show;
}

const game = new Game(scene, camera, {
  onGameStart: (info) => {
    startMenuEl.classList.add("hidden");
    onlineMenuEl.classList.add("hidden");
    raceMenuEl.classList.add("hidden");
    pauseMenuEl.classList.add("hidden");
    winOverlayEl.classList.add("hidden");
    inGameHudEl.classList.remove("hidden");

    const isRace = !!(info && info.race);
    setRaceMode(isRace);
    if (isRace) {
      const hal = !!(info && info.halloween);
      applyRaceAtmosphere(hal);
      document.body.classList.toggle("halloween-race", hal);
    }

    // Rebuild the survivors strip for this match's roster
    renderSurvivors(isRace ? info.racers : game.robots);

    if (info && info.online) {
      updateOnlineHud();
    }

    controls.autoRotate = false;
    arenaLoader.setVisible(false);
    if (isRace) snapRaceCamera();
    setMenuBackdropHidden(false);
    if (!isRace) setArenaPreviewVisible(true);
  },

  // Fired whenever the fighter roster changes (bot count / map rebuild)
  onRosterChange: (robots) => {
    renderSurvivors(robots);
  },

  onPause: (isPaused) => {
    if (isPaused) {
      pauseMenuEl.classList.remove("hidden");
    } else {
      pauseMenuEl.classList.add("hidden");
    }
  },

  onArenaLoading: (loading, label) => {
    if (arenaLoaderEl) {
      arenaLoaderEl.classList.toggle("hidden", !loading);
      arenaLoaderEl.setAttribute("aria-hidden", loading ? "false" : "true");
    }
    if (loading && arenaLoaderNameEl && label) arenaLoaderNameEl.textContent = label;
    document.body.classList.toggle("arena-loading", !!loading);
  },

  onArenaReady: (mapDef) => {
    if (game.state === "menu") {
      frameMenuCamera(mapDef && mapDef.gridSize);
      setArenaPreviewVisible(false);
      setMenuBackdropHidden(true);
    }
  },

  onMenu: () => {
    pauseMenuEl.classList.add("hidden");
    winOverlayEl.classList.add("hidden");
    inGameHudEl.classList.add("hidden");
    onlineMenuEl.classList.add("hidden");
    raceMenuEl.classList.add("hidden");
    startMenuEl.classList.remove("hidden");
    setRaceMode(false);
    game.onMenuSpace = null;

    // Leaving the menu always tears down any live P2P session
    net.leave();

    // Planet is the menu backdrop for as long as this screen is up.
    arenaLoader.setVisible(true);
    frameMenuCamera(game.island.gridSize);
    setArenaPreviewVisible(false);
    setMenuBackdropHidden(true);

    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;
  },

  onStatusUpdate: (status) => {
    if (!status.race) {
      tileCountEl.textContent = `${status.activeTiles}/${status.totalTiles || 100}`;
      fallTimerEl.textContent = `${status.nextFallTimer.toFixed(1)}s`;

      if (game.island.currentInterval) {
        maxFallInterval = game.island.currentInterval;
      }
      const pct = Math.max(0, Math.min(100, (status.nextFallTimer / maxFallInterval) * 100));
      fallProgressBarEl.style.width = `${pct}%`;
    }

    // Active Arsenal Cooldown HUD
    if (status.abilities) {
      // 1. Push (SPACE)
      const p = status.abilities.push;
      if (p) {
        pushProgressBarEl.style.width = `${Math.round(p.progress * 100)}%`;
        if (p.ready) {
          pushStatusTextEl.textContent = "READY";
          pushStatusTextEl.className = "status-value ready tabular";
          pushProgressBarEl.classList.add("ready");
        } else {
          pushStatusTextEl.textContent = `${p.remaining.toFixed(1)}s`;
          pushStatusTextEl.className = "status-value charging tabular";
          pushProgressBarEl.classList.remove("ready");
        }
      }

      // 2. Spear Thrust (E)
      const s = status.abilities.spear;
      if (s) {
        spearProgressBarEl.style.width = `${Math.round(s.progress * 100)}%`;
        if (s.locked) {
          spearStatusTextEl.textContent = "LOCKED";
          spearStatusTextEl.className = "status-value locked tabular";
          spearProgressBarEl.classList.remove("ready");
        } else if (s.ready) {
          spearStatusTextEl.textContent = "READY";
          spearStatusTextEl.className = "status-value ready tabular";
          spearProgressBarEl.classList.add("ready");
        } else {
          spearStatusTextEl.textContent = `${s.remaining.toFixed(1)}s`;
          spearStatusTextEl.className = "status-value charging tabular";
          spearProgressBarEl.classList.remove("ready");
        }
      }

      // 3. Cyber Grenade (G)
      const g = status.abilities.grenade;
      if (g) {
        grenadeProgressBarEl.style.width = `${Math.round(g.progress * 100)}%`;
        if (g.locked) {
          grenadeStatusTextEl.textContent = "LOCKED";
          grenadeStatusTextEl.className = "status-value locked tabular";
          grenadeProgressBarEl.classList.remove("ready");
        } else if (g.ready) {
          grenadeStatusTextEl.textContent = "READY";
          grenadeStatusTextEl.className = "status-value ready tabular";
          grenadeProgressBarEl.classList.add("ready");
        } else {
          grenadeStatusTextEl.textContent = `${g.remaining.toFixed(1)}s`;
          grenadeStatusTextEl.className = "status-value charging tabular";
          grenadeProgressBarEl.classList.remove("ready");
        }
      }

      // 4. Neon Dash (SHIFT)
      const d = status.abilities.dash;
      if (d) {
        dashProgressBarEl.style.width = `${Math.round(d.progress * 100)}%`;
        if (d.ready) {
          dashStatusTextEl.textContent = "READY";
          dashStatusTextEl.className = "status-value ready tabular";
          dashProgressBarEl.classList.add("ready");
        } else {
          dashStatusTextEl.textContent = `${d.remaining.toFixed(1)}s`;
          dashStatusTextEl.className = "status-value charging tabular";
          dashProgressBarEl.classList.remove("ready");
        }
      }

      // 5. Consumable item slot. Hint stays "Q — USE" while an item is held.
      // The jetpack fuel bar is five segments; the one that just drained pops.
      const item = status.abilities.item;
      if (item && itemStatusTextEl) {
        const showJetpack = item.kind === "jetpack" || item.showFuel;
        if (showJetpack) {
          const charges = item.charges || 0;
          const spent = charges <= 0;
          itemStatusTextEl.textContent = spent ? "EMPTY" : "JETPACK";
          itemStatusTextEl.className = spent
            ? "status-value locked tabular"
            : "status-value ready tabular";
          if (itemSlotIconEl) {
            itemSlotIconEl.src = "assets/Jetpack.png";
            itemSlotIconEl.style.display = "block";
            itemSlotIconEl.classList.toggle("spent", spent);
          }
          if (itemSlotHintEl) itemSlotHintEl.textContent = spent ? "—" : "Q — USE";
          if (itemFuelBarEl) {
            itemFuelBarEl.hidden = false;
            for (let i = 0; i < itemFuelSegs.length; i++) {
              itemFuelSegs[i].classList.toggle("lit", i < charges);
            }
            if (prevFuelCharges != null && charges < prevFuelCharges) {
              const popped = itemFuelSegs[charges];
              if (popped) {
                popped.classList.remove("pop");
                void popped.offsetWidth;
                popped.classList.add("pop");
              }
            }
            prevFuelCharges = charges;
          }
        } else if (item.kind === "quake") {
          itemStatusTextEl.textContent = "QUAKE";
          itemStatusTextEl.className = "status-value ready tabular";
          if (itemSlotIconEl) {
            itemSlotIconEl.src = "assets/Quake.png";
            itemSlotIconEl.style.display = "block";
            itemSlotIconEl.classList.remove("spent");
          }
          if (itemSlotHintEl) itemSlotHintEl.textContent = "Q — USE";
          if (itemFuelBarEl) itemFuelBarEl.hidden = true;
          prevFuelCharges = null;
        } else {
          itemStatusTextEl.textContent = "EMPTY";
          itemStatusTextEl.className = "status-value locked tabular";
          if (itemSlotIconEl) {
            itemSlotIconEl.style.display = "none";
            itemSlotIconEl.classList.remove("spent");
          }
          if (itemSlotHintEl) itemSlotHintEl.textContent = "—";
          if (itemFuelBarEl) itemFuelBarEl.hidden = true;
          prevFuelCharges = null;
        }
      }
    }

    if (status.race) {
      updateRaceHud(status.race);
      return;
    }

    scoreP1El.textContent = status.scores.p1;
    scoreP2El.textContent = status.scores.p2;

    // Live standings: fighters left + the player's placement (while alive).
    if (aliveCountEl) {
      aliveCountEl.textContent = `${status.alive} / ${status.survivors}`;
    }
    if (placementLabelEl) {
      if (status.placement != null) {
        placementLabelEl.textContent = `#${status.placement} / ${status.totalFighters || status.survivors}`;
      } else {
        placementLabelEl.textContent = "-- (in play)";
      }
    }

    // Dim eliminated fighters in the survivors strip (cheap class toggle)
    if (status.robots) updateSurvivors(status.robots);
  },

  // A fighter walked over a weapon pod and equipped it
  onPickup: (info) => {
    const label = info.kind === "spear" ? "SPEAR" : "GRENADE";
    const key = info.kind === "spear" ? "E" : "G";
    if (info.isPlayer) {
      showToast(`◈ ${label} acquired — press ${key}`);
      // Flash the matching ability block to draw the eye
      const el = info.kind === "spear" ? spearStatusTextEl : grenadeStatusTextEl;
      if (el) {
        const block = el.closest(".ability-block");
        if (block) {
          block.classList.add("flash");
          setTimeout(() => block.classList.remove("flash"), 700);
        }
      }
    } else {
      showToast(`⚡ ${info.name} grabbed the ${label}`);
    }
  },

  // A fighter walked over a consumable pod (jetpack / quake)
  onConsumablePickup: (info) => {
    const label = info.kind === "jetpack" ? "JETPACK" : "QUAKE";
    if (info.isPlayer) {
      showToast(`◈ ${label} equipped — press Q to use`);
      const block = document.getElementById("item-slot-block");
      if (block) {
        block.classList.add("flash");
        setTimeout(() => block.classList.remove("flash"), 700);
      }
    } else {
      showToast(`⚡ ${info.name} grabbed a ${label}`);
    }
  },

  onRoundEnd: (outcome) => {
    // WINNER == inside the top-N cut (placement <= winnerCount). Online 1v1
    // uses the same flag; non-winners get the placement screen with NO drum.
    const isWinner = outcome.isPlayerWinner === true;

    // Track the player's win streak for the signed memo
    if (isWinner) {
      winStreak++;
      addWin(); // profile WINS counter
    } else {
      winStreak = 0;
    }

    // Optional crypto: sign the win with the connected wallet (silent if not connected)
    if (isWinner && walletState.status === "connected") {
      const memo = `${game.p1.name.toUpperCase()} WON — streak ${winStreak}`;
      signWinMessage(memo).then((res) => {
        if (res.ok) showToast("signed ✓");
      });
    }

    winTitleEl.textContent = outcome.winnerText;
    winTitleEl.style.color = outcome.winnerColor;
    winSubtitleEl.textContent = outcome.subText || "";

    if (winScoreEl) {
      winScoreEl.innerHTML = outcome.race
        ? `FINISH TIME: <span class="tabular">${outcome.timeText}</span>`
        : `MATCH SCORE: <span class="tabular">${outcome.scores.p1} - ${outcome.scores.p2}</span>`;
    }

    if (outcome.winnerId === 1) {
      winAvatarEl.src = outcome.winnerAvatar || "assets/robot1_portrait.png";
      winAvatarFrameEl.className = "avatar-frame large cyan";
      winAvatarEl.style.display = "block";
    } else if (outcome.winnerId === 2) {
      winAvatarEl.src = outcome.winnerAvatar || "assets/robot2_portrait.png";
      winAvatarFrameEl.className = "avatar-frame large magenta";
      winAvatarEl.style.display = "block";
    } else {
      winAvatarEl.style.display = "none";
    }

    if (isWinner) {
      // Player is a WINNER (top-N) -> spin the prize drum, then reveal the
      // win screen. Non-winners skip the drum entirely.
      game.drumActive = true;
      if (touchUiEl) touchUiEl.style.display = "none"; // keep the spin clean on mobile
      showPrizeDrum(
        (wonAmount) => {
          game.drumActive = false;
          if (touchUiEl) touchUiEl.style.display = "";
          winSubtitleEl.textContent =
            (outcome.subText || "") + "  ·  +" + wonAmount.toLocaleString() + " $VIB";
          winOverlayEl.classList.remove("hidden");
          // Guest mode: no-op. Logged in: treasury pays testnet $VIB to the
          // Privy embedded wallet and syncs the on-chain balance to the profile.
          creditWinToPrivyWallet(wonAmount);
        },
        { renderer, manualLoop: true, character: game.p1 ? game.p1.charIndex : 0 }
      );
    } else {
      // Loss / draw / not in the top-N -> no drum, just the normal screen
      winOverlayEl.classList.remove("hidden");
    }
  },

  onScreenShake: (amount) => {
    screenShakeAmount = Math.max(screenShakeAmount, amount);
  },

  onRoundStart: () => {
    winOverlayEl.classList.add("hidden");
    pauseMenuEl.classList.add("hidden");

    if (game.mode === "race" && game.race) {
      renderSurvivors(game.race.racerRobots());
      snapRaceCamera();
      return;
    }

    // Everyone is alive again — reset the survivors strip
    renderSurvivors(game.robots);

    // Snap the camera onto the player's spawn — follow takes over from here
    frameCameraOnPlayer();
  },

  // VIBER RACE: 3-2-1-GO overlay
  onRaceCountdown: (label) => showRaceCountdown(label),

  // VIBER RACE: checkpoint / battery / respawn / finish notifications
  onRaceEvent: (e) => {
    switch (e.type) {
      case "checkpoint":
        showToast(`✔ CHECKPOINT ${e.cp}/${e.total} — respawn point saved`);
        break;
      case "respawn":
        showToast(`↺ Respawned at ${e.cp === 0 ? "the START" : `CHECKPOINT ${e.cp}`}`);
        break;
      case "battery": {
        showToast(`⚡ Battery +1 (${e.count}/5) — press Q to jetpack`);
        const block = document.getElementById("item-slot-block");
        if (block) {
          block.classList.add("flash");
          setTimeout(() => block.classList.remove("flash"), 700);
        }
        break;
      }
      case "finish":
        showToast(
          e.isPlayer
            ? `🏁 FINISHED #${e.place} — ${formatRaceTime(e.time)}`
            : `🏁 ${e.name} finished #${e.place}`
        );
        break;
      case "map":
        showToast(`🗺 ${e.name} — ${e.tagline}`);
        break;
      case "redlight":
        if (e.light === "red") showToast("🔴 RED LIGHT — freeze!");
        else if (e.light === "green") showToast("🟢 GREEN LIGHT — run!");
        else if (e.light === "shot") showToast("🔫 Shot! Back to your checkpoint");
        break;
      case "meteor":
        showToast(e.direct ? "☄️ Direct hit! Back to your checkpoint" : "☄️ Meteor near miss");
        break;
    }
  },

  onCollision: (dist) => {
    screenShakeAmount = Math.max(screenShakeAmount, 0.18);
  },
});

// Debug/test hook: lets CDP check scripts inspect the running game.
window.game = game;
window.__renderer = renderer;
window.__camera = camera;
window.__controls = controls;

// Wire the network into the game — all online sends (snapshots, input,
// restart requests) go through game.net.
game.net = net;

// ------------------------------------------------------------------
// Follow camera: the orbit pivot glides after the player so the robot
// stays in frame while the island scrolls under it. The camera position
// is shifted by the SAME delta as the pivot, so drag-to-orbit and zoom
// keep working, and camera-relative movement stays stable.
// ------------------------------------------------------------------
const followPivot = new THREE.Vector3();
const FOLLOW_LAG = 5.0; // 1/lag = smoothing time constant (~0.2s, snappy)
const FOLLOW_LEAD = 0.25; // seconds of look-ahead in the travel direction
const FOLLOW_MAX_LEAD = 2.2; // clamp so knockback can't yank the frame

// Instantly center the orbit pivot on the player (round starts, reset cam)
function frameCameraOnPlayer() {
  const p = game.p1;
  controls.target.set(p.pos.x, 0, p.pos.z);
  camera.position.set(
    p.pos.x + DEFAULT_CAM_POS.x,
    DEFAULT_CAM_POS.y,
    p.pos.z + DEFAULT_CAM_POS.z
  );
  controls.update();
}

// Glide the pivot toward the player (with a small look-ahead). Freezes
// while the player tumbles into the void so the arena stays in frame.
function updateCameraFollow(dt) {
  if (game.state !== "playing") return;
  const p = game.p1;
  if (p.pos.y < -0.5) return;

  let leadX = p.vel.x * FOLLOW_LEAD;
  let leadZ = p.vel.y * FOLLOW_LEAD;
  const leadLen = Math.hypot(leadX, leadZ);
  if (leadLen > FOLLOW_MAX_LEAD) {
    leadX *= FOLLOW_MAX_LEAD / leadLen;
    leadZ *= FOLLOW_MAX_LEAD / leadLen;
  }
  followPivot.set(p.pos.x + leadX, 0, p.pos.z + leadZ);

  const k = 1 - Math.exp(-dt * FOLLOW_LAG);
  const mx = (followPivot.x - controls.target.x) * k;
  const mz = (followPivot.z - controls.target.z) * k;
  if (Math.abs(mx) < 0.0005 && Math.abs(mz) < 0.0005) return;

  controls.target.x += mx;
  controls.target.z += mz;
  camera.position.x += mx;
  camera.position.z += mz;
}

// ------------------------------------------------------------------
// VIBER RACE: chase camera behind the player looking down the track,
// mode toggles, HUD and countdown.
// ------------------------------------------------------------------
const raceCamGoal = new THREE.Vector3();
const raceLookGoal = new THREE.Vector3();
const raceLook = new THREE.Vector3();
let raceFollowY = 0;
let countdownTimer = 0;

function raceCameraGoals() {
  const p = game.p1;
  // Freeze while the player tumbles into the void; resume on respawn.
  if (p.state !== "alive") return false;
  const x = p.pos.x * 0.7;
  raceCamGoal.set(x, raceFollowY + 6.6, p.pos.z + 10.2);
  raceLookGoal.set(x, raceFollowY + 0.9, p.pos.z - 7);
  return true;
}

function syncRaceBackdrop() {
  // Grid / horizon / embers / key light travel with the camera down the track.
  cyberGrid.position.z = Math.round((camera.position.z - 20) / 2) * 2;
  if (horizonGrid) horizonGrid.position.z = camera.position.z - 20;
  if (embers) embers.points.position.z = camera.position.z - 22;
  dirLight.position.set(raceLook.x + 18, 30, raceLook.z + 14);
  dirLight.target.position.set(raceLook.x, 0, raceLook.z);
  dirLight.target.updateMatrixWorld();

  // Halloween full moon: pinned to the map, far beyond the finish line.
  if (moonGroup) {
    const hal = !!(game.race && game.race.halloween) && game.mode === "race";
    moonGroup.visible = hal;
    if (hal) {
      const course = game.race.course;
      // Place it once per race (and re-place when the course is rebuilt).
      if (course && moonGroup.userData.course !== course) {
        moonGroup.userData.course = course;
        const ahead = (course.finishS || 200) + MOON_FAR_AHEAD;
        moonGroup.position.set(ahead * MOON_SIDE, MOON_HEIGHT, -ahead);
        moonGroup.updateMatrixWorld(true);
      }
    }
  }
}

function snapRaceCamera() {
  raceFollowY = Math.max(0, game.p1.pos.y);
  if (!raceCameraGoals()) return;
  camera.position.copy(raceCamGoal);
  raceLook.copy(raceLookGoal);
  camera.lookAt(raceLook);
  syncRaceBackdrop();
}

function updateRaceCamera(dt) {
  const p = game.p1;
  if (p.state === "alive") {
    raceFollowY += (Math.max(0, Math.min(p.pos.y, 4)) - raceFollowY) * (1 - Math.exp(-dt * 3));
  }
  if (raceCameraGoals()) {
    camera.position.lerp(raceCamGoal, 1 - Math.exp(-dt * 5));
    raceLook.lerp(raceLookGoal, 1 - Math.exp(-dt * 7));
  }
  camera.lookAt(raceLook);
  syncRaceBackdrop();
}

function setRaceMode(on) {
  document.body.classList.toggle("race-mode", on);
  controls.enabled = !on;
  haloGroup.visible = !on;
  if (hudTitleBadgeEl) hudTitleBadgeEl.textContent = on ? "VIBER RACE" : "3D ARENA";
  raceHudCache.place = -1;
  raceHudCache.finished = "";
  raceHudCache.dots = [];
  if (raceTrackDotsEl) raceTrackDotsEl.innerHTML = "";
  if (!on) {
    cyberGrid.position.z = 0;
    if (horizonGrid) horizonGrid.position.z = 0;
    if (embers) embers.points.position.z = 0;
    dirLight.position.set(18, 30, 14);
    dirLight.target.position.set(0, 0, 0);
    dirLight.target.updateMatrixWorld();
    if (moonGroup) moonGroup.visible = false;
    applyRaceAtmosphere(false);
    document.body.classList.remove("halloween-race");
    if (raceCountdownEl) raceCountdownEl.classList.add("hidden");
  }
}

function showRaceCountdown(label) {
  if (!raceCountdownEl) return;
  raceCountdownEl.textContent = label;
  raceCountdownEl.classList.remove("hidden", "pop", "go");
  void raceCountdownEl.offsetWidth; // restart the pop animation
  raceCountdownEl.classList.add("pop");
  const go = label === "GO!";
  if (go) raceCountdownEl.classList.add("go");
  clearTimeout(countdownTimer);
  countdownTimer = setTimeout(() => raceCountdownEl.classList.add("hidden"), go ? 700 : 1100);
}

// Only touch the DOM when a value actually changes (status arrives every frame).
const raceHudCache = { place: -1, total: -1, time: "", cp: "", batt: "", dots: [], finished: "", map: "", hazard: "", light: "" };

function updateRaceHud(r) {
  if (r.map !== raceHudCache.map && raceMapEl) {
    raceHudCache.map = r.map;
    raceMapEl.textContent = r.map || "—";
  }
  // Music / voice tag clickers are shown only on RED LIGHT GREEN LIGHT (map 3).
  if (r.hazard !== raceHudCache.hazard) {
    raceHudCache.hazard = r.hazard;
    if (raceAudioControlsEl) raceAudioControlsEl.classList.toggle("show", r.hazard === "redlight");
    syncRaceAudioButtons();
  }
  // Map signal: Red Light Green Light state, or a meteor-shower hint.
  const light = r.hazard === "redlight" ? r.light : r.hazard === "islands" ? "meteor" : null;
  if (r.hazard === "redlight" && (r.light === "red" || r.light === "green")) lastRaceLight = r.light;
  if (light !== raceHudCache.light && raceLightEl) {
    raceHudCache.light = light;
    if (!light) {
      raceLightEl.textContent = "—";
      raceLightEl.className = "status-value race-light";
    } else if (light === "green") {
      raceLightEl.textContent = "GREEN LIGHT";
      raceLightEl.className = "status-value race-light green";
    } else if (light === "red") {
      raceLightEl.textContent = "RED LIGHT";
      raceLightEl.className = "status-value race-light red";
    } else {
      raceLightEl.textContent = "☄ METEORS";
      raceLightEl.className = "status-value race-light meteor";
    }
  }
  if (r.place !== raceHudCache.place) {
    const prev = raceHudCache.place;
    raceHudCache.place = r.place;
    racePlaceEl.textContent = r.place;
    racePlaceEl.classList.toggle("first", r.place === 1);
    if (prev > 0) {
      racePlaceEl.classList.add("bump");
      setTimeout(() => racePlaceEl.classList.remove("bump"), 180);
    }
  }
  if (r.total !== raceHudCache.total) {
    raceHudCache.total = r.total;
    racePlaceTotalEl.textContent = `/ ${r.total}`;
  }
  const time = formatRaceTime(r.time);
  if (time !== raceHudCache.time) {
    raceHudCache.time = time;
    raceTimeEl.textContent = time;
  }
  const cp = `${r.cp} / ${r.cpTotal}`;
  if (cp !== raceHudCache.cp) {
    raceHudCache.cp = cp;
    raceCpEl.textContent = cp;
  }
  const batt = `${r.batteries} / ${r.maxBatteries}`;
  if (batt !== raceHudCache.batt) {
    raceHudCache.batt = batt;
    raceBattEl.textContent = batt;
    raceBattEl.classList.toggle("full", r.batteries >= r.maxBatteries);
  }
  raceTrackFillEl.style.width = `${(r.progress * 100).toFixed(1)}%`;

  // Progress dots: one per racer, the player's drawn on top.
  if (raceHudCache.dots.length !== r.racers.length) {
    raceTrackDotsEl.innerHTML = "";
    raceHudCache.dots = r.racers.map((rr) => {
      const dot = document.createElement("span");
      dot.className = "race-dot" + (rr.isPlayer ? " you" : "");
      dot.style.color = `#${rr.color.toString(16).padStart(6, "0")}`;
      raceTrackDotsEl.appendChild(dot);
      return dot;
    });
  }
  r.racers.forEach((rr, i) => {
    raceHudCache.dots[i].style.left = `${(rr.progress * 100).toFixed(1)}%`;
  });

  // Survivors strip doubles as the racer strip: finished racers get a rank.
  const finishedSig = r.racers.map((rr) => (rr.finished ? rr.placement : 0)).join(",");
  if (finishedSig !== raceHudCache.finished && survivorsStripEl) {
    raceHudCache.finished = finishedSig;
    for (const rr of r.racers) {
      const chip = survivorsStripEl.querySelector(`.surv-chip[data-id="${rr.id}"]`);
      if (!chip) continue;
      chip.classList.remove("out");
      chip.classList.toggle("finished", rr.finished);
      let badge = chip.querySelector(".race-rank");
      if (rr.finished) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "race-rank";
          chip.appendChild(badge);
        }
        badge.textContent = rr.placement;
      } else if (badge) {
        badge.remove();
      }
    }
  }
}

// --- 3D Showcase: the selected fighter on a neon pedestal under the title ---
// Scene graph:  actor (hop height + turntable spin)
//                 sway  (side-to-side lean, pivot at the feet)
//                   squash (breathing / landing squash, pivot at the feet)
//                     viber.root (normalized so the feet sit at y = 0)
// The pedestal is static; only its glow materials pulse.
const showcaseCanvas = menuP1AvatarCanvasEl;
let showcaseRenderer = null;
let showcaseScene = null;
let showcaseCamera = null;
let showcaseModel = null; // viber parts (armL/R, legL/R, head) for posing
let showcaseRoot = null;

const SHOWCASE_HEIGHT = 2.3; // robot height in showcase units
const PEDESTAL_TOP = -1.3; // world y of the pedestal's top face
const SHOWCASE_TURN_SPEED = 0.6; // rad/s turntable
const HOP_VELOCITY = 5.2; // launch speed -> ~0.75 high, ~0.58s airtime
const HOP_GRAVITY = 18;
const DANCE_TIME = 2.6;

const showcase = {
  actor: null,
  sway: null,
  squash: null,
  pedestal: null, // { topMat, ringMat, baseRingMat, hexMat, beamMat, shadow }
  last: 0,
  spin: 0,
  action: "idle", // "idle" | "crouch" | "air" | "dance"
  actionT: 0,
  nextActionIn: 1.6,
  cycle: 0, // jump, jump, dance, ...
  hopY: 0,
  hopV: 0,
  land: 0, // landing squash timer (s)
  pop: 0, // character-swap pop-in timer (s)
  flash: 0, // pedestal flash on landing
};
const SHOWCASE_CYCLE = ["jump", "jump", "dance"];
window.__showcase = showcase; // debug/test hook (like window.game)

function makeBeamTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(1, "rgba(255,255,255,1)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Static neon-cyberpunk pedestal: dark metal drum, glowing faceplate with a
// hex core, cyan top ring, magenta base ring, faint holo beam and a contact
// shadow that shrinks while the robot is in the air.
function buildShowcasePedestal() {
  const group = new THREE.Group();
  group.position.y = PEDESTAL_TOP;

  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(1.22, 1.38, 0.34, 48),
    new THREE.MeshStandardMaterial({ color: 0x121628, metalness: 0.85, roughness: 0.32, emissive: 0x00e5ff, emissiveIntensity: 0.06 })
  );
  drum.position.y = -0.2;
  group.add(drum);

  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(1.42, 1.5, 0.1, 48),
    new THREE.MeshStandardMaterial({ color: 0x0b0e1a, metalness: 0.8, roughness: 0.4 })
  );
  foot.position.y = -0.42;
  group.add(foot);

  const topMat = new THREE.MeshStandardMaterial({ color: 0x0c1122, metalness: 0.6, roughness: 0.3, emissive: 0x00e5ff, emissiveIntensity: 0.35 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.2, 0.06, 48), topMat);
  top.position.y = -0.03;
  group.add(top);

  const hexMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  const hex = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.86, 6), hexMat);
  hex.rotation.x = -Math.PI / 2;
  hex.position.y = 0.004;
  group.add(hex);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.19, 0.035, 8, 72), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.0;
  group.add(ring);

  const baseRingMat = new THREE.MeshBasicMaterial({ color: 0xff2d95 });
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(1.44, 0.028, 8, 72), baseRingMat);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = -0.37;
  group.add(baseRing);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    map: makeBeamTexture(),
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.16, 1.4, 48, 1, true), beamMat);
  beam.position.y = 0.7;
  group.add(beam);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;
  group.add(shadow);

  return { group, topMat, ringMat, baseRingMat, hexMat, beamMat, shadow };
}

function initShowcase3D() {
  if (!showcaseCanvas) return;
  try {
    showcaseRenderer = new THREE.WebGLRenderer({ canvas: showcaseCanvas, alpha: true, antialias: false });
    showcaseRenderer.setSize(showcaseCanvas.width, showcaseCanvas.height, false);
    showcaseRenderer.setPixelRatio(1);
    showcaseRenderer.setClearColor(0x000000, 0); // transparent — no background
  } catch (err) {
    console.error("showcase renderer failed", err);
    return;
  }

  showcaseScene = new THREE.Scene();

  // Slightly above the pedestal so its glowing top face reads as a disc.
  showcaseCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  showcaseCamera.position.set(0, 1.0, 7.6);
  showcaseCamera.lookAt(0, -0.15, 0);

  // Cool key + neon rim lighting so the model pops and matches the arena look.
  showcaseScene.add(new THREE.AmbientLight(0x7fb6ff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(2.5, 4, 3);
  showcaseScene.add(key);
  const rim = new THREE.DirectionalLight(0x00e5ff, 1.2);
  rim.position.set(-3, 1, -2);
  showcaseScene.add(rim);
  const under = new THREE.PointLight(0x00e5ff, 2.2, 3.5, 2);
  under.position.set(0, PEDESTAL_TOP + 0.35, 1.1);
  showcaseScene.add(under);

  showcase.pedestal = buildShowcasePedestal();
  showcaseScene.add(showcase.pedestal.group);

  showcase.actor = new THREE.Group();
  showcase.actor.position.y = PEDESTAL_TOP;
  showcase.sway = new THREE.Group();
  showcase.squash = new THREE.Group();
  showcase.actor.add(showcase.sway);
  showcase.sway.add(showcase.squash);
  showcaseScene.add(showcase.actor);
}

function setShowcaseCharacter(type) {
  const meta = CHAR_TYPES[type] || CHAR_TYPES.robot1_jpg;
  const def = CHARACTERS[meta.idx] || CHARACTERS[0];

  if (!showcaseScene) return;

  // Drop the previous model (pedestal + animation loop stay).
  if (showcaseRoot) {
    showcase.squash.remove(showcaseRoot);
    showcaseRoot.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose && m.dispose());
      }
    });
    showcaseRoot = null;
  }

  const viber = buildViber(def);
  showcaseModel = viber;

  // Normalize height and stand the feet on the pedestal (local y = 0),
  // centred over it horizontally.
  const box = new THREE.Box3().setFromObject(viber.root);
  const size = new THREE.Vector3();
  box.getSize(size);
  viber.root.scale.multiplyScalar(SHOWCASE_HEIGHT / (size.y || 1));
  const b2 = new THREE.Box3().setFromObject(viber.root);
  viber.root.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);

  showcaseRoot = viber.root;
  showcase.squash.add(showcaseRoot);

  // Pop in + a greeting hop so the swap reads instantly.
  showcase.pop = 0.3;
  if (showcase.action === "idle") startShowcaseAction("jump");
}

function startShowcaseAction(kind) {
  showcase.actionT = 0;
  if (kind === "jump") {
    showcase.action = "crouch";
  } else if (kind === "dance") {
    showcase.action = "dance";
  } else {
    showcase.action = "idle";
  }
}

const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

// Pose the robot for this frame: idle breathing/sway always, plus the active
// hop or dance layered on top. Every joint is set absolutely each frame.
function animateShowcase(t, dt) {
  const s = showcase;
  const v = showcaseModel;
  s.actionT += dt;

  // Idle base (always on)
  const breath = Math.sin(t * 2.2);
  let scaleY = 1 + 0.025 * breath;
  let scaleXZ = 1 - 0.012 * breath;
  let swayZ = 0.05 * Math.sin(t * 1.3);
  let extraSpin = 0;
  let bounce = 0;
  let armLX = 0.1 * Math.sin(t * 2.2);
  let armRX = -armLX;
  let armLZ = -0.06;
  let armRZ = 0.06;
  let legLX = 0;
  let legRX = 0;
  let headZ = 0.03 * Math.sin(t * 1.3 + 0.6);

  // Scheduler: after a gap, play the next action in the jump/jump/dance cycle.
  if (s.action === "idle") {
    s.nextActionIn -= dt;
    if (s.nextActionIn <= 0) {
      startShowcaseAction(SHOWCASE_CYCLE[s.cycle % SHOWCASE_CYCLE.length]);
      s.cycle++;
    }
  }

  if (s.action === "crouch") {
    // Anticipation: quick squat before take-off
    const k = Math.min(1, s.actionT / 0.12);
    scaleY *= 1 - 0.14 * k;
    scaleXZ *= 1 + 0.08 * k;
    armLZ = armRZ = 0;
    armLX = armRX = 0.5 * k;
    if (s.actionT >= 0.12) {
      s.action = "air";
      s.actionT = 0;
      s.hopV = HOP_VELOCITY;
    }
  } else if (s.action === "air") {
    s.hopV -= HOP_GRAVITY * dt;
    s.hopY += s.hopV * dt;
    const up = Math.max(0, s.hopV / HOP_VELOCITY); // 1 at launch -> 0 at apex
    scaleY *= 1 + 0.1 * up; // stretch on the way up
    scaleXZ *= 1 - 0.05 * up;
    armLZ = -2.3;
    armRZ = 2.3; // arms up
    legLX = -0.45;
    legRX = 0.45;
    if (s.hopY <= 0 && s.hopV < 0) {
      s.hopY = 0;
      s.hopV = 0;
      s.land = 0.22;
      s.flash = 1;
      s.action = "idle";
      s.nextActionIn = 2.2 + Math.random() * 0.8;
    }
  } else if (s.action === "dance") {
    const p = s.actionT / DANCE_TIME;
    const beat = s.actionT * Math.PI * 4; // 2 beats per second
    bounce = Math.abs(Math.sin(beat)) * 0.12;
    swayZ = 0.16 * Math.sin(beat);
    headZ = 0.14 * Math.sin(beat + 0.5);
    // Full extra spin in the middle of the routine
    extraSpin = Math.PI * 2 * easeInOut(Math.min(1, Math.max(0, (p - 0.35) / 0.4)));
    if (p < 0.5) {
      armRZ = 2.5 + 0.35 * Math.sin(s.actionT * 14); // right-hand wave
      armLZ = -0.3 - 0.25 * Math.sin(beat);
    } else {
      const pump = Math.sin(beat);
      armLZ = -1.6 - 0.8 * pump; // both arms pump
      armRZ = 1.6 - 0.8 * pump;
    }
    legLX = 0.4 * Math.max(0, Math.sin(beat));
    legRX = 0.4 * Math.max(0, -Math.sin(beat));
    if (p >= 1) {
      s.action = "idle";
      s.nextActionIn = 2.0 + Math.random() * 0.8;
    }
  }

  // Landing squash springs back over ~0.22s
  if (s.land > 0) {
    s.land = Math.max(0, s.land - dt);
    const k = s.land / 0.22;
    scaleY *= 1 - 0.2 * k;
    scaleXZ *= 1 + 0.12 * k;
  }

  // Character swap pop-in (slight overshoot)
  let pop = 1;
  if (s.pop > 0) {
    s.pop = Math.max(0, s.pop - dt);
    const x = 1 - s.pop / 0.3;
    pop = 1 + 0.12 * Math.sin(x * Math.PI) - 0.25 * (1 - x) * (1 - x);
  }

  s.spin += SHOWCASE_TURN_SPEED * dt;
  s.actor.position.y = PEDESTAL_TOP + s.hopY + bounce;
  s.actor.rotation.y = s.spin + extraSpin;
  s.sway.rotation.z = swayZ;
  s.squash.scale.set(scaleXZ * pop, scaleY * pop, scaleXZ * pop);

  if (v) {
    if (v.armL) v.armL.rotation.set(armLX, 0, armLZ);
    if (v.armR) v.armR.rotation.set(armRX, 0, armRZ);
    if (v.legL) v.legL.rotation.x = legLX;
    if (v.legR) v.legR.rotation.x = legRX;
    if (v.head) v.head.rotation.z = headZ;
  }

  // Pedestal pulse (+ a flash when the robot lands)
  const ped = s.pedestal;
  s.flash = Math.max(0, s.flash - dt * 3);
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  ped.topMat.emissiveIntensity = 0.28 + 0.22 * pulse + 0.6 * s.flash;
  ped.hexMat.opacity = 0.14 + 0.14 * pulse + 0.4 * s.flash;
  ped.beamMat.opacity = 0.1 + 0.08 * pulse + 0.15 * s.flash;
  ped.baseRingMat.color.setHex(s.flash > 0.5 ? 0xffffff : 0xff2d95);
  const air = Math.min(1, (s.hopY + bounce) / 0.8);
  ped.shadow.scale.setScalar(1 - 0.45 * air);
  ped.shadow.material.opacity = 0.45 * (1 - 0.6 * air);
}

function updateShowcase3D(t) {
  if (!showcaseRenderer || !showcaseScene || !showcaseRoot) return;
  // The canvas lives in the start menu: skip all work while it's hidden.
  if (startMenuEl.classList.contains("hidden")) {
    showcase.last = t;
    return;
  }
  const dt = Math.min(0.05, Math.max(0, t - (showcase.last || t)));
  showcase.last = t;
  animateShowcase(t, dt);
  showcaseRenderer.render(showcaseScene, showcaseCamera);
}

initShowcase3D();

// The start screen is already up at boot (the Game constructor builds the
// island synchronously, before any onArenaReady fires), so park the arena here
// once. onGameStart brings it back for the match.
setArenaPreviewVisible(false);
setMenuBackdropHidden(true);

// 9. Character Switching Logic (6 Viber fighters + 6 cutout agents, 2 pages)
const charButtons = [
  { el: btnCharJpgEl, type: "robot1_jpg", page: 1 },
  { el: btnCharMossEl, type: "moss", page: 1 },
  { el: btnCharMechaEl, type: "mecha", page: 1 },
  { el: btnCharPhantomEl, type: "phantom", page: 1 },
  { el: btnCharChogEl, type: "chog", page: 1 },
  { el: btnCharMetaEl, type: "meta", page: 1 },
  { el: btnCharAgent103El, type: "agent103", page: 2 },
  { el: btnCharAgent107El, type: "agent107", page: 2 },
  { el: btnCharAgent111El, type: "agent111", page: 2 },
  { el: btnCharAgent116El, type: "agent116", page: 2 },
  { el: btnCharAgent120El, type: "agent120", page: 2 },
  { el: btnCharAgent123El, type: "agent123", page: 2 },
];

let charPage = 1;
function showCharPage(page) {
  charPage = page;
  if (charPage1El) charPage1El.classList.toggle("hidden", page !== 1);
  if (charPage2El) charPage2El.classList.toggle("hidden", page !== 2);
  if (charPagerLabelEl) charPagerLabelEl.textContent = `${page} / 2`;
  if (charPagerPrevEl) charPagerPrevEl.disabled = page === 1;
  if (charPagerNextEl) charPagerNextEl.disabled = page === 2;
}

function selectCharacter(type) {
  audio.playClick();
  const meta = CHAR_TYPES[type] || CHAR_TYPES.robot1_jpg;

  charButtons.forEach(({ el, type: t }) => {
    if (!el) return;
    el.classList.toggle("active", t === type);
    const badge = el.querySelector(".tab-status-badge");
    if (badge) badge.textContent = t === type ? "EQUIPPED" : "SELECT";
  });

  if (menuP1AvatarEl) menuP1AvatarEl.src = meta.portrait;
  if (menuP1NameEl) menuP1NameEl.textContent = meta.name.toUpperCase();
  if (hudP1AvatarEl) hudP1AvatarEl.src = meta.portrait;
  if (hudP1NameEl) hudP1NameEl.textContent = meta.name;

  setShowcaseCharacter(type);
  game.setPlayerCharacter(type);
}

charButtons.forEach(({ el, type }) => {
  if (el) el.addEventListener("click", () => selectCharacter(type));
});

// Pagination: ◀ / ▶ switch between the two selector pages.
if (charPagerPrevEl) charPagerPrevEl.addEventListener("click", () => { audio.playClick(); showCharPage(Math.max(1, charPage - 1)); });
if (charPagerNextEl) charPagerNextEl.addEventListener("click", () => { audio.playClick(); showCharPage(Math.min(2, charPage + 1)); });
showCharPage(1);

// Select Crimson Miner by default
selectCharacter("robot1_jpg");

// 10. Arena Selection Logic
function selectMap(index) {
  if (index < 0 || index >= MAPS.length) return;
  audio.playClick();
  game.setMap(index);

  mapTabEls.forEach((btn, i) => {
    btn.classList.toggle("active", i === index);
    const badge = btn.querySelector(".tab-status-badge");
    if (badge) badge.textContent = i === index ? "ACTIVE" : "SELECT";
  });

  if (arenaNameEl) arenaNameEl.textContent = MAPS[index].name;
}

// Keep each map tab's size label in sync with the grid (more fighters = bigger).
function refreshMapSizeLabels() {
  mapTabEls.forEach((btn, i) => {
    const sizeEl = btn.querySelector(".map-size");
    if (sizeEl && MAPS[i]) {
      const fighters = game.botCount + 1; // player + bots
      const g = scaledMap(MAPS[i], fighters).gridSize || MAPS[i].gridSize || 10;
      sizeEl.textContent = `${g}x${g}`;
    }
  });
}

mapTabEls.forEach((btn, i) => {
  btn.addEventListener("click", () => selectMap(i));
});

// Initial labels + refresh whenever the arena is re-scaled (match size change).
refreshMapSizeLabels();
if (game.ui) game.ui.onMapScaled = refreshMapSizeLabels;

// Reflect the default arena in the HUD without rebuilding the island
if (arenaNameEl && MAPS.length > 0) {
  arenaNameEl.textContent = MAPS[0].name;
}

// 11. CPU Difficulty Logic
const DIFF_ORDER = ["easy", "normal", "hard"];

// Hover spotlight: track cursor position on menu tabs/buttons so the CSS
// radial glow (::after) follows the mouse. Delegated, PASSIVE, and throttled
// to one rAF per frame — an unthrottled pointermove + getBoundingClientRect()
// runs layout on every mousemove (hundreds/s on macOS trackpads) and can stall
// the UI. We cache rects and only refresh them on scroll/resize.
const spotlightSelector = ".char-tab-btn, .map-tab-btn, .diff-tab-btn, .bot-tab-btn, .race-size-btn, .race-diff-btn, .cyber-btn";
let spotlightEl = null;
let spotlightRect = null;
let spotlightQueued = false;

const refreshSpotlightRect = () => {
  if (spotlightEl) spotlightRect = spotlightEl.getBoundingClientRect();
};
window.addEventListener("scroll", refreshSpotlightRect, { passive: true, capture: true });
window.addEventListener("resize", refreshSpotlightRect, { passive: true });

document.addEventListener("pointermove", (e) => {
  const el = e.target.closest ? e.target.closest(spotlightSelector) : null;
  if (el !== spotlightEl) {
    spotlightEl = el;
    spotlightRect = el ? el.getBoundingClientRect() : null;
  }
  if (!spotlightEl || !spotlightRect) return;
  // Write coords relative to the cached rect (no layout read this frame)
  const x = e.clientX - spotlightRect.left;
  const y = e.clientY - spotlightRect.top;
  if (spotlightQueued) return;
  spotlightQueued = true;
  requestAnimationFrame(() => {
    spotlightQueued = false;
    if (!spotlightEl) return;
    spotlightEl.style.setProperty("--mx", `${x}px`);
    spotlightEl.style.setProperty("--my", `${y}px`);
  });
}, { passive: true });

function selectDifficulty(level, silent = false) {
  if (!DIFF_ORDER.includes(level)) return;
  if (!silent) audio.playClick();
  game.setDifficulty(level);

  const label = level.toUpperCase();
  diffTabEls.forEach((btn, i) => {
    btn.classList.toggle("active", DIFF_ORDER[i] === level);
    const badge = btn.querySelector(".tab-status-badge");
    if (badge) badge.textContent = DIFF_ORDER[i] === level ? "ACTIVE" : "SELECT";
  });

  if (hudP2NameEl) hudP2NameEl.textContent = `CPU · ${label}`;
}

diffTabEls.forEach((btn, i) => {
  btn.addEventListener("click", () => selectDifficulty(DIFF_ORDER[i]));
});

selectDifficulty("normal", true);

// 11b. Match-size (bot count) selector: 1 / 4 / 9 CPU bots
const botTabEls = Array.from(document.querySelectorAll(".bot-tab-btn"));
const survivorsStripEl = document.getElementById("survivors-strip");

function selectBotCount(n, silent = false) {
  if (!silent) audio.playClick();
  game.setBotCount(n);
  botTabEls.forEach((btn) => {
    const on = Number(btn.dataset.bots) === n;
    btn.classList.toggle("active", on);
    const badge = btn.querySelector(".tab-status-badge");
    if (badge) badge.textContent = on ? "ACTIVE" : "SELECT";
  });
  // Arena re-scaled for the new roster — refresh the map size labels (NxN).
  refreshMapSizeLabels();
}

botTabEls.forEach((btn) => {
  btn.addEventListener("click", () => selectBotCount(Number(btn.dataset.bots)));
});

// Survivors HUD: render one chip per fighter; dim the eliminated ones.
// Rebuilt only when the roster changes (onRosterChange); onStatusUpdate just
// toggles the `out` class — event-driven, not a full rebuild every frame.
function renderSurvivors(robots) {
  if (!survivorsStripEl) return;
  survivorsStripEl.innerHTML = "";
  robots.forEach((r) => {
    const chip = document.createElement("span");
    chip.className = "surv-chip" + (r.isPlayer ? " you" : "");
    chip.dataset.id = String(r.id);
    const img = document.createElement("img");
    img.src = r.portraitPath;
    img.alt = r.name;
    chip.appendChild(img);
    if (r.isPlayer) {
      const tag = document.createElement("em");
      tag.textContent = "YOU";
      chip.appendChild(tag);
    }
    survivorsStripEl.appendChild(chip);
  });
}

function updateSurvivors(robots) {
  if (!survivorsStripEl) return;
  robots.forEach((r) => {
    const chip = survivorsStripEl.querySelector(`.surv-chip[data-id="${r.id}"]`);
    if (!chip) return;
    const out = r.state === "eliminated" || r.pos.y < -3.5;
    chip.classList.toggle("out", out);
  });
}

// Initial strip (covers the case where a round starts before onRosterChange)
if (survivorsStripEl) renderSurvivors(game.robots);

// UI Event Listeners: Start Menu
// INITIALIZE BATTLE starts a match and never opens the profile.
// INITIALIZE BATTLE — start a match and never open the profile.
// Guarded: if the WebAudio click throws (autoplay/Safari can block the AudioContext
// on first gesture) we must NOT lose the game start — startGame() runs regardless.
// A second delegated listener on the actions block is a safety net in case the
// primary button's click is ever intercepted by an overlay.
function startMatch() {
  try {
    audio.playClick();
  } catch (e) {
    /* audio blocked — not fatal */
  }
  try {
    game.startGame();
  } catch (e) {
    console.error("startGame failed:", e);
  }
}
btnMenuPlayEl.addEventListener("click", (e) => {
  e.preventDefault();
  startMatch();
});
// Safety net: clicking anywhere on the primary action (icon / text / key tag)
// still starts the match even if the event target isn't the button itself.
const menuActionsEl = document.querySelector("#start-menu .menu-actions");
if (menuActionsEl) {
  menuActionsEl.addEventListener("click", (e) => {
    if (e.target && e.target.closest("#btn-menu-play")) startMatch();
  });
}

// UI Event Listeners: VIBER RACE setup panel
const RACE_DIFFS = ["easy", "normal", "hard"];
const RACE_MAP_IDS = ["random", "cyber", "islands", "redlight"];
let raceRacers = 5;
let raceDifficulty = "normal";
let raceMapChoice = "random"; // "random" | "cyber" | "islands" | "redlight"
let raceHalloween = true; // spooky theme on by default
let raceBloom = true; // emissive bloom while the Halloween race is running

function markTabs(els, isActive) {
  els.forEach((btn) => {
    const on = isActive(btn);
    btn.classList.toggle("active", on);
    const badge = btn.querySelector(".tab-status-badge");
    if (badge) badge.textContent = on ? "ACTIVE" : "SELECT";
  });
}

function selectRaceSize(n, silent = false) {
  if (!silent) audio.playClick();
  raceRacers = n === 10 ? 10 : 5;
  markTabs(raceSizeEls, (btn) => Number(btn.dataset.racers) === raceRacers);
}

function selectRaceDifficulty(level, silent = false) {
  if (!RACE_DIFFS.includes(level)) return;
  if (!silent) audio.playClick();
  raceDifficulty = level;
  markTabs(raceDiffEls, (btn) => btn.dataset.diff === level);
}

function selectRaceMap(id, silent = false) {
  if (!RACE_MAP_IDS.includes(id)) return;
  if (!silent) audio.playClick();
  raceMapChoice = id;
  markTabs(raceMapEls, (btn) => btn.dataset.map === id);
}

function selectRaceTheme(theme, silent = false) {
  if (!silent) audio.playClick();
  raceHalloween = theme !== "neon";
  markTabs(raceThemeEls, (btn) => (btn.dataset.theme === "halloween") === raceHalloween);
}

function syncRaceGlow() {
  if (btnRaceGlowEl) btnRaceGlowEl.classList.toggle("active", raceBloom);
  if (raceGlowStateEl) raceGlowStateEl.textContent = raceBloom ? "ON" : "OFF";
}

function startRaceFromMenu() {
  try {
    audio.playClick();
  } catch (e) {
    /* audio blocked — not fatal */
  }
  game.onMenuSpace = null;
  try {
    game.startRace({
      racers: raceRacers,
      difficulty: raceDifficulty,
      mapId: raceMapChoice === "random" ? null : raceMapChoice,
      halloween: raceHalloween,
    });
  } catch (e) {
    console.error("startRace failed:", e);
  }
}

raceSizeEls.forEach((btn) => btn.addEventListener("click", () => selectRaceSize(Number(btn.dataset.racers))));
raceDiffEls.forEach((btn) => btn.addEventListener("click", () => selectRaceDifficulty(btn.dataset.diff)));
raceMapEls.forEach((btn) => btn.addEventListener("click", () => selectRaceMap(btn.dataset.map)));
raceThemeEls.forEach((btn) => btn.addEventListener("click", () => selectRaceTheme(btn.dataset.theme)));
if (btnRaceGlowEl) {
  btnRaceGlowEl.addEventListener("click", () => {
    audio.playClick();
    raceBloom = !raceBloom;
    syncRaceGlow();
  });
}

btnMenuRaceEl.addEventListener("click", () => {
  audio.playClick();
  // Warm the Halloween kit while the setup panel is open.
  preloadHalloweenAssets();
  // Start from the battle difficulty the player already picked.
  selectRaceDifficulty(game.difficulty || "normal", true);
  startMenuEl.classList.add("hidden");
  raceMenuEl.classList.remove("hidden");
  game.onMenuSpace = startRaceFromMenu; // SPACE starts the race from this panel
});

btnRaceStartEl.addEventListener("click", (e) => {
  e.preventDefault();
  startRaceFromMenu();
});

btnRaceBackEl.addEventListener("click", () => {
  audio.playClick();
  game.onMenuSpace = null;
  raceMenuEl.classList.add("hidden");
  startMenuEl.classList.remove("hidden");
});

selectRaceSize(5, true);
selectRaceDifficulty("normal", true);
selectRaceMap("random", true);
selectRaceTheme("halloween", true);
syncRaceGlow();

// UI Event Listeners: Online 1v1 panel
btnMenuOnlineEl.addEventListener("click", () => {
  audio.playClick();
  startMenuEl.classList.add("hidden");
  onlineMenuEl.classList.remove("hidden");
  onlineCodeDisplayEl.classList.add("hidden");
  setOnlineStatus("HOST A ROOM OR JOIN BY CODE");
});

btnOnlineHostEl.addEventListener("click", () => {
  audio.playClick();
  // The online path does not go through startGame(), so build any arena the
  // player picked in the menu now — the peer handshake gives it time to settle.
  game.flushPendingArena();
  net.host();
});

btnOnlineJoinEl.addEventListener("click", () => {
  audio.playClick();
  game.flushPendingArena();
  net.join(onlineCodeInputEl ? onlineCodeInputEl.value : "");
});

btnOnlineBackEl.addEventListener("click", () => {
  audio.playClick();
  net.leave();
  onlineMenuEl.classList.add("hidden");
  startMenuEl.classList.remove("hidden");
});

// Allow Enter in the code input to join
if (onlineCodeInputEl) {
  onlineCodeInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnOnlineJoinEl.click();
    }
  });
}

// ---------------------------------------------------------------------------
// GUARANTEED BUTTON ACTIVATION (macOS trackpad fix).
//
// `.cyber-btn` uses clip-path + a transform transition + overflow:hidden. On
// some Mac trackpads/browsers the native `click` event never fires for it
// (pointer events land, click is swallowed) — while the clip-path-free menu
// tabs kept working. That mismatch is exactly what made the big buttons feel
// dead.
//
// Fix: activate every menu button from `pointerup` (which ALWAYS fires) by
// dispatching a real `click`, and CANCEL any native `click` that arrives in
// the same gesture so each press runs exactly once. This works whether the
// browser emits `click` or not, and regardless of where the button's own
// listener was attached.
// ---------------------------------------------------------------------------
{
  const SELECTOR =
    "#btn-menu-play, #btn-menu-race, #btn-menu-online, #btn-menu-profile, #btn-menu-sound, " +
    "#btn-race-start, #btn-race-back, .race-size-btn, .race-diff-btn, " +
    ".char-tab-btn, .map-tab-btn, .diff-tab-btn, .bot-tab-btn, " +
    "#btn-online-host, #btn-online-join, #btn-online-back, " +
    "#btn-pause-resume, #btn-pause-restart, #btn-pause-menu, " +
    "#btn-hud-pause, #btn-hud-restart, #btn-win-restart";
  const handledAt = new Map(); // element -> last pointerup activation (ms)
  let synthClick = false; // true only while OUR synthesized click is dispatching
  const findBtn = (t) => (t && t.closest ? t.closest(SELECTOR) : null);

  // NATIVE click arriving right after we already activated this SAME button on
  // pointerup -> swallow it so the action runs once. Our OWN synthesized click
  // (synthClick === true) must pass through, or the button never fires.
  document.addEventListener(
    "click",
    (e) => {
      if (synthClick) return; // let our own activation through
      const el = findBtn(e.target);
      if (el && performance.now() - (handledAt.get(el) || 0) < 400) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true
  );

  // Activate on pointerup — fires on every mouse / trackpad / touch release.
  document.addEventListener(
    "pointerup",
    (e) => {
      const el = findBtn(e.target);
      if (!el) return;
      const now = performance.now();
      if (now - (handledAt.get(el) || 0) < 400) return; // THIS button already activated
      handledAt.set(el, now);
      // Re-dispatch a real click so the button's OWN listener runs unchanged.
      synthClick = true;
      try {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      } finally {
        synthClick = false;
      }
    },
    { passive: true }
  );
}

btnMenuSoundEl.addEventListener("click", () => {
  handleSoundToggle();
});

// PROFILE · STAKING DEMO opens the profile page and nothing else.
// (The win-screen PROFILE button does the same.)
const btnMenuProfileEl = document.getElementById("btn-menu-profile");
btnMenuProfileEl.addEventListener("click", () => {
  audio.playClick();
  startMenuEl.classList.add("hidden");
  openProfile();
});
const btnWinProfileEl = document.getElementById("btn-win-profile");
if (btnWinProfileEl) {
  btnWinProfileEl.addEventListener("click", () => {
    audio.playClick();
    winOverlayEl.classList.add("hidden");
    openProfile();
  });
}
// Closing the profile returns to the screen it was opened from.
const btnProfileCloseEl = document.getElementById("btn-profile-close");
if (btnProfileCloseEl) {
  btnProfileCloseEl.addEventListener("click", () => {
    if (game.state === "menu") startMenuEl.classList.remove("hidden");
    else if (game.state === "round_over") winOverlayEl.classList.remove("hidden");
  });
}
wireProfileButtons();

// Optional Privy email login. When logged in, the wallet's on-chain balance
// replaces the profile's free $VIB. Guests keep the demo state untouched.
initPrivyAuth((balance) => {
  setSyncedVibBalance(balance);
});

// UI Event Listeners: Pause Menu
btnPauseResumeEl.addEventListener("click", () => {
  audio.playClick();
  game.setPaused(false);
});

btnPauseRestartEl.addEventListener("click", () => {
  audio.playClick();
  pauseMenuEl.classList.add("hidden");
  game.restartRound();
});

btnPauseSoundEl.addEventListener("click", () => {
  handleSoundToggle();
});

btnPauseMenuEl.addEventListener("click", () => {
  audio.playClick();
  game.goToMenu();
});

// UI Event Listeners: Win Screen
btnWinRestartEl.addEventListener("click", () => {
  audio.playClick();
  winOverlayEl.classList.add("hidden");
  game.restartRound();
});

btnWinMenuEl.addEventListener("click", () => {
  audio.playClick();
  game.goToMenu();
});

// UI Event Listeners: In-Game HUD
btnHudPauseEl.addEventListener("click", () => {
  audio.playClick();
  game.togglePause();
});

btnHudRestartEl.addEventListener("click", () => {
  if (game.drumActive) return; // don't restart mid-spin
  audio.playClick();
  game.restartRound();
});

btnResetCamEl.addEventListener("click", () => {
  audio.playClick();
  if (game.mode === "race" && game.state !== "menu") {
    snapRaceCamera();
  } else if (game.state === "playing" || game.state === "paused" || game.state === "round_over") {
    frameCameraOnPlayer();
  } else {
    camera.position.copy(DEFAULT_CAM_POS);
    controls.target.copy(DEFAULT_CAM_TARGET);
    controls.update();
  }
});

btnSoundEl.addEventListener("click", () => {
  handleSoundToggle();
});

// Resize handler
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, raceLowDpr ? 1.5 : 2));
  resizeComposer();
});

// Animation loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);

  // Boot overlay: animate the progress bar until the game is ready.
  updateBootLoader(dt);

  // Update game simulation
  game.update(dt);
  arenaLoader.update(dt);

  // Rotate floating holographic arena halo rings
  haloMesh1.rotation.z += 0.0025;
  haloMesh2.rotation.z -= 0.0018;

  // Slowly rotate faint horizon grid
  if (horizonGrid) {
    horizonGrid.rotation.y += 0.0003;
  }

  // Subtle breathing pulse on the abyss cyber grid
  const now = performance.now() * 0.001;
  cyberGrid.material.opacity = 0.45 + 0.12 * Math.sin(now * 1.5);

  // Float cyber embers upwards through the arena
  if (embers) {
    const pos = embers.geo.attributes.position.array;
    for (let i = 0; i < embers.count; i++) {
      pos[i * 3 + 1] += embers.speeds[i] * dt * 2.2;
      if (pos[i * 3 + 1] > 9) {
        pos[i * 3 + 1] = -16.0;
        pos[i * 3 + 0] = (Math.random() - 0.5) * 60;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
      }
    }
    embers.geo.attributes.position.needsUpdate = true;
  }

  if (game.mode === "race" && game.state !== "menu") {
    // VIBER RACE: scripted chase camera (orbit controls are parked)
    updateRaceCamera(dt);
  } else {
    // Follow the player with the orbit pivot (frozen when paused / falling)
    updateCameraFollow(dt);

    // Update controls
    controls.update();
  }

  // Apply subtle screen shake
  if (screenShakeAmount > 0.001) {
    screenShakeAmount *= 0.88;
    camShakeOffset.set(
      (Math.random() - 0.5) * screenShakeAmount,
      (Math.random() - 0.5) * screenShakeAmount * 0.5,
      (Math.random() - 0.5) * screenShakeAmount
    );
    camera.position.add(camShakeOffset);
  }

  // Render scene
  renderFrame();

  // 3D fighter showcase (spins the selected character in the menu)
  updateShowcase3D(now);

  // Prize drum overlay (only draws while active — driven by this loop)
  updatePrizeDrum();

  // Revert shake offset so controls stay grounded
  if (screenShakeAmount > 0.001) {
    camera.position.sub(camShakeOffset);
  }
}

// ============================================================================
// 12. BOOT / LOADING SCREEN
// The overlay is plain HTML+CSS, so it covers the app from the first paint (while
// the three.js CDN modules are still downloading). It stays up until the fonts,
// portraits, Halloween kit, voice clips and a few warm frames are ready.
// ============================================================================
const bootLoaderEl = document.getElementById("boot-loader");
const bootBarEl = document.getElementById("boot-bar");
const bootFillEl = document.getElementById("boot-bar-fill");
const bootPercentEl = document.getElementById("boot-percent");
const bootStatusEl = document.getElementById("boot-status");
const bootTipEl = document.getElementById("boot-tip");

const BOOT_TIPS = [
  "TIP · HOLD SHIFT TO DASH",
  "TIP · PRESS Q FOR THE JETPACK",
  "TIP · E THRUSTS THE SPEAR, G THROWS A GRENADE",
  "TIP · IN VIBER RACE, REACH THE CHECKPOINTS",
  "TIP · HALLOWEEN MAPS HIDE METEORS AND PUMPKINS",
];

const bootState = { shown: 0, target: 0, tip: 0, tipTimer: 0, done: false };

function bootSetTarget(pct, label) {
  bootState.target = Math.max(bootState.target, Math.min(100, pct));
  if (label && bootStatusEl) bootStatusEl.textContent = label;
}

// Ease the bar toward the target so it never jumps; called from the main loop.
function updateBootLoader(dt) {
  if (bootState.done) return;
  const { target } = bootState;
  bootState.shown += (target - bootState.shown) * Math.min(1, dt * 9);
  if (target - bootState.shown < 0.3) bootState.shown = target;
  const pct = Math.round(bootState.shown);
  if (bootFillEl) bootFillEl.style.width = `${pct}%`;
  if (bootPercentEl) bootPercentEl.textContent = `${pct}%`;
  if (bootBarEl) bootBarEl.setAttribute("aria-valuenow", String(pct));

  bootState.tipTimer -= dt;
  if (bootState.tipTimer <= 0 && bootTipEl) {
    bootState.tipTimer = 2.6;
    bootState.tip = (bootState.tip + 1) % BOOT_TIPS.length;
    bootTipEl.textContent = BOOT_TIPS[bootState.tip];
  }
}

const bootDelay = (ms) => new Promise((r) => setTimeout(r, ms));
const bootFrames = (n) =>
  new Promise((resolve) => {
    let left = n;
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

// Wait for the menu's <img> portraits, but never block the boot on a bad file.
function bootWaitForImages(limitMs) {
  const imgs = Array.from(document.querySelectorAll("#start-menu img"));
  const loads = imgs.map((img) =>
    img.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        })
  );
  return Promise.race([Promise.all(loads), bootDelay(limitMs)]);
}

async function runBootLoader() {
  if (!bootLoaderEl) return;
  const started = performance.now();

  try {
    bootSetTarget(12, "INITIALIZING RENDERER");
    await bootFrames(2);

    bootSetTarget(30, "LOADING FONTS");
    await Promise.race([
      Promise.allSettled([
        document.fonts.load('900 40px "Orbitron"'),
        document.fonts.load('700 16px "JetBrains Mono"'),
        document.fonts.load('800 16px Rajdhani'),
        document.fonts.ready,
      ]),
      bootDelay(2500),
    ]);

    bootSetTarget(46, "LOADING FIGHTER PORTRAITS");
    await bootWaitForImages(2500);

    bootSetTarget(66, "LOADING HALLOWEEN ASSETS");
    // Already warming since startup; cap the wait so a slow network still
    // reaches the menu (the race keeps streaming it in the background).
    await Promise.race([
      preloadHalloweenAssets().catch(() => null),
      bootDelay(9000),
    ]);

    bootSetTarget(84, "DECODING VOICE PACK");
    // Audio is optional at boot: a blocked/old audio module must never stall
    // or break the loader.
    try {
      const voices = audio.preloadVoices(false);
      if (voices && typeof voices.then === "function") {
        await Promise.race([voices.catch(() => null), bootDelay(4000)]);
      }
    } catch {
      /* keep booting */
    }

    bootSetTarget(94, "COMPILING SHADERS");
    await bootFrames(4);
  } catch (err) {
    // Never trap the player on the loader — the menu works regardless.
    console.warn("[boot] warm-up skipped", err);
  }

  // Keep the screen up long enough to read, but do not stall a fast boot.
  const elapsed = performance.now() - started;
  if (elapsed < 1150) await bootDelay(1150 - elapsed);

  bootSetTarget(100, "READY");
  // Let the bar visibly finish before the fade.
  await bootDelay(260);

  bootState.done = true;
  if (bootFillEl) bootFillEl.style.width = "100%";
  if (bootPercentEl) bootPercentEl.textContent = "100%";
  bootLoaderEl.classList.add("is-hidden");
  bootLoaderEl.setAttribute("aria-hidden", "true");
  // Drop it from the layer tree once the fade is over.
  setTimeout(() => {
    bootLoaderEl.style.display = "none";
  }, 700);
}

runBootLoader();
animate();

