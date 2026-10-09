/**
 * Game constants for Vibing Floor 3D
 */

export const GRID_SIZE = 10;
export const TILE_SIZE = 1.0;
export const TILE_GAP = 0.08;
export const TILE_SPACING = TILE_SIZE + TILE_GAP; // 1.08 units between tile centers
export const TILE_HEIGHT = 0.5;

// Total span from edge to edge: 10 * 1.08 - 0.08 = 10.72 units
export const ISLAND_HALF_WIDTH = ((GRID_SIZE - 1) * TILE_SPACING) / 2;

// Shrinking timing (in seconds)
export const INITIAL_FALL_INTERVAL = 2.2;
export const MIN_FALL_INTERVAL = 0.65;
export const FALL_ACCEL_RATE = 0.985;
export const WARNING_DURATION = 0.85;

// Robot physics
export const ROBOT_RADIUS = 0.52;
export const ROBOT_SCALE = 1.25;

// Vertical platform levels (jumpable heights)
export const LEVEL_STEP = 0.75; // Height of one raised level
export const STEP_UP_MAX = 0.8; // Max ledge height a grounded robot can step up
export const ROBOT_BODY_HEIGHT = 1.4; // Approx body height for slab overlap checks

// CPU difficulty presets
export const DIFFICULTIES = {
  easy: {
    label: "EASY",
    maxSpeed: 4.2,
    accel: 26,
    aggro: 4.5,
    spearChance: 0.35,
    grenadeChance: 0.2,
    pushChance: 0.45,
    edgeSense: 0.85,
    dodge: false,
  },
  normal: {
    label: "NORMAL",
    maxSpeed: 5.0,
    accel: 30,
    aggro: 5.5,
    spearChance: 0.65,
    grenadeChance: 0.5,
    pushChance: 0.8,
    edgeSense: 1.0,
    dodge: false,
  },
  hard: {
    label: "HARD",
    maxSpeed: 5.8,
    accel: 34,
    aggro: 7.5,
    spearChance: 0.9,
    grenadeChance: 0.7,
    pushChance: 1.0,
    edgeSense: 1.35,
    dodge: true,
  },
};

export const P1_ACCEL = 36.0;
export const P1_MAX_SPEED = 5.8;
export const P1_DAMPING = 10.0;

export const AI_ACCEL = 30.0;
export const AI_MAX_SPEED = 5.0;
export const AI_DAMPING = 9.5;
export const AI_AGGRO_RADIUS = 5.5;

// Knockback impulse
export const BASE_KNOCKBACK = 8.0;
export const IMPACT_DAMPING = 0.85;

// Active Push Ability (P)
export const PUSH_RADIUS = 1.85; // Radius of force wave
export const PUSH_COOLDOWN = 1.2; // Seconds between pushes
export const PUSH_IMPULSE = 14.5; // Strong impulse to knock opponent into void

// Active Jump Ability (J)
export const JUMP_FORCE = 10.5; // Upward velocity on jump
export const JUMP_COOLDOWN = 0.75; // Seconds between jumps
export const JUMP_FORWARD_BOOST = 1.2; // Bonus forward leap speed if moving (kept low for precise platform landings)

// Dash Ability (SHIFT): short burst along the move/facing direction
export const DASH_COOLDOWN = 1.5; // Seconds between dashes
export const DASH_DURATION = 0.18; // Burst length in seconds
export const DASH_SPEED_MULT = 2.8; // Burst speed as a multiple of normal max speed
export const DASH_RECOVERY = 0.14; // Smooth speed bleed after the burst ends
export const DASH_TRAIL_INTERVAL = 0.04; // Afterimage spawn cadence (seconds)
export const DASH_TRAIL_LIFE = 0.25; // Afterimage fade duration (seconds)

// Weapon 1: Spear Thrust (E)
export const SPEAR_COOLDOWN = 1.8; // Seconds
export const SPEAR_REACH = 3.2; // Long melee reach (~3 tiles)
export const SPEAR_IMPULSE = 38.0; // Heavy knockback, sends opponent flying into the abyss!

// Weapon 2: Grenade Throw (G)
export const GRENADE_COOLDOWN = 4.2; // Seconds
export const GRENADE_RADIUS = 1.7; // Destroys ~2x2 to 3x3 tiles
export const GRENADE_THROW_SPEED = 14.0;
export const GRENADE_THROW_DISTANCE = 4.8; // Thrown forward in facing direction
export const GRENADE_IMPULSE = 20.0; // Blast knockback if caught in shockwave

// Falling / Void
export const GRAVITY = 24.0;
export const VOID_KILL_Y = -15.0;

// Visual Colors - Neon Cyberpunk Arena Palette
export const COLORS = {
  voidBg: 0x0a0a14,
  voidFog: 0x0a0a14,
  tileBase: 0x121526,
  tileTop: 0x1a2038,
  tileEdge: 0x00e5ff, // Glowing solid cyan #00e5ff
  tileEdgeSubtle: 0x3b4875, // Deep cyber indigo
  tileUnderglow: 0x00e5ff, // Levitating cyan underglow
  tileWarning: 0xff5c1a, // Neon warning orange #ff5c1a
  tileWarningGlow: 0xff2200, // Fiery red flicker #ff2200
  p1Ring: 0x00e5ff, // Player electric cyan #00e5ff
  p2Ring: 0xff2d95, // Enemy cyber laser magenta #ff2d95
  accentCyan: 0x00e5ff,
  accentMagenta: 0xff2d95,
  gridMajor: 0x00e5ff, // Cyan grid lines
  gridMinor: 0x182046, // Deep indigo grid lines
  arenaRing: 0x00e5ff, // Floating arena halo
};
