# VIBING FLOOR

3D "Don't Fall"-style battle royale in Three.js (no build step). Robots fight
on a shrinking neon island, push each other into the void, and blow up the
floor under their opponents.

## Run

```
python3 -m http.server 8000
# or: npx serve .
```

Open http://localhost:8000.

## Controls

- WASD / arrows — move (camera-relative; drag to orbit)
- SPACE — force push
- J — jet jump
- E — cyber spear
- G — grenade (destroys floor tiles)
- R — restart, P / ESC — pause

Touch controls appear automatically on phones/tablets.

## Online 1v1 (free P2P, PeerJS + WebRTC)

Menu → ONLINE 1V1 → HOST GAME (share the room code) or JOIN by code.
The host runs the simulation for both robots; the guest is a thin client.
Requires internet for the free PeerJS broker + STUN.

## Android APK (Capacitor)

```
npm run web:copy
npm run sync          # copy web assets + cap sync android
cd android && ./gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.
Requires local JDK 21 + Android SDK (`JAVA_HOME` / `ANDROID_HOME`).

## Tests

Headless Chrome checks (no deps beyond Chrome + Node 24):

```
python3 -m http.server 8123   # in another terminal
node scripts/cdp-test.mjs http://127.0.0.1:8123/index.html 4000 scripts/boot-check.js
node scripts/cdp-test.mjs http://127.0.0.1:8123/index.html 2300 scripts/mobile-check.js --mobile=390x844
```
