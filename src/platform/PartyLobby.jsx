import { useEffect, useState } from 'react';
import { PlatformLogo } from './components/PlatformLogo.jsx';

export function PartyLobby({ onCreate, onJoin, error, defaultRoomCode }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(defaultRoomCode || '');

  useEffect(() => {
    if (defaultRoomCode) setCode(defaultRoomCode);
  }, [defaultRoomCode]);

  return (
    <div className="lobby">
      <PlatformLogo />
      <p className="lobby-desc">친구와 함께 즐기는 멀티플레이 파티</p>
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
