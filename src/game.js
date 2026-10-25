import {
  TILE_SPACING,
  ROBOT_RADIUS,
  BASE_KNOCKBACK,
  COLORS,
  P1_ACCEL,
  P1_MAX_SPEED,
  P1_DAMPING,
  PUSH_COOLDOWN,
  JUMP_COOLDOWN,
  SPEAR_COOLDOWN,
  SPEAR_REACH,
  LASER_REACH_MULT,
  LASER_REACH,
  GRENADE_COOLDOWN,
  DASH_COOLDOWN,
  DASH_DURATION,
  DASH_SPEED_MULT,
  DASH_RECOVERY,
  GRENADE_THROW_DISTANCE,
  GRENADE_RADIUS,
  JUMP_FORCE,
  GRAVITY,
  STEP_UP_MAX,
} from "./constants.js";
import { Island } from "./island.js";
import { Robot, CHAR_TYPES } from "./robot.js";
import { FXManager } from "./particles.js";
import { audio } from "./audio.js";
import { MAPS, scaledMap } from "./maps.js";

const round2 = (v) => Math.round(v * 100) / 100;

export class Game {
  constructor(scene, camera, uiCallbacks) {
    this.scene = scene;
    this.camera = camera;
    this.ui = uiCallbacks || {};

    // Game state: "menu" | "playing" | "paused" | "round_over"
    this.state = "menu";
    this.scores = { p1: 0, p2: 0 };
    this.roundNumber = 1;
    this.currentMapIndex = 0;

    // Keys pressed state
    this.keys = {};

    // Online 1v1 (PeerJS) state
    this.mode = "cpu"; // "cpu" | "online"
    this.netRole = null; // "host" | "guest" | null
    this.net = null; // Net instance (wired by main.js)
    this.remoteInput = { mx: 0, mz: 0, jump: false, push: false, spear: false, grenade: false, dash: false };

    // Host: snapshot / fx bookkeeping
    this.snapSeq = 0;
    this.snapAccum = 0;
    this.sentTileStates = new Map(); // tileId -> last sent state code
    this.sentFx = new Map(); // fxId -> { kind, ... } awaiting removal broadcast
    this.lastJumpSent = { p1: 0, p2: 0 };
    this.lastPushSent = { p1: 0, p2: 0 };
    this.lastDashSent = { p1: 0, p2: 0 };
    this.lastLaserSent = { p1: 0, p2: 0 };
    this.lastWinner = null; // "host" | "guest" | "draw" | null

    // Guest: input serialization + round-over detection
    this.lastInputSig = "";
    this.inputSentAt = 0;
    this.netRoundOverShown = false;
    this.guestMoving = false; // guest is steering right now (prediction active)
    this.guestPredicted = {}; // kind -> timestamp of locally predicted abilities

    // FX & Projectiles Manager
    this.fx = new FXManager(this.scene);

    // Roster size must be known BEFORE building the arena (activeMap scales the
    // grid to the roster). 1 CPU bot = classic 1v1 to start. Online stays 1v1.
    this.robots = [];
    this.botCount = 1; // total CPU bots (set via setBotCount)

    // Create Island with the map SCALED to the starting roster (player + 1 bot)
    const initialMap = this.activeMap();
    this.island = new Island(this.scene, initialMap);

    // Create Player 1 (human) using full-color clean texture
    const p1Spawn = this.island.getWorldPos(initialMap.p1Spawn[0], initialMap.p1Spawn[1]);
    this.p1 = new Robot(
      1,
      "Crimson Miner",
      "assets/robot1_portrait.png",
      p1Spawn.x,
      p1Spawn.z,
      COLORS.p1Ring,
      true, // Player controlled
      this.scene
    );

    // Spawn the initial 1v1 roster (p1 + 1 bot). setBotCount rebuilds it later.
    this.rebuildRoster();

    // Collision cooldown
    this.collisionCooldown = 0;

    // Hook keyboard listeners
    this.setupControls();
  }

  // Team colours for bots — cycle neon palette (magenta first, then gold/violet…).
  // The human player is always cyan (COLORS.p1Ring).
  static BOT_COLORS = [0xff2d95, 0xffd700, 0x39ff14, 0xa855f7, 0xff5c1a, 0x00e5ff, 0xff8a00, 0x00ff9d, 0xff4ba0];

  // Bot roster: names + portraits (reuse the six Viber bodies, cycling).
  static BOT_ROSTER = [
    { name: "Volt Viber", portrait: "assets/robot2_portrait.png" },
    { name: "Moss Viber", portrait: "assets/robot3_portrait.png" },
    { name: "Phantom Viber", portrait: "assets/robot4_portrait.png" },
    { name: "Chog Viber", portrait: "assets/robot5_portrait.png" },
    { name: "Sable Viber", portrait: "assets/robot1_portrait.png" },
    { name: "Nova Viber", portrait: "assets/robot2_portrait.png" },
    { name: "Rift Viber", portrait: "assets/robot3_portrait.png" },
    { name: "Pulse Viber", portrait: "assets/robot4_portrait.png" },
    { name: "Drift Viber", portrait: "assets/robot5_portrait.png" },
  ];

  // Ring of spawn points spread around the arena (level-design: spawn layout
  // scales with the grid). Returns world positions for up to 10 fighters.
  //
  // SPAWN SAFETY: a spawn point must ALWAYS sit on solid ground — on scaled /
  // broken arenas (holes, shelf bands, islets) the ideal ring slot can land in
  // the void and the fighter would fall the instant the round starts. Each slot
  // is therefore validated against the actual island, and if there is no tile
  // under it we search outward (ring by ring) for the nearest walkable tile.
  spawnRing() {
    const g = this.island.gridSize;
    const inset = Math.max(2, Math.floor(g * 0.14)); // keep off the very edge
    const lo = inset;
    const hi = g - 1 - inset;
    const ideal = [
      [lo, lo], [hi, hi], [hi, lo], [lo, hi], // corners
      [Math.floor(g / 2), lo], [Math.floor(g / 2), hi],
      [lo, Math.floor(g / 2)], [hi, Math.floor(g / 2)],
      [Math.floor(g * 0.3), Math.floor(g * 0.7)],
      [Math.floor(g * 0.7), Math.floor(g * 0.3)],
    ];

    // Is this grid cell a walkable tile right now?
    const isSafe = (gx, gz) => {
      const t = this.island.getTile(gx, gz);
      return !!(t && t.isWalkable && t.isWalkable());
    };

    // Nearest walkable cell to (gx, gz): expanding ring search so a spawn that
    // lands over a hole snaps onto the closest solid block instead of the void.
    const findSafe = (gx, gz) => {
      if (isSafe(gx, gz)) return [gx, gz];
      for (let r = 1; r <= Math.max(g, 6); r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring cells only
            const nx = gx + dx;
            const nz = gz + dz;
            if (isSafe(nx, nz)) return [nx, nz];
          }
        }
      }
      // Last resort: the grid centre (every map has ground at its core)
      const c = Math.floor(g / 2);
      return [c, c];
    };

    return ideal.map(([x, z]) => {
      const [sx, sz] = findSafe(x, z);
      return this.island.getWorldPos(sx, sz);
    });
  }

  // (Re)create the whole roster from scratch: p1 + this.botCount bots.
  // Used on boot, on setBotCount, and on setMap (spawn points depend on grid).
  rebuildRoster() {
    // Dispose any existing bots (their meshes live in the scene)
    for (const r of this.robots) {
      if (r !== this.p1 && r.dispose) r.dispose();
    }

    const spawns = this.spawnRing();
    // Player takes the first ring slot
    this.p1.startX = spawns[0].x;
    this.p1.startZ = spawns[0].z;

    this.robots = [this.p1];
    this.bots = [];
    const Roster = Game.BOT_ROSTER;
    const Colors = Game.BOT_COLORS;

    for (let i = 0; i < this.botCount; i++) {
      const meta = Roster[i % Roster.length];
      const spawn = spawns[(i + 1) % spawns.length];
      const bot = new Robot(
        i + 2, // ids 2..N (id 1 is the player)
        meta.name,
        meta.portrait,
        spawn.x,
        spawn.z,
        Colors[i % Colors.length],
        false, // AI controlled
        this.scene
      );
      // Give the bot the Viber body that matches its roster portrait/name
      const charKey = Object.keys(CHAR_TYPES).find((k) => CHAR_TYPES[k].name === meta.name);
      if (charKey) bot.switchCharacter(charKey);
      this.robots.push(bot);
      this.bots.push(bot);
    }
    // p2 stays an alias for the FIRST bot so legacy/online code keeps working
    this.p2 = this.bots[0];
  }

  // Switch between 1 / 4 / 9 CPU bots (menu selector calls this).
  setBotCount(count) {
    const n = Math.max(1, Math.min(9, count | 0));
    if (n === this.botCount) return;
    this.botCount = n;
    // Arena scales with the roster: rebuild the map at the NEW size, then
    // re-place every fighter on the fresh spawn ring.
    this.island.setMap(this.activeMap());
    this.rebuildRoster();
    // Reflect spawns immediately if we're sitting in the menu
    if (this.state === "menu") {
      this.fx.clear();
      this.island.reset();
      this.resetFighters();
      this.island.isPaused = true;
    } else {
      this.restartRound(false);
    }
    // Let the menu refresh its map-size label (NxN) after scaling.
    if (this.ui.onMapScaled) this.ui.onMapScaled(this.activeMap());
  }

  // Every enemy EXCEPT the given robot (used as the `opponent` source for
  // update() — AI picks the nearest, area abilities hit them all).
  allEnemiesOf(robot) {
    return this.robots.filter((r) => r !== robot);
  }

  // Every living fighter (round-over check + survivors HUD)
  livingRobots() {
    return this.robots.filter((r) => r.state === "alive" || r.pos.y > -3.5);
  }

  // The map for the CURRENT match.
  // TEMPORARILY returning the BASE map: the scaledMap() arena projection
  // scrambled the layouts at 10 players (grid 33) — fix the scale properly
  // before re-enabling. Online stays 1v1 (fighters = 2).
  activeMap() {
    return MAPS[this.currentMapIndex];
    // eslint-disable-next-line no-unreachable
    const fighters = this.mode === "online" ? 2 : this.botCount + 1;
    return scaledMap(MAPS[this.currentMapIndex], fighters);
  }

  setMap(mapIndex) {
    if (mapIndex < 0 || mapIndex >= MAPS.length) return;
    const wasPlaying = this.state === "playing" || this.state === "paused";
    this.currentMapIndex = mapIndex;
    const mapDef = this.activeMap();
    this.island.setMap(mapDef);

    // Spawn points depend on the grid — rebuild the whole roster on the new map.
    this.rebuildRoster();

    if (wasPlaying) {
      this.restartRound(false);
    } else {
      // Rebuild the arena and reset fighters while staying in menu attract mode
      this.fx.clear();
      this.island.reset();
      this.resetFighters();
      this.island.isPaused = true;
    }
  }

  // Reset every fighter AND settle each onto the surface under its spawn point.
  // This is the single "respawn" primitive: reset() alone left fighters at y=0,
  // which on elevated / scaled tiles could start them inside a block or over a
  // hole → instant fall. Snapping Y to the real surface guarantees every fighter
  // begins STANDING on a tile.
  resetFighters() {
    for (const r of this.robots) {
      r.reset();
      const surf = this.island.getSurfaceAt(r.startX, r.startZ);
      if (surf) {
        r.pos.y = surf.y;
      } else {
        // No tile under the recorded spawn (arena shrank / layout changed):
        // snap the spawn to the nearest walkable cell and place the fighter there.
        const safe = this.nearestSafeSpawn(r.startX, r.startZ);
        r.startX = safe.x;
        r.startZ = safe.z;
        r.pos.set(safe.x, safe.y, safe.z);
      }
      r.group.position.copy(r.pos);
      r.isGrounded = true;
      r.vy = 0;
    }
  }

  // Nearest walkable WORLD position to (wx, wz) — resolves the spawn cell for a
  // fighter whose recorded point ended up over the void.
  nearestSafeSpawn(wx, wz) {
    const g = this.island.gridSize;
    const centerOffset = (g - 1) / 2;
    const gx = Math.round(wx / TILE_SPACING + centerOffset);
    const gz = Math.round(wz / TILE_SPACING + centerOffset);
    const isSafe = (x, z) => {
      const t = this.island.getTile(x, z);
      return !!(t && t.isWalkable && t.isWalkable());
    };
    if (isSafe(gx, gz)) {
      const s = this.island.getWorldPos(gx, gz);
      const surf = this.island.getSurfaceAt(s.x, s.z);
      return { x: s.x, z: s.z, y: surf ? surf.y : 0 };
    }
    for (let r = 1; r <= Math.max(g, 6); r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!isSafe(gx + dx, gz + dz)) continue;
          const s = this.island.getWorldPos(gx + dx, gz + dz);
          const surf = this.island.getSurfaceAt(s.x, s.z);
          return { x: s.x, z: s.z, y: surf ? surf.y : 0 };
        }
      }
    }
    // Absolute fallback: grid centre
    const c = Math.floor(g / 2);
    const s = this.island.getWorldPos(c, c);
    const surf = this.island.getSurfaceAt(s.x, s.z);
    return { x: s.x, z: s.z, y: surf ? surf.y : 0 };
  }

  handleScreenShake(amount) {
    if (this.ui.onScreenShake) {
      this.ui.onScreenShake(amount);
    }
  }

  setupControls() {
    // Never hijack keystrokes while the player types (e.g. the room-code
    // input) — otherwise letters like E/G/J/P/R never reach the field.
    const isTyping = (e) => {
      const t = e.target;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };

    window.addEventListener("keydown", (e) => {
      if (isTyping(e)) return;
      this.keys[e.code] = true;
      audio.ensureContext();

      if (e.code === "Space") {
        e.preventDefault();
        if (this.state === "menu") {
          this.startGame();
          return;
        }
      }

      // Pause toggle with P or Escape
      if (e.code === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        if (this.state === "playing" || this.state === "paused") {
          this.togglePause();
        }
        return;
      }

      // Prevent browser default on game keys
      if (
        e.code === "KeyE" ||
        e.code === "KeyG" ||
        e.code === "KeyJ" ||
        e.code === "ShiftLeft" ||
        e.code === "ShiftRight"
      ) {
        e.preventDefault();
      }

      // Quick restart with R (blocked while the prize drum is spinning)
      if (e.code === "KeyR") {
        if (!this.drumActive && (this.state === "playing" || this.state === "round_over" || this.state === "paused")) {
          this.restartRound();
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      if (isTyping(e)) return;
      this.keys[e.code] = false;
      if (e.code === "Space") {
        e.preventDefault();
      }
    });

    // Touch support / click audio unlock
    window.addEventListener("pointerdown", () => {
      audio.ensureContext();
    });
  }

  startGame() {
    // Always start in local vs-CPU mode; online mode has its own entry point
    this.mode = "cpu";
    this.netRole = null;
    this.island.remoteAuthoritative = false;
    this.state = "playing";
    this.island.isPaused = false;
    this.restartRound(false);

    if (this.ui.onGameStart) {
      this.ui.onGameStart({
        round: this.roundNumber,
        scores: this.scores,
      });
    }
  }

  // Enter an online match. "host" runs the full sim for both robots,
  // "guest" is a thin client driven by the host's snapshots.
  startOnlineGame(role) {
    this.setOnlineRole(role);
    this.state = "playing";
    this.island.remoteAuthoritative = role === "guest";
    this.island.isPaused = false;
    if (role === "guest") {
      this.mirrorGuestSpawns();
    }
    this.sentTileStates.clear();
    this.sentFx.clear();
    this.lastJumpSent = { p1: 0, p2: 0 };
    this.lastPushSent = { p1: 0, p2: 0 };
    this.lastDashSent = { p1: 0, p2: 0 };
    this.lastLaserSent = { p1: 0, p2: 0 };
    this.lastWinner = null;
    this.netRoundOverShown = false;
    this.remoteInput = { mx: 0, mz: 0, jump: false, push: false, spear: false, grenade: false, dash: false };
    this.restartRoundLocal(false);

    if (this.ui.onGameStart) {
      this.ui.onGameStart({
        round: this.roundNumber,
        scores: this.scores,
        online: role,
      });
    }
  }

  // The host spawns its p2 (our robot) at the map's p2 spawn. Mirror that on
  // the guest so our robot starts exactly where the host expects it —
  // otherwise the first snapshots drag it across the whole island.
  // Online is 1v1, so only p1/p2 matter here (bots aren't used online).
  mirrorGuestSpawns() {
    const mapDef = MAPS[this.currentMapIndex];
    const s1 = this.island.getWorldPos(mapDef.p1Spawn[0], mapDef.p1Spawn[1]);
    const s2 = this.island.getWorldPos(mapDef.p2Spawn[0], mapDef.p2Spawn[1]);
    this.p1.startX = s2.x;
    this.p1.startZ = s2.z;
    this.p2.startX = s1.x;
    this.p2.startZ = s1.z;
  }

  togglePause() {
    if (this.state === "playing") {
      this.setPaused(true);
    } else if (this.state === "paused") {
      this.setPaused(false);
    }
  }

  setPaused(paused) {
    if (paused && this.state === "playing") {
      this.state = "paused";
      this.island.isPaused = true;
      audio.playPause(true);
      // Online guest: freeze our robot on the host while we are paused
      if (this.mode === "online" && this.netRole === "guest" && this.net) {
        this.lastInputSig = "";
        this.net.send({ t: "input", mx: 0, mz: 0, jump: false, push: false, spear: false, grenade: false });
      }
      if (this.ui.onPause) {
        this.ui.onPause(true);
      }
    } else if (!paused && this.state === "paused") {
      this.state = "playing";
      this.island.isPaused = false;
      audio.playPause(false);
      if (this.ui.onPause) {
        this.ui.onPause(false);
      }
    }
  }

  goToMenu() {
    this.state = "menu";
    this.mode = "cpu";
    this.netRole = null;
    this.island.remoteAuthoritative = false;
    this.island.isPaused = true;
    this.fx.clear();
    this.island.reset();
    this.resetFighters();

    if (this.ui.onMenu) {
      this.ui.onMenu();
    }
  }

  setPlayerCharacter(charType) {
    this.selectedChar = charType;
    this.p1.switchCharacter(charType);
  }

  // Mark this game as online for a given role WITHOUT starting the round.
  // Needed on the guest: its DataConnection opens before the host's
  // "start" message arrives, and handleNetMessage routes by netRole.
  setOnlineRole(role) {
    this.mode = "online";
    this.netRole = role;
  }

  // Swap the opponent's body + name (online: the remote player's fighter)
  setOpponentCharacter(charType) {
    const meta = CHAR_TYPES[charType];
    if (!meta) return;
    this.p2.switchCharacter(charType);
    this.p2.name = meta.name;
    this.p2.portraitPath = meta.portrait;
  }

  setDifficulty(level) {
    this.difficulty = level;
    // Apply to every CPU bot (the player has no difficulty). p2 is one of them.
    for (const bot of this.bots) bot.setDifficulty(level);
    if (this.p2 && !this.bots.includes(this.p2)) this.p2.setDifficulty(level);
  }

  restartRound(advanceRound = true) {
    if (this.mode === "online" && this.netRole === "guest") {
      // The guest never restarts the sim locally — ask the host instead.
      if (this.net) this.net.send({ t: "restart" });
      return;
    }

    this.restartRoundLocal(advanceRound);

    // Host broadcasts the fresh arena to the guest
    if (this.mode === "online" && this.netRole === "host" && this.net) {
      this.net.send({
        t: "reset",
        round: this.roundNumber,
        scores: { host: this.scores.p1, guest: this.scores.p2 },
      });
    }
  }

  restartRoundLocal(advanceRound = true) {
    this.state = "playing";
    this.keys = {}; // Avoid held keys firing abilities on the first frame
    if (advanceRound) {
      this.roundNumber++;
    }

    this.lastWinner = null;
    this.netRoundOverShown = false;
    this.sentTileStates.clear();
    this.sentFx.clear();
    this.fx.clear();
    this.island.reset();
    this.resetFighters();

    audio.playReset();

    if (this.ui.onRoundStart) {
      this.ui.onRoundStart({
        round: this.roundNumber,
        scores: this.scores,
      });
    }
    if (this.ui.onRosterChange) this.ui.onRosterChange(this.robots);
  }

  // Pairwise body collision across ALL living fighters (n <= 10 → 45 pairs).
  resolveRobotCollision() {
    const list = this.robots;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state !== "alive") continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state !== "alive") continue;

        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        const dist = Math.hypot(dx, dz);
        const minDist = a.radius + b.radius;
        if (dist >= minDist || dist <= 0.0001) continue;

        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;

        // Position separation to prevent clipping
        a.pos.x += nx * overlap * 0.52;
        a.pos.z += nz * overlap * 0.52;
        b.pos.x -= nx * overlap * 0.52;
        b.pos.z -= nz * overlap * 0.52;

        // Relative closing velocity along contact normal
        const relVel = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * nz;

        // Punchy knockback impulse
        const impulse = BASE_KNOCKBACK + Math.max(0, -relVel * 0.85);

        a.applyImpulse(nx * impulse * 0.55, nz * impulse * 0.55);
        b.applyImpulse(-nx * impulse * 0.55, -nz * impulse * 0.55);

        if (this.ui.onCollision) {
          this.ui.onCollision(dist);
        }
      }
    }
  }

  // Round ends when at most ONE fighter is still in play (last one standing).
  // Handles 1v1, squad and 10-player royale alike.
  checkRoundEnd() {
    if (this.state !== "playing") return;

    const isOut = (r) => r.state === "eliminated" || r.pos.y < -3.5;
    const remaining = this.robots.filter((r) => !isOut(r));

    if (remaining.length > 1) return;

    this.state = "round_over";

    if (remaining.length === 0) {
      // Everyone fell — mutual KO
      this.lastWinner = "draw";
      if (this.ui.onRoundEnd) {
        this.ui.onRoundEnd({
          winnerId: 0,
          winnerText: "DRAW / MUTUAL KO!",
          subText: "Every robot tumbled into the dark abyss!",
          winnerColor: "#ffffff",
          scores: this.scores,
        });
      }
      return;
    }

    const winner = remaining[0];
    const online = this.mode === "online";

    if (winner === this.p1) {
      this.lastWinner = "host";
      this.scores.p1++;
      audio.playWin();
      if (this.ui.onRoundEnd) {
        this.ui.onRoundEnd({
          winnerId: 1,
          winnerText: `${winner.name.toUpperCase()} WINS!`,
          subText: online
            ? "You knocked your opponent into the void!"
            : this.robots.length > 2
              ? `Last one standing out of ${this.robots.length}!`
              : "Player knocked the CPU into the void!",
          winnerColor: "#00e5ff",
          winnerAvatar: winner.portraitPath,
          scores: this.scores,
        });
      }
    } else {
      // A bot (or the online rival) outlasted everyone
      this.lastWinner = "guest";
      this.scores.p2++;
      if (this.ui.onRoundEnd) {
        this.ui.onRoundEnd({
          winnerId: 2,
          winnerText: `${winner.name.toUpperCase()} WINS!`,
          subText: online
            ? "Your opponent pushed you off the edge!"
            : this.robots.length > 2
              ? `A bot outlasted all ${this.robots.length - 1} rivals!`
              : "Enemy pushed you off the edge!",
          winnerColor: "#ff2d95",
          winnerAvatar: winner.portraitPath,
          scores: this.scores,
        });
      }
    }
  }

  // ----------------------------------------------------------------
  // Online 1v1 (host-authoritative PeerJS sync)
  // ----------------------------------------------------------------

  // Route a message from the opponent depending on our role.
  handleNetMessage(msg) {
    if (!msg || !msg.t) return;

    if (this.netRole === "host") {
      switch (msg.t) {
        case "hello":
          if (msg.char) this.setOpponentCharacter(msg.char);
          break;
        case "input":
          this.remoteInput = {
            mx: Number(msg.mx) || 0,
            mz: Number(msg.mz) || 0,
            jump: !!msg.jump,
            push: !!msg.push,
            spear: !!msg.spear,
            grenade: !!msg.grenade,
            dash: !!msg.dash,
          };
          break;
        case "restart":
          this.restartRound(true);
          break;
        case "ping":
          if (this.net) this.net.send({ t: "pong" });
          break;
      }
      return;
    }

    if (this.netRole === "guest") {
      switch (msg.t) {
        case "hello":
          if (msg.char) this.setOpponentCharacter(msg.char);
          if (Number.isInteger(msg.map)) this.setMap(msg.map);
          break;
        case "start":
          if (Number.isInteger(msg.map)) this.setMap(msg.map);
          if (msg.round) this.roundNumber = msg.round;
          this.startOnlineGame("guest");
          break;
        case "snap":
          this.applySnapshot(msg);
          break;
        case "reset":
          if (msg.round) this.roundNumber = msg.round;
          if (msg.scores) {
            this.scores.p1 = msg.scores.guest || 0;
            this.scores.p2 = msg.scores.host || 0;
          }
          this.restartRoundLocal(false);
          break;
      }
    }
  }

  poseOf(r) {
    return {
      x: round2(r.pos.x),
      y: round2(r.pos.y),
      z: round2(r.pos.z),
      f: round2(r.facingAngle),
      vx: round2(r.vel.x),
      vz: round2(r.vel.y),
      st: r.state,
      g: r.isGrounded ? 1 : 0, // grounded flag (guest keeps local Y while the host is airborne)
      cd: [
        round2(r.pushCooldown),
        round2(r.jumpCooldown),
        round2(r.spearCooldown),
        round2(r.grenadeCooldown),
        round2(r.dashCooldown),
      ],
    };
  }

  // Visual FX broadcast: new grenades/spears + removals + jump/push waves.
  collectNetFx() {
    const out = [];
    const seen = new Set();

    for (const p of this.fx.projectiles) {
      const id = p.id;
      const key = "n:" + id;
      seen.add(key);
      const who = p.owner === 1 ? "p1" : "p2";
      if (!this.sentFx.has(key)) {
        this.sentFx.set(key, { kind: "nade", id, tx: p.targetX, ty: p.targetY, tz: p.targetZ, who });
        out.push({
          k: "nade",
          id,
          who,
          x: round2(p.startX),
          y: round2(p.startY),
          z: round2(p.startZ),
          tx: round2(p.targetX),
          ty: round2(p.targetY),
          tz: round2(p.targetZ),
          ft: p.flightTime,
          c: p.mat && p.mat.emissive ? p.mat.emissive.getHex() : 0x00e5ff,
        });
      }
    }

    for (const s of this.fx.spears) {
      const id = s.id;
      const key = "s:" + id;
      seen.add(key);
      const who = s.owner === 1 ? "p1" : "p2";
      if (!this.sentFx.has(key)) {
        this.sentFx.set(key, { kind: "spear", id });
        out.push({
          k: "spear",
          id,
          who,
          x: round2(s.group.position.x),
          y: round2(s.group.position.y),
          z: round2(s.group.position.z),
          dx: round2(s.dirX),
          dz: round2(s.dirZ),
          c: s.colorHex || 0x00f0ff,
        });
      }
    }

    // Announce fx that disappeared since the last snapshot
    for (const [key, info] of this.sentFx) {
      if (seen.has(key)) continue;
      this.sentFx.delete(key);
      if (info.kind === "nade") {
        out.push({ k: "boom", id: info.id, who: info.who, x: round2(info.tx), y: round2(info.ty), z: round2(info.tz) });
      } else {
        out.push({ k: "spearDone", id: info.id });
      }
    }

    // Jump / push wave visuals (host-local robot = p1, guest robot = p2)
    if (this.p1.fxJumpCount > this.lastJumpSent.p1) {
      this.lastJumpSent.p1 = this.p1.fxJumpCount;
      out.push({ k: "jump", who: "p1" });
    }
    if (this.p2.fxJumpCount > this.lastJumpSent.p2) {
      this.lastJumpSent.p2 = this.p2.fxJumpCount;
      out.push({ k: "jump", who: "p2" });
    }
    if (this.p1.fxPushCount > this.lastPushSent.p1) {
      this.lastPushSent.p1 = this.p1.fxPushCount;
      out.push({ k: "push", who: "p1" });
    }
    if (this.p2.fxPushCount > this.lastPushSent.p2) {
      this.lastPushSent.p2 = this.p2.fxPushCount;
      out.push({ k: "push", who: "p2" });
    }
    if (this.p1.fxDashCount > this.lastDashSent.p1) {
      this.lastDashSent.p1 = this.p1.fxDashCount;
      out.push({ k: "dash", who: "p1" });
    }
    if (this.p2.fxDashCount > this.lastDashSent.p2) {
      this.lastDashSent.p2 = this.p2.fxDashCount;
      out.push({ k: "dash", who: "p2" });
    }
    if (this.p1.fxLaserCount > this.lastLaserSent.p1) {
      this.lastLaserSent.p1 = this.p1.fxLaserCount;
      out.push({
        k: "laser",
        who: "p1",
        x: round2(this.p1.pos.x),
        y: round2(this.p1.pos.y + 1.05),
        z: round2(this.p1.pos.z),
        dx: round2(-Math.sin(this.p1.facingAngle)),
        dz: round2(-Math.cos(this.p1.facingAngle)),
      });
    }
    if (this.p2.fxLaserCount > this.lastLaserSent.p2) {
      this.lastLaserSent.p2 = this.p2.fxLaserCount;
      out.push({
        k: "laser",
        who: "p2",
        x: round2(this.p2.pos.x),
        y: round2(this.p2.pos.y + 1.05),
        z: round2(this.p2.pos.z),
        dx: round2(-Math.sin(this.p2.facingAngle)),
        dz: round2(-Math.cos(this.p2.facingAngle)),
      });
    }

    return out;
  }

  // Host -> guest authoritative snapshot (~30/s)
  buildSnapshot() {
    const island = this.island;
    const tiles = [];
    for (const tile of island.allTiles) {
      let code = 0;
      if (tile.state === "warning") code = 1;
      else if (tile.state === "falling" || tile.state === "dead") code = 2;
      if (code === 0) continue;
      const id = tile.gx * island.gridSize + tile.gz;
      if (this.sentTileStates.get(id) !== code) {
        this.sentTileStates.set(id, code);
        tiles.push([id, code]);
      }
    }

    return {
      t: "snap",
      seq: ++this.snapSeq,
      round: this.roundNumber,
      st: this.state,
      winner: this.state === "round_over" ? this.lastWinner : null,
      scores: { host: this.scores.p1, guest: this.scores.p2 },
      island: { fallT: round2(island.fallTimer), interval: round2(island.currentInterval) },
      p1: this.poseOf(this.p1),
      p2: this.poseOf(this.p2),
      tiles,
      fx: this.collectNetFx(),
    };
  }

  // Guest: apply an authoritative snapshot from the host.
  applySnapshot(snap) {
    // Tile state deltas: code 1 = warning, 2 = falling/dead
    if (snap.tiles && snap.tiles.length) {
      for (const d of snap.tiles) {
        const tile = this.island.tileById.get(d[0]);
        if (!tile) continue;
        if (d[1] === 1) {
          tile.startWarning();
        } else if (d[1] === 2) {
          // Never warned locally = weapon collapse (instant drop); warned = rim fall
          if (tile.state === "warning" || tile.state === "falling") tile.startFalling();
          else tile.collapseInstantly();
        }
      }
    }

    // Shrink-timer display sync (progress bar only)
    if (snap.island) {
      this.island.fallTimer = snap.island.fallT || 0;
      this.island.currentInterval = snap.island.interval || this.island.currentInterval;
    }

    // Robot poses: host's p1 = our p2 (opponent), host's p2 = our p1 (us)
    if (snap.p1) this.p2.setNetPose(snap.p1);
    if (snap.p2) this.p1.setNetPose(snap.p2);

    // Scores from our perspective
    if (snap.scores) {
      this.scores.p1 = snap.scores.guest || 0;
      this.scores.p2 = snap.scores.host || 0;
    }
    if (snap.round) this.roundNumber = snap.round;

    // Visual fx
    if (snap.fx && snap.fx.length) {
      for (const f of snap.fx) this.applyNetFx(f);
    }

    // Round-over transition (fires the win overlay exactly once)
    if (snap.st === "round_over" && !this.netRoundOverShown && this.state !== "menu") {
      this.netRoundOverShown = true;
      this.state = "round_over";
      const winner = snap.winner;
      let outcome;
      if (winner === "guest") {
        audio.playWin();
        outcome = {
          winnerId: 1,
          winnerText: `${this.p1.name.toUpperCase()} WINS!`,
          subText: "You knocked your opponent into the void!",
          winnerColor: "#00e5ff",
          winnerAvatar: this.p1.portraitPath,
          scores: this.scores,
        };
      } else if (winner === "host") {
        outcome = {
          winnerId: 2,
          winnerText: `${this.p2.name.toUpperCase()} WINS!`,
          subText: "Your opponent pushed you off the edge!",
          winnerColor: "#ff2d95",
          winnerAvatar: this.p2.portraitPath,
          scores: this.scores,
        };
      } else {
        outcome = {
          winnerId: 0,
          winnerText: "DRAW / MUTUAL KO!",
          subText: "Both robots tumbled into the dark abyss!",
          winnerColor: "#ffffff",
          scores: this.scores,
        };
      }
      if (this.ui.onRoundEnd) this.ui.onRoundEnd(outcome);
    }
  }

  // Guest: render a visual-only fx event (gameplay stays host-authoritative).
  // Our own robot's actions were already predicted locally — skip the host's
  // echo so they don't double up.
  applyNetFx(f) {
    const mine = f.who === "p2"; // host's p2 = our robot
    switch (f.k) {
      case "nade":
        if (mine && this.consumeGuestPrediction("grenade", 1500)) break;
        this.fx.spawnNetGrenade({
          id: f.id,
          x: f.x,
          y: f.y,
          z: f.z,
          tx: f.tx,
          ty: f.ty,
          tz: f.tz,
          ft: f.ft,
          color: f.c || 0x00e5ff,
          // The opponent's blast center is authoritative — collapse the
          // same tiles locally so the destruction is visible instantly.
          onBoom: (ex, ez) => this.island.destroyTilesAt(ex, ez, GRENADE_RADIUS),
        });
        break;
      case "boom":
        if (mine && this.consumeGuestPrediction("grenade", 1500)) break;
        this.fx.detonateNetGrenade(f.id);
        this.handleScreenShake(0.42);
        break;
      case "spear":
        if (mine && this.consumeGuestPrediction("spear", 1200)) break;
        this.fx.spawnFlyingSpear(
          f.x,
          f.y,
          f.z,
          f.dx,
          f.dz,
          7.0,
          24.0,
          null,
          null,
          f.c || 0x00f0ff,
          f.id
        );
        break;
      case "spearDone":
        this.fx.removeSpear(f.id);
        break;
      case "jump": {
        const r = f.who === "p1" ? this.p2 : this.p1;
        if (mine && this.consumeGuestPrediction("jump", 1200)) break;
        r.triggerJumpVisual(this.fx);
        break;
      }
      case "push": {
        const r = f.who === "p1" ? this.p2 : this.p1;
        if (mine && this.consumeGuestPrediction("push", 1200)) break;
        r.playPushWaveVisual();
        r.spawnSpikeBurst(this.fx); // CHOG: quills scatter on the opponent too
        break;
      }
      case "dash": {
        const r = f.who === "p1" ? this.p2 : this.p1;
        if (mine && this.consumeGuestPrediction("dash", 1500)) break;
        r.playDashVisual();
        break;
      }
      case "laser": {
        const r = f.who === "p1" ? this.p2 : this.p1;
        if (mine && this.consumeGuestPrediction("laser", 1500)) break;
        this.fx.fireLaserBeam({
          x: f.x,
          y: f.y,
          z: f.z,
          dirX: f.dx,
          dirZ: f.dz,
          maxDist: LASER_REACH,
          color: 0x39ff14,
        });
        break;
      }
    }
  }

  // True if the guest predicted this kind of action recently (and consume it
  // so a single host echo is suppressed at most once).
  consumeGuestPrediction(kind, windowMs) {
    const t = this.guestPredicted[kind];
    if (t && performance.now() - t < windowMs) {
      this.guestPredicted[kind] = 0;
      return true;
    }
    return false;
  }

  // Guest: move OUR robot locally from the same input we send the host,
  // using identical physics constants. The authoritative snapshots only
  // correct drift (see Robot.netTick) — no network round-trip before the
  // robot reacts to the joystick. Abilities get the same treatment: the
  // visual fires instantly (the host still applies the authoritative
  // knockback / tile damage via snapshots).
  applyGuestPrediction(dt) {
    const keys = this.keys;
    const now = performance.now();
    const fwd =
      (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) -
      (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
    const right =
      (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) -
      (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);

    this.guestMoving = fwd !== 0 || right !== 0;
    const p = this.p1;
    if (p.state !== "alive") return;

    // Dash prediction: instant burst feel + afterimages (the host applies the
    // authoritative burst; the echo fx event is deduped below)
    const shiftDown = !!(keys["ShiftLeft"] || keys["ShiftRight"]);
    if (shiftDown && !p.dashHeld && p.dashCooldown <= 0) {
      let dirX;
      let dirZ;
      if (fwd !== 0 || right !== 0) {
        const v = p.cameraRelativeMove(this.camera, fwd, right);
        dirX = v.x;
        dirZ = v.z;
      } else {
        dirX = -Math.sin(p.facingAngle);
        dirZ = -Math.cos(p.facingAngle);
      }
      if (p.triggerDash(dirX, dirZ)) {
        this.guestPredicted.dash = now;
      }
    }
    p.dashHeld = shiftDown;

    if (p.dashTimer > 0) this.guestMoving = true; // burst counts as steering

    if (this.guestMoving) {
      if (p.dashTimer > 0) {
        // Burst: override velocity along the dash direction
        p.dashTimer -= dt;
        if (p.dashTimer <= 0) p.dashRecovery = DASH_RECOVERY;
        const burst = P1_MAX_SPEED * DASH_SPEED_MULT;
        p.vel.set(p.dashDir.x * burst, p.dashDir.y * burst);
        p.facingAngle = Math.atan2(-p.dashDir.x, -p.dashDir.y);
      } else {
        const v = p.cameraRelativeMove(this.camera, fwd, right);
        p.vel.x += v.x * P1_ACCEL * dt;
        p.vel.y += v.z * P1_ACCEL * dt;
        p.facingAngle = Math.atan2(-v.x, -v.z);

        if (p.dashRecovery > 0) p.dashRecovery -= dt;
        const dampingFactor = Math.max(0, 1 - P1_DAMPING * dt);
        p.vel.multiplyScalar(dampingFactor);
        const speed = p.vel.length();
        if (speed > P1_MAX_SPEED && p.dashTimer <= 0 && p.dashRecovery <= 0) {
          p.vel.multiplyScalar(P1_MAX_SPEED / speed);
        }
      }

      // Per-axis ledge/wall blocking — same rules as the host, so the
      // predicted robot cannot clip through raised tiers of blocks.
      const tryX = p.pos.x + p.vel.x * dt;
      const sx = this.island.getSurfaceAt(tryX, p.pos.z);
      if (sx && p.blockedBySurface(sx.y)) {
        p.vel.x = 0;
      } else {
        p.pos.x = tryX;
      }

      const tryZ = p.pos.z + p.vel.y * dt;
      const sz = this.island.getSurfaceAt(p.pos.x, tryZ);
      if (sz && p.blockedBySurface(sz.y)) {
        p.vel.y = 0;
      } else {
        p.pos.z = tryZ;
      }
    }

    // Step snap: walk up/down small height steps instantly like the host
    // (prevents feet clipping into level-1 platforms while steering).
    if (p.isGrounded) {
      const s = this.island.getSurfaceAt(p.pos.x, p.pos.z);
      if (s && Math.abs(s.y - p.pos.y) <= STEP_UP_MAX) {
        p.pos.y = s.y;
      }
    }

    // Abilities: instant local feel (the host echoes are deduped above)
    const dirX = -Math.sin(p.facingAngle);
    const dirZ = -Math.cos(p.facingAngle);

    // Predicted aerial physics: the hop starts instantly instead of waiting
    // for the host round-trip. netTick keeps the local Y while airborne.
    if (!p.isGrounded) {
      p.vy -= GRAVITY * dt;
      p.pos.y += p.vy * dt;
      const s = this.island.getSurfaceAt(p.pos.x, p.pos.z);
      if (s && p.pos.y <= s.y && p.vy <= 0) {
        p.pos.y = s.y;
        p.vy = 0;
        p.isGrounded = true;
        p.predictingHop = false;
        audio.playLand();
      }
    }

    if (keys["KeyJ"] && p.pushCooldown <= 0) {
      p.pushCooldown = PUSH_COOLDOWN;
      p.playPushWaveVisual();
      p.spawnSpikeBurst(this.fx); // CHOG: quills scatter instantly on the guest too
      this.guestPredicted.push = now;
    }
    if (keys["Space"] && p.jumpCooldown <= 0 && p.isGrounded) {
      p.jumpCooldown = JUMP_COOLDOWN;
      p.isGrounded = false;
      p.predictingHop = true;
      p.vy = JUMP_FORCE;
      p.triggerJumpVisual(this.fx);
      this.guestPredicted.jump = now;
    }
    if (keys["KeyE"] && p.spearCooldown <= 0) {
      p.spearCooldown = SPEAR_COOLDOWN;
      audio.playSpearThrust();
      if (p.hasLaser) {
        // META: predict the laser beam locally (the host echoes are deduped)
        this.fx.fireLaserBeam({
          x: p.pos.x + dirX * 0.4,
          y: p.pos.y + 1.05,
          z: p.pos.z + dirZ * 0.4,
          dirX,
          dirZ,
          maxDist: LASER_REACH,
          color: 0x39ff14,
        });
        this.guestPredicted.laser = now;
      } else {
        this.fx.spawnFlyingSpear(
          p.pos.x + dirX * 0.4,
          p.pos.y + 0.55,
          p.pos.z + dirZ * 0.4,
          dirX,
          dirZ,
          7.0,
          24.0,
          null,
          null,
          p.teamColor
        );
        this.guestPredicted.spear = now;
      }
    }
    if (keys["KeyG"] && p.grenadeCooldown <= 0) {
      p.grenadeCooldown = GRENADE_COOLDOWN;
      audio.playGrenadeThrow();
      const tx = p.pos.x + dirX * GRENADE_THROW_DISTANCE;
      const tz = p.pos.z + dirZ * GRENADE_THROW_DISTANCE;
      this.fx.spawnNetGrenade({
        x: p.pos.x,
        y: p.pos.y + 0.75,
        z: p.pos.z,
        tx,
        ty: p.pos.y + 0.02,
        tz,
        ft: 0.65,
        color: p.hasLaser ? 0x39ff14 : p.teamColor,
        // Collapse the floor LOCALLY at detonation for an instant visual —
        // the host destroys the same tiles authoritatively a moment later
        // and the idempotent deltas keep both sides consistent.
        onBoom: (ex, ez) => this.island.destroyTilesAt(ex, ez, GRENADE_RADIUS),
      });
      this.guestPredicted.grenade = now;
    }
  }

  // Guest: serialize the same input the keyboard/touch already produce and
  // send it on change (plus a heartbeat) — not every frame.
  sendGuestInput() {
    if (this.state !== "playing") return;
    const keys = this.keys;
    const fwd =
      (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) -
      (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
    const right =
      (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) -
      (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);

    let mx = 0;
    let mz = 0;
    if (fwd !== 0 || right !== 0) {
      // Camera-relative using OUR camera, sent as a world-space vector
      const v = this.p1.cameraRelativeMove(this.camera, fwd, right);
      mx = round2(v.x);
      mz = round2(v.z);
    }

    const msg = {
      t: "input",
      mx,
      mz,
      jump: !!keys["Space"],
      push: !!keys["KeyJ"],
      spear: !!keys["KeyE"],
      grenade: !!keys["KeyG"],
      dash: !!(keys["ShiftLeft"] || keys["ShiftRight"]),
    };
    const sig = `${msg.mx},${msg.mz},${msg.jump ? 1 : 0}${msg.push ? 1 : 0}${msg.spear ? 1 : 0}${msg.grenade ? 1 : 0}${msg.dash ? 1 : 0}`;
    const now = performance.now();
    if (sig !== this.lastInputSig || now - this.inputSentAt > 500) {
      this.lastInputSig = sig;
      this.inputSentAt = now;
      if (this.net) this.net.send(msg);
    }
  }

  update(dt) {
    if (this.state === "menu") {
      // In menu attract mode: keep subtle tile pulse and prop motion alive,
      // don't tick physics or shrinking
      this.island.updateProps(dt * 0.6);
      for (const tile of this.island.allTiles) {
        if (!tile.isDead && tile.isIdle()) {
          tile.update(dt * 0.5);
        }
      }
      return;
    }

    if (this.state === "paused") {
      // Frozen during pause
      return;
    }

    // ONLINE GUEST: thin client — no authoritative physics, but with LOCAL
    // prediction for our own robot so the joystick responds instantly (the
    // host's snapshots gently correct drift instead of driving the motion).
    if (this.mode === "online" && this.netRole === "guest") {
      this.island.update(dt); // tiles animate (shrink is host-authoritative), props move
      this.fx.update(dt);
      this.applyGuestPrediction(dt);
      this.p1.netTick(dt, this.guestMoving, this.island);
      this.p2.netTick(dt);

      // Tick the local cooldown display between snapshots (values themselves
      // arrive in every snapshot from the host)
      for (const cd of ["pushCooldown", "jumpCooldown", "spearCooldown", "grenadeCooldown", "dashCooldown"]) {
        this.p1[cd] = Math.max(0, this.p1[cd] - dt);
      }

      this.sendGuestInput();

      if (this.ui.onStatusUpdate) {
        this.ui.onStatusUpdate({
          activeTiles: this.island.getActiveCount(),
          totalTiles: this.island.totalInitialTiles,
          nextFallTimer: Math.max(0, this.island.fallTimer),
          scores: this.scores,
          abilities: this.p1.getAbilityStatus(),
          gameState: this.state,
        });
      }
      return;
    }

    // 1. Update island grid and shrinking
    this.island.update(dt);

    // 2. Update particle FX and projectiles
    this.fx.update(dt);

    // 3. Update robots with weapons and FX support
    const shakeCb = this.handleScreenShake.bind(this);
    if (this.mode === "online") {
      // Online stays strictly 1v1: p1 (player) vs p2 (the single rival)
      this.p1.update(dt, this.camera, this.island, this.p2, this.keys, this.fx, shakeCb);
      if (this.netRole === "host") {
        // ONLINE HOST: the opponent robot is driven by the guest's input
        this.p2.update(dt, this.camera, this.island, this.p1, null, this.fx, shakeCb, this.remoteInput);
      } else {
        this.p2.update(dt, this.camera, this.island, this.p1, this.keys, this.fx, shakeCb);
      }
    } else {
      // LOCAL vs CPU (N bots): every robot gets the full living-enemy list —
      // AI targets the nearest foe, area abilities hit them all.
      for (const r of this.robots) {
        const enemies = this.allEnemiesOf(r);
        r.update(dt, this.camera, this.island, enemies, this.keys, this.fx, shakeCb);
      }
    }

    // 4. Check and resolve collisions
    this.resolveRobotCollision();

    // 5. Check victory conditions
    this.checkRoundEnd();

    // 6. ONLINE HOST: broadcast authoritative snapshots (~30/s)
    if (this.mode === "online" && this.netRole === "host" && this.net) {
      this.snapAccum += dt;
      if (this.snapAccum >= 1 / 30) {
        this.snapAccum -= 1 / 30;
        this.net.send(this.buildSnapshot());
      }
    }

    // 7. Periodic UI status update
    if (this.ui.onStatusUpdate) {
      this.ui.onStatusUpdate({
        activeTiles: this.island.getActiveCount(),
        totalTiles: this.island.totalInitialTiles,
        nextFallTimer: Math.max(0, this.island.fallTimer),
        scores: this.scores,
        abilities: this.p1.getAbilityStatus(),
        gameState: this.state,
        survivors: this.robots.length, // total fighters this round
        alive: this.robots.filter((r) => r.state === "alive").length,
        robots: this.robots, // live roster for the survivors HUD
      });
    }
  }
}
