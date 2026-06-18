import { ICE_SERVERS } from './constants.js';

function send(dc, msg) {
  if (dc?.readyState === 'open') {
    dc.send(JSON.stringify(msg));
  }
}

export class HostPeerManager {
  constructor(signalingSocket, mySocketId) {
    this.signaling = signalingSocket;
    this.mySocketId = mySocketId;
    this.peers = new Map();
    this.onMessage = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
  }

  async connectGuest(guestSocketId) {
    if (this.peers.has(guestSocketId)) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const entry = { pc, dc: null, connected: false };
    this.peers.set(guestSocketId, entry);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signaling.emit('webrtc-signal', {
          to: guestSocketId,
          signal: { candidate: e.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(guestSocketId);
      }
    };

    const dc = pc.createDataChannel('game');
    this.setupChannel(guestSocketId, dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.signaling.emit('webrtc-signal', {
      to: guestSocketId,
      signal: { sdp: pc.localDescription },
    });
  }

  setupChannel(guestSocketId, dc) {
    const entry = this.peers.get(guestSocketId);
    if (!entry) return;
    entry.dc = dc;

    dc.onopen = () => {
      entry.connected = true;
      this.onPeerConnected?.(guestSocketId);
    };

    dc.onclose = () => {
      this.removePeer(guestSocketId);
    };

    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this.onMessage?.(guestSocketId, msg);
      } catch {
        /* ignore */
      }
    };
  }

  async handleSignal(fromSocketId, signal) {
    const entry = this.peers.get(fromSocketId);
    if (!entry) return;
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

  removePeer(guestSocketId) {
    const entry = this.peers.get(guestSocketId);
    if (!entry) return;
    entry.dc?.close();
    entry.pc?.close();
    this.peers.delete(guestSocketId);
    this.onPeerDisconnected?.(guestSocketId);
  }

  destroy() {
    for (const id of [...this.peers.keys()]) {
      this.removePeer(id);
    }
  }
}

export class GuestPeerManager {
  constructor(signalingSocket, hostSocketId) {
    this.signaling = signalingSocket;
    this.hostSocketId = hostSocketId;
    this.pc = null;
    this.dc = null;
    this.onMessage = null;
    this.onConnected = null;
    this.onDisconnected = null;
  }

  async handleSignal(signal) {
    if (!this.pc) {
      this.pc = new RTCPeerConnection(ICE_SERVERS);

      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.signaling.emit('webrtc-signal', {
            to: this.hostSocketId,
            signal: { candidate: e.candidate.toJSON() },
          });
        }
      };

      this.pc.onconnectionstatechange = () => {
        if (this.pc.connectionState === 'connected') {
          this.onConnected?.();
        }
        if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
          this.onDisconnected?.();
        }
      };

      this.pc.ondatachannel = (e) => {
        this.dc = e.channel;
        this.setupChannel();
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

  setupChannel() {
    if (!this.dc) return;

    this.dc.onopen = () => {
      this.onConnected?.();
    };

    this.dc.onclose = () => {
      this.onDisconnected?.();
    };

    this.dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this.onMessage?.(msg);
      } catch {
        /* ignore */
      }
    };
  }

  send(msg) {
    send(this.dc, msg);
  }

  destroy() {
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
  }
}
