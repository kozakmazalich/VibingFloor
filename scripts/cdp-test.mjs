/**
 * Minimal CDP (Chrome DevTools Protocol) test driver.
 *
 * Loads a page in real headless Chrome and lets REAL time pass (unlike
 * --virtual-time-budget, which races past real network I/O — required for
 * WebSocket/WebRTC tests). Reads #log textContent and reports console errors.
 *
 * Usage:
 *   node scripts/cdp-test.mjs <url> [waitMs]                 -> dumps #log
 *   node scripts/cdp-test.mjs <url> [waitMs] <checkScript>   -> evaluates
 *        the async check script (awaitPromise) and prints its return value
 *   optional flags (any position after the first args):
 *     --mobile=WxH      emulate a phone viewport + touch (e.g. --mobile=390x844)
 *     --shot=path.png   capture a screenshot right after [waitMs]
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const CHROME =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const URL = args.find((a) => a.startsWith("http")) || null;
const WAIT_MS = Number(args.find((a) => /^\d+$/.test(a)) ?? 8000);
const CHECK_FILE = args.find((a) => a.endsWith(".js") && !a.startsWith("--")) || null;
const MOBILE = args.find((a) => a.startsWith("--mobile="))?.slice(9) || null;
const SHOT = args.find((a) => a.startsWith("--shot="))?.slice(7) || null;
const SHOT2 = args.find((a) => a.startsWith("--shot2="))?.slice(8) || null;

if (!URL) {
  console.error(
    "usage: node scripts/cdp-test.mjs <url> [waitMs] [checkScript.js] [--mobile=WxH] [--shot=path.png]"
  );
  process.exit(2);
}

const PORT = 9400 + Math.floor(Math.random() * 500);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--no-sandbox",
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=" + mkdtempSync(tmpdir() + "/vf-chrome-"),
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return res.json();
}

async function main() {
  let target = null;
  for (let i = 0; i < 100; i++) {
    try {
      const list = await cdpJson("/json/list");
      target = list.find((t) => t.type === "page");
      if (target) break;
    } catch {
      /* chrome still starting */
    }
    await sleep(150);
  }
  if (!target) throw new Error("no CDP page target (chrome failed to start?)");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const errors = [];
  let idc = 0;

  function send(method, params = {}) {
    const id = ++idc;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message}`));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      errors.push(
        `exception: ${d.exception?.description || d.text || "unknown"}`
      );
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      // favicon 404s are harmless noise in local test pages
      const url = msg.params.entry.url || "";
      if (!url.includes("favicon") && !msg.params.entry.text.includes("favicon")) {
        errors.push(`console.error: ${msg.params.entry.text}`);
      }
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      errors.push(`console.error: ${text}`);
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("CDP websocket failed"));
  });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");

  if (MOBILE) {
    const [w, h] = MOBILE.split("x").map(Number);
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 3,
      mobile: true,
      screenWidth: w,
      screenHeight: h,
    });
    await send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
  }

  await send("Page.navigate", { url: URL });
  await sleep(WAIT_MS);

  if (SHOT) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(SHOT, Buffer.from(shot.data, "base64"));
    console.log("screenshot saved: " + SHOT);
  }

  if (CHECK_FILE) {
    const src = readFileSync(CHECK_FILE, "utf8");
    const res = await send("Runtime.evaluate", {
      expression: src,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      errors.push(
        "check script exception: " +
          (res.exceptionDetails.exception?.description || res.exceptionDetails.text)
      );
      console.log("(check script threw)");
    } else {
      console.log(res.result && res.result.value !== undefined ? String(res.result.value) : "(check done)");
    }
  } else {
    const logRes = await send("Runtime.evaluate", {
      expression:
        "document.getElementById('log') ? document.getElementById('log').textContent : null",
      returnByValue: true,
    });
    console.log(logRes.result.value ?? "(no #log element)");
  }

  if (SHOT2) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(SHOT2, Buffer.from(shot.data, "base64"));
    console.log("screenshot saved: " + SHOT2);
  }

  if (errors.length) {
    console.log("ERRORS:");
    for (const e of [...new Set(errors)]) console.log("  " + e);
    process.exitCode = 1;
  }
  ws.close();
}

main()
  .catch((err) => {
    console.error("CDP TEST FAILED:", err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      chrome.kill("SIGKILL");
    } catch {}
    setTimeout(() => process.exit(), 100);
  });
