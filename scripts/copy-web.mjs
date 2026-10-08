/**
 * Copies the static web app (index.html, style.css, src/, assets/) into www/.
 * Capacitor's webDir points at www/, so `cap sync android` ships exactly these
 * files to the Android WebView — no node_modules, no build step.
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("www", { recursive: true, force: true });
mkdirSync("www", { recursive: true });

for (const file of ["index.html", "style.css"]) {
  cpSync(file, `www/${file}`);
}
cpSync("src", "www/src", { recursive: true });
cpSync("assets", "www/assets", { recursive: true });

console.log("web assets copied to www/");
