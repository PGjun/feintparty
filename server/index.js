import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 3001;
const MAX_PLAYERS = 6;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getLobbyState(room) {
  return {
    code: room.code,
    players: room.players.map((p) => ({ id: p.id, name: p.name, score: 0 })),
    maxPlayers: MAX_PLAYERS,
    status: 'waiting',
    hostId: room.hostId,
  };
}

function broadcastLobby(room) {
  const state = getLobbyState(room);
  io.to(room.code).emit('lobby-update', state);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

io.on('connection', (socket) => {
  socket.on('create-room', ({ name }) => {
    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

    const room = {
      code,
      hostId: socket.id,
      players: [{ id: socket.id, name }],
      status: 'waiting',
    };

    rooms.set(code, room);
    socket.join(code);
    socket.roomCode = code;

    socket.emit('room-joined', {
      code,
      isHost: true,
      hostId: socket.id,
      ...getLobbyState(room),
    });
  });

  socket.on('join-room', ({ code, name }) => {
    const room = rooms.get(code.toUpperCase());
    if (!room) {
      socket.emit('error', '방을 찾을 수 없어요.');
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('error', `방이 가득 찼어요. (최대 ${MAX_PLAYERS}명)`);
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

    room.players.push({ id: socket.id, name });
    socket.join(code);
    socket.roomCode = room.code;

    socket.emit('room-joined', {
      code: room.code,
      isHost: false,
      hostId: room.hostId,
      ...getLobbyState(room),
    });

    broadcastLobby(room);
    io.to(room.hostId).emit('peer-joined', { socketId: socket.id, name });
  });

  socket.on('webrtc-signal', ({ to, signal }) => {
    io.to(to).emit('webrtc-signal', { from: socket.id, signal });
  });

  socket.on('game-started', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    room.status = 'playing';
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    if (socket.id === room.hostId) {
      io.to(code).emit('room-closed', '방장이 나갔어요. 방이 종료됩니다.');
      rooms.delete(code);
      return;
    }

    room.players = room.players.filter((p) => p.id !== socket.id);
    if (room.players.length === 0) {
      rooms.delete(code);
    } else {
      io.to(room.hostId).emit('peer-left', { socketId: socket.id });
      broadcastLobby(room);
    }
  });
});

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🎨 Feint Painting 신호 서버: http://localhost:${PORT}`);
  console.log('   게임 처리는 방장 기기(WebRTC P2P)에서 실행됩니다.');
});
