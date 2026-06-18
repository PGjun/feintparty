import { ICE_SERVERS } from './constants.js';

export const HEARTBEAT_INTERVAL_MS = 3000;
export const HEARTBEAT_TIMEOUT_MS = 10000;
export const MAX_RECONNECT_ATTEMPTS = 5;
export const RECONNECT_BASE_DELAY_MS = 1500;

function send(dc, msg) {
  if (dc?.readyState === 'open') {
    dc.send(JSON.stringify(msg));
  }
}

function isSystemMessage(msg) {
  return msg?.type === 'ping' || msg?.type === 'pong';
}

function createPeerEntry(guestSocketId) {
  return {
    guestSocketId,
    pc: null,
    dc: null,
    connected: false,
    reconnecting: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    lastSeen: 0,
  };
}

export class HostPeerManager {
  constructor(signalingSocket, mySocketId) {
    this.signaling = signalingSocket;
    this.mySocketId = mySocketId;
    this.peers = new Map();
    this.onMessage = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
    this.onStatusChange = null;
    this._heartbeatTimer = null;
    this._watchdogTimer = null;
    this._destroyed = false;
    this._startHeartbeat();
  }

  _emitStatus() {
    this.onStatusChange?.(this.getStatus());
  }

  getStatus() {
    const entries = [...this.peers.values()];
    const expected = entries.length;

    if (expected === 0) {
      return { phase: 'idle', connected: 0, expected: 0, isHost: true };
    }

    const connected = entries.filter((e) => e.connected && !e.reconnecting).length;
    const reconnecting = entries.some((e) => e.reconnecting);
    const maxAttempt = Math.max(0, ...entries.map((e) => e.reconnectAttempts));

    if (reconnecting) {
      return {
        phase: 'reconnecting',
        connected,
        expected,
        attempt: maxAttempt,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        isHost: true,
      };
    }

    if (connected === 0) {
      const anyPeer = entries.some((e) => e.pc);
      return {
        phase: anyPeer ? 'connecting' : 'connecting',
        connected: 0,
        expected,
        isHost: true,
      };
    }

    if (connected < expected) {
      return { phase: 'connecting', connected, expected, isHost: true };
    }

    const stale = entries.some(
      (e) => e.connected && e.lastSeen > 0 && Date.now() - e.lastSeen > HEARTBEAT_TIMEOUT_MS
    );
    if (stale) {
      return { phase: 'degraded', connected, expected, isHost: true };
    }

    return { phase: 'connected', connected, expected, isHost: true };
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      if (this._destroyed) return;
      const now = Date.now();
      for (const entry of this.peers.values()) {
        if (entry.dc?.readyState === 'open') {
          send(entry.dc, { type: 'ping', t: now });
        }
      }
      this._emitStatus();
    }, HEARTBEAT_INTERVAL_MS);

    this._watchdogTimer = setInterval(() => {
      if (this._destroyed) return;
      const now = Date.now();
      for (const [guestId, entry] of this.peers) {
        if (!entry.connected || entry.reconnecting) continue;
        if (entry.lastSeen > 0 && now - entry.lastSeen > HEARTBEAT_TIMEOUT_MS) {
          this._scheduleReconnect(guestId, entry);
        }
      }
      this._emitStatus();
    }, HEARTBEAT_INTERVAL_MS);
  }

  _clearReconnectTimer(entry) {
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
  }

  _scheduleReconnect(guestSocketId, entry) {
    if (entry.reconnecting || this._destroyed) return;

    entry.reconnectAttempts += 1;
    if (entry.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      this.removePeer(guestSocketId);
      return;
    }

    entry.reconnecting = true;
    this._emitStatus();

    this._clearReconnectTimer(entry);
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      this._reconnectGuest(guestSocketId);
    }, RECONNECT_BASE_DELAY_MS * entry.reconnectAttempts);
  }

  async _reconnectGuest(guestSocketId) {
    const entry = this.peers.get(guestSocketId);
    if (!entry || this._destroyed) return;

    entry.dc?.close();
    entry.pc?.close();
    entry.dc = null;
    entry.pc = null;
    entry.connected = false;

    try {
      await this._createConnection(guestSocketId, entry);
    } catch {
      this._scheduleReconnect(guestSocketId, entry);
    }
  }

  async connectGuest(guestSocketId) {
    if (this.peers.has(guestSocketId)) {
      const entry = this.peers.get(guestSocketId);
      if (entry.connected || entry.reconnecting || entry.pc) return;
    } else {
      this.peers.set(guestSocketId, createPeerEntry(guestSocketId));
    }

    const entry = this.peers.get(guestSocketId);
    entry.reconnectAttempts = 0;
    entry.reconnecting = false;
    this._clearReconnectTimer(entry);
    this._emitStatus();

    try {
      await this._createConnection(guestSocketId, entry);
    } catch {
      this._scheduleReconnect(guestSocketId, entry);
    }
  }

  async _createConnection(guestSocketId, entry) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    entry.pc = pc;
    entry.dc = null;
    entry.connected = false;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signaling.emit('webrtc-signal', {
          to: guestSocketId,
          signal: { candidate: e.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this._scheduleReconnect(guestSocketId, entry);
      } else if (pc.connectionState === 'closed' && !this._destroyed) {
        this._scheduleReconnect(guestSocketId, entry);
      }
    };

    const dc = pc.createDataChannel('game');
    this._setupChannel(guestSocketId, entry, dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.signaling.emit('webrtc-signal', {
      to: guestSocketId,
      signal: { sdp: pc.localDescription },
    });
  }

  _setupChannel(guestSocketId, entry, dc) {
    entry.dc = dc;

    dc.onopen = () => {
      entry.connected = true;
      entry.reconnecting = false;
      entry.reconnectAttempts = 0;
      entry.lastSeen = Date.now();
      this._clearReconnectTimer(entry);
      this.onPeerConnected?.(guestSocketId);
      this._emitStatus();
    };

    dc.onclose = () => {
      if (this._destroyed) return;
      entry.connected = false;
      this._scheduleReconnect(guestSocketId, entry);
    };

    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'pong') {
          entry.lastSeen = Date.now();
          this._emitStatus();
          return;
        }
        if (isSystemMessage(msg)) return;
        this.onMessage?.(guestSocketId, msg);
      } catch {
        /* ignore */
      }
    };
  }

  async handleSignal(fromSocketId, signal) {
    const entry = this.peers.get(fromSocketId);
    if (!entry?.pc) return;
    const { pc } = entry;

    if (signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    }
    if (signal.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch {
        /* ignore */
      }
    }
  }

  sendTo(guestSocketId, msg) {
    const entry = this.peers.get(guestSocketId);
    send(entry?.dc, msg);
  }

  broadcast(msg) {
    for (const [id] of this.peers) {
      this.sendTo(id, msg);
    }
  }

  broadcastExcept(excludeSocketId, msg) {
    for (const [id] of this.peers) {
      if (id !== excludeSocketId) {
        this.sendTo(id, msg);
      }
    }
  }

  removePeer(guestSocketId, { notify = true } = {}) {
    const entry = this.peers.get(guestSocketId);
    if (!entry) return;

    this._clearReconnectTimer(entry);
    entry.dc?.close();
    entry.pc?.close();
    this.peers.delete(guestSocketId);
    this._emitStatus();

    if (notify) {
      this.onPeerDisconnected?.(guestSocketId);
    }
  }

  destroy() {
    this._destroyed = true;
    clearInterval(this._heartbeatTimer);
    clearInterval(this._watchdogTimer);
    for (const id of [...this.peers.keys()]) {
      this.removePeer(id, { notify: false });
    }
  }
}

export class GuestPeerManager {
  constructor(signalingSocket, hostSocketId) {
    this.signaling = signalingSocket;
    this.hostSocketId = hostSocketId;
    this.pc = null;
    this.dc = null;
    this.connected = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.lastSeen = 0;
    this.onMessage = null;
    this.onConnected = null;
    this.onDisconnected = null;
    this.onStatusChange = null;
    this._watchdogTimer = null;
    this._destroyed = false;
    this._startWatchdog();
  }

  _emitStatus() {
    this.onStatusChange?.(this.getStatus());
  }

  getStatus() {
    if (this._destroyed) {
      return { phase: 'idle', connected: 0, expected: 1, isHost: false };
    }

    if (this.reconnecting) {
      return {
        phase: 'reconnecting',
        connected: 0,
        expected: 1,
        attempt: this.reconnectAttempts,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        isHost: false,
      };
    }

    if (!this.pc) {
      return { phase: 'connecting', connected: 0, expected: 1, isHost: false };
    }

    if (!this.connected) {
      return { phase: 'connecting', connected: 0, expected: 1, isHost: false };
    }

    if (this.lastSeen > 0 && Date.now() - this.lastSeen > HEARTBEAT_TIMEOUT_MS) {
      return { phase: 'degraded', connected: 1, expected: 1, isHost: false };
    }

    return { phase: 'connected', connected: 1, expected: 1, isHost: false };
  }

  _startWatchdog() {
    this._watchdogTimer = setInterval(() => {
      if (this._destroyed || !this.connected || this.reconnecting) return;
      if (this.lastSeen > 0 && Date.now() - this.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        this._scheduleReconnect();
      }
      this._emitStatus();
    }, HEARTBEAT_INTERVAL_MS);
  }

  _clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this.reconnecting || this._destroyed) return;

    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      this.connected = false;
      this.onDisconnected?.();
      this._emitStatus();
      return;
    }

    this.reconnecting = true;
    this.connected = false;
    this._emitStatus();

    this._clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._resetConnection();
    }, RECONNECT_BASE_DELAY_MS * this.reconnectAttempts);
  }

  _resetConnection() {
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.connected = false;
    this.reconnecting = true;
    this._emitStatus();
  }

  setHostSocketId(hostSocketId) {
    this.hostSocketId = hostSocketId;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this._clearReconnectTimer();
    this._resetConnection();
  }

  async handleSignal(signal) {
    if (!this.pc) {
      this.pc = new RTCPeerConnection(ICE_SERVERS);
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      this._emitStatus();

      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.signaling.emit('webrtc-signal', {
            to: this.hostSocketId,
            signal: { candidate: e.candidate.toJSON() },
          });
        }
      };

      this.pc.onconnectionstatechange = () => {
        if (this.pc?.connectionState === 'failed' || this.pc?.connectionState === 'closed') {
          if (!this._destroyed) {
            this._scheduleReconnect();
          }
        }
      };

      this.pc.ondatachannel = (e) => {
        this.dc = e.channel;
        this._setupChannel();
      };
    }

    if (signal.sdp) {
      await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.signaling.emit('webrtc-signal', {
          to: this.hostSocketId,
          signal: { sdp: this.pc.localDescription },
        });
      }
    }

    if (signal.candidate) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch {
        /* ignore */
      }
    }
  }

  _setupChannel() {
    if (!this.dc) return;

    this.dc.onopen = () => {
      this.connected = true;
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      this.lastSeen = Date.now();
      this._clearReconnectTimer();
      this.onConnected?.();
      this._emitStatus();
    };

    this.dc.onclose = () => {
      if (this._destroyed) return;
      this.connected = false;
      this._scheduleReconnect();
    };

    this.dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ping') {
          this.lastSeen = Date.now();
          send(this.dc, { type: 'pong', t: msg.t });
          this._emitStatus();
          return;
        }
        if (isSystemMessage(msg)) return;
        this.lastSeen = Date.now();
        this.onMessage?.(msg);
        this._emitStatus();
      } catch {
        /* ignore */
      }
    };
  }

  send(msg) {
    send(this.dc, msg);
  }

  destroy() {
    this._destroyed = true;
    clearInterval(this._watchdogTimer);
    this._clearReconnectTimer();
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.connected = false;
  }
}
