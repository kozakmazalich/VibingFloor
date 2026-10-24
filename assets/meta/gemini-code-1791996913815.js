if (def.spikes) {
  for (const s of def.spikes) {
    const col = typeof s.c === "number" ? s.c : (def.colors[s.c] ?? def.colors.accent);
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 });
    const cone = mkCone(s.r, s.h, mat);
    cone.position.set(s.x, s.y, s.z);
    if (s.rx) cone.rotation.x = s.rx;
    if (s.ry) cone.rotation.y = s.ry;
    if (s.rz) cone.rotation.z = s.rz;
    head.add(cone);
  }
}