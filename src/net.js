/**
 * PeerJS (WebRTC) networking layer for Vibing Floor online 1v1.
 *
 * Free cloud broker (0.peerjs.com) + STUN for NAT traversal. P2P only,
 * no paid servers. Host-authoritative: the host runs the full simulation,
 * the guest is a thin client that sends input and renders snapshots.
 *
 * Wire protocol (JSON DataConnection):
 *   guest -> host: hello {char} | input {mx,mz,jump,push,spear,grenade} |
 *                  restart {} | ping {}
 *   host -> guest: hello {char, map} | start {map, round} |
 *                  snap {…} | reset {round, scores} | pong {}
 *
 * PeerJS is imported LAZILY (first host()/join() call) so the single-player
 * game still boots even if the CDN is unreachable.
 */

// STUN + the free PeerJS cloud TURN relays. Mobile carriers put phones
// behind carrier-grade NAT where STUN alone cannot punch through — TURN is
// what makes the connection work in practice. Same credentials as PeerJS's
// own default config.
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  {
    urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"],
    username: "peerjs",
    credential: "peerjsp",
  },
];

// Unambiguous room-code alphabet (no 0/O, 1/I/L)
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

let PeerCtor = null;

async function loadPeer() {
  if (!PeerCtor) {
    const mod = await import("peerjs");
    PeerCtor = mod.default || mod.Peer;
  }
  return PeerCtor;
}

function genRoomCode() {
  let out = "VF";
  for (let i = 0; i < 4; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export class Net {
  constructor() {
    this.peer = null;
    this.conn = null; // guest: the single connection to the host (legacy alias)
    this.conns = new Map(); // host: peerId -> DataConnection (multiconnection for N-player)
    this.nextGuestId = 1; // host: assigns a stable roster id to each guest
    this.maxConns = 1; // host: 1 = classic 1v1, N-1 = N-player match
    this.role = null; // "host" | "guest" | null
    this.status = "idle"; // idle | starting | waiting | connecting | connected | error | closed
    this.roomCode = "";
    this.closedByUs = false;

    // Callbacks wired by main.js
    this.onStatus = null; // (status, info) => void
    this.onMessage = null; // (msg, meta) => void — meta: { peerId } (host side)
    this.onOpen = null; // () => void — first side connected
    this.onGuestJoin = null; // (peerId, rosterId, msg) => void — host: a guest said hello
    this.onGuestLeave = null; // (peerId) => void — host: a guest disconnected
    this.onClosed = null; // () => void — fatal (guest lost host / no conns left)
  }

  setStatus(status, info = "") {
    this.status = status;
    if (this.onStatus) this.onStatus(status, info);
  }

  /** Host a room: create a peer with a short readable room code.
   *  maxConns = how many guests may join (1 => classic 1v1). */
  async host(maxConns = 1) {
    this.teardown();
    this.role = "host";
    this.maxConns = Math.max(1, maxConns | 0);
    this.closedByUs = false;
    this.setStatus("starting", "Contacting peer server…");
    try {
      await loadPeer();
    } catch {
      this.setStatus("error", "Network module failed to load");
      this.onClosedSafe();
      return;
    }
    this.createPeer(genRoomCode());
  }

  /** Join a room by code. */
  async join(code) {
    this.teardown();
    this.role = "guest";
    this.closedByUs = false;
    this.roomCode = String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!this.roomCode) {
      this.setStatus("error", "Enter a room code");
      return;
    }
    this.setStatus("connecting", `Joining ${this.roomCode}…`);
    try {
      await loadPeer();
    } catch {
      this.setStatus("error", "Network module failed to load");
      this.onClosedSafe();
      return;
    }
    this.createPeer();
  }

  createPeer(id) {
    const Peer = PeerCtor;
    const peer = id
      ? new Peer(id, { debug: 0, config: { iceServers: ICE_SERVERS } })
      : new Peer({ debug: 0, config: { iceServers: ICE_SERVERS } });
    this.peer = peer;

    peer.on("open", (peerId) => {
      if (this.role === "host") {
        this.roomCode = peerId;
        this.setStatus("waiting", peerId);
      } else if (this.role === "guest") {
        // Connect to the host now that we have a broker connection.
        const conn = peer.connect(this.roomCode, {
          reliable: true,
          serialization: "json",
          metadata: { game: "vibing-floor" },
        });
        this.wireConn(conn);
      }
    });

    // Host: accept incoming connections from guests (up to maxConns).
    peer.on("connection", (conn) => {
      if (this.role !== "host") {
        try { conn.close(); } catch { /* noop */ }
        return;
      }
      if (this.conns.size >= this.maxConns) {
        // Room full — close the extra guest (it will see the conn close).
        try { conn.close(); } catch { /* noop */ }
        return;
      }
      this.wireConn(conn);
    });

    peer.on("error", (err) => {
      const type = err && err.type ? err.type : "error";
      if (type === "unavailable-id" && this.role === "host") {
        // Room code collision — pick a new one and retry.
        this.createPeer(genRoomCode());
        return;
      }
      if (type === "peer-unavailable") {
        this.setStatus("error", "Room not found — check the code");
        this.onClosedSafe();
        return;
      }
      if (type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed") {
        this.setStatus("error", "Peer server unreachable");
        this.onClosedSafe();
        return;
      }
      this.setStatus("error", type);
    });

    peer.on("disconnected", () => {
      // Lost the signalling server. Existing P2P connections keep working,
      // but new ones are impossible — treat as fatal for the match.
      const hasConns = (this.conns && this.conns.size > 0) || !!this.conn;
      if (!this.closedByUs && hasConns) {
        this.setStatus("error", "Signalling server lost");
        this.onClosedSafe();
      }
    });
  }

  wireConn(conn) {
    const peerId = conn.peer; // guest's peer id (host side); undefined on the guest

    if (this.role === "host") {
      // Multi-connection host: track each guest by its peer id.
      this.conns.set(peerId, conn);
    } else {
      this.conn = conn; // guest: single connection to the host
    }

    conn.on("open", () => {
      if (this.role === "host") {
        // First guest connected => the room is live.
        this.setStatus("connected");
        if (this.onOpen) this.onOpen();
      } else {
        this.setStatus("connected");
        if (this.onOpen) this.onOpen();
      }
    });

    conn.on("data", (msg) => {
      if (!msg || !this.onMessage) return;
      // Host routes per-guest so the game knows WHO sent input/hello.
      this.onMessage(msg, this.role === "host" ? { peerId } : undefined);
    });

    conn.on("close", () => {
      if (this.closedByUs) return;
      if (this.role === "host") {
        // A single guest left — remove it, keep the match alive for the rest.
        this.conns.delete(peerId);
        if (this.onGuestLeave) this.onGuestLeave(peerId);
        if (this.conns.size === 0) {
          this.setStatus("closed", "All guests disconnected");
          this.onClosedSafe();
        }
        return;
      }
      // Guest lost the host => fatal.
      this.setStatus("closed", "Opponent disconnected");
      this.onClosedSafe();
    });

    conn.on("error", (err) => {
      if (this.closedByUs) return;
      const type = err && err.type ? err.type : "error";
      if (this.role === "host") {
        this.conns.delete(peerId);
        if (this.onGuestLeave) this.onGuestLeave(peerId);
        if (this.conns.size === 0) {
          this.setStatus("error", `Connection error: ${type}`);
          this.onClosedSafe();
        }
        return;
      }
      this.setStatus("error", `Connection error: ${type}`);
      this.onClosedSafe();
    });
  }

  onClosedSafe() {
    if (this.closedByUs) return;
    this.closedByUs = true;
    if (this.onClosed) this.onClosed();
  }

  /** Send a JSON message to ALL connected guests (host) / the host (guest).
   *  No-op when nothing is connected. */
  send(msg) {
    if (this.role === "host") {
      let any = false;
      for (const conn of this.conns.values()) {
        if (conn && conn.open) {
          try { conn.send(msg); any = true; } catch { /* skip */ }
        }
      }
      return any;
    }
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(msg);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** Send to ONE guest by peer id (host only). */
  sendTo(peerId, msg) {
    const conn = this.conns.get(peerId);
    if (conn && conn.open) {
      try { conn.send(msg); return true; } catch { /* noop */ }
    }
    return false;
  }

  /** How many guests are connected right now (0 for a guest client). */
  connectedCount() {
    if (this.role !== "host") return this.conn && this.conn.open ? 1 : 0;
    let n = 0;
    for (const conn of this.conns.values()) if (conn && conn.open) n++;
    return n;
  }

  /** Leave the current room / destroy the peer (safe to call anytime). */
  leave() {
    this.closedByUs = true;
    this.teardown();
    this.setStatus("idle");
  }

  teardown() {
    // Close every guest connection (host) or the single one (guest).
    if (this.conns && this.conns.size) {
      for (const conn of this.conns.values()) {
        try { conn.close(); } catch { /* noop */ }
      }
      this.conns.clear();
    }
    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        /* noop */
      }
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        /* noop */
      }
      this.peer = null;
    }
    this.role = null;
    this.roomCode = "";
    this.nextGuestId = 1;
    this.maxConns = 1;
  }
}
