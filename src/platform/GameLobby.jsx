import { useEffect, useState } from 'react';

export function GameLobby({ game, onCreate, onJoin, onBack, error, defaultRoomCode }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(defaultRoomCode || '');

  useEffect(() => {
    if (defaultRoomCode) setCode(defaultRoomCode);
  }, [defaultRoomCode]);

  return (
    <div className="lobby">
      <button type="button" className="btn-back lobby-back" onClick={onBack} aria-label="게임 선택">
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

      <div className="game-lobby-header">
        <span className="game-lobby-emoji">{game.emoji}</span>
        <h2 className="game-lobby-title">{game.name}</h2>
      </div>
      <p className="lobby-desc">{game.description}</p>
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
