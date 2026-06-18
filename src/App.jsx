import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import DrawingCanvas from './components/DrawingCanvas';
import { MAX_PLAYERS, getPlayerColor, DEFAULT_ROUNDS } from './lib/constants';
import { createGameEngine } from './lib/gameEngine';
import { HostPeerManager, GuestPeerManager } from './lib/peerNetwork';

function Logo({ size = 'lg' }) {
  return (
    <h1 className={`logo ${size}`}>
      Feint<span className="logo-accent">Painting</span>
    </h1>
  );
}

function CopyIconButton({ text, title = '복사' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      className={`btn-copy-icon ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      title={copied ? '복사됨!' : title}
      aria-label={title}
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function Lobby({ onCreate, onJoin, error, defaultRoomCode }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(defaultRoomCode || '');

  useEffect(() => {
    if (defaultRoomCode) setCode(defaultRoomCode);
  }, [defaultRoomCode]);

  return (
    <div className="lobby">
      <Logo />
      <p className="lobby-desc">친구들과 함께 실시간으로 그림을 맞춰보세요!</p>
      {error && <div className="error-msg">{error}</div>}

      <input
        placeholder="닉네임"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={10}
      />
      <button
        className="btn-primary"
        onClick={() => name.trim() && onCreate(name.trim())}
        disabled={!name.trim()}
      >
        방 만들기
      </button>

      <div className="divider">— 또는 —</div>

      <div className="join-row">
        <input
          placeholder="코드"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={4}
        />
        <input
          placeholder="닉네임"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={10}
        />
      </div>
      <button
        className="btn-secondary"
        onClick={() => name.trim() && code.trim() && onJoin(code.trim(), name.trim())}
        disabled={!name.trim() || code.trim().length < 4}
      >
        방 참가하기
      </button>
    </div>
  );
}

function ChatPanel({ messages, players, onSend, disabled, placeholder }) {
  const [text, setText] = useState('');
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const lastScrollKey = useRef('');

  const scrollKey =
    messages.length > 0
      ? `${messages.length}-${messages[messages.length - 1].time}`
      : '0';

  useEffect(() => {
    if (scrollKey === lastScrollKey.current) return;
    lastScrollKey.current = scrollKey;
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [scrollKey]);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="chat-box">
      <div className="chat-messages" ref={messagesRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.type}`}>
            {msg.type === 'system' ? (
              msg.text
            ) : msg.type === 'correct' ? (
              <>
                🎉{' '}
                <span className="name" style={{ color: getPlayerColor(players, msg.name) }}>
                  {msg.name}
                </span>
                : {msg.text} — 정답!
              </>
            ) : (
              <>
                <span className="name" style={{ color: getPlayerColor(players, msg.name) }}>
                  {msg.name}:
                </span>
                {msg.text}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          ref={inputRef}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={disabled}
          readOnly={disabled}
          tabIndex={disabled ? -1 : 0}
          inputMode={disabled ? 'none' : 'text'}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSend}
          disabled={disabled || !text.trim()}
        >
          전송
        </button>
      </div>
    </div>
  );
}

function isFreeDrawStatus(status) {
  return status === 'waiting' || status === 'finished';
}

function getWinners(players) {
  const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topScore = sorted[0]?.score ?? 0;
  return sorted.filter((p) => (p.score ?? 0) === topScore);
}

function formatWinnerMessage(winners) {
  if (winners.length === 0) return '';
  const score = winners[0].score ?? 0;
  const names = winners.map((p) => p.name).join(', ');
  return `${names}가 ${score}점으로 이겼습니다!`;
}

function getLobbyStatusBar(room, isHost, p2pStatus) {
  if (p2pStatus && !p2pStatus.ok) {
    return p2pStatus;
  }

  const count = `${room.players.length}/${MAX_PLAYERS}명`;
  return {
    ok: true,
    text: isHost
      ? `👑 방장 — 참가자를 기다리는 중... (${count})`
      : `참가자를 기다리는 중... (${count})`,
  };
}

function GameRoom({
  room,
  isHost,
  p2pStatus,
  onStartGame,
  onSendChat,
  onDraw,
  onClear,
  canvasRef,
}) {
  const [roundInput, setRoundInput] = useState(String(DEFAULT_ROUNDS));
  const parsedRounds = parseInt(roundInput, 10);
  const isValidRounds =
    roundInput.trim() !== '' &&
    !isNaN(parsedRounds) &&
    parsedRounds >= 1 &&
    parsedRounds <= 50;
  const chatPlaceholder =
    room.status === 'playing' && !room.isDrawer
      ? '정답을 입력하세요...'
      : '메시지 입력...';

  const inviteLink = `${window.location.origin.replace(/\/$/, '')}/?room=${room.code}`;
  const winners = room.status === 'finished' ? getWinners(room.players) : [];
  const canDrawFree =
    isFreeDrawStatus(room.status) ||
    (room.isDrawer && room.status === 'playing');

  const statusBar =
    room.status === 'waiting' || room.status === 'finished'
      ? getLobbyStatusBar(room, isHost, p2pStatus)
      : p2pStatus && !p2pStatus.ok
        ? p2pStatus
        : null;

  return (
    <div className="game">
      <div className="game-main">
        <div className="status-bar">
          <div className="players-bar">
            {room.players.map((p, i) => (
              <div
                key={p.id}
                className={`player-chip ${i === room.drawerIndex && room.status === 'playing' ? 'drawing' : ''}`}
              >
                {p.name} <span className="score">{p.score ?? 0}점</span>
                {i === room.drawerIndex && room.status === 'playing' && ' 🖌️'}
              </div>
            ))}
          </div>

          {room.status === 'playing' && (
            <>
              {room.isDrawer ? (
                <span className="word">제시어: {room.word}</span>
              ) : (
                <span className="word hidden">
                  {'●'.repeat(room.wordLength || 4)}
                </span>
              )}
              <span className={`timer ${room.timeLeft <= 10 ? 'warning' : ''}`}>
                ⏱ {room.timeLeft}초
              </span>
              <span className="round-info">
                라운드 {room.round}/{room.maxRounds}
              </span>
            </>
          )}
        </div>

        {statusBar && (
          <div className={`p2p-status ${statusBar.ok ? 'ok' : 'warn'}`}>{statusBar.text}</div>
        )}

        <DrawingCanvas
          ref={canvasRef}
          isDrawer={canDrawFree}
          onDraw={onDraw}
          onClear={onClear}
        />
      </div>

      <div className="sidebar">
        {(room.status === 'waiting' || room.status === 'finished') && (
          <div className="room-info">
            <div className="invite-row">
              <span className="invite-label">초대 코드 :</span>
              <span className="invite-value code">{room.code}</span>
              <CopyIconButton text={room.code} title="코드 복사" />
            </div>
            <div className="invite-row">
              <span className="invite-label">초대 링크 :</span>
              <span className="invite-value link">{inviteLink}</span>
              <CopyIconButton text={inviteLink} title="링크 복사" />
            </div>
          </div>
        )}

        {room.status === 'finished' && winners.length > 0 && (
          <div className="finished-banner">
            <p className="winner-text">🎉 {formatWinnerMessage(winners)}</p>
          </div>
        )}

        {(room.status === 'waiting' || room.status === 'finished') && isHost && (
          <div className="start-panel">
            <label className="field-label">라운드 수 (1~50)</label>
            <input
              type="text"
              inputMode="numeric"
              value={roundInput}
              onChange={(e) => setRoundInput(e.target.value)}
            />
            <button
              className="btn-start"
              onClick={() => onStartGame(parsedRounds)}
              disabled={room.players.length < 2 || !isValidRounds}
            >
              {room.status === 'finished' ? '다시 시작' : '게임 시작!'}
            </button>
          </div>
        )}

        <ChatPanel
          messages={room.messages || []}
          players={room.players}
          onSend={onSendChat}
          placeholder={chatPlaceholder}
        />
      </div>
    </div>
  );
}

function confirmLeaveRoom() {
  return window.confirm('방에서 나가시겠습니까?');
}

function getInitialRoomCode() {
  return new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '';
}

export default function App() {
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

  const handleHostMessage = useCallback((guestSocketId, msg) => {
    const engine = gameEngineRef.current;
    if (!engine) return;

    if (msg.type === 'lobby-draw') {
      if (!isFreeDrawStatus(engine.getHostState().status)) return;
      canvasRef.current?.drawStroke(msg.stroke);
      hostPeersRef.current?.broadcastExcept(guestSocketId, {
        type: 'draw',
        stroke: msg.stroke,
      });
      return;
    }

    if (msg.type === 'lobby-clear') {
      if (!isFreeDrawStatus(engine.getHostState().status)) return;
      canvasRef.current?.clear();
      hostPeersRef.current?.broadcast({ type: 'clear' });
      return;
    }

    if (msg.type === 'chat') {
      const player = lobbyPlayersRef.current.find((p) => p.id === guestSocketId);
      engine.handleChat(guestSocketId, player?.name || '플레이어', msg.text);
    }
  }, []);

  const handleGuestMessage = useCallback((msg) => {
    setP2pStatus(null);
    if (msg.type === 'state') {
      setRoom(msg.state);
    }
    if (msg.type === 'draw') {
      canvasRef.current?.drawStroke(msg.stroke);
    }
    if (msg.type === 'clear') {
      canvasRef.current?.clear();
    }
  }, []);

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
      setIsHost(data.isHost);
      setError('');
      lobbyPlayersRef.current = data.players;

      const lobbyRoom = {
        code: data.code,
        players: data.players.map((p) => ({ ...p, score: 0 })),
        maxPlayers: MAX_PLAYERS,
        status: 'waiting',
        messages: [],
        myId: socket.id,
        isDrawer: false,
      };
      setRoom(lobbyRoom);

      if (data.isHost) {
        const peers = new HostPeerManager(socket, socket.id);
        hostPeersRef.current = peers;

        const engine = createGameEngine(
          socket.id,
          (toId, msg) => peers.sendTo(toId, msg),
          () => {
            peers.broadcast({ type: 'clear' });
            canvasRef.current?.clear();
          },
          () => {
            socket.emit('game-finished', { code: data.code });
          }
        );
        engine.setCode(data.code);
        engine.setPlayers(data.players);
        gameEngineRef.current = engine;

        peers.onMessage = handleHostMessage;
        peers.onPeerConnected = () => {
          setP2pStatus(null);
          engine.setPlayers(lobbyPlayersRef.current);
        };
        peers.onPeerDisconnected = (guestId) => {
          lobbyPlayersRef.current = lobbyPlayersRef.current.filter((p) => p.id !== guestId);
          engine.setPlayers(lobbyPlayersRef.current);
        };
      } else {
        const guest = new GuestPeerManager(socket, data.hostId);
        guestPeerRef.current = guest;
        guest.onMessage = handleGuestMessage;
        guest.onConnected = () => {
          setP2pStatus(null);
        };
        guest.onDisconnected = () => {
          setP2pStatus({ ok: false, text: '⚠️ 연결이 끊어졌어요' });
        };
        setP2pStatus({ ok: false, text: '📡 연결 중...' });
      }
    });

    socket.on('lobby-update', (data) => {
      lobbyPlayersRef.current = data.players;
      setRoom((prev) =>
        prev
          ? {
              ...prev,
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
  }, [handleHostMessage, handleGuestMessage]);

  const handleCreate = (name) => {
    setMyName(name);
    setError('');
    socketRef.current?.emit('create-room', { name });
  };

  const handleJoin = (code, name) => {
    setMyName(name);
    setError('');
    socketRef.current?.emit('join-room', { code, name });
  };

  const handleStartGame = (roundCount) => {
    const engine = gameEngineRef.current;
    engine?.startGame(roundCount);
    socketRef.current?.emit('game-started', { code: roomCode });
    setRoom(engine?.getHostState());
    setP2pStatus(null);
  };

  const handleSendChat = (text) => {
    if (isHost) {
      const engine = gameEngineRef.current;
      engine?.handleChat(myId, myName, text);
      setRoom(engine?.getHostState());
    } else {
      guestPeerRef.current?.send({ type: 'chat', text });
    }
  };

  const handleDraw = useCallback(
    (stroke) => {
      const status = gameEngineRef.current?.getHostState()?.status ?? room?.status;
      if (isFreeDrawStatus(status)) {
        if (isHost) {
          hostPeersRef.current?.broadcast({ type: 'draw', stroke });
        } else {
          guestPeerRef.current?.send({ type: 'lobby-draw', stroke });
        }
        return;
      }
      gameEngineRef.current?.handleDraw(stroke);
    },
    [isHost, room?.status]
  );

  const handleClear = useCallback(() => {
    const status = gameEngineRef.current?.getHostState()?.status ?? room?.status;
    if (isFreeDrawStatus(status)) {
      if (isHost) {
        canvasRef.current?.clear();
        hostPeersRef.current?.broadcast({ type: 'clear' });
      } else {
        guestPeerRef.current?.send({ type: 'lobby-clear' });
      }
      return;
    }
    gameEngineRef.current?.handleClearCanvas();
  }, [isHost, room?.status]);

  useEffect(() => {
    if (!isHost || !gameEngineRef.current) return;
    const interval = setInterval(() => {
      setRoom(gameEngineRef.current.getHostState());
    }, 500);
    return () => clearInterval(interval);
  }, [isHost, room?.status]);

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
    setIsHost(false);
    setP2pStatus(null);
    setError('');

    const url = new URL(window.location.href);
    if (url.searchParams.has('room')) {
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  const handleLeaveRoom = useCallback(() => {
    if (!confirmLeaveRoom()) return;
    leaveRoom();
  }, [leaveRoom]);

  useEffect(() => {
    if (!room) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [room]);

  return (
    <div className={`app${!room ? ' lobby-page' : ''}`}>
      {room && (
        <header className="header header-room">
          <button
            type="button"
            className="btn-back"
            onClick={handleLeaveRoom}
            aria-label="방 나가기"
            title="방 나가기"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <Logo size="sm" />
        </header>
      )}

      {!room ? (
        <Lobby
          onCreate={handleCreate}
          onJoin={handleJoin}
          error={error}
          defaultRoomCode={getInitialRoomCode()}
        />
      ) : (
        <GameRoom
          room={room}
          isHost={isHost}
          p2pStatus={p2pStatus}
          onStartGame={handleStartGame}
          onSendChat={handleSendChat}
          onDraw={handleDraw}
          onClear={handleClear}
          canvasRef={canvasRef}
        />
      )}

      {error && room && <div className="error-msg floating">{error}</div>}
    </div>
  );
}
