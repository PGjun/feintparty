import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import DrawingCanvas from './components/DrawingCanvas';
import { MAX_PLAYERS } from './lib/constants';
import { createGameEngine } from './lib/gameEngine';
import { HostPeerManager, GuestPeerManager } from './lib/peerNetwork';

function CopyButton({ text, label = '복사' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button className="btn-copy" onClick={handleCopy}>
      {copied ? '복사됨!' : label}
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
      <h2>🎨 그림 맞추기</h2>
      <p className="lobby-desc">방을 만들면 당신의 기기에서 게임이 실행됩니다</p>
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

function ChatPanel({ messages, onSend, disabled, placeholder }) {
  const [text, setText] = useState('');
  const messagesRef = useRef(null);
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
  };

  return (
    <div className="chat-box">
      <div className="chat-messages" ref={messagesRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.type}`}>
            {msg.type === 'system' ? (
              msg.text
            ) : msg.type === 'correct' ? (
              <>🎉 {msg.name}: {msg.text} — 정답!</>
            ) : (
              <>
                <span className="name">{msg.name}:</span>
                {msg.text}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={disabled}
          readOnly={disabled}
          tabIndex={disabled ? -1 : 0}
          inputMode={disabled ? 'none' : 'text'}
        />
        <button onClick={handleSend} disabled={disabled || !text.trim()}>
          전송
        </button>
      </div>
    </div>
  );
}

function GameRoom({
  room,
  roomCode,
  isHost,
  myName,
  myId,
  p2pStatus,
  onStartGame,
  onSendChat,
  onDraw,
  onClear,
  canvasRef,
}) {
  const [roundCount, setRoundCount] = useState(6);
  const chatDisabled = room.status === 'round-end' || room.status === 'finished';
  const chatPlaceholder =
    room.status === 'playing' && !room.isDrawer
      ? '정답을 입력하세요...'
      : '메시지 입력...';

  const inviteLink = `${window.location.origin.replace(/\/$/, '')}/?room=${room.code}`;

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

        {p2pStatus && (
          <div className={`p2p-status ${p2pStatus.ok ? 'ok' : 'warn'}`}>{p2pStatus.text}</div>
        )}

        <DrawingCanvas
          ref={canvasRef}
          isDrawer={room.isDrawer && room.status === 'playing'}
          onDraw={onDraw}
          onClear={onClear}
        />

        {room.status === 'waiting' && (
          <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
            {room.players.length < 2
              ? `참가자를 기다리는 중... (${room.players.length}/${MAX_PLAYERS}명)`
              : isHost
                ? `참가자 ${room.players.length}명 — P2P 연결 후 게임을 시작하세요`
                : `참가자 ${room.players.length}명 — 방장이 게임을 시작할 때까지...`}
          </p>
        )}
      </div>

      <div className="sidebar">
        <div className="room-info">
          <div className="hint">방 코드</div>
          <div className="code">{room.code}</div>
          <div className="hint">
            참가자 {room.players.length}/{MAX_PLAYERS}명
          </div>
          {isHost && (
            <div className="hint subtle">🖥️ 이 기기에서 게임 실행 중</div>
          )}
        </div>

        {isHost && room.status === 'waiting' && (
          <div className="share-box compact">
            <div className="hint">친구 초대 (코드 또는 링크)</div>
            <div className="share-url small">{inviteLink}</div>
            <CopyButton text={inviteLink} label="링크 복사" />
          </div>
        )}

        {room.status === 'waiting' && room.players.length >= 2 && isHost && (
          <div className="start-panel">
            <label className="field-label">라운드 수 (1~50)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={roundCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setRoundCount(Math.min(50, Math.max(1, val)));
              }}
            />
            <button className="btn-start" onClick={() => onStartGame(roundCount)}>
              게임 시작!
            </button>
          </div>
        )}

        {room.status === 'finished' && (
          <div className="finished-banner">
            <h3>🎉 게임 종료!</h3>
            <div className="final-scores">
              {room.players.map((p) => (
                <div key={p.id}>
                  {p.name}: <strong>{p.score}점</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        <ChatPanel
          messages={room.messages || []}
          onSend={onSendChat}
          disabled={chatDisabled}
          placeholder={chatPlaceholder}
        />
      </div>
    </div>
  );
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
  const [connected, setConnected] = useState(false);
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

    if (msg.type === 'chat') {
      const player = lobbyPlayersRef.current.find((p) => p.id === guestSocketId);
      engine.handleChat(guestSocketId, player?.name || '플레이어', msg.text);
    }
  }, []);

  const handleGuestMessage = useCallback((msg) => {
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
      setConnected(true);
      setMyId(socket.id);
      setError('');
    });

    socket.on('disconnect', () => {
      setConnected(false);
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
          }
        );
        engine.setCode(data.code);
        engine.setPlayers(data.players);
        gameEngineRef.current = engine;

        peers.onMessage = handleHostMessage;
        peers.onPeerConnected = () => {
          setP2pStatus({ ok: true, text: '✅ 참가자와 P2P 연결됨' });
          engine.setPlayers(lobbyPlayersRef.current);
        };
        peers.onPeerDisconnected = (guestId) => {
          lobbyPlayersRef.current = lobbyPlayersRef.current.filter((p) => p.id !== guestId);
          engine.setPlayers(lobbyPlayersRef.current);
        };

        setP2pStatus({ ok: true, text: '🖥️ 방장 모드 — 게임이 이 기기에서 실행됩니다' });
      } else {
        const guest = new GuestPeerManager(socket, data.hostId);
        guestPeerRef.current = guest;
        guest.onMessage = handleGuestMessage;
        guest.onConnected = () => {
          setP2pStatus({ ok: true, text: '✅ 방장과 P2P 연결됨' });
        };
        guest.onDisconnected = () => {
          setP2pStatus({ ok: false, text: '⚠️ 방장과 연결이 끊어졌어요' });
        };
        setP2pStatus({ ok: false, text: '📡 방장과 연결 중...' });
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

  const handleDraw = (stroke) => {
    gameEngineRef.current?.handleDraw(stroke);
  };

  const handleClear = () => {
    gameEngineRef.current?.handleClearCanvas();
  };

  useEffect(() => {
    if (!isHost || !gameEngineRef.current) return;
    const interval = setInterval(() => {
      setRoom(gameEngineRef.current.getHostState());
    }, 500);
    return () => clearInterval(interval);
  }, [isHost, room?.status]);

  return (
    <div className="app">
      <header className="header">
        <h1>Feint Painting</h1>
        <p>{connected ? '🌐 접속됨 — 방 만들고 코드를 공유하세요' : '서버 연결 중...'}</p>
      </header>

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
          roomCode={roomCode}
          isHost={isHost}
          myName={myName}
          myId={myId}
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
