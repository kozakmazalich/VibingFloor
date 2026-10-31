import {
  TILE_SPACING,
  TILE_SIZE,
  INITIAL_FALL_INTERVAL,
  MIN_FALL_INTERVAL,
  FALL_ACCEL_RATE,
} from "./constants.js";
import { Tile } from "./tile.js";
import { MAPS } from "./maps.js";
import { buildProp } from "./props.js";

export class Island {
  constructor(scene, mapDef = MAPS[0]) {
    this.scene = scene;
    this.mapDef = mapDef;
    this.gridSize = mapDef.gridSize || 10;

    this.grid = Array.from({ length: this.gridSize }, () =>
      Array(this.gridSize).fill(null)
    );
    this.allTiles = [];
    this.tilesFallenCount = 0;
    this.fallTimer = INITIAL_FALL_INTERVAL;
    this.currentInterval = INITIAL_FALL_INTERVAL;
    this.isPaused = false;
    this.totalInitialTiles = 0;

    // Online guest: tile states are driven by the host's snapshots — the
    // local shrink logic (rim picking / fall timer) must stay off, but tile
    // fall ANIMATIONS still run locally.
    this.remoteAuthoritative = false;
    this.tileById = new Map(); // tile id (gx * gridSize + gz) -> Tile

    this.buildGrid();
  }

  setMap(mapDef) {
    this.mapDef = mapDef;
    this.gridSize = mapDef.gridSize || 10;
    this.reset();
  }

  // Chunked rebuild. Tiles stay hidden until reveal(), so a cancelled load
  // cannot leave the previous arena's tiles in the scene. `isStale` aborts
  // when a newer map was requested mid-build.
  setMapAsync(mapDef, isStale) {
    this._buildGen = (this._buildGen || 0) + 1;
    const gen = this._buildGen;
    const stale = () => (isStale && isStale()) || this._buildGen !== gen;

    this.mapDef = mapDef;
    this.gridSize = mapDef.gridSize || 10;
    this.clear();
    this.isPaused = true;
    this.grid = Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(null));
    this.allTiles = [];

    const cells = this._activeCells();
    const BATCH = 70;

    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        if (stale()) {
          this.clear();
          resolve(false);
          return;
        }
        const end = Math.min(cells.length, i + BATCH);
        for (; i < end; i++) {
          this._addTile(cells[i][0], cells[i][1], false);
        }
        if (i < cells.length) {
          requestAnimationFrame(step);
        } else {
          if (stale()) {
            this.clear();
            resolve(false);
            return;
          }
          this._finalizeGrid(false);
          resolve(true);
        }
      };
      requestAnimationFrame(step);
    });
  }

  reveal() {
    for (const tile of this.allTiles) {
      if (tile && tile.group) tile.group.visible = true;
    }
    for (const prop of this.props || []) {
      if (prop && prop.group) prop.group.visible = true;
    }
  }

  // The main menu no longer shows a live arena preview behind the panels, so
  // the whole board (tiles + props) can be parked off-screen and restored the
  // moment a match starts. Tiles keep their own visibility rules otherwise.
  setArenaVisible(visible) {
    const show = !!visible;
    for (const tile of this.allTiles) {
      if (tile && tile.group) tile.group.visible = show;
    }
    for (const prop of this.props || []) {
      if (prop && prop.group) prop.group.visible = show;
    }
  }

  buildGrid() {
    this.clear();
    this.grid = Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(null));
    this.allTiles = [];
    for (const [x, z] of this._activeCells()) this._addTile(x, z, true);
    this._finalizeGrid(true);
  }

  _activeCells() {
    const isTileActive = this.mapDef.isTileActive || (() => true);
    const cells = [];
    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        if (isTileActive(x, z)) cells.push([x, z]);
      }
    }
    return cells;
  }

  _addTile(x, z, visible) {
    const elevationAt = this.mapDef.elevationAt || (() => 0);
    const decorAt = this.mapDef.decorAt || (() => null);
    const theme = this.mapDef.theme || null;
    const tile = new Tile(x, z, this.scene, this.gridSize, elevationAt(x, z), theme, decorAt(x, z));
    tile.group.visible = visible;
    this.grid[x][z] = tile;
    this.allTiles.push(tile);
  }

  _finalizeGrid(visibleProps) {
    this.totalInitialTiles = this.allTiles.length;
    this.tilesFallenCount = 0;

    this.tileById.clear();
    for (const tile of this.allTiles) {
      this.tileById.set(tile.gx * this.gridSize + tile.gz, tile);
    }

    this.props = [];
    for (const def of this.mapDef.props || []) {
      const prop = buildProp(def);
      if (prop) {
        prop.group.visible = visibleProps;
        this.scene.add(prop.group);
        this.props.push(prop);
      }
    }

    const paceScale = Math.sqrt(100 / Math.max(1, this.totalInitialTiles));
    this.initialInterval = INITIAL_FALL_INTERVAL * paceScale;
    this.minInterval = MIN_FALL_INTERVAL * paceScale;
    this.currentInterval = this.initialInterval;
    this.fallTimer = this.initialInterval;
  }

  // Dispose EVERY live tile, including ones that sit outside the new grid.
  // The old loop used the incoming gridSize, so shrinking an arena (10 fighters
  // back to 1v1, or a big honeycomb back to a 20x20 map) left the outer tiles
  // in the scene and the two layouts drew on top of each other.
  clear() {
    const seen = new Set();
    const drop = (tile) => {
      if (!tile || seen.has(tile)) return;
      seen.add(tile);
      tile.dispose();
    };
    for (const tile of this.allTiles || []) drop(tile);
    if (this.grid) {
      for (let x = 0; x < this.grid.length; x++) {
        const col = this.grid[x];
        if (!col) continue;
        for (let z = 0; z < col.length; z++) drop(col[z]);
      }
    }
    this.allTiles = [];
    this.grid = [];
    this.tileById.clear();

    for (const prop of this.props || []) {
      this.scene.remove(prop.group);
      if (prop.dispose) prop.dispose();
    }
    this.props = [];
  }

  // Advance animated props (elevators, orbs). Frozen while paused.
  updateProps(dt) {
    for (const prop of this.props || []) {
      prop.update(dt);
    }
  }

  reset() {
    this.buildGrid();
    this.isPaused = false;
  }

  getWorldPos(gx, gz) {
    const centerOffset = (this.gridSize - 1) / 2;
    return {
      x: (gx - centerOffset) * TILE_SPACING,
      z: (gz - centerOffset) * TILE_SPACING,
    };
  }

  getTile(gx, gz) {
    if (!this.grid || gx < 0 || gz < 0 || gx >= this.gridSize || gz >= this.gridSize) return null;
    const col = this.grid[gx];
    return col ? col[gz] : null;
  }

  // Tile under a world position (grid rounding), or null
  getTileAtWorld(rx, rz) {
    const centerOffset = (this.gridSize - 1) / 2;
    const gx = Math.round(rx / TILE_SPACING + centerOffset);
    const gz = Math.round(rz / TILE_SPACING + centerOffset);
    return this.getTile(gx, gz);
  }

  // A tile is on the rim if at least one cardinal neighbor is void/falling/dead
  isRimTile(gx, gz) {
    const tile = this.getTile(gx, gz);
    if (!tile || !tile.isIdle()) return false;

    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const [dx, dz] of neighbors) {
      const nx = gx + dx;
      const nz = gz + dz;

      // Outside grid bounds
      if (nx < 0 || nx >= this.gridSize || nz < 0 || nz >= this.gridSize) {
        return true;
      }

      // Void or collapsed tile
      const nTile = this.grid[nx][nz];
      if (!nTile || nTile.state === "falling" || nTile.state === "dead") {
        return true;
      }
    }

    return false;
  }

  // Get current rim candidates for shrinking (weighted towards outer edge)
  getOuterRimTiles() {
    const rimTiles = [];
    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        if (this.isRimTile(x, z)) {
          rimTiles.push(this.grid[x][z]);
        }
      }
    }
    return rimTiles;
  }

  // Active, walkable tiles remaining
  getActiveCount() {
    let count = 0;
    for (const tile of this.allTiles) {
      if (tile && tile.isWalkable()) count++;
    }
    return count;
  }

  // Center of mass of remaining active tiles
  getActiveCenter() {
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (const tile of this.allTiles) {
      if (tile && tile.isWalkable()) {
        sumX += tile.worldX;
        sumZ += tile.worldZ;
        count++;
      }
    }
    if (count === 0) return { x: 0, z: 0 };
    return { x: sumX / count, z: sumZ / count };
  }

  // Destroy floor tiles in a radius immediately (e.g. from a grenade blast).
  // opts.shatter: quake path — crack, then burst into chunks. Grenades omit
  // opts and keep the whole-tile tumble from collapseInstantly.
  // opts.minDist spares tiles closer than this (the caster's own tile).
  // opts.dirX/dirZ + opts.coneCos carve a forward wedge: only tiles whose
  // unit vector from (worldX,worldZ) dots the facing >= coneCos are hit.
  // opts.onBurst(tile) fires once, when that tile actually shatters.
  destroyTilesAt(worldX, worldZ, radius, opts) {
    const shatter = !!(opts && opts.shatter);
    const minDist = opts && opts.minDist != null ? opts.minDist : -1;
    const onBurst = opts && opts.onBurst;
    const hasCone = !!(opts && (opts.dirX || opts.dirZ));
    const dirX = (opts && opts.dirX) || 0;
    const dirZ = (opts && opts.dirZ) || 0;
    const coneCos = opts && opts.coneCos != null ? opts.coneCos : -1;
    const dirLen = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / dirLen;
    const nz = dirZ / dirLen;
    const destroyed = [];
    for (const tile of this.allTiles) {
      if (tile && (tile.state === "idle" || tile.state === "warning")) {
        const dx = tile.worldX - worldX;
        const dz = tile.worldZ - worldZ;
        const dist = Math.hypot(dx, dz);
        if (dist <= radius && dist > minDist) {
          if (hasCone) {
            const dot = (dx * nx + dz * nz) / dist;
            if (dot < coneCos) continue; // outside the forward wedge
          }
          if (shatter) {
            if (tile.beginShatter(onBurst)) destroyed.push(tile);
          } else {
            tile.collapseInstantly();
            destroyed.push(tile);
          }
        }
      }
    }
    return destroyed;
  }

  // QUAKE: group tiles into a TRIANGULAR forward wave. Rows extend away from
  // the caster along their facing direction, widening 1 → 2 → 3 → 4 → 5 tiles,
  // so the first tile directly ahead is row 1, then row 2 (two tiles)… forming
  // a wedge that travels FORWARD. The caster's own tile (row 0) and anything
  // behind are NEVER touched. Returns an array of rows (each an array of live
  // tiles), ordered nearest → furthest, ready for staggered animated shattering.
  destroyTilesWave(worldX, worldZ, dirX, dirZ, range = 5) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const fx = dirX / len; // facing unit vector
    const fz = dirZ / len;
    const px = -fz; // perpendicular (widens the row)
    const pz = fx;

    // Resolve a world position to the nearest live tile.
    const tileAt = (tx, tz) => {
      let best = null;
      let bd = Infinity;
      for (const t of this.allTiles) {
        if (!t || !(t.state === "idle" || t.state === "warning")) continue;
        const d = Math.hypot(t.worldX - tx, t.worldZ - tz);
        if (d < bd) { bd = d; best = t; }
      }
      return best && bd < TILE_SPACING * 0.75 ? best : null;
    };

    const rows = [];
    for (let r = 1; r <= range; r++) {
      const forward = r * TILE_SPACING;
      const centerX = worldX + fx * forward;
      const centerZ = worldZ + fz * forward;
      const row = [];
      for (let k = 0; k < r; k++) {
        const offset = k - (r - 1) / 2; // symmetric perpendicular offset
        const tx = centerX + px * offset * TILE_SPACING;
        const tz = centerZ + pz * offset * TILE_SPACING;
        const tile = tileAt(tx, tz);
        if (tile && !row.includes(tile)) row.push(tile);
      }
      if (row.length) rows.push(row);
    }
    return rows;
  }

  // Check if a 3D coordinate (rx, rz) has solid ground underneath
  hasGroundUnder(rx, rz) {
    return !!this.getSurfaceAt(rx, rz);
  }

  // Surface under a world position: { y, tile } or null
  getSurfaceAt(rx, rz) {
    const centerOffset = (this.gridSize - 1) / 2;
    const gx = Math.round(rx / TILE_SPACING + centerOffset);
    const gz = Math.round(rz / TILE_SPACING + centerOffset);

    const check = (tile) => {
      if (!tile || !tile.isWalkable()) return null;
      const dx = Math.abs(rx - tile.worldX);
      const dz = Math.abs(rz - tile.worldZ);
      if (dx <= TILE_SIZE * 0.58 && dz <= TILE_SIZE * 0.58) {
        return { y: tile.surfaceY, tile };
      }
      return null;
    };

    // Primary candidate tile
    let hit = check(this.getTile(gx, gz));
    if (hit) return hit;

    // Check adjacent tiles in case the robot is bridging the small tile gap
    const offsets = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [ox, oz] of offsets) {
      hit = check(this.getTile(gx + ox, gz + oz));
      if (hit) return hit;
    }

    return null;
  }

  update(dt) {
    // Update active tiles
    for (const tile of this.allTiles) {
      if (!tile.isDead) {
        tile.update(dt);
      }
    }

    if (this.isPaused) return;

    this.updateProps(dt);

    // Online guest: the host decides which tiles warn/fall — only animate here.
    if (this.remoteAuthoritative) return;

    this.fallTimer -= dt;
    if (this.fallTimer <= 0) {
      const rimTiles = this.getOuterRimTiles();
      if (rimTiles.length > 0) {
        // Sort rim tiles by distance from center so outer boundaries fall first
        rimTiles.sort((a, b) => b.distFromCenter - a.distFromCenter);

        // Pick among top 40% furthest rim tiles to maintain organic variety
        const candidatePoolSize = Math.max(1, Math.floor(rimTiles.length * 0.4));
        const randomIndex = Math.floor(Math.random() * candidatePoolSize);
        const chosenTile = rimTiles[randomIndex];
        chosenTile.startWarning();

        this.tilesFallenCount++;

        // Accelerate shrink interval gradually
        this.currentInterval = Math.max(
          this.minInterval,
          this.initialInterval * Math.pow(FALL_ACCEL_RATE, this.tilesFallenCount)
        );
      }

      this.fallTimer = this.currentInterval;
    }
  }
}
