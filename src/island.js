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

  buildGrid() {
    this.clear();
    this.allTiles = [];
    this.grid = Array.from({ length: this.gridSize }, () =>
      Array(this.gridSize).fill(null)
    );

    const isTileActive = this.mapDef.isTileActive || (() => true);
    const elevationAt = this.mapDef.elevationAt || (() => 0);
    const decorAt = this.mapDef.decorAt || (() => null);
    const theme = this.mapDef.theme || null;

    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        if (isTileActive(x, z)) {
          const tile = new Tile(
            x,
            z,
            this.scene,
            this.gridSize,
            elevationAt(x, z),
            theme,
            decorAt(x, z)
          );
          this.grid[x][z] = tile;
          this.allTiles.push(tile);
        }
      }
    }

    this.totalInitialTiles = this.allTiles.length;
    this.tilesFallenCount = 0;

    // Fast id -> tile lookup for snapshot deltas (online guest)
    this.tileById.clear();
    for (const tile of this.allTiles) {
      this.tileById.set(tile.gx * this.gridSize + tile.gz, tile);
    }

    // Map-specific animated props (elevator, floating orb, ...)
    this.props = [];
    for (const def of this.mapDef.props || []) {
      const prop = buildProp(def);
      if (prop) {
        this.scene.add(prop.group);
        this.props.push(prop);
      }
    }

    // Scale shrink pacing so huge arenas still tighten up in a demo-length round
    const paceScale = Math.sqrt(100 / Math.max(1, this.totalInitialTiles));
    this.initialInterval = INITIAL_FALL_INTERVAL * paceScale;
    this.minInterval = MIN_FALL_INTERVAL * paceScale;
    this.currentInterval = this.initialInterval;
    this.fallTimer = this.initialInterval;
  }

  clear() {
    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        if (this.grid[x] && this.grid[x][z]) {
          this.grid[x][z].dispose();
          this.grid[x][z] = null;
        }
      }
    }
    this.allTiles = [];

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
    if (gx < 0 || gx >= this.gridSize || gz < 0 || gz >= this.gridSize) return null;
    return this.grid[gx][gz];
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

  // Destroy floor tiles in a radius immediately (e.g. from Grenade blast)
  destroyTilesAt(worldX, worldZ, radius) {
    const destroyed = [];
    for (const tile of this.allTiles) {
      if (tile && (tile.state === "idle" || tile.state === "warning")) {
        const dist = Math.hypot(tile.worldX - worldX, tile.worldZ - worldZ);
        if (dist <= radius) {
          tile.collapseInstantly();
          destroyed.push(tile);
        }
      }
    }
    return destroyed;
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
