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

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

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
    this.conn = null;
    this.role = null; // "host" | "guest" | null
    this.status = "idle"; // idle | starting | waiting | connecting | connected | error | closed
    this.roomCode = "";
    this.closedByUs = false;

    // Callbacks wired by main.js
    this.onStatus = null; // (status, info) => void
    this.onMessage = null; // (msg) => void
    this.onOpen = null; // () => void — both sides connected
    this.onClosed = null; // () => void — opponent disconnected / fatal error
  }

  setStatus(status, info = "") {
    this.status = status;
    if (this.onStatus) this.onStatus(status, info);
  }

  /** Host a room: create a peer with a short readable room code. */
  async host() {
    this.teardown();
    this.role = "host";
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

    // Host: accept incoming connection from the guest.
    peer.on("connection", (conn) => {
      if (this.role === "host" && !this.conn) {
        this.wireConn(conn);
      } else {
        // Already connected — refuse duplicates.
        try {
          conn.close();
        } catch {
          /* noop */
        }
      }
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
      if (!this.closedByUs && this.conn) {
        this.setStatus("error", "Signalling server lost");
        this.onClosedSafe();
      }
    });
  }

  wireConn(conn) {
    this.conn = conn;

    conn.on("open", () => {
      this.setStatus("connected");
      if (this.onOpen) this.onOpen();
    });

    conn.on("data", (msg) => {
      if (msg && this.onMessage) this.onMessage(msg);
    });

    conn.on("close", () => {
      if (this.closedByUs) return;
      this.setStatus("closed", "Opponent disconnected");
      this.onClosedSafe();
    });

    conn.on("error", (err) => {
      if (this.closedByUs) return;
      const type = err && err.type ? err.type : "error";
      this.setStatus("error", `Connection error: ${type}`);
      this.onClosedSafe();
    });
  }

  onClosedSafe() {
    if (this.closedByUs) return;
    this.closedByUs = true;
    if (this.onClosed) this.onClosed();
  }

  /** Send a JSON message to the opponent (no-op when not connected). */
  send(msg) {
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

  /** Leave the current room / destroy the peer (safe to call anytime). */
  leave() {
    this.closedByUs = true;
    this.teardown();
    this.setStatus("idle");
  }

  teardown() {
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
  }
}
