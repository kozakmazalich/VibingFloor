// Runtime smoke-check for the weapon pickup system (steps 2-6).
// Runs inside index.html's import map via cdp-test.mjs.
(async () => {
  const out = [];
  const THREE = await import("three");
  const { Robot } = await import("/src/robot.js");
  const { PickupManager } = await import("/src/pickups.js");
  const { Island } = await import("/src/island.js");
  const { MAPS } = await import("/src/maps.js");

  const scene = new THREE.Scene();
  const pm = new PickupManager(scene);
  pm.spearCount = 1;
  pm.grenadeCount = 1;
  const island = new Island(scene, MAPS[0]);

  // Spawn pods and ensure no runtime throw + 2 pods
  const sp = island.getWorldPos(10, 10);
  pm.spawn(island, [{ x: sp.x, z: sp.z }]);
  out.push("pods=" + pm.pickups.length + " kinds=" + pm.pickups.map((p) => p.kind).sort().join(","));

  // Robot starts unarmed, equip works, trigger gated
  const r = new Robot(9, "PU", "assets/robot1_portrait.png", sp.x, sp.z, 0x00e5ff, true, scene);
  out.push("unarmed=" + (!r.hasSpear && !r.hasGrenade));
  const gatedSpear = r.triggerSpear(null, null, null) === false;
  out.push("spearGated=" + gatedSpear);
  r.equip("spear");
  out.push("spearEquipped=" + r.hasSpear);
  r.equip("grenade");
  out.push("grenadeEquipped=" + r.hasGrenade);
  const st = r.getAbilityStatus();
  out.push("hudLocked(final)=" + (st.spear.locked === false && st.grenade.locked === false));
  out.push("hudSpearReady=" + st.spear.ready);

  // pickupAt / nearest
  const pod = pm.pickups[0];
  out.push("overlap=" + (pm.pickupAt(pod.pos.x, pod.pos.z) === pod));
  out.push("nearest=" + (pm.nearest(sp.x, sp.z) !== null));

  pm.clear();
  r.dispose();
  const leaked = scene.children.length;
  out.push("cleared=" + (leaked === 0));

  return "PICKUP-SMOKE: " + out.join(" | ");
})();
