import { useState } from 'react';
import DrawingCanvas from './DrawingCanvas.jsx';
import { CopyIconButton } from '../../platform/components/CopyIconButton.jsx';
import { ChatPanel } from '../../platform/components/ChatPanel.jsx';
import { buildInviteLink } from '../../platform/url.js';
import { DEFAULT_ROUNDS, MAX_PLAYERS } from './constants.js';

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

export default function GameRoom({
  gameId,
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

  const inviteLink = buildInviteLink(room.code, gameId);
  const winners = room.status === 'finished' ? getWinners(room.players) : [];
  const canDrawFree =
    room.status === 'waiting' ||
    room.status === 'finished' ||
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
