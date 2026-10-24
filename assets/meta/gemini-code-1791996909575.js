// Optional helper if any character uses def.spikes (META VIBER uses pure boxes)
function mkCone(r, h, mat, outline) {
  const g = new THREE.ConeGeometry(r, h, 4);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline !== false) m.add(new THREE.LineSegments(edgeGeo(g), outlineMat));
  return m;
}

// Add to CHARACTERS array:
{
  id: "meta",
  name: "META VIBER",
  laser: true, // Flag for green laser ability instead of spear
  colors: {
    head:   0xc5d41d, // bright lime-green main body
    body:   0xc5d41d, // lime-green upper/side torso under overalls
    arm:    0xc5d41d, // lime-green upper arms
    foot:   0x272125, // near-black legs
    belt:   0x272125, // near-black overalls waist
    dark:   0x96a117, // darker olive-green depth shade
    visor:  0xc5d41d, // blend default visor into lime head (custom eyes sit on top)
    eye:    0xffffff, // pure white eyes
    accent: 0xeaff3a, // brighter lime highlight (hands / top highlights)
    boot:   0x272125, // near-black flat boots
  },
  headExtras: [
    // --- TOP EARS (near-black blocks with white inner ear cubes) ---
    { w: 0.24, h: 0.20, d: 0.22, x: -0.22, y: 0.44, z: 0.02, c: 0x272125 }, // Left ear
    { w: 0.10, h: 0.10, d: 0.06, x: -0.22, y: 0.39, z: 0.14, c: 0xffffff }, // Left ear white insert
    { w: 0.24, h: 0.20, d: 0.22, x:  0.22, y: 0.44, z: 0.02, c: 0x272125 }, // Right ear
    { w: 0.10, h: 0.10, d: 0.06, x:  0.22, y: 0.39, z: 0.14, c: 0xffffff }, // Right ear white insert

    // --- CROWN HIGHLIGHT & NECK SHADE ---
    { w: 0.72, h: 0.04, d: 0.64, x:  0.00, y: 0.35, z: 0.00, c: 0xeaff3a }, // Brighter lime top highlight
    { w: 0.70, h: 0.05, d: 0.62, x:  0.00, y:-0.34, z: 0.00, c: 0x96a117 }, // Olive depth shade under chin

    // --- LARGE SQUARE WHITE EYES (Sclera) ---
    { w: 0.32, h: 0.34, d: 0.08, x: -0.19, y: -0.02, z: 0.36, c: 0xffffff }, // Left big white eye block
    { w: 0.32, h: 0.34, d: 0.08, x:  0.19, y: -0.02, z: 0.36, c: 0xffffff }, // Right big white eye block

    // --- BLACK CUBE PUPILS (protruding from center of white eyes) ---
    { w: 0.11, h: 0.11, d: 0.07, x: -0.19, y: -0.02, z: 0.42, c: 0x272125 }, // Left pupil
    { w: 0.11, h: 0.11, d: 0.07, x:  0.19, y: -0.02, z: 0.42, c: 0x272125 }, // Right pupil

    // --- CENTER NOSE / SNOUT BLOCK (wedged low between the eyes) ---
    { w: 0.09, h: 0.14, d: 0.07, x:  0.00, y: -0.12, z: 0.37, c: 0x272125 },
  ],
  bodyExtras: [
    // --- OVERALLS (Комбинезон) BIB & STRAPS ---
    { w: 0.46, h: 0.36, d: 0.44, x:  0.00, y: -0.06, z: 0.02, c: 0x272125 }, // Main dark front/back bib
    { w: 0.11, h: 0.14, d: 0.44, x: -0.17, y:  0.18, z: 0.02, c: 0x272125 }, // Left shoulder strap
    { w: 0.11, h: 0.14, d: 0.44, x:  0.17, y:  0.18, z: 0.02, c: 0x272125 }, // Right shoulder strap

    // --- WHITE CHEST BUTTON / BADGE (slightly right of center on bib) ---
    { w: 0.10, h: 0.10, d: 0.06, x:  0.05, y:  0.04, z: 0.25, c: 0xffffff },

    // --- WHITE TOP-OF-LEG TRIM (visible on character's left thigh under bib) ---
    { w: 0.22, h: 0.06, d: 0.24, x:  0.15, y: -0.27, z: 0.00, c: 0xffffff },
  ],
  armExtrasL: [
    // Dark wristband/cuff + bright lime hand at bottom of left arm
    { w: 0.24, h: 0.14, d: 0.24, x: 0.00, y: -0.10, z: 0.00, c: 0x272125 }, // Dark cuff
    { w: 0.22, h: 0.10, d: 0.24, x: 0.00, y: -0.22, z: 0.02, c: 0xeaff3a }, // Bright lime hand
  ],
  armExtrasR: [
    // Dark wristband/cuff + bright lime hand at bottom of right arm
    { w: 0.24, h: 0.14, d: 0.24, x: 0.00, y: -0.10, z: 0.00, c: 0x272125 }, // Dark cuff
    { w: 0.22, h: 0.10, d: 0.24, x: 0.00, y: -0.22, z: 0.02, c: 0xeaff3a }, // Bright lime hand
  ],
}