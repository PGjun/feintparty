import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { GameHost } from './gameHost.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 3001;
const DEFAULT_MAX_PLAYERS = 6;
const RECONNECT_GRACE_MS = 60_000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const rooms = new Map();
const gameHost = new GameHost(io);

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom(code, hostId, hostName, mode = 'p2p') {
  return {
    code,
    mode,
    gameId: null,
    hostId,
    players: [{ id: hostId, name: hostName }],
    maxPlayers: DEFAULT_MAX_PLAYERS,
    status: 'waiting',
    graceSlots: new Map(),
    lobbyMessages: [],
  };
}

function getLobbyState(room) {
  return {
    code: room.code,
    mode: room.mode,
    gameId: room.gameId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, score: 0 })),
    maxPlayers: room.maxPlayers,
    status: room.status,
    hostId: room.hostId,
  };
}

function broadcastLobby(room) {
  io.to(room.code).emit('lobby-update', getLobbyState(room));
}

function isServerRoom(room) {
  return room?.mode === 'server';
}

function syncServerPlayers(room) {
  if (!isServerRoom(room) || !gameHost.hasEngine(room.code)) return;
  gameHost.setPlayers(room);
}

function sendServerGameState(socket, room) {
  gameHost.sendPlayerState(room, socket.id);
}

function pruneGraceSlots(room) {
  const now = Date.now();
  for (const [name, slot] of room.graceSlots) {
    if (slot.graceUntil <= now) {
      const wasSoloHostGrace =
        slot.oldSocketId === room.hostId && room.players.length === 0;
      room.graceSlots.delete(name);
      if (wasSoloHostGrace) {
        gameHost.destroyEngine(room.code);
        rooms.delete(room.code);
      }
    }
  }
}

function findGraceSlot(room, name) {
  pruneGraceSlots(room);
  const slot = room.graceSlots.get(name);
  if (!slot || slot.graceUntil <= Date.now()) {
    room.graceSlots.delete(name);
    return null;
  }
  return slot;
}

function addGraceSlot(room, player) {
  room.graceSlots.set(player.name, {
    name: player.name,
    oldSocketId: player.id,
    graceUntil: Date.now() + RECONNECT_GRACE_MS,
  });
}

function emitRoomJoined(socket, room, { isHost, isReconnect = false }) {
  socket.emit(isReconnect ? 'room-rejoined' : 'room-joined', {
    code: room.code,
    mode: room.mode,
    isHost,
    isReconnect,
    hostId: room.hostId,
    gameId: room.gameId,
    status: room.status,
    messages: room.lobbyMessages ?? [],
    ...getLobbyState(room),
  });

  if (isServerRoom(room) && room.gameId) {
    const engine = gameHost.getEngine(room.code);
    if (engine) sendServerGameState(socket, room);
  }
}

function tryMigrateHost(room, code, oldHostId) {
  if (room.players.length === 0) {
    gameHost.destroyEngine(code);
    rooms.delete(code);
    return false;
  }

  room.hostId = room.players[0].id;

  if (isServerRoom(room)) {
    gameHost.replacePlayerId(room, oldHostId, room.hostId);
    syncServerPlayers(room);
  }

  io.to(code).emit('host-migrated', {
    ...getLobbyState(room),
    newHostId: room.hostId,
    newHostName: room.players[0].name,
  });
  broadcastLobby(room);
  return true;
}

function handlePlayerReconnect(socket, room, name, grace) {
  const oldSocketId = grace?.oldSocketId;
  const existingIdx = room.players.findIndex((p) => p.name === name);
  const previousSocketId = existingIdx >= 0 ? room.players[existingIdx].id : oldSocketId;
  const shouldRestoreHost = previousSocketId && room.hostId === previousSocketId;

  if (existingIdx >= 0) {
    room.players[existingIdx].id = socket.id;
  } else {
    room.players.push({ id: socket.id, name });
  }

  if (shouldRestoreHost) {
    room.hostId = socket.id;
  }

  if (grace) {
    room.graceSlots.delete(name);
  }

  leaveSocketRoom(socket);
  socket.join(room.code);
  socket.roomCode = room.code;

  const isHost = socket.id === room.hostId;
  emitRoomJoined(socket, room, { isHost, isReconnect: true });

  if (isServerRoom(room)) {
    if (previousSocketId && previousSocketId !== socket.id) {
      gameHost.replacePlayerId(room, previousSocketId, socket.id);
    }
    syncServerPlayers(room);
  } else if (
    previousSocketId &&
    previousSocketId !== socket.id &&
    socket.id !== room.hostId
  ) {
    io.to(room.hostId).emit('peer-rejoined', {
      oldSocketId: previousSocketId,
      newSocketId: socket.id,
      name,
    });
  }

  broadcastLobby(room);
}

function appendLobbyMessage(room, message) {
  room.lobbyMessages = [...(room.lobbyMessages ?? []), message].slice(-50);
  io.to(room.code).emit('lobby-chat', { message });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, supportsServerMode: true });
});

function leaveSocketRoom(socket) {
  const prev = socket.roomCode;
  if (!prev) return;
  socket.leave(prev);
  delete socket.roomCode;
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name, mode = 'p2p' }) => {
    const roomMode = mode === 'server' ? 'server' : 'p2p';
    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

    leaveSocketRoom(socket);
    const room = createRoom(code, socket.id, name, roomMode);
    rooms.set(code, room);
    socket.join(code);
    socket.roomCode = code;

    emitRoomJoined(socket, room, { isHost: true });
  });

  socket.on('join-room', ({ code, name }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) {
      socket.emit('error', '방을 찾을 수 없어요.');
      return;
    }

    const grace = findGraceSlot(room, name);
    if (grace) {
      handlePlayerReconnect(socket, room, name, grace);
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit('error', `방이 가득 찼어요. (최대 ${room.maxPlayers}명)`);
      return;
    }
    if (room.status !== 'waiting') {
      socket.emit('error', '이미 게임이 진행 중이에요.');
      return;
    }
    if (room.players.some((p) => p.name === name)) {
      socket.emit('error', '이미 사용 중인 닉네임이에요.');
      return;
    }

    leaveSocketRoom(socket);
    room.players.push({ id: socket.id, name });
    socket.join(room.code);
    socket.roomCode = room.code;

    emitRoomJoined(socket, room, { isHost: false });
    broadcastLobby(room);
    syncServerPlayers(room);

    if (!isServerRoom(room)) {
      io.to(room.hostId).emit('peer-joined', { socketId: socket.id, name });
    }
  });

  socket.on('rejoin-room', ({ code, name }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) {
      socket.emit('error', '방을 찾을 수 없어요.');
      return;
    }

    const grace = findGraceSlot(room, name);
    const alreadyActive = room.players.some((p) => p.name === name && p.id === socket.id);

    if (alreadyActive) {
      emitRoomJoined(socket, room, { isHost: socket.id === room.hostId, isReconnect: true });
      return;
    }

    if (grace) {
      handlePlayerReconnect(socket, room, name, grace);
      return;
    }

    if (room.players.some((p) => p.name === name)) {
      handlePlayerReconnect(socket, room, name, null);
      return;
    }

    socket.emit('error', '재접속할 수 없어요. 다시 참가해주세요.');
  });

  socket.on('select-game', ({ code, gameId, minPlayers }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room || room.hostId !== socket.id) return;
    if (room.status !== 'waiting' || room.gameId) return;
    if (!gameId) return;

    const required = minPlayers || 2;
    if (room.players.length < required) {
      socket.emit('error', `최소 ${required}명이 필요해요.`);
      return;
    }

    room.gameId = gameId;
    io.to(room.code).emit('game-selected', { gameId });

    if (isServerRoom(room)) {
      gameHost.initEngine(room, { messages: room.lobbyMessages ?? [] });
    }
  });

  socket.on('lobby-chat', ({ code, text }) => {
    const roomCode = (code || socket.roomCode)?.toUpperCase();
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) {
      socket.emit('room-membership-lost');
      return;
    }
    const trimmed = text?.trim();
    if (!trimmed) return;

    if (isServerRoom(room) && gameHost.hasEngine(room.code)) {
      gameHost.handleInput(room, socket.id, player.name, { type: 'chat', text: trimmed });
      return;
    }

    appendLobbyMessage(room, {
      type: 'chat',
      name: player.name,
      text: trimmed,
      time: Date.now(),
    });
  });

  socket.on('game-input', ({ code, msg }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room || !isServerRoom(room)) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player || !msg) return;
    gameHost.handleInput(room, socket.id, player.name, msg);
  });

  socket.on('webrtc-signal', ({ to, signal }) => {
    io.to(to).emit('webrtc-signal', { from: socket.id, signal });
  });

  socket.on('game-started', ({ code }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room || room.hostId !== socket.id) return;
    if (isServerRoom(room)) return;
    room.status = 'playing';
  });

  socket.on('game-finished', ({ code }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room || room.hostId !== socket.id) return;
    if (isServerRoom(room)) return;
    room.status = 'waiting';
  });

  socket.on('leave-game', ({ code }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room || room.hostId !== socket.id) return;

    room.gameId = null;
    room.status = 'waiting';
    if (isServerRoom(room)) {
      gameHost.destroyEngine(room.code);
    }
    io.to(room.code).emit('return-to-lobby');
    broadcastLobby(room);
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    addGraceSlot(room, player);
    room.players = room.players.filter((p) => p.id !== socket.id);

    if (socket.id === room.hostId) {
      const oldHostId = socket.id;
      if (room.players.length === 0) {
        return;
      }
      if (!tryMigrateHost(room, code, oldHostId)) {
        io.to(code).emit('room-closed', '방이 종료됩니다.');
      }
      return;
    }

    if (room.players.length === 0) {
      gameHost.destroyEngine(code);
      rooms.delete(code);
      return;
    }

    syncServerPlayers(room);

    if (!isServerRoom(room)) {
      io.to(room.hostId).emit('peer-left', {
        socketId: socket.id,
        name: player.name,
        graceMs: RECONNECT_GRACE_MS,
      });
    }
    broadcastLobby(room);
  });
});

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Feint Party 서버: http://localhost:${PORT}`);
  console.log('   P2P 모드: 방장 기기에서 게임 실행 | 서버 모드: Node에서 게임 실행');
});
