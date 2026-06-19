import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getGame } from '../games/registry.js';
import { appendMessage, mergeEngineRoom } from './roomState.js';
import { formatToastMessage } from './toast.js';
import { setUrlParams } from './url.js';

const SESSION_KEY = 'feintparty-session';

function saveSession(code, name) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, name, active: true }));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useRoomSession() {
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myName, setMyName] = useState('');
  const [myId, setMyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [signalingStatus, setSignalingStatus] = useState(null);

  const socketRef = useRef(null);
  const canvasRef = useRef(null);
  const lobbyPlayersRef = useRef([]);
  const isHostRef = useRef(false);
  const myNameRef = useRef('');
  const roomCodeRef = useRef(null);
  const gameIdRef = useRef(null);
  const intentionalLeaveRef = useRef(false);
  const toastTimerRef = useRef(null);
  const userActionRef = useRef(null);
  const roomJoinedRef = useRef(false);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message) => {
      dismissToast();
      setToast(formatToastMessage(message));
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 3200);
    },
    [dismissToast]
  );

  const activeGame = room?.gameId ? getGame(room.gameId) : null;

  useEffect(() => {
    gameIdRef.current = room?.gameId ?? null;
  }, [room?.gameId]);

  const emitGameInput = useCallback((msg) => {
    const code = roomCodeRef.current;
    if (!code) return;
    socketRef.current?.emit('game-input', { code, msg });
  }, []);

  const sessionCtx = useMemo(
    () => ({
      isHost,
      emitGameInput,
      myId,
      myName,
      room,
      roomCode,
      canvasRef,
      socketRef,
      setRoom,
    }),
    [isHost, emitGameInput, myId, myName, room, roomCode]
  );

  const handlers = useMemo(
    () => (activeGame ? activeGame.createHandlers(sessionCtx) : {}),
    [activeGame, sessionCtx]
  );

  const applyRoomData = useCallback((socket, data, { isReconnect = false } = {}) => {
    setRoomCode(data.code);
    roomCodeRef.current = data.code;
    roomJoinedRef.current = true;
    setIsHost(data.isHost);
    isHostRef.current = data.isHost;
    setSignalingStatus(null);
    lobbyPlayersRef.current = data.players;
    saveSession(data.code, myNameRef.current);
    setUrlParams({ gameId: data.gameId, roomCode: data.code });

    setRoom((prev) => ({
      code: data.code,
      gameId: data.gameId,
      hostId: data.hostId,
      players: data.players.map((p) => {
        const existing = prev?.players?.find((x) => x.name === p.name);
        return { ...p, score: existing?.score ?? 0 };
      }),
      maxPlayers: data.maxPlayers,
      status: data.status ?? prev?.status ?? 'waiting',
      messages: data.messages ?? (isReconnect ? (prev?.messages ?? []) : []),
      myId: socket.id,
      isDrawer: false,
    }));
  }, []);

  const applyGameSelected = useCallback((gameId, code) => {
    const game = getGame(gameId);
    if (!game) return;

    setRoom((prev) =>
      prev
        ? {
            ...prev,
            gameId,
            maxPlayers: game.maxPlayers,
          }
        : prev
    );
    setUrlParams({ gameId, roomCode: code });
  }, []);

  const handleHostMigration = useCallback((socket, data) => {
    const amNewHost = socket.id === data.newHostId;
    setIsHost(amNewHost);
    isHostRef.current = amNewHost;
    lobbyPlayersRef.current = data.players;
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            hostId: data.newHostId,
            gameId: data.gameId ?? prev.gameId,
            players: data.players.map((p) => {
              const existing = prev.players.find((x) => x.name === p.name);
              return { ...existing, ...p, score: existing?.score ?? 0 };
            }),
            status: data.status ?? prev.status,
          }
        : prev
    );
  }, []);

  useEffect(() => {
    intentionalLeaveRef.current = false;

    const requestRejoin = ({ warn = false } = {}) => {
      const session = readSession();
      if (!session?.active || !session?.code || !session?.name) return;
      if (warn && roomJoinedRef.current) {
        setSignalingStatus({ level: 'warn', text: '🔄 서버 재연결 중...' });
      }
      socketRef.current?.emit('rejoin-room', { code: session.code, name: session.name });
    };

    const socket = io({
      transports: ['polling', 'websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setMyId(socket.id);

      if (roomJoinedRef.current) {
        requestRejoin({ warn: true });
        return;
      }

      const session = readSession();
      if (session?.active && session?.code && session?.name && !intentionalLeaveRef.current) {
        socket.emit('rejoin-room', { code: session.code, name: session.name });
      }
    });

    socket.io.on('reconnect', () => {
      if (intentionalLeaveRef.current) return;
      requestRejoin({ warn: true });
    });

    socket.on('disconnect', () => {
      if (roomCodeRef.current && !intentionalLeaveRef.current) {
        setSignalingStatus({ level: 'warn', text: '🔄 서버 연결 끊김, 재연결 중...' });
      }
    });

    socket.on('connect_error', () => {
      showToast('서버에 연결할 수 없어요.');
      setSignalingStatus({ level: 'error', text: '🔴 서버 연결 실패' });
    });

    socket.on('lobby-chat', ({ message }) => {
      setRoom((prev) =>
        prev ? { ...prev, messages: appendMessage(prev.messages, message) } : prev
      );
    });

    socket.on('room-membership-lost', () => {
      requestRejoin({ warn: true });
    });

    socket.on('game-state', (state) => {
      setRoom((prev) => (prev ? mergeEngineRoom(prev, state) : state));
    });

    socket.on('game-event', (msg) => {
      const game = gameIdRef.current ? getGame(gameIdRef.current) : null;
      if (!game) return;
      game.handleGuestMessage(msg, { setRoom, canvasRef });
    });

    socket.on('room-joined', (data) => {
      userActionRef.current = null;
      dismissToast();
      applyRoomData(socket, data);
    });

    socket.on('room-rejoined', (data) => {
      userActionRef.current = null;
      dismissToast();
      applyRoomData(socket, data, { isReconnect: true });
      setSignalingStatus({ level: 'ok', text: '서버 재접속 완료' });
      setTimeout(() => setSignalingStatus(null), 2500);
    });

    socket.on('return-to-lobby', () => {
      canvasRef.current?.clear();
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              gameId: null,
              status: 'waiting',
              players: prev.players.map((p) => ({ ...p, score: 0 })),
              isDrawer: false,
              chatDisabled: false,
            }
          : prev
      );
      setUrlParams({ gameId: null, roomCode: roomCodeRef.current });
    });

    socket.on('lobby-update', (data) => {
      lobbyPlayersRef.current = data.players;
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              gameId: 'gameId' in data ? data.gameId : prev.gameId,
              hostId: data.hostId ?? prev.hostId,
              maxPlayers: data.maxPlayers ?? prev.maxPlayers,
              players: data.players.map((p) => ({
                ...p,
                score: prev.players.find((x) => x.id === p.id || x.name === p.name)?.score ?? 0,
              })),
            }
          : prev
      );
    });

    socket.on('game-selected', ({ gameId }) => {
      applyGameSelected(gameId, roomCodeRef.current);
    });

    socket.on('host-migrated', (data) => {
      handleHostMigration(socket, data);
      setSignalingStatus({
        level: 'warn',
        text:
          socket.id === data.newHostId
            ? '👑 방장 권한을 이어받았어요'
            : `👑 ${data.newHostName}님이 새 방장이에요`,
      });
      setTimeout(() => setSignalingStatus(null), 4000);
    });

    socket.on('room-closed', (msg) => {
      lobbyPlayersRef.current = [];
      canvasRef.current?.clear();
      roomCodeRef.current = null;
      roomJoinedRef.current = false;
      clearSession();

      showToast(msg);
      setRoom(null);
      setRoomCode(null);
      setSignalingStatus(null);
      setUrlParams({ gameId: null, roomCode: null });
    });

    socket.on('error', (msg) => {
      const fromUser = userActionRef.current;
      userActionRef.current = null;

      if (msg === '방을 찾을 수 없어요.' || (typeof msg === 'string' && msg.includes('재접속'))) {
        clearSession();
        setSignalingStatus(null);
      }

      if (msg === '방을 찾을 수 없어요.' && fromUser !== 'join') {
        return;
      }

      if (typeof msg === 'string' && msg.includes('재접속') && !fromUser) {
        return;
      }

      showToast(msg);
    });

    return () => {
      intentionalLeaveRef.current = true;
      dismissToast();
      socket.disconnect();
    };
  }, [
    applyGameSelected,
    applyRoomData,
    handleHostMigration,
    dismissToast,
    showToast,
  ]);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  const sendChat = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const code = roomCodeRef.current;
    if (!code) return;

    if (gameIdRef.current) {
      socketRef.current?.emit('game-input', { code, msg: { type: 'chat', text: trimmed } });
    } else {
      socketRef.current?.emit('lobby-chat', { code, text: trimmed });
    }
  }, []);

  const createRoom = useCallback(
    (name) => {
      myNameRef.current = name;
      setMyName(name);
      userActionRef.current = 'create';
      dismissToast();
      setSignalingStatus(null);
      socketRef.current?.emit('create-room', { name });
    },
    [dismissToast]
  );

  const joinRoom = useCallback(
    (code, name) => {
      myNameRef.current = name;
      setMyName(name);
      userActionRef.current = 'join';
      dismissToast();
      setSignalingStatus(null);
      socketRef.current?.emit('join-room', { code, name });
    },
    [dismissToast]
  );

  const selectGame = useCallback(
    (gameId) => {
      if (!isHostRef.current || !roomCode) return;
      const game = getGame(gameId);
      if (!game) return;
      if (lobbyPlayersRef.current.length < game.minPlayers) return;

      socketRef.current?.emit('select-game', {
        code: roomCode,
        gameId,
        minPlayers: game.minPlayers,
      });
    },
    [roomCode]
  );

  const returnToLobby = useCallback(() => {
    if (!isHostRef.current || !roomCodeRef.current) return;

    canvasRef.current?.clear();
    socketRef.current?.emit('leave-game', { code: roomCodeRef.current });

    setRoom((prev) =>
      prev
        ? {
            ...prev,
            gameId: null,
            status: 'waiting',
            maxPlayers: prev.maxPlayers,
            players: prev.players.map((p) => ({ ...p, score: 0 })),
            isDrawer: false,
            chatDisabled: false,
          }
        : prev
    );
    setUrlParams({ gameId: null, roomCode: roomCodeRef.current });
  }, []);

  const leaveRoom = useCallback(() => {
    intentionalLeaveRef.current = true;
    lobbyPlayersRef.current = [];
    canvasRef.current?.clear();
    clearSession();

    const socket = socketRef.current;
    if (socket) {
      socket.disconnect();
      socket.connect();
    }

    setRoom(null);
    setRoomCode(null);
    roomCodeRef.current = null;
    roomJoinedRef.current = false;
    setIsHost(false);
    isHostRef.current = false;
    setSignalingStatus(null);
    dismissToast();
    setUrlParams({ gameId: null, roomCode: null });
  }, [dismissToast]);

  return {
    room,
    activeGame,
    isHost,
    toast,
    dismissToast,
    signalingStatus,
    canvasRef,
    createRoom,
    joinRoom,
    selectGame,
    returnToLobby,
    leaveRoom,
    sendChat,
    handlers,
  };
}
