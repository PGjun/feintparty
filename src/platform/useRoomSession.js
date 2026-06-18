import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getGame } from '../games/registry.js';
import { HostPeerManager, GuestPeerManager } from './peerNetwork.js';
import { formatP2pStatus } from './p2pStatus.js';
import { appendMessage, mergeEngineRoom } from './roomState.js';
import { formatToastMessage } from './toast.js';
import { setUrlParams } from './url.js';

const SESSION_KEY = 'feintparty-session';
const PEER_GRACE_MS = 60_000;

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

function syncP2pStatus(setP2pStatus, hostPeersRef, guestPeerRef) {
  if (hostPeersRef.current) {
    setP2pStatus(formatP2pStatus(hostPeersRef.current.getStatus()));
  } else if (guestPeerRef.current) {
    setP2pStatus(formatP2pStatus(guestPeerRef.current.getStatus()));
  } else {
    setP2pStatus(null);
  }
}

function attachPeerStatusHandlers(hostPeersRef, guestPeerRef, setP2pStatus) {
  const update = () => syncP2pStatus(setP2pStatus, hostPeersRef, guestPeerRef);

  if (hostPeersRef.current) {
    hostPeersRef.current.onStatusChange = update;
    update();
  }
  if (guestPeerRef.current) {
    guestPeerRef.current.onStatusChange = update;
    update();
  }
}

export function useRoomSession() {
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myName, setMyName] = useState('');
  const [myId, setMyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [p2pStatus, setP2pStatus] = useState(null);
  const [signalingStatus, setSignalingStatus] = useState(null);

  const socketRef = useRef(null);
  const hostPeersRef = useRef(null);
  const guestPeerRef = useRef(null);
  const gameEngineRef = useRef(null);
  const canvasRef = useRef(null);
  const lobbyPlayersRef = useRef([]);
  const engineBackupRef = useRef(null);
  const pendingRemovalsRef = useRef(new Map());
  const isHostRef = useRef(false);
  const myNameRef = useRef('');
  const roomCodeRef = useRef(null);
  const gameIdRef = useRef(null);
  const roomModeRef = useRef('p2p');
  const intentionalLeaveRef = useRef(false);
  const toastTimerRef = useRef(null);
  const userActionRef = useRef(null);
  const pendingCreateModeRef = useRef(null);
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

  const clearPendingRemovals = useCallback(() => {
    for (const timer of pendingRemovalsRef.current.values()) {
      clearTimeout(timer);
    }
    pendingRemovalsRef.current.clear();
  }, []);

  const teardownPeers = useCallback(() => {
    if (guestPeerRef.current) {
      guestPeerRef.current.onDisconnected = null;
      guestPeerRef.current.onConnected = null;
      guestPeerRef.current.onMessage = null;
      guestPeerRef.current.onStatusChange = null;
      guestPeerRef.current.destroy();
      guestPeerRef.current = null;
    }
    if (hostPeersRef.current) {
      hostPeersRef.current.onPeerDisconnected = null;
      hostPeersRef.current.onPeerConnected = null;
      hostPeersRef.current.onMessage = null;
      hostPeersRef.current.onStatusChange = null;
      hostPeersRef.current.destroy();
      hostPeersRef.current = null;
    }
    setP2pStatus(null);
  }, []);

  const activeGame = room?.gameId ? getGame(room.gameId) : null;

  useEffect(() => {
    gameIdRef.current = room?.gameId ?? null;
  }, [room?.gameId]);

  const emitGameInput = useCallback((msg) => {
    const code = roomCodeRef.current;
    if (!code) return;
    socketRef.current?.emit('game-input', { code, msg });
  }, []);

  const isServerMode = room?.mode === 'server';

  const sessionCtx = useMemo(
    () => ({
      isHost,
      isServerMode,
      emitGameInput,
      myId,
      myName,
      room,
      roomCode,
      gameEngineRef,
      hostPeersRef,
      guestPeerRef,
      canvasRef,
      socketRef,
      lobbyPlayersRef,
      setRoom,
      setP2pStatus,
    }),
    [isHost, isServerMode, emitGameInput, myId, myName, room, roomCode]
  );

  const handlers = useMemo(
    () => (activeGame ? activeGame.createHandlers(sessionCtx) : {}),
    [activeGame, sessionCtx]
  );

  const schedulePlayerRemoval = useCallback((socketId) => {
    if (pendingRemovalsRef.current.has(socketId)) {
      clearTimeout(pendingRemovalsRef.current.get(socketId));
    }

    const timer = setTimeout(() => {
      pendingRemovalsRef.current.delete(socketId);
      lobbyPlayersRef.current = lobbyPlayersRef.current.filter((p) => p.id !== socketId);
      gameEngineRef.current?.setPlayers(lobbyPlayersRef.current);
    }, PEER_GRACE_MS);

    pendingRemovalsRef.current.set(socketId, timer);
  }, []);

  const cancelPlayerRemoval = useCallback((socketId) => {
    const timer = pendingRemovalsRef.current.get(socketId);
    if (timer) {
      clearTimeout(timer);
      pendingRemovalsRef.current.delete(socketId);
    }
  }, []);

  const handleHostMessage = useCallback((guestSocketId, msg) => {
    if (msg.type === 'chat' && !gameEngineRef.current) {
      const player = lobbyPlayersRef.current.find((p) => p.id === guestSocketId);
      const message = {
        type: 'chat',
        name: player?.name || '플레이어',
        text: msg.text,
        time: Date.now(),
      };
      setRoom((prev) =>
        prev ? { ...prev, messages: appendMessage(prev.messages, message) } : prev
      );
      hostPeersRef.current?.broadcast({ type: 'chat-sync', message });
      return;
    }

    const game = gameIdRef.current ? getGame(gameIdRef.current) : null;
    const engine = gameEngineRef.current;
    if (!game || !engine) return;

    game.handleHostMessage(msg, guestSocketId, {
      engine,
      canvasRef,
      hostPeers: hostPeersRef.current,
      lobbyPlayersRef,
      setRoom,
    });
  }, []);

  const handleGuestMessage = useCallback((msg) => {
    if (msg.type === 'engine-backup') {
      engineBackupRef.current = msg.backup;
      return;
    }

    if (msg.type === 'chat-sync') {
      setRoom((prev) =>
        prev ? { ...prev, messages: appendMessage(prev.messages, msg.message) } : prev
      );
      return;
    }

    const game = gameIdRef.current ? getGame(gameIdRef.current) : null;
    if (!game) return;

    game.handleGuestMessage(msg, {
      setRoom,
      canvasRef,
    });
  }, []);

  const initHostEngine = useCallback((game, code, initialMessages = [], options = {}) => {
    const { backup = null } = options;
    if (!hostPeersRef.current) return;

    if (gameEngineRef.current) {
      gameEngineRef.current.destroy();
      gameEngineRef.current = null;
    }

    const peers = hostPeersRef.current;
    const engine = game.createEngine(
      socketRef.current.id,
      (toId, msg) => peers.sendTo(toId, msg),
      () => {
        peers.broadcast({ type: 'clear' });
        canvasRef.current?.clear();
      },
      () => {
        socketRef.current?.emit('game-finished', { code });
      }
    );

    engine.setCode(code);

    if (backup && engine.importState) {
      engine.importState(backup);
      engine.setPlayers(lobbyPlayersRef.current);
    } else {
      if (initialMessages.length) {
        engine.setInitialMessages(initialMessages);
      }
      engine.setPlayers(lobbyPlayersRef.current);
      game.onHostEngineReady?.(engine);
    }

    gameEngineRef.current = engine;
  }, []);

  const setupHostPeers = useCallback(
    (socket, data) => {
      const peers = new HostPeerManager(socket, socket.id);
      hostPeersRef.current = peers;

      peers.onMessage = (guestId, msg) => handleHostMessage(guestId, msg);
      peers.onPeerConnected = () => {
        gameEngineRef.current?.setPlayers(lobbyPlayersRef.current);
        syncP2pStatus(setP2pStatus, hostPeersRef, guestPeerRef);
      };
      peers.onPeerDisconnected = (guestId) => {
        schedulePlayerRemoval(guestId);
      };

      attachPeerStatusHandlers(hostPeersRef, guestPeerRef, setP2pStatus);

      data.players.forEach((p) => {
        if (p.id !== socket.id) peers.connectGuest(p.id);
      });

      if (data.gameId) {
        const game = getGame(data.gameId);
        if (game) {
          initHostEngine(game, data.code, [], {
            backup: engineBackupRef.current,
          });
        }
      }
    },
    [handleHostMessage, initHostEngine, schedulePlayerRemoval]
  );

  const setupGuestPeers = useCallback(
    (socket, data) => {
      const guest = new GuestPeerManager(socket, data.hostId);
      guestPeerRef.current = guest;
      guest.onMessage = handleGuestMessage;
      guest.onConnected = () => {
        syncP2pStatus(setP2pStatus, hostPeersRef, guestPeerRef);
      };
      guest.onDisconnected = () => {
        syncP2pStatus(setP2pStatus, hostPeersRef, guestPeerRef);
      };

      attachPeerStatusHandlers(hostPeersRef, guestPeerRef, setP2pStatus);
    },
    [handleGuestMessage]
  );

  const applyRoomData = useCallback(
    (socket, data, { isReconnect = false } = {}) => {
      teardownPeers();
      clearPendingRemovals();

      if (!isReconnect) {
        gameEngineRef.current?.destroy();
        gameEngineRef.current = null;
        engineBackupRef.current = null;
      } else if (!data.isHost) {
        gameEngineRef.current?.destroy();
        gameEngineRef.current = null;
      }

      setRoomCode(data.code);
      roomCodeRef.current = data.code;
      roomModeRef.current = data.mode ?? 'p2p';
      roomJoinedRef.current = true;
      setIsHost(data.isHost);
      isHostRef.current = data.isHost;
      setSignalingStatus(null);
      lobbyPlayersRef.current = data.players;
      saveSession(data.code, myNameRef.current);
      setUrlParams({ gameId: data.gameId, roomCode: data.code });

      setRoom((prev) => ({
        code: data.code,
        mode: data.mode ?? 'p2p',
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

      if (data.mode === 'server') {
        setP2pStatus(null);
        return;
      }

      if (data.isHost) {
        setupHostPeers(socket, data);
      } else {
        setupGuestPeers(socket, data);
      }
    },
    [clearPendingRemovals, setupGuestPeers, setupHostPeers, teardownPeers]
  );

  const applyGameSelected = useCallback(
    (gameId, code) => {
      const game = getGame(gameId);
      if (!game) return;

      if (isHostRef.current && gameEngineRef.current) {
        setRoom((prev) =>
          prev
            ? {
                ...mergeEngineRoom(prev, gameEngineRef.current.getHostState()),
                gameId,
                maxPlayers: game.maxPlayers,
              }
            : prev
        );
        setUrlParams({ gameId, roomCode: code });
        return;
      }

      if (roomModeRef.current === 'server') {
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
        return;
      }

      setRoom((prev) => {
        const messages = prev?.messages ?? [];
        if (isHostRef.current) {
          initHostEngine(game, code, messages, {
            backup: engineBackupRef.current,
          });
          if (gameEngineRef.current) {
            return {
              ...mergeEngineRoom(prev, gameEngineRef.current.getHostState()),
              gameId,
              maxPlayers: game.maxPlayers,
            };
          }
        }
        return prev
          ? {
              ...prev,
              gameId,
              maxPlayers: game.maxPlayers,
            }
          : prev;
      });
      setUrlParams({ gameId, roomCode: code });
    },
    [initHostEngine]
  );

  const handleHostMigration = useCallback(
    (socket, data) => {
      const amNewHost = socket.id === data.newHostId;

      if (data.mode === 'server') {
        setIsHost(amNewHost);
        isHostRef.current = amNewHost;
        lobbyPlayersRef.current = data.players;
        setRoom((prev) =>
          prev
            ? {
                ...prev,
                mode: 'server',
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
        return;
      }

      teardownPeers();
      gameEngineRef.current?.destroy();
      gameEngineRef.current = null;

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

      if (amNewHost) {
        setupHostPeers(socket, {
          ...data,
          hostId: data.newHostId,
          code: data.code,
        });

        const game = data.gameId ? getGame(data.gameId) : null;
        if (game && engineBackupRef.current) {
          initHostEngine(game, data.code, [], {
            backup: engineBackupRef.current,
          });
          setRoom((prev) =>
            prev && gameEngineRef.current
              ? mergeEngineRoom(prev, gameEngineRef.current.getHostState())
              : prev
          );
        }
      } else {
        setupGuestPeers(socket, {
          ...data,
          hostId: data.newHostId,
        });
      }
    },
    [initHostEngine, setupGuestPeers, setupHostPeers, teardownPeers]
  );

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
      const requestedMode = pendingCreateModeRef.current;
      pendingCreateModeRef.current = null;
      userActionRef.current = null;
      dismissToast();
      applyRoomData(socket, data);
      if (requestedMode === 'server' && data.mode !== 'server') {
        showToast('서버 방 기능이 배포되지 않았어요. 지금은 P2P 방으로 동작합니다.');
      }
    });

    socket.on('room-rejoined', (data) => {
      userActionRef.current = null;
      dismissToast();
      applyRoomData(socket, data, { isReconnect: true });
      setSignalingStatus({ level: 'ok', text: '서버 재접속 완료' });
      setTimeout(() => setSignalingStatus(null), 2500);
    });

    socket.on('return-to-lobby', () => {
      gameEngineRef.current?.destroy();
      gameEngineRef.current = null;
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
      if (data.mode) {
        roomModeRef.current = data.mode;
      }
      lobbyPlayersRef.current = data.players;
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              mode: data.mode ?? prev.mode,
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
      if (hostPeersRef.current && roomModeRef.current !== 'server') {
        gameEngineRef.current?.setPlayers(data.players);
        data.players.forEach((p) => {
          if (p.id !== socket.id) {
            hostPeersRef.current.connectGuest(p.id);
          }
        });
      }
    });

    socket.on('game-selected', ({ gameId }) => {
      applyGameSelected(gameId, roomCodeRef.current);
    });

    socket.on('peer-joined', ({ socketId }) => {
      cancelPlayerRemoval(socketId);
      hostPeersRef.current?.connectGuest(socketId);
    });

    socket.on('peer-left', ({ socketId, graceMs }) => {
      schedulePlayerRemoval(socketId);
      hostPeersRef.current?.removePeer(socketId, { notify: false });
    });

    socket.on('peer-rejoined', ({ oldSocketId, newSocketId, name }) => {
      cancelPlayerRemoval(oldSocketId);
      cancelPlayerRemoval(newSocketId);

      lobbyPlayersRef.current = lobbyPlayersRef.current.map((p) =>
        p.id === oldSocketId || p.name === name ? { ...p, id: newSocketId, name } : p
      );

      gameEngineRef.current?.replacePlayerId?.(oldSocketId, newSocketId);

      if (hostPeersRef.current) {
        hostPeersRef.current.removePeer(oldSocketId, { notify: false });
        hostPeersRef.current.connectGuest(newSocketId);
      }

      setRoom((prev) =>
        prev
          ? {
              ...prev,
              players: prev.players.map((p) =>
                p.id === oldSocketId || p.name === name ? { ...p, id: newSocketId, name } : p
              ),
            }
          : prev
      );
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

    socket.on('webrtc-signal', async ({ from, signal }) => {
      if (hostPeersRef.current) {
        await hostPeersRef.current.handleSignal(from, signal);
      } else if (guestPeerRef.current) {
        await guestPeerRef.current.handleSignal(signal);
      }
    });

    socket.on('room-closed', (msg) => {
      gameEngineRef.current?.destroy();
      gameEngineRef.current = null;
      teardownPeers();
      clearPendingRemovals();
      lobbyPlayersRef.current = [];
      canvasRef.current?.clear();
      roomCodeRef.current = null;
      roomJoinedRef.current = false;
      clearSession();

      showToast(msg);
      setRoom(null);
      setRoomCode(null);
      setP2pStatus(null);
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
      gameEngineRef.current?.destroy();
      hostPeersRef.current?.destroy();
      guestPeerRef.current?.destroy();
      clearPendingRemovals();
      socket.disconnect();
    };
  }, [
    applyGameSelected,
    applyRoomData,
    cancelPlayerRemoval,
    clearPendingRemovals,
    handleHostMigration,
    schedulePlayerRemoval,
    teardownPeers,
    dismissToast,
    showToast,
  ]);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  useEffect(() => {
    if (roomModeRef.current === 'server') return;
    if (!isHost || !gameEngineRef.current) return;
    const interval = setInterval(() => {
      setRoom((prev) =>
        prev ? mergeEngineRoom(prev, gameEngineRef.current.getHostState()) : prev
      );
    }, 500);
    return () => clearInterval(interval);
  }, [isHost, room?.status, room?.gameId, room?.mode]);

  const sendChat = useCallback(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (roomModeRef.current === 'server') {
        const code = roomCodeRef.current;
        if (!code) return;
        if (gameIdRef.current) {
          socketRef.current?.emit('game-input', { code, msg: { type: 'chat', text: trimmed } });
        } else {
          socketRef.current?.emit('lobby-chat', { code, text: trimmed });
        }
        return;
      }

      if (gameEngineRef.current) {
        if (isHostRef.current) {
          gameEngineRef.current.handleChat(myId, myNameRef.current, trimmed);
          setRoom((prev) =>
            prev ? mergeEngineRoom(prev, gameEngineRef.current.getHostState()) : prev
          );
        } else {
          guestPeerRef.current?.send({ type: 'chat', text: trimmed });
        }
        return;
      }

      if (isHostRef.current) {
        const message = {
          type: 'chat',
          name: myNameRef.current,
          text: trimmed,
          time: Date.now(),
        };
        setRoom((prev) =>
          prev ? { ...prev, messages: appendMessage(prev.messages, message) } : prev
        );
        hostPeersRef.current?.broadcast({ type: 'chat-sync', message });
      } else {
        guestPeerRef.current?.send({ type: 'chat', text: trimmed });
      }
    },
    [myId]
  );

  const createRoom = useCallback((name, mode = 'p2p') => {
    myNameRef.current = name;
    setMyName(name);
    userActionRef.current = 'create';
    pendingCreateModeRef.current = mode;
    dismissToast();
    setP2pStatus(null);
    setSignalingStatus(null);
    socketRef.current?.emit('create-room', { name, mode });
  }, [dismissToast]);

  const joinRoom = useCallback((code, name) => {
    myNameRef.current = name;
    setMyName(name);
    userActionRef.current = 'join';
    pendingCreateModeRef.current = null;
    dismissToast();
    setP2pStatus(null);
    setSignalingStatus(null);
    socketRef.current?.emit('join-room', { code, name });
  }, [dismissToast]);

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

    const messages =
      gameEngineRef.current?.getHostState()?.messages ?? room?.messages ?? [];

    gameEngineRef.current?.destroy();
    gameEngineRef.current = null;
    canvasRef.current?.clear();

    socketRef.current?.emit('leave-game', { code: roomCodeRef.current });

    setRoom((prev) =>
      prev
        ? {
            ...prev,
            gameId: null,
            status: 'waiting',
            messages,
            maxPlayers: prev.maxPlayers,
            players: prev.players.map((p) => ({ ...p, score: 0 })),
            isDrawer: false,
            chatDisabled: false,
          }
        : prev
    );
    setUrlParams({ gameId: null, roomCode: roomCodeRef.current });
  }, [room?.messages]);

  const leaveRoom = useCallback(() => {
    intentionalLeaveRef.current = true;
    gameEngineRef.current?.destroy();
    gameEngineRef.current = null;
    teardownPeers();
    clearPendingRemovals();
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
    setP2pStatus(null);
    setSignalingStatus(null);
    dismissToast();
    setUrlParams({ gameId: null, roomCode: null });
  }, [clearPendingRemovals, dismissToast, teardownPeers]);

  return {
    room,
    activeGame,
    isHost,
    toast,
    dismissToast,
    p2pStatus,
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
