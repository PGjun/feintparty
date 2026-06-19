import { useCallback, useEffect, useRef, useState } from 'react';
import { CopyIconButton } from '../../platform/components/CopyIconButton.jsx';
import { ChatPanel } from '../../platform/components/ChatPanel.jsx';
import { buildInviteLink } from '../../platform/url.js';
import {
  DEFAULT_TARGET_SCORE,
  EMOJI_COOLDOWN_MS,
  EMOJIS,
  MAX_TARGET_SCORE,
  MIN_TARGET_SCORE,
} from './constants.js';
import { HockeyTable } from './HockeyTable.jsx';

function ScoreBar({ room }) {
  const myIndex = room.myPlayerIndex ?? 0;
  const me = room.players?.[myIndex];
  const opponent = room.players?.[myIndex === 0 ? 1 : 0];

  return (
    <div className="hockey-score-bar">
      <span className="hockey-score-name">{me?.name ?? '나'}</span>
      <span className="hockey-score-values">
        {room.myScore ?? 0} : {room.opponentScore ?? 0}
      </span>
      <span className="hockey-score-name">{opponent?.name ?? '상대'}</span>
    </div>
  );
}

function FinishedBanner({ room }) {
  const winnerName =
    room.winnerName ??
    room.players?.find((p) => p.id === room.winnerId)?.name ??
    '플레이어';

  return (
    <div className="finished-banner hockey-finished">
      <p className="winner-text">🏆 {winnerName} 승리!</p>
      <p className="hockey-final-score">
        {room.myScore ?? 0} : {room.opponentScore ?? 0}
      </p>
    </div>
  );
}

function EmojiBar({ onEmoji, disabled }) {
  const lastSent = useRef(0);

  const send = (emoji) => {
    if (disabled) return;
    const now = Date.now();
    if (now - lastSent.current < EMOJI_COOLDOWN_MS) return;
    lastSent.current = now;
    onEmoji(emoji);
  };

  return (
    <div className="hockey-emoji-bar">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="hockey-emoji-btn"
          onClick={() => send(emoji)}
          disabled={disabled}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export default function GameRoom({
  gameId,
  room,
  isHost,
  onSendChat,
  handlers = {},
}) {
  const [targetInput, setTargetInput] = useState(String(DEFAULT_TARGET_SCORE));
  const [emojiBubbles, setEmojiBubbles] = useState([]);

  const {
    handleStartGame,
    handleReturnToGameWaiting,
    handlePaddleMove,
    handleEmoji,
  } = handlers;

  const parsedTarget = parseInt(targetInput, 10);
  const isValidTarget =
    targetInput.trim() !== '' &&
    !isNaN(parsedTarget) &&
    parsedTarget >= MIN_TARGET_SCORE &&
    parsedTarget <= MAX_TARGET_SCORE;

  const inviteLink = buildInviteLink(room.code, gameId);
  const isWaiting = room.status === 'waiting';
  const isPlaying =
    room.status === 'playing' ||
    room.status === 'countdown' ||
    room.status === 'goalCelebration';
  const isFinished = room.status === 'finished';
  const showChat = !isPlaying;
  const canStart = isHost && room.players?.length >= 2 && isValidTarget;

  useEffect(() => {
    if (!room.emojiEvent) return;
    const id = Date.now();
    setEmojiBubbles((prev) => [
      ...prev,
      { id, emoji: room.emojiEvent.emoji, name: room.emojiEvent.name },
    ]);
    const timer = setTimeout(() => {
      setEmojiBubbles((prev) => prev.filter((b) => b.id !== id));
    }, 2500);
    return () => clearTimeout(timer);
  }, [room.emojiEvent]);

  const onEmojiSend = useCallback(
    (emoji) => {
      handleEmoji?.(emoji);
    },
    [handleEmoji]
  );

  return (
    <div className={`game game-airhockey${isPlaying ? ' game-airhockey-playing' : ''}`}>
      <div className="game-main hockey-main">
        {isPlaying && <ScoreBar room={room} />}

        {isFinished && <FinishedBanner room={room} />}

        <HockeyTable
          room={room}
          onPaddleMove={handlePaddleMove}
          inactive={isWaiting || isFinished}
        />

        {emojiBubbles.length > 0 && (
          <div className="hockey-emoji-floats" aria-live="polite">
            {emojiBubbles.map((b) => (
              <div key={b.id} className="hockey-emoji-float">
                <span className="hockey-emoji-float-name">{b.name}</span>
                <span className="hockey-emoji-float-emoji">{b.emoji}</span>
              </div>
            ))}
          </div>
        )}

        {isPlaying && (
          <EmojiBar onEmoji={onEmojiSend} disabled={!handleEmoji} />
        )}
      </div>

      {showChat && (
        <div className="sidebar hockey-sidebar">
          {isWaiting && (
            <>
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

              <div className="players-bar hockey-wait-players">
                {room.players.map((p) => (
                  <div key={p.id} className="player-chip">
                    {p.name}
                    {p.id === room.hostId && ' 👑'}
                  </div>
                ))}
              </div>

              {isHost ? (
                <div className="start-panel">
                  <label className="field-label">
                    득점 목표 ({MIN_TARGET_SCORE}~{MAX_TARGET_SCORE})
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-start"
                    onClick={() => handleStartGame?.(parsedTarget)}
                    disabled={!canStart}
                  >
                    게임 시작!
                  </button>
                </div>
              ) : (
                <p className="hockey-wait-guest">방장이 게임을 시작하는 중...</p>
              )}
            </>
          )}

          <ChatPanel
            messages={room.messages || []}
            players={room.players}
            onSend={onSendChat}
            placeholder="메시지 입력..."
          />

          {isFinished && isHost && (
            <div className="hockey-return-bar">
              <button
                type="button"
                className="btn-start"
                onClick={() => handleReturnToGameWaiting?.()}
              >
                게임 대기로
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
