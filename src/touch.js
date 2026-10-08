/**
 * Touch controls for mobile (virtual joystick + action buttons).
 *
 * IMPORTANT: no gameplay logic lives here. Everything is routed through the
 * EXISTING keyboard handlers (src/game.js setupControls) by dispatching
 * synthetic KeyboardEvents on window — the same code path as WASD / SPACE /
 * J / E / G / P / R on desktop.
 */

function keyEvent(code, type) {
  return new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
}

function press(code) {
  window.dispatchEvent(keyEvent(code, "keydown"));
}

function release(code) {
  window.dispatchEvent(keyEvent(code, "keyup"));
}

/** True on phones/tablets (and coarse-pointer laptops). */
export function isTouchDevice() {
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
  );
}

/**
 * Wire up the joystick and buttons. Returns a handle or null on non-touch
 * devices / missing DOM. Call once after the DOM is ready.
 */
export function setupTouchControls() {
  const ui = document.getElementById("touch-ui");
  const joystick = document.getElementById("touch-joystick");
  const knob = document.getElementById("joy-knob");
  if (!ui || !joystick || !knob) return null;

  // --- Left joystick -> WASD (8-direction, deadzone) ---
  const JOY_RADIUS = 48; // px of knob travel
  const DEADZONE = 0.3;
  const held = new Set(); // WASD codes currently pressed
  let joyPointer = null;

  function releaseAllJoystick() {
    for (const code of [...held]) release(code);
    held.clear();
    knob.style.transform = "translate(-50%, -50%)";
  }

  function applyJoystick(clientX, clientY) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const mag = Math.hypot(dx, dy);
    if (mag > JOY_RADIUS) {
      dx = (dx / mag) * JOY_RADIUS;
      dy = (dy / mag) * JOY_RADIUS;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    const nx = mag > 0.001 ? dx / JOY_RADIUS : 0;
    const ny = mag > 0.001 ? dy / JOY_RADIUS : 0;
    const want = {
      KeyW: ny < -DEADZONE,
      KeyS: ny > DEADZONE,
      KeyA: nx < -DEADZONE,
      KeyD: nx > DEADZONE,
    };
    for (const [code, active] of Object.entries(want)) {
      if (active && !held.has(code)) {
        held.add(code);
        press(code);
      } else if (!active && held.has(code)) {
        held.delete(code);
        release(code);
      }
    }
  }

  joystick.addEventListener("pointerdown", (e) => {
    if (joyPointer !== null) return;
    e.preventDefault();
    joyPointer = e.pointerId;
    try {
      joystick.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events (tests) have no active pointer */
    }
    joystick.classList.add("active");
    applyJoystick(e.clientX, e.clientY);
  });

  joystick.addEventListener("pointermove", (e) => {
    if (e.pointerId !== joyPointer) return;
    e.preventDefault();
    applyJoystick(e.clientX, e.clientY);
  });

  const endJoystick = (e) => {
    if (e.pointerId !== joyPointer) return;
    e.preventDefault();
    joyPointer = null;
    joystick.classList.remove("active");
    releaseAllJoystick();
  };
  joystick.addEventListener("pointerup", endJoystick);
  joystick.addEventListener("pointercancel", endJoystick);

  // Safety: never leave keys stuck when the page loses focus
  window.addEventListener("blur", releaseAllJoystick);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAllJoystick();
  });

  // --- Right action buttons -> SPACE / J / E / G (hold-to-use, like keys) ---
  const bindHoldButton = (id, code) => {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events (tests) have no active pointer */
      }
      el.classList.add("pressed");
      press(code);
    };
    const up = (e) => {
      e.preventDefault();
      el.classList.remove("pressed");
      release(code);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  // --- Small utility buttons -> P / R (instant taps) ---
  const bindTapButton = (id, code) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.classList.add("pressed");
      press(code);
      release(code); // P and R are instant actions, not held states
      setTimeout(() => el.classList.remove("pressed"), 160);
    });
  };

  bindHoldButton("touch-push", "Space");
  bindHoldButton("touch-jump", "KeyJ");
  bindHoldButton("touch-spear", "KeyE");
  bindHoldButton("touch-grenade", "KeyG");
  bindTapButton("touch-pause", "KeyP");
  bindTapButton("touch-restart", "KeyR");

  return { releaseAll: releaseAllJoystick };
}
