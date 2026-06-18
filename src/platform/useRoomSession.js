import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getGame } from '../games/registry.js';
import { HostPeerManager, GuestPeerManager } from './peerNetwork.js';
import { appendMessage, mergeEngineRoom } from './roomState.js';
import { setUrlParams } from './url.js';

export function useRoomSession() {
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myName, setMyName] = useState('');
  const [myId, setMyId] = useState(null);
  const [error, setError] = useState('');
  const [p2pStatus, setP2pStatus] = useState(null);

  const socketRef = useRef(null);
  const hostPeersRef = useRef(null);
  const guestPeerRef = useRef(null);
  const gameEngineRef = useRef(null);
  const canvasRef = useRef(null);
  const lobbyPlayersRef = useRef([]);
  const isHostRef = useRef(false);
  const myNameRef = useRef('');
  const roomCodeRef = useRef(null);
  const gameIdRef = useRef(null);

  const activeGame = room?.gameId ? getGame(room.gameId) : null;

  useEffect(() => {
    gameIdRef.current = room?.gameId ?? null;
  }, [room?.gameId]);

  const sessionCtx = useMemo(
    () => ({
      isHost,
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
    [isHost, myId, myName, room, roomCode]
  );

  const handlers = useMemo(
    () => (activeGame ? activeGame.createHandlers(sessionCtx) : {}),
    [activeGame, sessionCtx]
  );

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
    setP2pStatus(null);

    if (msg.type === 'chat-sync') {
      setRoom((prev) =>
        prev ? { ...prev, messages: appendMessage(prev.messages, msg.message) } : prev
      );
      return;
    }

    const game = gameIdRef.current ? getGame(gameIdRef.current) : null;
    if (!game) return;

    game.handleGuestMessage(msg, {
      setP2pStatus,
      setRoom,
      canvasRef,
    });
  }, []);

  const initHostEngine = useCallback((game, code, initialMessages = []) => {
    if (!hostPeersRef.current || gameEngineRef.current) return;

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
    if (initialMessages.length) {
      engine.setInitialMessages(initialMessages);
    }
    engine.setPlayers(lobbyPlayersRef.current);
    gameEngineRef.current = engine;
    game.onHostEngineReady?.(engine);
  }, []);

  const setupHostPeers = useCallback(
    (socket, data) => {
      const peers = new HostPeerManager(socket, socket.id);
      hostPeersRef.current = peers;

      peers.onMessage = (guestId, msg) => handleHostMessage(guestId, msg);
      peers.onPeerConnected = () => {
        setP2pStatus(null);
        gameEngineRef.current?.setPlayers(lobbyPlayersRef.current);
      };
      peers.onPeerDisconnected = (guestId) => {
        lobbyPlayersRef.current = lobbyPlayersRef.current.filter((p) => p.id !== guestId);
        gameEngineRef.current?.setPlayers(lobbyPlayersRef.current);
      };

      data.players.forEach((p) => {
        if (p.id !== socket.id) peers.connectGuest(p.id);
      });

      if (data.gameId) {
        const game = getGame(data.gameId);
        if (game) initHostEngine(game, data.code, []);
      }
    },
    [handleHostMessage, initHostEngine]
  );

  const setupGuestPeers = useCallback(
    (socket, data) => {
      const guest = new GuestPeerManager(socket, data.hostId);
      guestPeerRef.current = guest;
      guest.onMessage = handleGuestMessage;
      guest.onConnected = () => setP2pStatus(null);
      guest.onDisconnected = () => {
        setP2pStatus({ ok: false, text: '⚠️ 연결이 끊어졌어요' });
      };
      setP2pStatus({ ok: false, text: '📡 연결 중...' });
    },
    [handleGuestMessage]
  );

  const applyGameSelected = useCallback(
    (gameId, code) => {
      const game = getGame(gameId);
      if (!game) return;

      setRoom((prev) => {
        const messages = prev?.messages ?? [];
        if (isHostRef.current) {
          initHostEngine(game, code, messages);
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

  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setMyId(socket.id);
      setError('');
    });

    socket.on('connect_error', () => {
      setError('서버에 연결할 수 없어요.');
    });

    socket.on('room-joined', (data) => {
      setRoomCode(data.code);
      roomCodeRef.current = data.code;
      setIsHost(data.isHost);
      isHostRef.current = data.isHost;
      setError('');
      lobbyPlayersRef.current = data.players;
      setUrlParams({ gameId: data.gameId, roomCode: data.code });

      setRoom({
        code: data.code,
        gameId: data.gameId,
        hostId: data.hostId,
        players: data.players.map((p) => ({ ...p, score: 0 })),
        maxPlayers: data.maxPlayers,
        status: 'waiting',
        messages: [],
        myId: socket.id,
        isDrawer: false,
      });

      if (data.isHost) {
        setupHostPeers(socket, data);
      } else {
        setupGuestPeers(socket, data);
      }
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
                score: prev.players.find((x) => x.id === p.id)?.score ?? 0,
              })),
            }
          : prev
      );
      if (hostPeersRef.current) {
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
      hostPeersRef.current?.connectGuest(socketId);
    });

    socket.on('webrtc-signal', async ({ from, signal }) => {
      if (hostPeersRef.current) {
        await hostPeersRef.current.handleSignal(from, signal);
      } else if (guestPeerRef.current) {
        await guestPeerRef.current.handleSignal(signal);
      }
    });

    socket.on('room-closed', (msg) => {
      setError(msg);
      setRoom(null);
      setRoomCode(null);
      setP2pStatus(null);
      setUrlParams({ gameId: null, roomCode: null });
    });

    socket.on('error', (msg) => {
      setError(msg);
    });

    return () => {
      gameEngineRef.current?.destroy();
      hostPeersRef.current?.destroy();
      guestPeerRef.current?.destroy();
      socket.disconnect();
    };
  }, [applyGameSelected, setupGuestPeers, setupHostPeers]);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  useEffect(() => {
    if (!isHost || !gameEngineRef.current) return;
    const interval = setInterval(() => {
      setRoom((prev) =>
        prev ? mergeEngineRoom(prev, gameEngineRef.current.getHostState()) : prev
      );
    }, 500);
    return () => clearInterval(interval);
  }, [isHost, room?.status, room?.gameId]);

  const sendChat = useCallback(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;

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

  const createRoom = useCallback((name) => {
    myNameRef.current = name;
    setMyName(name);
    setError('');
    socketRef.current?.emit('create-room', { name });
  }, []);

  const joinRoom = useCallback((code, name) => {
    myNameRef.current = name;
    setMyName(name);
    setError('');
    socketRef.current?.emit('join-room', { code, name });
  }, []);

  const selectGame = useCallback(
    (gameId) => {
      if (!isHostRef.current || !roomCode) return;
      const game = getGame(gameId);
      if (!game) return;
      if (lobbyPlayersRef.current.length < game.minPlayers) return;

      setError('');
      socketRef.current?.emit('select-game', {
        code: roomCode,
        gameId,
        minPlayers: game.minPlayers,
      });
      applyGameSelected(gameId, roomCode);
    },
    [applyGameSelected, roomCode]
  );

  const returnToLobby = useCallback(() => {
    if (!isHostRef.current || !roomCodeRef.current) return;

    const messages =
      gameEngineRef.current?.getHostState()?.messages ??
      room?.messages ??
      [];

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
    gameEngineRef.current?.destroy();
    gameEngineRef.current = null;
    hostPeersRef.current?.destroy();
    hostPeersRef.current = null;
    guestPeerRef.current?.destroy();
    guestPeerRef.current = null;
    lobbyPlayersRef.current = [];
    canvasRef.current?.clear();

    const socket = socketRef.current;
    if (socket) {
      socket.disconnect();
      socket.connect();
    }

    setRoom(null);
    setRoomCode(null);
    roomCodeRef.current = null;
    setIsHost(false);
    isHostRef.current = false;
    setP2pStatus(null);
    setError('');
    setUrlParams({ gameId: null, roomCode: null });
  }, []);

  return {
    room,
    activeGame,
    isHost,
    error,
    setError,
    p2pStatus,
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
