import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { COLORS } from "./constants.js";
import { Game } from "./game.js";
import { CHAR_TYPES } from "./robot.js";
import { MAPS } from "./maps.js";
import { audio } from "./audio.js";
import { isTouchDevice, setupTouchControls } from "./touch.js";
import { walletState, connectWallet, signWinMessage } from "./wallet.js";
import { Net } from "./net.js";

// DOM Elements: Menus & Overlays
const startMenuEl = document.getElementById("start-menu");
const pauseMenuEl = document.getElementById("pause-menu");
const winOverlayEl = document.getElementById("win-overlay");
const inGameHudEl = document.getElementById("in-game-hud");

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

// Buttons: Start Menu
const btnMenuPlayEl = document.getElementById("btn-menu-play");
const btnMenuSoundEl = document.getElementById("btn-menu-sound");
const menuSoundIconEl = document.getElementById("menu-sound-icon");
const menuSoundTextEl = document.getElementById("menu-sound-text");

// Fighter selection buttons (4 Viber robots)
const btnCharJpgEl = document.getElementById("btn-char-jpg");
const btnCharMossEl = document.getElementById("btn-char-moss");
const btnCharMechaEl = document.getElementById("btn-char-mecha");
const btnCharPhantomEl = document.getElementById("btn-char-phantom");
const menuP1AvatarEl = document.getElementById("menu-p1-avatar");
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

// Wallet (Solana Mobile Wallet Adapter — optional, invisible without a wallet)
const btnWalletConnectEl = document.getElementById("btn-wallet-connect");
const walletBtnTextEl = document.getElementById("wallet-btn-text");
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
  if (walletState.status === "connected") {
    if (hudWalletEl) {
      hudWalletEl.textContent = `◈ ${walletState.displayAddress}`;
      hudWalletEl.classList.remove("hidden");
    }
    if (walletBtnTextEl) walletBtnTextEl.textContent = `${walletState.displayAddress} ✓`;
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
  100
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

const game = new Game(scene, camera, {
  onGameStart: (info) => {
    startMenuEl.classList.add("hidden");
    onlineMenuEl.classList.add("hidden");
    pauseMenuEl.classList.add("hidden");
    winOverlayEl.classList.add("hidden");
    inGameHudEl.classList.remove("hidden");

    if (info && info.online) {
      updateOnlineHud();
    }

    controls.autoRotate = false;
  },

  onPause: (isPaused) => {
    if (isPaused) {
      pauseMenuEl.classList.remove("hidden");
    } else {
      pauseMenuEl.classList.add("hidden");
    }
  },

  onMenu: () => {
    pauseMenuEl.classList.add("hidden");
    winOverlayEl.classList.add("hidden");
    inGameHudEl.classList.add("hidden");
    onlineMenuEl.classList.add("hidden");
    startMenuEl.classList.remove("hidden");

    // Leaving the menu always tears down any live P2P session
    net.leave();

    // Re-frame the attract-mode orbit on the island center
    camera.position.copy(DEFAULT_CAM_POS);
    controls.target.copy(DEFAULT_CAM_TARGET);
    controls.update();

    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;
  },

  onStatusUpdate: (status) => {
    tileCountEl.textContent = `${status.activeTiles}/${status.totalTiles || 100}`;
    fallTimerEl.textContent = `${status.nextFallTimer.toFixed(1)}s`;

    if (game.island.currentInterval) {
      maxFallInterval = game.island.currentInterval;
    }
    const pct = Math.max(0, Math.min(100, (status.nextFallTimer / maxFallInterval) * 100));
    fallProgressBarEl.style.width = `${pct}%`;

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
        if (s.ready) {
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
        if (g.ready) {
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
    }

    scoreP1El.textContent = status.scores.p1;
    scoreP2El.textContent = status.scores.p2;
  },

  onRoundEnd: (outcome) => {
    // Track the player's win streak for the signed memo
    if (outcome.winnerId === 1) {
      winStreak++;
    } else {
      winStreak = 0;
    }

    // Optional crypto: sign the win with the connected wallet (silent if not connected)
    if (outcome.winnerId === 1 && walletState.status === "connected") {
      const memo = `${game.p1.name.toUpperCase()} WON — streak ${winStreak}`;
      signWinMessage(memo).then((res) => {
        if (res.ok) showToast("signed ✓");
      });
    }

    winTitleEl.textContent = outcome.winnerText;
    winTitleEl.style.color = outcome.winnerColor;
    winSubtitleEl.textContent = outcome.subText || "";

    if (winScoreEl) {
      winScoreEl.innerHTML = `MATCH SCORE: <span class="tabular">${outcome.scores.p1} - ${outcome.scores.p2}</span>`;
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

    winOverlayEl.classList.remove("hidden");
  },

  onScreenShake: (amount) => {
    screenShakeAmount = Math.max(screenShakeAmount, amount);
  },

  onRoundStart: () => {
    winOverlayEl.classList.add("hidden");
    pauseMenuEl.classList.add("hidden");

    // Snap the camera onto the player's spawn — follow takes over from here
    frameCameraOnPlayer();
  },

  onCollision: (dist) => {
    screenShakeAmount = Math.max(screenShakeAmount, 0.18);
  },
});

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

// 9. Character Switching Logic (4 Viber fighters)
const charButtons = [
  { el: btnCharJpgEl, type: "robot1_jpg" },
  { el: btnCharMossEl, type: "moss" },
  { el: btnCharMechaEl, type: "mecha" },
  { el: btnCharPhantomEl, type: "phantom" },
];

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

  game.setPlayerCharacter(type);
}

charButtons.forEach(({ el, type }) => {
  if (el) el.addEventListener("click", () => selectCharacter(type));
});

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

  // Re-frame the camera for the new arena size
  camera.position.copy(DEFAULT_CAM_POS);
  controls.target.copy(DEFAULT_CAM_TARGET);
  controls.update();
}

mapTabEls.forEach((btn, i) => {
  btn.addEventListener("click", () => selectMap(i));
});

// Reflect the default arena in the HUD without rebuilding the island
if (arenaNameEl && MAPS.length > 0) {
  arenaNameEl.textContent = MAPS[0].name;
}

// 11. CPU Difficulty Logic
const DIFF_ORDER = ["easy", "normal", "hard"];

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

// UI Event Listeners: Start Menu
btnMenuPlayEl.addEventListener("click", () => {
  audio.playClick();
  game.startGame();
});

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
  net.host();
});

btnOnlineJoinEl.addEventListener("click", () => {
  audio.playClick();
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

// Wallet connect (optional crypto — see src/wallet.js)
if (btnWalletConnectEl) {
  btnWalletConnectEl.addEventListener("click", async () => {
    audio.playClick();
    if (walletState.status === "connected") {
      showToast(`Wallet: ${walletState.displayAddress}`);
      return;
    }
    btnWalletConnectEl.disabled = true;
    const res = await connectWallet();
    btnWalletConnectEl.disabled = false;
    if (res.ok) {
      updateWalletUI();
      showToast("Wallet connected");
    } else if (res.reason === "web") {
      showToast("Wallet requires the Android app");
    } else if (res.reason === "no-wallet") {
      showToast("No MWA wallet found on device");
    } else if (res.reason && res.reason !== "rejected") {
      showToast(`Wallet: ${res.reason}`);
    }
    // "rejected" — the user cancelled in Seed Vault: stay silent
  });
}

btnMenuSoundEl.addEventListener("click", () => {
  handleSoundToggle();
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
  audio.playClick();
  game.restartRound();
});

btnResetCamEl.addEventListener("click", () => {
  audio.playClick();
  if (game.state === "playing" || game.state === "paused" || game.state === "round_over") {
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// Animation loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);

  // Update game simulation
  game.update(dt);

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

  // Follow the player with the orbit pivot (frozen when paused / falling)
  updateCameraFollow(dt);

  // Update controls
  controls.update();

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
  renderer.render(scene, camera);

  // Revert shake offset so controls stay grounded
  if (screenShakeAmount > 0.001) {
    camera.position.sub(camShakeOffset);
  }
}

animate();

