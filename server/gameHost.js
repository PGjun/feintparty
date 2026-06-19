import { getServerGame } from './gameRegistry.js';

export class GameHost {
  /** @param {import('socket.io').Server} io */
  constructor(io) {
    this.io = io;
    /** @type {Map<string, { engine: object, gameId: string }>} */
    this.rooms = new Map();
  }

  hasEngine(code) {
    return this.rooms.has(code?.toUpperCase());
  }

  getEngine(code) {
    return this.rooms.get(code?.toUpperCase())?.engine ?? null;
  }

  createBroadcaster(room) {
    const sendTo = (toId, msg) => {
      if (msg.type === 'state') {
        this.io.to(toId).emit('game-state', msg.state);
        return;
      }
      this.io.to(toId).emit('game-event', msg);
    };

    return {
      sendTo,
      broadcast: (msg) => {
        room.players.forEach((p) => sendTo(p.id, msg));
      },
      broadcastExcept: (exceptId, msg) => {
        room.players.forEach((p) => {
          if (p.id !== exceptId) sendTo(p.id, msg);
        });
      },
    };
  }

  initEngine(room, { messages = [], backup = null } = {}) {
    const code = room.code.toUpperCase();
    const game = getServerGame(room.gameId);
    if (!game) return;

    this.destroyEngine(code);

    const hostPeers = this.createBroadcaster(room);
    const onGameFinished = () => {
      room.status = 'waiting';
    };

    const engine = game.createEngine(
      room.hostId,
      (toId, msg) => hostPeers.sendTo(toId, msg),
      () => {
        room.players.forEach((p) => {
          this.io.to(p.id).emit('game-event', { type: 'clear' });
        });
      },
      onGameFinished
    );

    engine.setCode(code);

    if (backup && engine.importState) {
      engine.importState(backup);
      engine.setPlayers(room.players);
    } else {
      if (messages.length) {
        engine.setInitialMessages(messages);
      }
      engine.setPlayers(room.players);
      game.onHostEngineReady?.(engine);
    }

    this.rooms.set(code, { engine, gameId: room.gameId });
  }

  destroyEngine(code) {
    const key = code?.toUpperCase();
    const entry = this.rooms.get(key);
    if (!entry) return;
    entry.engine.destroy?.();
    this.rooms.delete(key);
  }

  setPlayers(room) {
    const engine = this.getEngine(room.code);
    engine?.setPlayers(room.players);
  }

  replacePlayerId(room, oldId, newId) {
    const engine = this.getEngine(room.code);
    engine?.replacePlayerId?.(oldId, newId);
  }

  sendPlayerState(room, socketId) {
    const engine = this.getEngine(room.code);
    if (!engine?.getPlayerState) return;
    this.io.to(socketId).emit('game-state', engine.getPlayerState(socketId));
  }

  handleInput(room, socketId, playerName, msg) {
    const code = room.code.toUpperCase();
    let entry = this.rooms.get(code);

    if (!entry && room.gameId) {
      this.initEngine(room, { messages: room.roomMessages ?? [] });
      entry = this.rooms.get(code);
    }
    if (!entry) return false;

    const game = getServerGame(entry.gameId);
    const { engine } = entry;
    if (!game || !engine) return false;

    if (
      entry.gameId === 'yangsechan' &&
      msg.type === 'yang-action' &&
      (msg.action === 'confirm-word' || msg.action === 'submit-word')
    ) {
      const status = engine.getHostState?.()?.status;
      if (status === 'waiting') {
        engine.startAssigning();
      }
    }

    if (msg.type === 'host-start-game') {
      if (socketId !== room.hostId) return true;
      if (entry.gameId === 'feintpainting') {
        engine.startGame(msg.roundCount);
        room.status = 'playing';
      } else if (entry.gameId === 'yangsechan') {
        engine.startAssigning();
      } else if (entry.gameId === 'airhockey') {
        engine.startGame(msg.targetScore);
        room.status = 'playing';
      }
      return true;
    }

    if (msg.type === 'host-return-to-game-waiting') {
      if (socketId !== room.hostId) return true;
      if (entry.gameId === 'airhockey') {
        engine.returnToGameWaiting();
        room.status = 'waiting';
      }
      return true;
    }

    if (msg.type === 'host-begin-playing') {
      if (socketId !== room.hostId) return true;
      engine.beginPlaying?.(() => {
        room.status = 'playing';
      });
      return true;
    }

    return game.handleHostMessage(msg, socketId, {
      engine,
      canvasRef: { current: null },
      hostPeers: this.createBroadcaster(room),
      roomPlayersRef: { current: room.players },
      setRoom: null,
    });
  }
}
