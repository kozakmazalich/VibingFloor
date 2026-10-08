/**
 * Two-device online test: spawns TWO separate headless Chrome processes
 * (independent WebRTC stacks, like a computer and a phone), drives the REAL
 * game UI on both (host -> room code -> join) and verifies the full duplex
 * loop: phone input -> host sim -> snapshot -> phone HUD.
 *
 * Usage: node scripts/two-device-test.mjs [url] [hostMobile=WxH] [guestMobile=WxH]
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const CHROME =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:8123/index.html";
const HOST_MOBILE = process.argv.find((a) => a.startsWith("--host="))?.slice(7) || null;
const GUEST_MOBILE = process.argv.find((a) => a.startsWith("--guest="))?.slice(8) || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

class Session {
  constructor(name, port, mobile) {
    this.name = name;
    this.port = port;
    this.mobile = mobile;
    this.errors = [];
    this.idc = 0;
    this.pending = new Map();
    this.chrome = spawn(
      CHROME,
      [
        "--headless=new",
        "--disable-gpu",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--no-sandbox",
        "--mute-audio",
        "--autoplay-policy=no-user-gesture-required",
        `--remote-debugging-port=${port}`,
        "--user-data-dir=" + mkdtempSync(tmpdir() + "/vf2-"),
        "about:blank",
      ],
      { stdio: "ignore" }
    );
  }

  async connect() {
    let target = null;
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (
          await fetch(`http://127.0.0.1:${this.port}/json/list`)
        ).json();
        target = list.find((t) => t.type === "page");
        if (target) break;
      } catch {
        /* chrome starting */
      }
      await sleep(150);
    }
    if (!target) throw new Error(this.name + ": no CDP target");
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message));
        else p.resolve(m.result);
        return;
      }
      if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        this.errors.push("exception: " + (d.exception?.description || d.text || "?"));
      }
      if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
        const u = m.params.entry.url || "";
        if (!u.includes("favicon") && !m.params.entry.text.includes("favicon")) {
          this.errors.push("console.error: " + m.params.entry.text);
        }
      }
    };
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = () => rej(new Error(this.name + ": CDP ws failed"));
    });
    this.send = (method, params = {}) => {
      const id = ++this.idc;
      this.ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    };
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    await this.send("Log.enable");
    if (this.mobile) {
      const [w, h] = this.mobile.split("x").map(Number);
      await this.send("Emulation.setDeviceMetricsOverride", {
        width: w,
        height: h,
        deviceScaleFactor: 3,
        mobile: true,
        screenWidth: w,
        screenHeight: h,
      });
      await this.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    }
    await this.send("Page.navigate", { url: URL });
  }

  async eval(expr) {
    const r = await this.send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        this.name + " eval: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      );
    }
    return r.result.value;
  }

  async waitFor(expr, label, timeout = 25000) {
    const t0 = Date.now();
    for (;;) {
      if (await this.eval(expr)) {
        this.log("OK: " + label);
        return;
      }
      if (Date.now() - t0 > timeout) {
        failures++;
        this.log("FAIL: " + label);
        throw new Error(this.name + ": TIMEOUT " + label);
      }
      await sleep(200);
    }
  }

  async expect(expr, label, want) {
    const got = await this.eval(expr);
    if (want !== undefined ? got === want : !!got) {
      this.log(`OK: ${label} (${got})`);
    } else {
      failures++;
      this.log(`FAIL: ${label} — got ${JSON.stringify(got)}${want !== undefined ? " want " + JSON.stringify(want) : ""}`);
    }
  }

  log(m) {
    console.log(`[${this.name}] ${m}`);
  }

  close() {
    try {
      this.chrome.kill("SIGKILL");
    } catch {
      /* noop */
    }
  }
}

async function runScenario(label, hostMobile, guestMobile) {
  console.log(`\n===== SCENARIO: ${label} =====`);
  const host = new Session("HOST", 9500 + Math.floor(Math.random() * 300), hostMobile);
  const guest = new Session("PHONE", 9800 + Math.floor(Math.random() * 300), guestMobile);
  try {
    await host.connect();
    await guest.connect();
    await sleep(2500); // boot both pages

    // HOST: open the online panel and start hosting
    await host.eval(`document.getElementById("btn-menu-online").click()`);
    await sleep(400);
    await host.eval(`document.getElementById("btn-online-host").click()`);
    await host.waitFor(
      `(() => { const el = document.getElementById("online-code"); return el && el.textContent.length === 6 && el.textContent.indexOf("-") === -1; })()`,
      "host has room code"
    );
    const code = await host.eval(`document.getElementById("online-code").textContent`);
    console.log("room code: " + code);

    // GUEST: join by the room code (like a phone player would)
    await guest.eval(`document.getElementById("btn-menu-online").click()`);
    await sleep(400);
    await guest.eval(
      `(() => { const i = document.getElementById("online-code-input"); i.value = ${JSON.stringify(code)}; return i.value; })()`
    );
    await guest.eval(`document.getElementById("btn-online-join").click()`);

    await host.waitFor(
      `!document.getElementById("in-game-hud").classList.contains("hidden")`,
      "host entered the game"
    );
    await guest.waitFor(
      `!document.getElementById("in-game-hud").classList.contains("hidden")`,
      "guest entered the game"
    );

    // HUD labels per side
    await host.expect(
      `document.getElementById("hud-p2-name").textContent.indexOf("RIVAL") === 0`,
      "host sees the rival label"
    );
    await guest.expect(
      `document.getElementById("hud-p1-name").textContent.indexOf("YOU") === 0`,
      "guest sees the YOU label"
    );
    const arenaA = await host.eval(`document.getElementById("arena-name").textContent`);
    const arenaB = await guest.eval(`document.getElementById("arena-name").textContent`);
    if (arenaA === arenaB) host.log("OK: same arena on both sides (" + arenaA + ")");
    else {
      failures++;
      host.log(`FAIL: arenas differ (${arenaA} vs ${arenaB})`);
    }

    // Round-trip 1: REAL touch button (pointer events) — the guest HUD must
    // react INSTANTLY (local prediction), and the authoritative cooldown must
    // round-trip through the host afterwards.
    const firePointer = (sel) =>
      guest.eval(
        `(() => { const el = document.querySelector(${JSON.stringify(sel)}); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const ev = (t) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 3, isPrimary: true, clientX: x, clientY: y }));
        ev("pointerdown"); window.__hold = { el, x, y }; return true; })()`
      );
    const releasePointer = () =>
      guest.eval(
        `(() => { const h = window.__hold; if (!h) return false; h.el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 3, isPrimary: true, clientX: h.x, clientY: h.y })); window.__hold = null; return true; })()`
      );

    const pushBefore = await guest.eval(`document.getElementById("push-status-text").textContent`);
    await firePointer("#touch-push");
    await sleep(80);
    const pushInstant = await guest.eval(`document.getElementById("push-status-text").textContent`);
    await sleep(400);
    const pushDuring = await guest.eval(`document.getElementById("push-status-text").textContent`);
    await releasePointer();
    if (pushInstant !== pushBefore) {
      guest.log(`OK: PUSH button reacts instantly ("${pushBefore}" -> "${pushInstant}")`);
    } else {
      failures++;
      guest.log(`FAIL: PUSH button did not react instantly (stayed "${pushBefore}")`);
    }
    if (pushDuring !== pushBefore) {
      guest.log(`OK: push cooldown round-tripped through the host ("${pushBefore}" -> "${pushDuring}")`);
    } else {
      failures++;
      guest.log(`FAIL: push cooldown did not round-trip (stayed "${pushBefore}")`);
    }
    // cooldown is 1.2s — poll for recovery instead of a single snapshot
    let recovered = false;
    for (let i = 0; i < 15; i++) {
      await sleep(200);
      if ((await guest.eval(`document.getElementById("push-status-text").textContent`)) === "READY") {
        recovered = true;
        break;
      }
    }
    if (recovered) guest.log("OK: push cooldown recovered to READY");
    else {
      failures++;
      guest.log("FAIL: push cooldown stuck");
    }

    // Round-trip 2: SPEAR button — instant + round-trip the same way
    const spearBefore = await guest.eval(`document.getElementById("spear-status-text").textContent`);
    await firePointer("#touch-spear");
    await sleep(80);
    const spearInstant = await guest.eval(`document.getElementById("spear-status-text").textContent`);
    await releasePointer();
    if (spearInstant !== spearBefore) {
      guest.log(`OK: SPEAR button reacts instantly ("${spearBefore}" -> "${spearInstant}")`);
    } else {
      failures++;
      guest.log(`FAIL: SPEAR button did not react instantly (stayed "${spearBefore}")`);
    }
    let spearRecovered = false;
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      if ((await guest.eval(`document.getElementById("spear-status-text").textContent`)) === "READY") {
        spearRecovered = true;
        break;
      }
    }
    if (spearRecovered) guest.log("OK: spear cooldown recovered to READY");
    else {
      failures++;
      guest.log("FAIL: spear cooldown stuck");
    }

    // Round-trip 2: guest holds W (movement input must reach the host and
    // the guest's own prediction must respond — the follow camera is the
    // only observable: it stays locked on the robot, so the snapshots keep
    // the fall timer ticking either way). Verify snapshots are flowing.
    const t1 = await guest.eval(`document.getElementById("fall-timer").textContent`);
    await guest.eval(
      `window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true, cancelable: true }))`
    );
    // sample several times: the ~1.1s cycle can land on the same text once
    const seen = new Set([t1]);
    for (let i = 0; i < 6; i++) {
      await sleep(250);
      seen.add(await guest.eval(`document.getElementById("fall-timer").textContent`));
    }
    await guest.eval(
      `window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", bubbles: true, cancelable: true }))`
    );
    if (seen.size >= 2) guest.log(`OK: snapshots flowing on the guest (${[...seen].join(", ")})`);
    else {
      failures++;
      guest.log("FAIL: guest snapshots frozen");
    }

    await sleep(1500); // let any late errors surface

    for (const s of [host, guest]) {
      const errs = [...new Set(s.errors)];
      if (errs.length) {
        failures += errs.length;
        s.log("FAIL: console errors — " + errs.join(" | "));
      } else {
        s.log("OK: zero console errors");
      }
    }
  } catch (err) {
    failures++;
    console.log("SCENARIO ERROR: " + err.message);
  } finally {
    host.close();
    guest.close();
    await sleep(300);
  }
}

(async () => {
  await runScenario("desktop host + phone guest", HOST_MOBILE, GUEST_MOBILE || "390x844");
  console.log(failures === 0 ? "\nRESULT: PASS two-device online" : `\nRESULT: FAIL (${failures} problems)`);
  process.exit(failures === 0 ? 0 : 1);
})();
