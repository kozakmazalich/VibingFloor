/**
 * Web Audio API synthesizer for Vibing Floor
 * Zero external audio files, completely self-contained.
 */

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;

    // Background music state (mp3 loop: assets/1025.mp3)
    this.musicRunning = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicNextTime = 0;
    this.musicBus = null;
    this.musicBassGain = null;
    this.musicBuffer = null; // decoded AudioBuffer of 1025.mp3
    this.musicLoadPromise = null; // in-flight fetch+decode
    this.musicSrc = null; // active looping BufferSource
    this._noiseBuf = null;

    // Red Light / Green Light voice clips (race map 3). Decoded once, then
    // fired as one-shots on each phase flip.
    this.voiceBuffers = { green: null, red: null };
    this.voicePromises = { green: null, red: null };
    this.voiceSrc = null; // active one-shot source
    this.voiceGain = null;
    this.voiceReq = null; // most recently requested clip

    // Per-source switches + levels (the map-3 HUD exposes music/voice on-off).
    this.musicEnabled = true;
    this.musicVolume = 0.5;
    this.voiceEnabled = true;
    this.voiceVolume = 1.15; // louder than the music (music ducks under it)
    this._voiceDuckTimer = null;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.initialized = true;
      }
    } catch (e) {
      console.warn("Web Audio not supported", e);
    }
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    // First user gesture unlocks audio: fire up the arena beat
    if (this.ctx && !this.muted) this.startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopMusic();
      this.stopVoice();
    } else {
      this.startMusic();
    }
    return this.muted;
  }

  // Knockback impact thump
  playImpact(strength = 1.0) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(140 + strength * 40, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.16);

    gain.gain.setValueAtTime(Math.min(0.35, 0.2 * strength), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Tile warning alert
  playWarning() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.1);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.13);
  }

  // Tile falling crumble whoosh
  playTileFall() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.4);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.45);
  }

  // Robot falling downward slide whistle
  playRobotFall() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.7);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.8);
  }

  // Victory fanfare
  playWin() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const start = t + idx * 0.11;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.22, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.38);
    });
  }

  // Round reset chime
  playReset() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(640, t + 0.15);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.22);
  }

  // Active push whoosh air blast sound (SPACE ability)
  playPushWhoosh() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // Pitch sweep
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.22);

    oscGain.gain.setValueAtTime(0.28, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.25);

    // Fast noise sweep for whoosh texture
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.2);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(280, t + 0.18);
    filter.Q.setValueAtTime(2.0, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.22, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    whiteNoise.start(t);
    whiteNoise.stop(t + 0.21);
  }

  // Spear thrust whoosh (Key E)
  playSpearThrust() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(650, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.16);

    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Spear impact strike
  playSpearHit() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // Heavy impact thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);

    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Grenade toss aerodynamic whistle (Key G)
  playGrenadeThrow() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(540, t + 0.22);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  // Grenade explosion blast
  playExplosion() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // Sub-bass detonation boom
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();

    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(120, t);
    subOsc.frequency.exponentialRampToValueAtTime(25, t + 0.6);

    subGain.gain.setValueAtTime(0.65, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);

    subOsc.start(t);
    subOsc.stop(t + 0.7);

    // Explosive noise crunch
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.45);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.4);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + 0.46);
  }

  // Futuristic UI button click feedback
  playClick() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.04);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  // Pause / resume chime
  playPause(isPausing = true) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    if (isPausing) {
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(330, t + 0.12);
    } else {
      osc.frequency.setValueAtTime(330, t);
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.12);
    }

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  // Jump thruster launch sound (SPACE)
  playJump() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.16);

    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Ground landing thud
  playLand() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  // Dash burst whoosh (SHIFT): fast descending pitch sweep + noise zip
  playDash() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // Fast pitch sweep down
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);

    oscGain.gain.setValueAtTime(0.22, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.15);

    // Short noise zip for the whoosh texture
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.14);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2400, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    filter.Q.setValueAtTime(1.6, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    whiteNoise.start(t);
    whiteNoise.stop(t + 0.15);
  }

  // Weapon pickup chime — a bright ascending arpeggio confirming an equip
  playPickup() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      const start = t + i * 0.07;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });

    // Soft shimmer overtone for a "holo" texture
    const shimmer = this.ctx.createOscillator();
    const shimGain = this.ctx.createGain();
    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(2093, t + 0.22);
    shimGain.gain.setValueAtTime(0.0001, t + 0.22);
    shimGain.gain.exponentialRampToValueAtTime(0.12, t + 0.24);
    shimGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    shimmer.connect(shimGain);
    shimGain.connect(this.ctx.destination);
    shimmer.start(t + 0.22);
    shimmer.stop(t + 0.42);
  }

  // Jetpack ignition — a rising whoosh + low rumble (Key Q)
  playJetpack() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Filtered noise whoosh (thrust)
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.4);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const outN = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) outN[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(1600, t + 0.35);
    filter.Q.setValueAtTime(1.2, t);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, t);
    nGain.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noise.connect(filter); filter.connect(nGain); nGain.connect(this.ctx.destination);
    noise.start(t); noise.stop(t + 0.42);

    // Rising tone
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.4);
    oGain.gain.setValueAtTime(0.12, t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(oGain); oGain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.44);
  }

  // Quake ground slam — a deep rumble + cracking thud (Key Q)
  playQuake() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Sub-bass detonation
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(90, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    subGain.gain.setValueAtTime(0.7, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    sub.connect(subGain); subGain.connect(this.ctx.destination);
    sub.start(t); sub.stop(t + 0.8);

    // Crackle / rumble noise
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.6);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const outN = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) outN[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 0.5);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.5, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    noise.connect(filter); filter.connect(nGain); nGain.connect(this.ctx.destination);
    noise.start(t); noise.stop(t + 0.62);
  }

  // =====================================================================
  // BACKGROUND MUSIC — the game's techno track (assets/1025.mp3), looped.
  // Decoded into an AudioBuffer and played with a looping source so it wraps
  // seamlessly; the previous synthesized loop is kept below but unused.
  startMusic() {
    if (this.musicRunning) return;
    if (!this.musicEnabled) return;
    if (!this.ctx) this.init(); // do NOT call ensureContext here (it calls us back)
    if (!this.ctx || this.muted) return;

    this.musicRunning = true;

    // Lazily fetch + decode the mp3 once, then start the loop.
    if (!this.musicBuffer) {
      if (!this.musicLoadPromise) {
        this.musicLoadPromise = fetch("assets/1025.mp3")
          .then((r) => {
            if (!r.ok) throw new Error(`mp3 fetch ${r.status}`);
            return r.arrayBuffer();
          })
          .then((buf) => this.ctx.decodeAudioData(buf))
          .then((decoded) => {
            this.musicBuffer = decoded;
            // Start only if music is still supposed to be running.
            if (this.musicRunning) this._startMusicLoop();
          })
          .catch((err) => {
            console.warn("[audio] music track failed to load:", err);
            this.musicRunning = false;
          });
      }
      return;
    }
    this._startMusicLoop();
  }

  _startMusicLoop() {
    if (!this.ctx || !this.musicBuffer) return;
    this.stopMusicNodes(); // clear any previous source
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume; // track volume
    this.musicBus.connect(this.ctx.destination);

    const src = this.ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    src.loop = true; // seamless techno loop
    src.connect(this.musicBus);
    try {
      src.start(0);
    } catch (e) {
      /* already started */
    }
    this.musicSrc = src;
  }

  // Tear down the looping source + bus (safe to call anytime).
  stopMusicNodes() {
    if (this.musicSrc) {
      try {
        this.musicSrc.stop();
        this.musicSrc.disconnect();
      } catch (e) {
        /* noop */
      }
      this.musicSrc = null;
    }
    if (this.musicBus) {
      try {
        this.musicBus.disconnect();
      } catch (e) {
        /* already disconnected */
      }
      this.musicBus = null;
    }
    this.musicBassGain = null;
  }

  stopMusic() {
    if (!this.musicRunning && !this.musicSrc) return;
    this.musicRunning = false;
    if (this.musicTimer) {
      clearInterval(this.musicTimer); // legacy synthesized loop
      this.musicTimer = null;
    }
    this.stopMusicNodes();
  }

  // =====================================================================
  // LIGHT VOICES — "GREEN LIGHT" / "RED LIGHT" clips for race map 3.
  // Fetched + decoded once, then played instantly on each phase flip.
  // =====================================================================
  preloadVoices() {
    this.ensureContext();
    if (!this.ctx) return;
    this._loadVoice("green", "GREEN.mp3");
    this._loadVoice("red", "RED.mp3");
  }

  // Music + voice on/off (exposed by the map-3 HUD clicker).
  setMusicEnabled(on) {
    this.musicEnabled = !!on;
    if (!this.musicEnabled) this.stopMusic();
    else if (!this.muted) this.startMusic();
    return this.musicEnabled;
  }

  toggleMusicEnabled() {
    return this.setMusicEnabled(!this.musicEnabled);
  }

  setVoiceEnabled(on) {
    this.voiceEnabled = !!on;
    if (!this.voiceEnabled) this.stopVoice();
    return this.voiceEnabled;
  }

  toggleVoiceEnabled() {
    return this.setVoiceEnabled(!this.voiceEnabled);
  }

  _loadVoice(key, url) {
    if (!this.ctx) return;
    if (this.voiceBuffers[key] || this.voicePromises[key]) return;
    this.voicePromises[key] = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`voice fetch ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => this.ctx.decodeAudioData(buf))
      .then((decoded) => {
        this.voiceBuffers[key] = decoded;
        console.info(`[audio] ${key} voice ready (${decoded.duration.toFixed(2)}s)`);
      })
      .catch((err) => {
        console.warn(`[audio] ${key} voice failed to load:`, err);
        this.voicePromises[key] = null; // allow a retry
      });
  }

  // Play the GREEN or RED light clip. One-shots replace each other so the clips
  // never overlap. If still decoding, playback is deferred — and skipped if a
  // newer light was requested in the meantime.
  playVoice(key) {
    if (this.muted || !this.voiceEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;
    this.voiceReq = key;

    const buf = this.voiceBuffers[key];
    if (buf) {
      this._startVoice(buf);
      return;
    }
    const url = key === "green" ? "GREEN.mp3" : "RED.mp3";
    this._loadVoice(key, url);
    const p = this.voicePromises[key];
    if (p) {
      p.then(() => {
        if (!this.muted && this.voiceEnabled && this.voiceReq === key && this.voiceBuffers[key]) {
          this._startVoice(this.voiceBuffers[key]);
        }
      });
    }
  }

  _startVoice(buffer) {
    this.stopVoice();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = this.voiceVolume; // louder than the music bed
    src.connect(gain);
    gain.connect(this.ctx.destination);
    try {
      src.start(0);
    } catch (e) {
      /* already started */
    }
    this.voiceSrc = src;
    this.voiceGain = gain;
    src.onended = () => {
      if (this.voiceSrc === src) this.voiceSrc = null;
    };

    // Duck the music while the tag speaks, then bring it back. A timed restore
    // is used because the clips carry trailing silence after the spoken line.
    this._duckMusic(true);
    clearTimeout(this._voiceDuckTimer);
    this._voiceDuckTimer = setTimeout(() => {
      this._voiceDuckTimer = null;
      this._duckMusic(false);
    }, 2900);
  }

  // Lower the music bed while a voice tag plays so the tag is always on top.
  _duckMusic(on) {
    if (!this.musicBus || !this.ctx) return;
    const now = this.ctx.currentTime;
    const target = on ? Math.max(0.03, this.musicVolume * 0.12) : this.musicVolume;
    try {
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setTargetAtTime(target, now, 0.06);
    } catch (e) {
      this.musicBus.gain.value = target;
    }
  }

  stopVoice() {
    clearTimeout(this._voiceDuckTimer);
    this._voiceDuckTimer = null;
    if (this.voiceSrc) {
      try {
        this.voiceSrc.stop();
        this.voiceSrc.disconnect();
      } catch (e) {
        /* noop */
      }
      this.voiceSrc = null;
    }
    if (this.voiceGain) {
      try {
        this.voiceGain.disconnect();
      } catch (e) {
        /* noop */
      }
      this.voiceGain = null;
    }
    this._duckMusic(false);
  }

  _musicTick() {
    const STEP = 60 / 128 / 4; // 128 BPM 16th note
    while (this.musicNextTime < this.ctx.currentTime + 0.12) {
      this._musicStep(this.musicStep, this.musicNextTime);
      this.musicStep = (this.musicStep + 1) % 32;
      this.musicNextTime += STEP;
    }
  }

  // One 16th-note slot of the 2-bar pattern
  _musicStep(step, t) {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;

    // Kick: four-on-the-floor
    if (step % 4 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.2);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + 0.26);

      // Sidechain-style duck: pump the bassline with the kick
      const bg = this.musicBassGain && this.musicBassGain.gain;
      if (bg) {
        bg.setValueAtTime(0.35, t);
        bg.linearRampToValueAtTime(1.0, t + 0.18);
      }
    }

    // Clap on beats 2 and 4
    if (step % 8 === 4) {
      this._musicNoise(t, 0.09, "bandpass", 1800, 0.32, 1.2);
    }

    // Hats: offbeat 8ths (open hat at the end of each bar)
    if (step % 4 === 2) {
      const open = step % 16 === 14;
      this._musicNoise(t, open ? 0.12 : 0.035, "highpass", 7000, open ? 0.16 : 0.11, 1);
    }

    // Rolling bassline (A minor techno)
    const note = MUSIC_BASS[step];
    if (note) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = "sawtooth";
      o.frequency.value = note;
      f.type = "lowpass";
      f.frequency.value = 520;
      const strong = step % 4 === 0;
      g.gain.setValueAtTime(strong ? 0.3 : 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(f);
      f.connect(g);
      g.connect(this.musicBassGain);
      o.start(t);
      o.stop(t + 0.14);
    }

    // Arpeggio lead on 8ths with a dotted-8th echo
    if (step % 2 === 0) {
      const freq = MUSIC_LEAD[step / 2];
      this._musicPluck(freq, t, 0.075);
      this._musicPluck(freq, t + 3 * (60 / 128 / 4), 0.03);
    }
  }

  // Short filtered noise hit (hats / clap)
  _musicNoise(t, dur, type, freq, gainVal, q) {
    const ctx = this.ctx;
    if (!this._noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      this._noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // Short square pluck for the lead arp
  _musicPluck(freq, t, gainVal) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    f.type = "lowpass";
    f.frequency.value = 2600;
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.16);
  }
}

// 2-bar A minor rolling bassline (Hz), one entry per 16th note
const MUSIC_BASS = [
  55, 0, 55, 110, 0, 55, 0, 0, 65.41, 0, 55, 0, 110, 0, 49, 0,
  55, 0, 55, 110, 0, 55, 0, 0, 82.41, 0, 73.42, 0, 49, 0, 110, 0,
];

// Arpeggio lead melody (Hz), one entry per 8th note
const MUSIC_LEAD = [
  440, 523.25, 659.25, 880, 783.99, 659.25, 587.33, 523.25,
  440, 523.25, 659.25, 880, 1046.5, 880, 783.99, 659.25,
];

export const audio = new SoundSystem();
