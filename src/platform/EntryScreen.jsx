import { useEffect, useState } from 'react';
import { PlatformLogo } from './components/PlatformLogo.jsx';

export function EntryScreen({ onCreateRoom, onJoin, defaultRoomCode }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(defaultRoomCode || '');

  useEffect(() => {
    if (defaultRoomCode) setCode(defaultRoomCode);
  }, [defaultRoomCode]);

  const trimmedName = name.trim();
  const trimmedCode = code.trim();
  const canJoin = trimmedName.length > 0 && trimmedCode.length === 4;

  const handleJoin = () => {
    if (!canJoin) return;
    onJoin(trimmedCode, trimmedName);
  };

  return (
    <div className="entry">
      <PlatformLogo />
      <p className="entry-desc">친구와 함께 즐기는 멀티플레이 파티</p>

      <input
        className="entry-name"
        placeholder="닉네임"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={10}
      />

      <div className="entry-join-row">
        <input
          className="entry-code"
          placeholder="코드"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={4}
        />
        <button
          type="button"
          className="btn-primary entry-join-btn"
          onClick={handleJoin}
          disabled={!canJoin}
        >
          방 참가하기
        </button>
      </div>

      <div className="entry-create-group">
        <button
          type="button"
          className="btn-secondary entry-create-btn"
          onClick={() => trimmedName && onCreateRoom(trimmedName)}
          disabled={!trimmedName}
        >
          방 만들기
        </button>
      </div>
    </div>
  );
}
