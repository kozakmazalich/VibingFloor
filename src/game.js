import {
  TILE_SPACING,
  ROBOT_RADIUS,
  BASE_KNOCKBACK,
  COLORS,
  P1_ACCEL,
  P1_MAX_SPEED,
  P1_DAMPING,
} from "./constants.js";
import { Island } from "./island.js";
import { Robot, CHAR_TYPES } from "./robot.js";
import { FXManager } from "./particles.js";
import { audio } from "./audio.js";
import { MAPS } from "./maps.js";

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
    this.remoteInput = { mx: 0, mz: 0, jump: false, push: false, spear: false, grenade: false };

    // Host: snapshot / fx bookkeeping
    this.snapSeq = 0;
    this.snapAccum = 0;
    this.sentTileStates = new Map(); // tileId -> last sent state code
    this.sentFx = new Map(); // fxId -> { kind, ... } awaiting removal broadcast
    this.lastJumpSent = { p1: 0, p2: 0 };
    this.lastPushSent = { p1: 0, p2: 0 };
    this.lastWinner = null; // "host" | "guest" | "draw" | null

    // Guest: input serialization + round-over detection
    this.lastInputSig = "";
    this.inputSentAt = 0;
    this.netRoundOverShown = false;
    this.guestMoving = false; // guest is steering right now (prediction active)

    // FX & Projectiles Manager
    this.fx = new FXManager(this.scene);

    // Create Island with default map
    const initialMap = MAPS[this.currentMapIndex];
    this.island = new Island(this.scene, initialMap);

    // Initial positions based on selected map
    const p1Spawn = this.island.getWorldPos(initialMap.p1Spawn[0], initialMap.p1Spawn[1]);
    const p2Spawn = this.island.getWorldPos(initialMap.p2Spawn[0], initialMap.p2Spawn[1]);

    // Create Robots using full-color clean textures
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

    this.p2 = new Robot(
      2,
      "Volt Viber",
      "assets/robot2_portrait.png",
      p2Spawn.x,
      p2Spawn.z,
      COLORS.p2Ring,
      false, // AI controlled
      this.scene
    );

    // Collision cooldown
    this.collisionCooldown = 0;

    // Hook keyboard listeners
    this.setupControls();
  }

  setMap(mapIndex) {
    if (mapIndex < 0 || mapIndex >= MAPS.length) return;
    const wasPlaying = this.state === "playing" || this.state === "paused";
    this.currentMapIndex = mapIndex;
    const mapDef = MAPS[mapIndex];
    this.island.setMap(mapDef);

    const p1Spawn = this.island.getWorldPos(mapDef.p1Spawn[0], mapDef.p1Spawn[1]);
    const p2Spawn = this.island.getWorldPos(mapDef.p2Spawn[0], mapDef.p2Spawn[1]);

    this.p1.startX = p1Spawn.x;
    this.p1.startZ = p1Spawn.z;
    this.p2.startX = p2Spawn.x;
    this.p2.startZ = p2Spawn.z;

    if (wasPlaying) {
      this.restartRound(false);
    } else {
      // Rebuild the arena and reset fighters while staying in menu attract mode
      this.fx.clear();
      this.island.reset();
      this.p1.reset();
      this.p2.reset();
      this.island.isPaused = true;
    }
  }

  handleScreenShake(amount) {
    if (this.ui.onScreenShake) {
      this.ui.onScreenShake(amount);
    }
  }

  setupControls() {
    window.addEventListener("keydown", (e) => {
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
      if (e.code === "KeyE" || e.code === "KeyG" || e.code === "KeyJ") {
        e.preventDefault();
      }

      // Quick restart with R
      if (e.code === "KeyR") {
        if (this.state === "playing" || this.state === "round_over" || this.state === "paused") {
          this.restartRound();
        }
      }
    });

    window.addEventListener("keyup", (e) => {
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
    this.lastWinner = null;
    this.netRoundOverShown = false;
    this.remoteInput = { mx: 0, mz: 0, jump: false, push: false, spear: false, grenade: false };
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
    this.p1.reset();
    this.p2.reset();

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
    this.p2.setDifficulty(level);
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
    this.p1.reset();
    this.p2.reset();

    audio.playReset();

    if (this.ui.onRoundStart) {
      this.ui.onRoundStart({
        round: this.roundNumber,
        scores: this.scores,
      });
    }
  }

  resolveRobotCollision() {
    if (this.p1.state !== "alive" || this.p2.state !== "alive") return;

    const dx = this.p1.pos.x - this.p2.pos.x;
    const dz = this.p1.pos.z - this.p2.pos.z;
    const dist = Math.hypot(dx, dz);
    const minDist = this.p1.radius + this.p2.radius;

    if (dist < minDist && dist > 0.0001) {
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = minDist - dist;

      // Position separation to prevent clipping
      this.p1.pos.x += nx * overlap * 0.52;
      this.p1.pos.z += nz * overlap * 0.52;
      this.p2.pos.x -= nx * overlap * 0.52;
      this.p2.pos.z -= nz * overlap * 0.52;

      // Relative closing velocity along contact normal
      const relVel =
        (this.p1.vel.x - this.p2.vel.x) * nx +
        (this.p1.vel.y - this.p2.vel.y) * nz;

      // Punchy knockback impulse
      const impulse = BASE_KNOCKBACK + Math.max(0, -relVel * 0.85);

      this.p1.applyImpulse(nx * impulse * 0.55, nz * impulse * 0.55);
      this.p2.applyImpulse(-nx * impulse * 0.55, -nz * impulse * 0.55);

      if (this.ui.onCollision) {
        this.ui.onCollision(dist);
      }
    }
  }

  checkRoundEnd() {
    if (this.state !== "playing") return;

    const p1Eliminated = this.p1.state === "eliminated" || this.p1.pos.y < -3.5;
    const p2Eliminated = this.p2.state === "eliminated" || this.p2.pos.y < -3.5;

    if (p1Eliminated && p2Eliminated) {
      // Rare double KO
      this.state = "round_over";
      this.lastWinner = "draw";
      if (this.ui.onRoundEnd) {
        this.ui.onRoundEnd({
          winnerId: 0,
          winnerText: "DRAW / MUTUAL KO!",
          subText: "Both robots tumbled into the dark abyss!",
          winnerColor: "#ffffff",
          scores: this.scores,
        });
      }
    } else if (p2Eliminated && this.p1.state === "alive") {
      // Player 1 wins
      this.state = "round_over";
      this.lastWinner = "host";
      this.scores.p1++;
      audio.playWin();

      const online = this.mode === "online";
      if (this.ui.onRoundEnd) {
        this.ui.onRoundEnd({
          winnerId: 1,
          winnerText: `${this.p1.name.toUpperCase()} WINS!`,
          subText: online
            ? "You knocked your opponent into the void!"
            : "Player knocked the CPU into the void!",
          winnerColor: "#00e5ff",
          winnerAvatar: this.p1.portraitPath,
          scores: this.scores,
        });
      }
    } else if (p1Eliminated && this.p2.state === "alive") {
      // Robot 2 (CPU or online guest) wins
      this.state = "round_over";
      this.lastWinner = "guest";
      this.scores.p2++;

      const online = this.mode === "online";
      if (this.ui.onRoundEnd) {
        this.ui.onRoundEnd({
          winnerId: 2,
          winnerText: `${this.p2.name.toUpperCase()} WINS!`,
          subText: online
            ? "Your opponent pushed you off the edge!"
            : "Enemy pushed you off the edge!",
          winnerColor: "#ff2d95",
          winnerAvatar: this.p2.portraitPath,
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
      cd: [
        round2(r.pushCooldown),
        round2(r.jumpCooldown),
        round2(r.spearCooldown),
        round2(r.grenadeCooldown),
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
      if (!this.sentFx.has(key)) {
        this.sentFx.set(key, { kind: "nade", id, tx: p.targetX, ty: p.targetY, tz: p.targetZ });
        out.push({
          k: "nade",
          id,
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
      if (!this.sentFx.has(key)) {
        this.sentFx.set(key, { kind: "spear", id });
        out.push({
          k: "spear",
          id,
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
        out.push({ k: "boom", id: info.id, x: round2(info.tx), y: round2(info.ty), z: round2(info.tz) });
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
        const tile = this.island.tileById[d[0]];
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

  // Guest: render a visual-only fx event (gameplay stays host-authoritative)
  applyNetFx(f) {
    switch (f.k) {
      case "nade":
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
        });
        break;
      case "boom":
        this.fx.detonateNetGrenade(f.id);
        this.handleScreenShake(0.42);
        break;
      case "spear":
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
        r.triggerJumpVisual(this.fx);
        break;
      }
      case "push": {
        const r = f.who === "p1" ? this.p2 : this.p1;
        r.playPushWaveVisual();
        break;
      }
    }
  }

  // Guest: move OUR robot locally from the same input we send the host,
  // using identical physics constants. The authoritative snapshots only
  // correct drift (see Robot.netTick) — no network round-trip before the
  // robot reacts to the joystick.
  applyGuestPrediction(dt) {
    const keys = this.keys;
    const fwd =
      (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) -
      (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
    const right =
      (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) -
      (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);

    this.guestMoving = fwd !== 0 || right !== 0;
    const p = this.p1;
    if (p.state !== "alive" || !this.guestMoving) return;

    const v = p.cameraRelativeMove(this.camera, fwd, right);
    p.vel.x += v.x * P1_ACCEL * dt;
    p.vel.y += v.z * P1_ACCEL * dt;
    p.facingAngle = Math.atan2(-v.x, -v.z);

    const dampingFactor = Math.max(0, 1 - P1_DAMPING * dt);
    p.vel.multiplyScalar(dampingFactor);
    const speed = p.vel.length();
    if (speed > P1_MAX_SPEED) {
      p.vel.multiplyScalar(P1_MAX_SPEED / speed);
    }

    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.y * dt;
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
      jump: !!keys["KeyJ"],
      push: !!keys["Space"],
      spear: !!keys["KeyE"],
      grenade: !!keys["KeyG"],
    };
    const sig = `${msg.mx},${msg.mz},${msg.jump ? 1 : 0}${msg.push ? 1 : 0}${msg.spear ? 1 : 0}${msg.grenade ? 1 : 0}`;
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
      this.p1.netTick(dt, this.guestMoving);
      this.p2.netTick(dt);

      // Tick the local cooldown display between snapshots (values themselves
      // arrive in every snapshot from the host)
      for (const cd of ["pushCooldown", "jumpCooldown", "spearCooldown", "grenadeCooldown"]) {
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
    this.p1.update(dt, this.camera, this.island, this.p2, this.keys, this.fx, shakeCb);
    if (this.mode === "online" && this.netRole === "host") {
      // ONLINE HOST: the opponent robot is driven by the guest's input
      this.p2.update(dt, this.camera, this.island, this.p1, null, this.fx, shakeCb, this.remoteInput);
    } else {
      this.p2.update(dt, this.camera, this.island, this.p1, this.keys, this.fx, shakeCb);
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
      });
    }
  }
}
