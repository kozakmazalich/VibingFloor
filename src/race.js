import * as THREE from "three";
import { Robot, CHAR_TYPES } from "./robot.js";
import { RaceCourse } from "./raceCourse.js";
import { RACE_MAPS, pickRaceMap, buildOversizedMetaViber } from "./raceMaps.js";
import { audio } from "./audio.js";
import {
  COLORS,
  GRAVITY,
  JUMP_FORCE,
  STEP_UP_MAX,
  DASH_RECOVERY,
  JETPACK_MAX_CHARGES,
  JETPACK_CHARGE_COST,
  RACE_PLAYER_SPEED_MULT,
  RACE_RESPAWN_DELAY,
  RACE_RESPAWN_SHIELD,
  RACE_COUNTDOWN,
  RACE_SPINNER_IMPULSE,
  RACE_BOTS_TO_END,
  RACE_DIFFICULTIES,
} from "./constants.js";

/**
 * VIBER RACE — obstacle-course race mode.
 *
 * Owned by Game (game.race). While game.mode === "race", Game.update hands
 * the frame to RaceMode.update. The player's Robot (game.p1) is borrowed for
 * the race; bots are fresh Robots driven by a race controller instead of the
 * battle AI. No combat: push / spear / grenade are locked (combatDisabled).
 */

const NO_ENEMIES = [];
const BOT_AIR_SPEED = 3.7; // bots keep at least this speed in the air (reliable 2.5u gap clears)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Race-map hazard tunables (Red Light Green Light + Meteor Shower).
// ---------------------------------------------------------------------------
const RL_GREEN_DUR = 4.0; // seconds of GREEN LIGHT (run)
const RL_RED_DUR = 5.0; // seconds of RED LIGHT (announcement + scan)
const RL_REACTION = 2.6; // hear "RED LIGHT" and STOP before the scan starts
const RL_MOVE_SPEED = 0.35; // horizontal speed above this counts as moving
const RL_SHOT_CD = 0.6; // min seconds between two shots on the same racer

const METEOR_INTERVAL = 1.15; // seconds between meteor spawns
const METEOR_FALL_TIME = 1.15; // spawn -> impact (warning window)
const METEOR_SPAWN_Y = 24; // meteor start height
const METEOR_BLAST_R = 1.9; // direct-hit radius
const METEOR_NEAR_R = 3.1; // knockback-only radius
const METEOR_MAX_ACTIVE = 6; // cap for 60fps on the M1
const METEOR_HOLE_R = 1.55; // crater / collision-hole radius
const METEOR_MAX_HOLES = 14; // keep the track playable (floor restore on reset)
const LASER_LIFE = 0.18; // green META laser flash duration

// Shared meteor kit (one geometry + material pair, reused for every meteor).
let meteorKit = null;
function ensureMeteorKit() {
  if (meteorKit) return meteorKit;
  meteorKit = {
    geo: new THREE.SphereGeometry(0.42, 12, 10),
    mat: new THREE.MeshBasicMaterial({ color: 0xff8c2a }),
    trailGeo: new THREE.CylinderGeometry(0.16, 0.34, 1.6, 8),
    trailMat: new THREE.MeshBasicMaterial({ color: 0xff5c1a, transparent: true, opacity: 0.7, depthWrite: false }),
    shadowGeo: new THREE.CircleGeometry(1.15, 24),
    shadowMat: new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.55, depthWrite: false }),
  };
  meteorKit.shadowGeo.rotateX(-Math.PI / 2);
  return meteorKit;
}

export function formatRaceTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

export class RaceMode {
  constructor(game) {
    this.game = game;
    this.course = null;
    this.racers = [];
    this.playerRc = null;
    this.phase = "idle"; // "countdown" | "racing" | "done"
    this.countdown = 0;
    this.raceTime = 0;
    this.finishOrder = [];
    this.ended = false;
    this.difficulty = "normal";
    this._shake = (amount) => game.handleScreenShake(amount);

    // Random race-map selection + hazard state.
    this.mapId = null;
    this.mapDef = null;
    this.mapObjects = null; // per-map meshes (META VIBER, light panel)
    this.light = "green"; // redlight map: "green" | "red"
    this.lightT = 0; // seconds into the current light phase
    this._redScanned = false; // has the scan/laser started for this RED phase?
    this.meteors = []; // meteor-shower map
    this._meteorTimer = 0;
    this._lasers = []; // green META laser flashes (redlight map)
    this.raceHoleSoundCd = 0; // throttle the floor-break sound
  }

  // Robots in grid order (player first) — used by the HUD strip.
  racerRobots() {
    return this.racers.map((rc) => rc.robot);
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------
  enter({ racers = 5, difficulty = "normal", mapId = null, halloween = true } = {}) {
    const g = this.game;
    const total = racers >= 10 ? 10 : 5;
    this.difficulty = RACE_DIFFICULTIES[difficulty] ? difficulty : "normal";
    this.halloween = !!halloween;

    // Tear down the battle arena so only the course renders.
    g.fx.clear();
    g.pickups.clear();
    g.consumables.clear();
    g.island.clear();
    g.island.isPaused = true;
    for (const r of g.robots) {
      if (r !== g.p1 && r.group) r.group.visible = false;
    }

    const p1 = g.p1;
    this._p1Saved = {
      startX: p1.startX,
      startZ: p1.startZ,
      speedMult: p1.speedMult,
      combatDisabled: p1.combatDisabled,
    };
    p1.speedMult = RACE_PLAYER_SPEED_MULT;
    p1.combatDisabled = true;

    // Map pick: an explicit choice wins, otherwise random (avoid a repeat).
    const chosen = RACE_MAPS.find((m) => m.id === mapId);
    this.mapDef = chosen || pickRaceMap(this.mapId);
    this.mapId = this.mapDef.id;
    this.course = new RaceCourse(g.scene, this.mapDef.layout, { halloween: this.halloween });
    this._setupMap();
    if (g.ui.onRaceEvent) {
      g.ui.onRaceEvent({ type: "map", name: this.mapDef.name, tagline: this.mapDef.tagline });
    }

    // Grid slots: two rows of five. The player takes front-row centre.
    const order = [2, 1, 3, 0, 4, 7, 6, 8, 5, 9];
    this.racers = [];
    this.playerRc = this.makeRacer(p1, true, order[0]);
    this.racers.push(this.playerRc);

    const roster = g.constructor.BOT_ROSTER || [];
    const colors = g.constructor.BOT_COLORS || [COLORS.accentMagenta];
    for (let i = 0; i < total - 1; i++) {
      const meta = roster[i % roster.length] || { name: `Viber ${i + 1}`, portrait: "assets/robot2_portrait.png" };
      const bot = new Robot(i + 2, meta.name, meta.portrait, 0, 0, colors[i % colors.length], false, g.scene);
      // Same body lookup as the battle roster (Game.rebuildRoster).
      const charKey = Object.keys(CHAR_TYPES).find((k) => CHAR_TYPES[k].name === meta.name);
      if (charKey) bot.switchCharacter(charKey);
      const rc = this.makeRacer(bot, false, order[i + 1]);
      bot.raceController = (dt) => this.botThink(rc, dt);
      this.racers.push(rc);
    }

    this.restart(false);
  }

  makeRacer(robot, isPlayer, slot) {
    const preset = RACE_DIFFICULTIES[this.difficulty];
    const col = slot % 5;
    const jitter = isPlayer ? 1 : 0.94 + Math.random() * 0.1;
    return {
      robot,
      isPlayer,
      slot,
      laneBias: clamp((col - 2) / 2 + (Math.random() - 0.5) * 0.3, -1, 1),
      ai: { ...preset, speed: preset.speed * jitter },
      cp: 0,
      finished: false,
      placement: null,
      finishTime: 0,
      finishX: 0,
      route: [],
      wp: 0,
      downT: 0,
      shield: 0,
      spinCd: 0,
      holdT: 0,
      stuckT: 0,
      bestS: 0,
      jetMode: false,
      rescueRolled: false,
      rescueOk: false,
      gapSeen: false,
      earlyJump: false,
      spinIgnoreUntil: 0,
      spinRolledAt: -10,
      hopT: 0,
      shotCd: 0, // red-light map: min time between two shots
      meteorCd: 0, // meteor map: brief post-hit grace
    };
  }

  // Fresh race on the same course + roster (R / PLAY AGAIN).
  restart(notify = true) {
    const g = this.game;
    if (!this.course) return;
    this.course.reset();
    g.fx.clear();
    this.phase = "countdown";
    this.countdown = RACE_COUNTDOWN;
    this.raceTime = 0;
    this.finishOrder = [];
    this.ended = false;

    for (const rc of this.racers) {
      const row = Math.floor(rc.slot / 5);
      const x = ((rc.slot % 5) - 2) * 1.8;
      const s = -row * 2.4;
      this.placeRobot(rc, x, s, 0);
      rc.cp = 0;
      rc.finished = false;
      rc.placement = null;
      rc.finishTime = 0;
      rc.bestS = s;
      rc.stuckT = 0;
      rc.shotCd = 0;
      rc.meteorCd = 0;
      rc.route = this.routeFrom(s);
      rc.wp = 0;
    }

    // Reset the map hazard (light cycle, meteors) for a fresh race.
    this.light = "green";
    this.lightT = 0;
    this._redScanned = false;
    this._meteorTimer = 0;
    this.raceHoleSoundCd = 0;
    this._clearLasers();
    for (const m of this.meteors) this._removeMeteor(m);
    this.meteors = [];

    g.state = "playing";
    g.keys = {};
    g.roundEndGrace = 0;
    g.roundEndOutcome = null;
    audio.playReset();
    if (notify && g.ui.onRoundStart) g.ui.onRoundStart({ round: g.roundNumber, scores: g.scores, race: true });
    if (g.ui.onRaceCountdown) g.ui.onRaceCountdown(String(RACE_COUNTDOWN));
    this._shownCount = RACE_COUNTDOWN;
    if (g.ui.onRosterChange) g.ui.onRosterChange(this.racerRobots());
  }

  // Hand the borrowed player robot back and drop every race object.
  exit() {
    const g = this.game;
    for (const rc of this.racers) {
      if (rc.isPlayer) continue;
      rc.robot.raceController = null;
      rc.robot.dispose();
    }
    this.racers = [];
    this.playerRc = null;
    this._teardownMap();
    if (this._p1Saved) {
      const p1 = g.p1;
      p1.startX = this._p1Saved.startX;
      p1.startZ = this._p1Saved.startZ;
      p1.speedMult = this._p1Saved.speedMult;
      p1.combatDisabled = this._p1Saved.combatDisabled;
      p1.group.visible = true;
      this._p1Saved = null;
    }
    if (this.course) {
      this.course.dispose();
      this.course = null;
    }
    g.fx.clear();
    this.phase = "idle";
  }

  // ---------------------------------------------------------------------
  // Per-map hazard setup (layouts themselves come from src/raceLayouts.js)
  // ---------------------------------------------------------------------
  _setupMap() {
    this._teardownMap();
    this.meteors = [];
    this._meteorTimer = 0;
    this.light = "green";
    this.lightT = 0;
    this._redScanned = false;
    if (!this.mapDef) return;
    this.mapObjects = {};
    if (this.mapDef.hazard === "redlight") this._setupRedLight();
  }

  _setupRedLight() {
    const obj = this.mapObjects;
    const bx = this.course.bossX;
    const bz = -(this.course.finishS + 2);
    const m = buildOversizedMetaViber();
    // Stand at the front of the track, just past the finish gate.
    m.group.position.set(bx, 0, bz);
    m.group.rotation.y = Math.PI; // GREEN: facing away from the racers
    this.course.root.add(m.group);

    // Glowing halo above the head — the clearest GREEN/RED signal.
    const haloGeo = new THREE.TorusGeometry(1.7, 0.24, 12, 48);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x39ff14 });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(bx, m.height + 1.0, bz);
    halo.rotation.x = Math.PI / 2;
    this.course.root.add(halo);

    // Big billboard behind the META VIBER reinforces the current light.
    const panelGeo = new THREE.PlaneGeometry(14, 7);
    const panelMat = new THREE.MeshBasicMaterial({
      color: 0x39ff14,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(bx, 4.4, bz - 4);
    this.course.root.add(panel);

    obj.meta = m;
    obj.halo = halo;
    obj.haloMat = haloMat;
    obj.panel = panel;
    obj.panelMat = panelMat;
    obj.geos = [haloGeo, panelGeo];
    obj.mats = [haloMat, panelMat];
    // Free the META VIBER's own bodies too (its outline/edge assets are shared).
    obj.viberMats = m.mats || [];
    obj.viberGeos = [];
    m.group.traverse((o) => {
      if (o.isMesh && o.geometry) obj.viberGeos.push(o.geometry);
    });

    // Load the "GREEN LIGHT" / "RED LIGHT" voice clips now so the first flip
    // (and the opening green phase) can fire them instantly.
    audio.preloadVoices();
  }

  _teardownMap() {
    this._clearLasers();
    audio.stopVoice(); // silence any in-flight red/green call-out
    for (const m of this.meteors) this._removeMeteor(m);
    this.meteors = [];
    const obj = this.mapObjects;
    this.mapObjects = null;
    if (!obj) return;
    const root = this.course ? this.course.root : null;
    if (obj.meta && root) root.remove(obj.meta.group);
    if (obj.halo && root) root.remove(obj.halo);
    if (obj.panel && root) root.remove(obj.panel);
    for (const g of obj.geos || []) g.dispose();
    for (const mt of obj.mats || []) mt.dispose();
    for (const g of obj.viberGeos || []) g.dispose();
    for (const mt of obj.viberMats || []) mt.dispose();
  }

  _updateMap(dt) {
    this._updateLasers(dt);
    if (!this.mapDef) return;
    if (this.mapDef.hazard === "redlight") this._updateRedLight(dt);
    else if (this.mapDef.hazard === "islands" && this.phase === "racing") this._updateMeteors(dt);
  }

  // Green META laser beams: fade each out, then remove + free its resources.
  _updateLasers(dt) {
    for (let i = this._lasers.length - 1; i >= 0; i--) {
      const L = this._lasers[i];
      L.t += dt;
      L.mat.opacity = Math.max(0, 0.95 * (1 - L.t / L.life));
      if (L.t >= L.life) {
        this.course.root.remove(L.mesh);
        L.geo.dispose();
        L.mat.dispose();
        this._lasers.splice(i, 1);
      }
    }
  }

  _clearLasers() {
    for (const L of this._lasers) {
      if (this.course) this.course.root.remove(L.mesh);
      L.geo.dispose();
      L.mat.dispose();
    }
    this._lasers = [];
  }

  // ---- Red Light Green Light -------------------------------------------
  _updateRedLight(dt) {
    const obj = this.mapObjects;
    if (this.phase === "racing") {
      this.lightT += dt;
      if (this.light === "green" && this.lightT >= RL_GREEN_DUR) {
        this.light = "red";
        this.lightT = 0;
        this._redScanned = false;
        audio.playWarning();
        // ANNOUNCE FIRST: the doll calls "RED LIGHT" the instant it turns, so
        // racers hear it and have time to freeze before the scan begins.
        audio.playVoice("red");
        if (this.game.ui.onRaceEvent) this.game.ui.onRaceEvent({ type: "redlight", light: "red" });
      } else if (this.light === "red") {
        // Reaction window: the call-out has just played — give racers time to
        // stop. Only AFTER it does the doll start scanning/shooting.
        if (this.lightT >= RL_REACTION) {
          if (!this._redScanned) {
            this._redScanned = true;
            this._fireScanLaser(); // scan begins (after the voice)
          }
          for (const rc of this.racers) {
            rc.shotCd = Math.max(0, rc.shotCd - dt);
            if (rc.shotCd > 0 || rc.finished) continue;
            const r = rc.robot;
            if (r.state !== "alive") continue;
            if (Math.hypot(r.vel.x, r.vel.y) > RL_MOVE_SPEED) this._shootRacer(rc);
          }
        }
        if (this.lightT >= RL_RED_DUR) {
          this.light = "green";
          this.lightT = 0;
          this._redScanned = false;
          audio.playPickup();
          audio.playVoice("green"); // GREEN LIGHT voice, synced to it turning away
          if (this.game.ui.onRaceEvent) this.game.ui.onRaceEvent({ type: "redlight", light: "green" });
        }
      }
    }

    // Turn + light colour every frame (also during countdown, at rest = green).
    const targetRot = this.light === "green" ? Math.PI : 0;
    const color = this.light === "green" ? 0x39ff14 : 0xff2d2d;
    if (obj) {
      if (obj.meta) {
        let delta = targetRot - obj.meta.group.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        obj.meta.group.rotation.y += delta * Math.min(1, dt * 6);
      }
      if (obj.haloMat) obj.haloMat.color.setHex(color);
      if (obj.panelMat) {
        obj.panelMat.color.setHex(color);
        obj.panelMat.opacity = 0.35 + 0.2 * Math.sin(this.lightT * 6);
      }
    }
  }

  _shootRacer(rc) {
    rc.shotCd = RL_SHOT_CD;
    const r = rc.robot;
    const fx = this.game.fx;
    this._fireLaser(rc); // the META VIBER's signature #39ff14 beam
    fx.spawnSparkBurst(r.pos.x, r.pos.y + 0.6, r.pos.z, 24, 0x39ff14, 1.4);
    fx.spawnImpactFlash(r.pos.x, r.pos.y + 0.5, r.pos.z);
    audio.playSpearHit();
    if (rc.isPlayer) this._shake(0.4);
    this.respawn(rc, true);
    if (rc.isPlayer && this.game.ui.onRaceEvent) {
      this.game.ui.onRaceEvent({ type: "redlight", light: "shot" });
    }
  }

  // Green laser beam from the META VIBER's eyes to a moving racer.
  _fireLaser(rc) {
    const r = rc.robot;
    this._spawnLaserBeam(r.pos.x, r.pos.y + 0.7, r.pos.z);
  }

  // Warning shot fired the instant RED begins: a beam into the track ahead, so
  // the RED call-out lands right after the shot instead of before it.
  _fireScanLaser() {
    const meta = this.mapObjects && this.mapObjects.meta;
    if (!meta) return;
    this._spawnLaserBeam(meta.group.position.x, 0.35, meta.group.position.z + 16);
    audio.playSpearHit();
  }

  _spawnLaserBeam(tx, ty, tz) {
    const meta = this.mapObjects && this.mapObjects.meta;
    if (!meta) return;
    const sx = meta.group.position.x;
    const sy = meta.height * 0.72; // eye height on the big model
    const sz = meta.group.position.z;
    const dx = tx - sx;
    const dy = ty - sy;
    const dz = tz - sz;
    const len = Math.hypot(dx, dy, dz) || 0.001;

    const geo = new THREE.CylinderGeometry(0.07, 0.07, len, 6, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x39ff14,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set((sx + tx) / 2, (sy + ty) / 2, (sz + tz) / 2);
    beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx, dy, dz).normalize()
    );
    this.course.root.add(beam);
    this.game.fx.spawnSparkBurst(sx, sy, sz, 10, 0x39ff14, 1.0); // muzzle flash
    this._lasers.push({ mesh: beam, geo, mat, t: 0, life: LASER_LIFE });
  }

  // ---- Meteor Shower -----------------------------------------------------
  _spawnMeteor() {
    if (this.meteors.length >= METEOR_MAX_ACTIVE) return;
    const p = this.playerRc ? this.playerRc.robot : null;
    const pS = p ? -p.pos.z : 0;
    const finishS = this.course.finishS;
    const half = this.course.halfWidth;

    // Prefer solid ground near the action (sample a few spots).
    let x = 0;
    let s = 0;
    let surf = null;
    for (let i = 0; i < 6; i++) {
      s = clamp(pS + (Math.random() * 34 - 5), 8, finishS - 4);
      x = -half * 0.7 + Math.random() * half * 1.4;
      const q = this.course.getSurfaceAt(x, -s);
      if (q && !q.platform.moving && q.y > -5) {
        surf = q;
        break;
      }
    }
    if (!surf) return; // no destructible ground in this sample — skip

    const kit = ensureMeteorKit();
    const z = -s;
    const y = surf.y;

    const mesh = new THREE.Mesh(kit.geo, kit.mat);
    mesh.position.set(x, METEOR_SPAWN_Y, z);
    this.course.root.add(mesh);

    const trail = new THREE.Mesh(kit.trailGeo, kit.trailMat);
    trail.position.set(x, METEOR_SPAWN_Y + 1.4, z);
    this.course.root.add(trail);

    const shadow = new THREE.Mesh(kit.shadowGeo, kit.shadowMat);
    shadow.position.set(x, y + 0.06, z);
    this.course.root.add(shadow);

    this.meteors.push({
      x,
      y,
      z,
      platform: surf.platform,
      startY: METEOR_SPAWN_Y,
      t: 0,
      fall: METEOR_FALL_TIME,
      mesh,
      trail,
      shadow,
      spin: (Math.random() - 0.5) * 6,
    });
  }

  _updateMeteors(dt) {
    this.raceHoleSoundCd = Math.max(0, this.raceHoleSoundCd - dt);
    this._meteorTimer -= dt;
    if (this._meteorTimer <= 0) {
      this._meteorTimer = METEOR_INTERVAL;
      this._spawnMeteor();
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      const k = clamp(m.t / m.fall, 0, 1);
      m.mesh.position.y = m.startY + (m.y - m.startY) * (k * k); // ease-in fall
      m.mesh.rotation.x += m.spin * dt;
      m.mesh.rotation.z += m.spin * 0.7 * dt;
      m.trail.position.y = m.mesh.position.y + 1.4;
      m.trail.rotation.z += dt * 2;
      m.shadow.scale.setScalar(0.55 + 0.75 * k + 0.1 * Math.sin(m.t * 18));
      if (m.t >= m.fall) {
        this._impactMeteor(m);
        this.meteors.splice(i, 1);
      }
    }
  }

  _impactMeteor(m) {
    const fx = this.game.fx;
    fx.spawnExplosionShockwave(m.x, m.y + 0.3, m.z, 0xff5c1a, METEOR_BLAST_R);
    fx.spawnSparkBurst(m.x, m.y + 0.3, m.z, 30, 0xff5c1a, 1.7);

    // Break through the floor: carve a real hole (collision + scorched crater).
    const s = -m.z;
    const canCarve =
      m.platform &&
      !m.platform.moving &&
      s > 8 &&
      s < this.course.finishS - 4 &&
      m.y > -5 &&
      this.course.holes.length < METEOR_MAX_HOLES;
    if (canCarve) {
      if (this.course.addHole(m.x, m.z, m.y, METEOR_HOLE_R)) {
        fx.spawnSparkBurst(m.x, m.y + 0.12, m.z, 16, 0xffa040, 1.2); // shards/dust
        if (this.raceHoleSoundCd == null || this.raceHoleSoundCd <= 0) {
          audio.playTileFall();
          this.raceHoleSoundCd = 0.4;
        }
      }
    }

    let anyHit = false;
    for (const rc of this.racers) {
      const r = rc.robot;
      if (r.state !== "alive" || rc.finished) continue;
      const d = Math.hypot(r.pos.x - m.x, r.pos.z - m.z);
      if (d > METEOR_NEAR_R) continue;
      if (Math.abs(r.pos.y - m.y) > 1.7) continue; // racer is on another level
      if (d <= METEOR_BLAST_R) {
        this._meteorKnockback(rc, true, m); // direct hit -> back to checkpoint
        anyHit = true;
      } else {
        this._meteorKnockback(rc, false, m); // near miss -> stumble
        anyHit = true;
      }
    }
    if (anyHit) audio.playExplosion();
    this._removeMeteor(m);
  }

  _meteorKnockback(rc, direct, m) {
    const r = rc.robot;
    if (direct) {
      if (rc.isPlayer) this._shake(0.55);
      this.respawn(rc, true);
      if (rc.isPlayer && this.game.ui.onRaceEvent) {
        this.game.ui.onRaceEvent({ type: "meteor", direct: true });
      }
    } else {
      const dx = r.pos.x - m.x;
      const dz = r.pos.z - m.z;
      const len = Math.hypot(dx, dz) || 1;
      r.applyImpulse((dx / len) * 9, (dz / len) * 9);
      if (rc.isPlayer) this._shake(0.25);
    }
  }

  _removeMeteor(m) {
    const root = this.course ? this.course.root : null;
    if (!root) return;
    if (m.mesh) root.remove(m.mesh);
    if (m.trail) root.remove(m.trail);
    if (m.shadow) root.remove(m.shadow);
  }

  // Put a racer on the floor at (x, s) facing down the track, keeping its batteries.
  placeRobot(rc, x, s, charges) {
    const r = rc.robot;
    r.startX = x;
    r.startZ = -s;
    r.reset();
    const surf = this.course.getSurfaceAt(x, -s);
    r.pos.set(x, surf ? surf.y : 0, -s);
    r.group.position.copy(r.pos);
    r.isGrounded = true;
    r.vy = 0;
    this.face(r, 0, -1);
    this.setCharges(r, charges);
    rc.downT = 0;
    rc.shield = 0;
    rc.spinCd = 0;
    rc.holdT = 0;
    rc.jetMode = false;
    rc.rescueRolled = false;
    rc.gapSeen = false;
    rc.earlyJump = false;
  }

  setCharges(r, n) {
    const c = clamp(n | 0, 0, JETPACK_MAX_CHARGES);
    r.jetpackCharges = c;
    r.jetpackFuel = c * JETPACK_CHARGE_COST;
    r.heldItem = c > 0 ? "jetpack" : null;
    r._emptyJetpackBurn = false;
    r.syncJetpack();
    r.paintFuelStrip();
  }

  face(r, dx, dz) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    r.facingAngle = Math.atan2(-dx, -dz);
    r.groundGroup.rotation.y = r.facingAngle;
    if (r.modelGroup) r.modelGroup.rotation.y = r.facingAngle;
  }

  respawn(rc, silent = false) {
    const r = rc.robot;
    const cp = this.course.checkpoints[rc.cp] || this.course.checkpoints[0];
    const half = this.course.halfWidth;
    let x = clamp(((rc.slot % 5) - 2) * 1.7, -half, half);
    const s = cp.s + (rc.slot >= 5 ? -1.2 : 0);
    // Make sure the slot sits on solid ground (island maps have narrow pads).
    if (!this.course.getSurfaceAt(x, -s)) {
      for (const dx of [0, -1, 1, -2, 2, -3, 3]) {
        if (this.course.getSurfaceAt(x + dx, -s)) {
          x += dx;
          break;
        }
      }
    }
    this.placeRobot(rc, x, s, r.jetpackCharges);
    rc.shield = RACE_RESPAWN_SHIELD;
    rc.bestS = s;
    rc.stuckT = 0;
    if (!rc.isPlayer && !rc.finished) {
      rc.route = this.routeFrom(s);
      rc.wp = 0;
    }
    const fx = this.game.fx;
    fx.spawnLandingRing(r.pos.x, r.pos.y, r.pos.z, r.teamColor);
    fx.spawnSparkBurst(r.pos.x, r.pos.y + 0.5, r.pos.z, 16, r.teamColor, 1.0);
    if (rc.isPlayer && !silent && this.game.ui.onRaceEvent) this.game.ui.onRaceEvent({ type: "respawn", cp: rc.cp });
  }

  // Nav nodes still ahead of `s` (respawn / start). Branches are re-decided.
  routeFrom(s) {
    const nav = this.course.nav;
    const decideS = this.course.decideS;
    if (decideS) {
      if (s < decideS[1]) return nav.A.filter((n) => n.s > s + 0.3);
      if (s < decideS[2]) return nav.B.filter((n) => n.s > s + 0.3);
      return nav.END.filter((n) => n.s > s + 0.3);
    }
    return (nav.route || []).filter((n) => n.s > s + 0.3);
  }

  // ---------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const course = this.course;
    if (!course) return;
    course.update(dt);
    g.fx.update(dt);
    this._updateMap(dt);

    if (this.phase === "countdown") {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (this.countdown > 0 && n !== this._shownCount) {
        this._shownCount = n;
        if (g.ui.onRaceCountdown) g.ui.onRaceCountdown(String(n));
        audio.playClick();
      }
      if (this.countdown <= 0) {
        this.phase = "racing";
        if (g.ui.onRaceCountdown) g.ui.onRaceCountdown("GO!");
        audio.playPickup();
        // Map 3 starts on GREEN — call it out as the race begins.
        if (this.mapDef && this.mapDef.hazard === "redlight") audio.playVoice("green");
        g.keys["KeyQ"] = false; // a Q tapped during the countdown must not fire at GO
      }
      this.emitStatus();
      return;
    }

    if (!this.ended) this.raceTime += dt;

    // 1. Moving platforms carry the racers standing on them.
    for (const rc of this.racers) {
      const r = rc.robot;
      if (r.state !== "alive" || !r.isGrounded) continue;
      const p = course.movingPlatformUnder(r.pos.x, r.pos.y, r.pos.z);
      if (p) {
        r.pos.x += p.dx;
        r.pos.z += p.dz;
      }
    }

    // 2. Bots that just tipped off an edge may burn a battery to recover.
    for (const rc of this.racers) {
      if (!rc.isPlayer) this.botRescueFromFall(rc);
    }

    // 3. Simulate every racer (player input / race controller + physics).
    for (const rc of this.racers) {
      rc.robot.update(
        dt,
        g.camera,
        course,
        NO_ENEMIES,
        rc.isPlayer ? g.keys : null,
        g.fx,
        rc.isPlayer ? this._shake : null,
        null,
        null,
        null
      );
    }

    // 4. Interactions.
    this.resolveSpinners(dt);
    this.resolveBumps();
    this.collectBatteries();

    // 5. Progress: checkpoints, finish, respawn.
    for (const rc of this.racers) this.trackProgress(rc, dt);

    // 6. Round end.
    if (!this.ended) {
      const botsDone = this.finishOrder.filter((rc) => !rc.isPlayer).length;
      const botsNeeded = Math.min(RACE_BOTS_TO_END, this.racers.length - 1);
      if (this.playerRc.finished || botsDone >= botsNeeded) this.endRace();
    }

    this.emitStatus();
  }

  trackProgress(rc, dt) {
    const r = rc.robot;
    const s = -r.pos.z;

    if (rc.shield > 0) {
      rc.shield = Math.max(0, rc.shield - dt);
      if (r.state === "alive") r.group.visible = rc.shield <= 0 || Math.floor(rc.shield * 14) % 2 === 0;
    }

    if (r.state !== "alive") {
      rc.downT += dt;
      if (rc.downT >= RACE_RESPAWN_DELAY || r.pos.y < -18) this.respawn(rc);
      return;
    }
    rc.downT = 0;

    if (rc.finished) return;

    // Checkpoints: activate the furthest one passed while standing on the main track.
    if (r.isGrounded && Math.abs(r.pos.x) <= this.course.halfWidth + 0.3) {
      const cps = this.course.checkpoints;
      for (let k = cps.length - 1; k > rc.cp; k--) {
        if (s >= cps[k].s) {
          rc.cp = k;
          if (rc.isPlayer) {
            this.course.markCheckpoint(k);
            audio.playPickup();
            this.game.fx.spawnSparkBurst(r.pos.x, r.pos.y + 0.4, r.pos.z, 26, 0x39ff14, 1.3);
            if (this.game.ui.onRaceEvent) this.game.ui.onRaceEvent({ type: "checkpoint", cp: k, total: cps.length - 1 });
          }
          break;
        }
      }
    }

    // Finish line spans the whole finish plaza of this map.
    const [fx0, fx1] = this.course.finishX;
    if (s >= this.course.finishS && r.pos.x >= fx0 && r.pos.x <= fx1) {
      this.finish(rc);
      return;
    }

    // Stuck guard: a bot that makes no progress for a long time respawns.
    if (!rc.isPlayer) {
      if (s > rc.bestS + 0.5) {
        rc.bestS = s;
        rc.stuckT = 0;
      } else {
        rc.stuckT += dt;
        if (rc.stuckT > 12) this.respawn(rc);
      }
    }
  }

  finish(rc) {
    const r = rc.robot;
    rc.finished = true;
    rc.placement = this.finishOrder.length + 1;
    rc.finishTime = this.raceTime;
    const [fx0, fx1] = this.course.finishX;
    rc.finishX = clamp(r.pos.x, fx0 + 1, fx1 - 1);
    this.finishOrder.push(rc);
    const fx = this.game.fx;
    fx.spawnSparkBurst(r.pos.x, r.pos.y + 1.2, r.pos.z, 34, rc.placement === 1 ? 0xffd700 : r.teamColor, 1.6);
    fx.spawnLandingRing(r.pos.x, r.pos.y, r.pos.z, r.teamColor);
    if (rc.isPlayer) {
      audio.playPickup();
      this._shake(0.25);
    }
    if (this.game.ui.onRaceEvent) {
      this.game.ui.onRaceEvent({ type: "finish", isPlayer: rc.isPlayer, name: r.name, place: rc.placement, time: rc.finishTime });
    }
  }

  // Finished racers first (by finish order), then everyone else by distance.
  ranking() {
    return this.racers.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.placement - b.placement;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return -b.robot.pos.z - -a.robot.pos.z;
    });
  }

  endRace() {
    const g = this.game;
    this.ended = true;
    this.phase = "done";
    // Drop any meteors still in flight so none hang in the air behind the win screen.
    for (const m of this.meteors) this._removeMeteor(m);
    this.meteors = [];
    const p = this.playerRc;
    const total = this.racers.length;
    const place = p.finished ? p.placement : this.ranking().indexOf(p) + 1;
    const won = place === 1;
    const leader = this.finishOrder[0] || p;

    if (won) audio.playWin();
    g.state = "round_over";
    g.lastWinner = won ? "host" : "guest";
    g._fireRoundEnd({
      race: true,
      winnerId: won ? 1 : 2,
      winnerText: `YOU PLACED #${place} / ${total}${won ? " \u2014 WINNER!" : ""}`,
      subText: won
        ? `${p.robot.name.toUpperCase()} crossed the finish line first!`
        : `${leader.robot.name.toUpperCase()} won the race in ${formatRaceTime(leader.finishTime)}`,
      winnerColor: won ? "#00e5ff" : "#ff2d95",
      winnerAvatar: won ? p.robot.portraitPath : leader.robot.portraitPath,
      scores: g.scores,
      placement: place,
      totalFighters: total,
      isPlayerWinner: won,
      timeText: p.finished ? formatRaceTime(p.finishTime) : "DNF",
    });
  }

  emitStatus() {
    const g = this.game;
    if (!g.ui.onStatusUpdate || !this.playerRc) return;
    const p = this.playerRc;
    const ranked = this.ranking();
    const r = p.robot;
    g.ui.onStatusUpdate({
      activeTiles: 0,
      totalTiles: 0,
      nextFallTimer: 0,
      scores: g.scores,
      abilities: r.getAbilityStatus(),
      gameState: g.state,
      race: {
        phase: this.phase,
        map: this.mapDef ? this.mapDef.name : "",
        hazard: this.mapDef ? this.mapDef.hazard : "none",
        light: this.mapDef && this.mapDef.hazard === "redlight" ? this.light : null,
        place: p.finished ? p.placement : ranked.indexOf(p) + 1,
        total: this.racers.length,
        cp: p.cp,
        cpTotal: this.course.checkpoints.length - 1,
        batteries: r.jetpackCharges,
        maxBatteries: JETPACK_MAX_CHARGES,
        time: p.finished ? p.finishTime : this.raceTime,
        progress: clamp(-r.pos.z / this.course.finishS, 0, 1),
        finished: p.finished,
        racers: this.racers.map((rc) => ({
          id: rc.robot.id,
          isPlayer: rc.isPlayer,
          color: rc.robot.teamColor,
          finished: rc.finished,
          placement: rc.placement,
          progress: rc.finished ? 1 : clamp(-rc.robot.pos.z / this.course.finishS, 0, 1),
        })),
      },
    });
  }

  // ---------------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------------
  resolveSpinners(dt) {
    const fx = this.game.fx;
    for (const rc of this.racers) rc.spinCd = Math.max(0, rc.spinCd - dt);
    for (const sp of this.course.spinners) {
      const ca = Math.cos(sp.angle);
      const sa = Math.sin(sp.angle);
      for (const rc of this.racers) {
        const r = rc.robot;
        if (r.state !== "alive") continue;
        const dx = r.pos.x - sp.x;
        const dz = r.pos.z - sp.z;
        const dist = Math.hypot(dx, dz);
        if (dist > sp.radius + r.radius) continue;
        const feet = r.pos.y - sp.y;

        // Hub pillar is solid.
        const hubR = sp.hubRadius + r.radius * 0.8;
        if (dist < hubR && feet < 1.25) {
          const nx = dist > 1e-4 ? dx / dist : 1;
          const nz = dist > 1e-4 ? dz / dist : 0;
          r.pos.x = sp.x + nx * hubR;
          r.pos.z = sp.z + nz * hubR;
          const vn = r.vel.x * nx + r.vel.y * nz;
          if (vn < 0) {
            r.vel.x -= vn * nx;
            r.vel.y -= vn * nz;
          }
        }

        if (rc.shield > 0 || rc.spinCd > 0) continue;
        if (feet > sp.barY + sp.barHalf - 0.04 || feet + 1.25 < sp.barY - sp.barHalf) continue;
        const along = dx * ca + dz * sa;
        const perp = dx * sa - dz * ca;
        if (Math.abs(along) > sp.radius + 0.15) continue;
        if (Math.abs(perp) > r.radius * 0.8 + sp.barHalf) continue;
        // The bar moves along speed*along*(-sin, cos); its perp component is
        // -speed*along. Skip racers the bar is sweeping AWAY from.
        const sweep = -sp.speed * along;
        if (perp * sweep < -0.05) continue;

        let tx = -sa * Math.sign(sp.speed * along || 1);
        let tz = ca * Math.sign(sp.speed * along || 1);
        const ox = dist > 1e-4 ? dx / dist : 0;
        const oz = dist > 1e-4 ? dz / dist : 0;
        tx += ox * 0.3;
        tz += oz * 0.3;
        const tl = Math.hypot(tx, tz) || 1;
        const imp = RACE_SPINNER_IMPULSE + 9 * Math.min(1, Math.abs(along) / sp.radius);
        r.applyImpulse((tx / tl) * imp, (tz / tl) * imp);
        r.isGrounded = false;
        r.vy = Math.max(r.vy, 4.2);
        rc.spinCd = 0.7;
        fx.spawnSparkBurst(r.pos.x, r.pos.y + 0.6, r.pos.z, 22, COLORS.accentMagenta, 1.4);
        if (rc.isPlayer) this._shake(0.35);
      }
    }
  }

  // Soft body bumps: separate overlapping racers and trade a little momentum.
  resolveBumps() {
    const list = this.racers;
    for (let i = 0; i < list.length; i++) {
      const a = list[i].robot;
      if (a.state !== "alive") continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j].robot;
        if (b.state !== "alive") continue;
        if (Math.abs(a.pos.y - b.pos.y) > 1.0) continue;
        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        const dist = Math.hypot(dx, dz);
        const minDist = a.radius + b.radius;
        if (dist >= minDist || dist < 1e-4) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const push = (minDist - dist) * 0.5;
        a.pos.x += nx * push;
        a.pos.z += nz * push;
        b.pos.x -= nx * push;
        b.pos.z -= nz * push;
        const rv = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * nz;
        if (rv < 0) {
          const k = -rv * 0.5;
          a.vel.x += nx * k;
          a.vel.y += nz * k;
          b.vel.x -= nx * k;
          b.vel.y -= nz * k;
        }
      }
    }
  }

  collectBatteries() {
    for (const rc of this.racers) {
      const r = rc.robot;
      if (r.state !== "alive" || r.jetpackCharges >= JETPACK_MAX_CHARGES) continue;
      const b = this.course.batteryAt(r.pos.x, r.pos.y + 0.7, r.pos.z);
      if (!b) continue;
      b.take();
      this.setCharges(r, r.jetpackCharges + 1);
      this.game.fx.spawnSparkBurst(b.x, b.y, b.z, 16, 0x00e5ff, 1.0);
      if (rc.isPlayer) {
        audio.playPickup();
        if (this.game.ui.onRaceEvent) this.game.ui.onRaceEvent({ type: "battery", count: r.jetpackCharges });
      }
    }
  }

  // ---------------------------------------------------------------------
  // Bot racing AI
  // ---------------------------------------------------------------------
  nodeTarget(rc, node) {
    const r = rc.robot;
    if (node.stones) {
      let best = node.stones[0];
      for (const sx of node.stones) {
        if (Math.abs(sx - r.pos.x) < Math.abs(best - r.pos.x)) best = sx;
      }
      return { x: best, z: -node.s };
    }
    if (node.slider != null) {
      const p = this.course.sliders[node.slider];
      if (p) {
        // Aim where the slider will be when we get there.
        const eta = clamp(Math.abs(-node.s - r.pos.z) / BOT_AIR_SPEED, 0.2, 1.4);
        return { x: clamp(p.at(eta).x, -3.2, 3.2), z: -node.s };
      }
    }
    return { x: node.x + rc.laneBias * (node.w || 0), z: -node.s };
  }

  advanceRoute(rc) {
    const r = rc.robot;
    while (rc.wp < rc.route.length) {
      const node = rc.route[rc.wp];
      let passed;
      if (node.reach) {
        const t = this.nodeTarget(rc, node);
        passed = r.isGrounded && Math.hypot(t.x - r.pos.x, t.z - r.pos.z) < 0.75;
      } else {
        passed = -r.pos.z >= node.s - 0.3;
      }
      if (!passed) break;
      rc.wp++;
      if (node.decide) this.decideBranch(rc, node.decide);
    }
  }

  // Jetpack shortcut or the safe route? Needs 2 batteries + the nerve to try.
  decideBranch(rc, which) {
    const nav = this.course.nav;
    if (!nav.GAP_JET) return;
    const take = rc.robot.jetpackCharges >= 2 && Math.random() < rc.ai.shortcut;
    if (which === 1) rc.route.push(...(take ? nav.GAP_JET : nav.GAP_MAIN), ...nav.B);
    else rc.route.push(...(take ? nav.SKY_JET : nav.SKY_MAIN), ...nav.END);
  }

  // Current steering target for a bot: { x, z, node }.
  botTarget(rc) {
    const r = rc.robot;
    const finishS = this.course.finishS;
    if (rc.finished) return { x: rc.finishX, z: -(finishS + 3.6), node: null };
    this.advanceRoute(rc);
    const node = rc.route[rc.wp] || null;
    if (!node) return { x: 0, z: -(finishS + 3), node: null };
    const t = this.nodeTarget(rc, node);
    let tx = t.x;

    // Steer around spinner hubs instead of running into the pillar.
    for (const sp of this.course.spinners) {
      const ahead = r.pos.z - sp.z;
      if (ahead > -0.5 && ahead < 5 && Math.abs(r.pos.x - sp.x) < 1.4 && Math.abs(tx - sp.x) < 1.4) {
        tx = sp.x + (r.pos.x >= sp.x ? 1.9 : -1.9);
      }
    }

    // Grab a nearby battery when it is roughly on the way.
    if (!node.jet && r.isGrounded && r.jetpackCharges < JETPACK_MAX_CHARGES) {
      const s = -r.pos.z;
      for (const b of this.course.batteries) {
        if (b.collected || !b.grounded) continue;
        const ds = b.s - s;
        if (ds < -0.3 || ds > 4) continue;
        if (Math.abs(b.x - r.pos.x) > 3.2 || Math.abs(b.groundY - r.pos.y) > 0.5) continue;
        return { x: b.x, z: b.z, node };
      }
    }
    return { x: tx, z: t.z, node };
  }

  // Would a jump right now (at air speed along dir) touch down on something?
  canJumpAcross(rc, dirX, dirZ) {
    const r = rc.robot;
    const air = Math.max(rc.ai.speed, BOT_AIR_SPEED);
    for (let t = 0.55; t <= 1.3; t += 0.05) {
      if (JUMP_FORCE - GRAVITY * t > 0) continue; // still rising
      const y = r.pos.y + JUMP_FORCE * t - 0.5 * GRAVITY * t * t;
      const d = air * t + 0.15;
      const s = this.course.surfaceAtFuture(r.pos.x + dirX * d, r.pos.z + dirZ * d, t);
      if (s && y <= s.y + 0.05 && y >= s.y - 0.9) return true;
    }
    return false;
  }

  groundAhead(rc, dirX, dirZ, maxD) {
    const r = rc.robot;
    for (let d = 1; d <= maxD; d += 0.75) {
      const s = this.course.getSurfaceAt(r.pos.x + dirX * d, r.pos.z + dirZ * d);
      if (s && s.y <= r.pos.y + 2) return true;
    }
    return false;
  }

  // Seconds until a spinner arm sweeps our bearing (arms repeat every PI).
  spinnerAction(rc) {
    const r = rc.robot;
    const now = this.raceTime;
    if (now < rc.spinIgnoreUntil) return null;
    for (const sp of this.course.spinners) {
      const dx = r.pos.x - sp.x;
      const dz = r.pos.z - sp.z;
      const dist = Math.hypot(dx, dz);
      if (dist > sp.radius + 1.6 || dist < sp.hubRadius + 0.5) continue;
      const phi = Math.atan2(dz, dx);
      let delta = sp.speed > 0 ? phi - sp.angle : sp.angle - phi;
      delta = ((delta % Math.PI) + Math.PI) % Math.PI;
      const tHit = delta / Math.abs(sp.speed);
      if (dist <= sp.radius + 0.55) {
        if (tHit < 0.4) {
          if (now - rc.spinRolledAt > 0.6) {
            rc.spinRolledAt = now;
            if (Math.random() < rc.ai.mistake) {
              rc.spinIgnoreUntil = now + 0.6; // froze up — the bar will hit
              return null;
            }
          }
          return "jump";
        }
      } else if (rc.ai.mistake < 0.2 && tHit < 0.55) {
        return "wait"; // let the arm pass before stepping into the disc
      }
    }
    return null;
  }

  useJet(rc, dirX, dirZ) {
    const r = rc.robot;
    this.face(r, dirX, dirZ);
    r.useItem(this.game.fx, null, null);
  }

  botRescueFromFall(rc) {
    const r = rc.robot;
    if (r.state !== "falling" || r.pos.y < -0.3 || r.jetpackCharges <= 0 || r.jetpackBurn > 0) return;
    if (!rc.rescueRolled) {
      rc.rescueRolled = true;
      rc.rescueOk = Math.random() < rc.ai.jetSkill;
    }
    if (!rc.rescueOk) return;
    const t = this.botTarget(rc);
    let dx = t.x - r.pos.x;
    let dz = t.z - r.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    if (this.groundAhead(rc, dx, dz, 4.5)) this.useJet(rc, dx, dz);
  }

  // Race controller: called by Robot.update while the bot is alive. Sets the
  // bot's horizontal velocity / facing and fires jump, dash and jetpack.
  botThink(rc, dt) {
    const r = rc.robot;
    const course = this.course;
    const fx = this.game.fx;

    if (this.phase === "countdown") {
      r.vel.set(0, 0);
      return;
    }

    // Red Light Green Light: freeze during RED (finished bots keep hopping).
    if (this.light === "red" && !rc.finished) {
      r.vel.set(0, 0);
      return;
    }

    const target = this.botTarget(rc);
    const node = target.node;
    let dx = target.x - r.pos.x;
    let dz = target.z - r.pos.z;
    const dist = Math.hypot(dx, dz);
    const dirX = dist > 1e-3 ? dx / dist : 0;
    const dirZ = dist > 1e-3 ? dz / dist : -1;
    let speed = rc.ai.speed;
    if (rc.finished) {
      speed *= clamp(dist / 1.2, 0, 1) * 0.7;
      rc.hopT -= dt;
      if (r.isGrounded && dist < 0.6 && rc.hopT <= 0) {
        rc.hopT = 1.6 + Math.random() * 2;
        r.triggerJump(fx); // victory hop
      }
    }

    // Knocked back: ride it out.
    if (r.hitShakeTimer > 0) {
      r.dampHorizontal(dt, 7);
      return;
    }

    // Dash burst in progress.
    if (r.dashTimer > 0) {
      r.dashTimer -= dt;
      if (r.dashTimer <= 0) r.dashRecovery = DASH_RECOVERY;
      const burst = rc.ai.speed * 2.5;
      r.vel.set(r.dashDir.x * burst, r.dashDir.y * burst);
      this.face(r, r.dashDir.x, r.dashDir.y);
      return;
    }
    if (r.dashRecovery > 0) r.dashRecovery -= dt;

    // ---- Airborne: steer, and burn batteries when the plan (or a rescue) needs it.
    if (!r.isGrounded) {
      if (r.jetpackBurn > 0) {
        r.vel.x += dirX * 6 * dt;
        r.vel.y += dirZ * 6 * dt;
        r.dampHorizontal(dt, 0);
      } else {
        const air = Math.max(rc.ai.speed, BOT_AIR_SPEED);
        const k = 1 - Math.exp(-5 * dt);
        r.vel.x += (dirX * air - r.vel.x) * k;
        r.vel.y += (dirZ * air - r.vel.y) * k;
      }
      this.face(r, dirX, dirZ);
      if (r.jetpackCharges > 0 && r.jetpackBurn <= 0 && r.vy <= 0.6) {
        const under = course.getSurfaceAt(r.pos.x, r.pos.z);
        if (rc.jetMode) {
          const climb = node && node.climb != null ? node.climb : null;
          if (climb != null ? r.pos.y < climb + 0.2 && (!under || under.y < climb - 0.1) : !under) {
            this.useJet(rc, dirX, dirZ);
          }
        } else if (!under && r.vy < -0.5 && r.pos.y > -0.35) {
          if (!rc.rescueRolled) {
            rc.rescueRolled = true;
            rc.rescueOk = Math.random() < rc.ai.jetSkill;
          }
          if (rc.rescueOk && this.groundAhead(rc, dirX, dirZ, 4.5)) this.useJet(rc, dirX, dirZ);
        }
      }
      return;
    }

    // ---- Grounded.
    rc.jetMode = false;
    rc.rescueRolled = false;
    let hold = false;
    let wantJump = false;

    if (!rc.finished) {
      const spin = this.spinnerAction(rc);
      if (spin === "jump") wantJump = true;
      else if (spin === "wait") hold = true;

      // Roll once per gap whether this bot botches it by leaping too early.
      const far = course.getSurfaceAt(r.pos.x + dirX * 2.0, r.pos.z + dirZ * 2.0);
      if (!far) {
        if (!rc.gapSeen) {
          rc.gapSeen = true;
          rc.earlyJump = !(node && node.jet) && Math.random() < rc.ai.mistake * 0.6;
        }
      } else {
        rc.gapSeen = false;
        rc.earlyJump = false;
      }

      if (!wantJump) {
        const ahead = course.getSurfaceAt(r.pos.x + dirX * 0.42, r.pos.z + dirZ * 0.42);
        const jetReady = node && node.jet && r.jetpackCharges >= (node.need || 1);
        if (!ahead) {
          if (jetReady) {
            wantJump = true;
            rc.jetMode = true;
          } else if (this.canJumpAcross(rc, dirX, dirZ)) {
            wantJump = true;
          } else {
            hold = true;
          }
        } else if (ahead.y - r.pos.y > STEP_UP_MAX - 0.02) {
          const h = ahead.y - r.pos.y;
          if (h < 2.3) {
            wantJump = true;
          } else if (jetReady) {
            wantJump = true;
            rc.jetMode = true;
          } else {
            hold = true; // e.g. a piston at full height: wait for it
          }
        } else if (rc.earlyJump && !course.getSurfaceAt(r.pos.x + dirX * 1.8, r.pos.z + dirZ * 1.8)) {
          wantJump = true; // mistake: leaps short
        }
      }

      if (hold) {
        rc.holdT += dt;
        if (rc.holdT > 4.5) {
          // Waited too long (missed slider timing, etc.): gamble on the jump.
          hold = false;
          wantJump = true;
          rc.holdT = 0;
        }
      } else {
        rc.holdT = 0;
      }
    }

    if (wantJump && r.jumpCooldown <= 0) {
      const air = Math.max(speed, BOT_AIR_SPEED);
      r.vel.set(dirX * air, dirZ * air);
      this.face(r, dirX, dirZ);
      r.triggerJump(fx);
      return;
    }
    if (wantJump) hold = true; // jump on cooldown: wait at the edge

    // Dash down safe straights (no gaps, steps, movers or sweepers ahead).
    if (!hold && !rc.finished && rc.ai.dashRate > 0 && r.dashCooldown <= 0 && Math.random() < rc.ai.dashRate * dt) {
      let safe = course.spinners.every((sp) => Math.hypot(r.pos.x - sp.x, r.pos.z - sp.z) > 7.5);
      for (let d = 1; safe && d <= 5; d++) {
        const s = course.getSurfaceAt(r.pos.x + dirX * d, r.pos.z + dirZ * d);
        if (!s || s.platform.moving || Math.abs(s.y - r.pos.y) > 0.1) safe = false;
      }
      if (safe && r.triggerDash(dirX, dirZ)) return;
    }

    let vx;
    let vz;
    if (hold) {
      // Hold at the edge, sliding sideways to line up with the target.
      vx = Math.abs(dx) > 0.2 ? clamp(dx, -1, 1) * speed * 0.7 : 0;
      vz = 0;
    } else {
      vx = dirX * speed;
      vz = dirZ * speed;
    }
    const k = 1 - Math.exp(-10 * dt);
    r.vel.x += (vx - r.vel.x) * k;
    r.vel.y += (vz - r.vel.y) * k;

    // Never walk off into the void (gaps are jumped, not walked).
    if (Math.abs(r.vel.x) > 0.01 && !course.getSurfaceAt(r.pos.x + Math.sign(r.vel.x) * 0.4, r.pos.z)) r.vel.x = 0;
    if (Math.abs(r.vel.y) > 0.01 && !course.getSurfaceAt(r.pos.x, r.pos.z + Math.sign(r.vel.y) * 0.4)) r.vel.y = 0;

    if (hold || rc.finished) this.face(r, dirX, dirZ);
    else this.face(r, vx, vz);
  }
}
