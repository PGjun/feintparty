import { useEffect, useState } from 'react';
import { CopyIconButton } from '../../platform/components/CopyIconButton.jsx';
import { ChatPanel } from '../../platform/components/ChatPanel.jsx';
import { buildInviteLink } from '../../platform/url.js';

function AssigningPanel({ room, wordInput, onWordChange, onConfirm, onBeginPlaying, isHost }) {
  return (
    <div className="yang-assigning">
      <h3 className="yang-section-title">단어 정하기</h3>

      {!room.myConfirmed ? (
        <div className="yang-word-form">
          <input
            type="text"
            placeholder="단어 입력..."
            value={wordInput}
            onChange={(e) => onWordChange(e.target.value)}
            maxLength={100}
          />
          <button
            type="button"
            className="yang-confirm-btn"
            onClick={() => onConfirm(wordInput)}
            disabled={!wordInput.trim()}
          >
            확인
          </button>
        </div>
      ) : (
        <p className="yang-confirmed-msg">✅ 단어를 확정했어요!</p>
      )}

      <ul className="yang-confirm-list">
        {room.players.map((p) => (
          <li key={p.id} className={p.confirmed ? 'done' : ''}>
            {p.name} {p.confirmed ? '✅' : '⏳'}
          </li>
        ))}
      </ul>

      {isHost && (
        <button
          type="button"
          className="btn-start"
          onClick={onBeginPlaying}
          disabled={!room.allConfirmed}
        >
          게임 시작!
        </button>
      )}

      {!isHost && !room.allConfirmed && (
        <p className="yang-wait-host">전원 확정을 기다리는 중...</p>
      )}
    </div>
  );
}

function WordCards({ room }) {
  const others = room.othersWords || [];
  const mineRevealed = room.myWord != null;
  const isCorrect = room.myWordRevealReason === 'correct';
  const isLast = room.myWordRevealReason === 'last';

  return (
    <div className="yang-word-cards">
      <div
        className={`yang-word-card mine${mineRevealed ? ' revealed' : ''}${isCorrect ? ' correct' : ''}${isLast ? ' last' : ''}`}
      >
        <span className="yang-word-label">나</span>
        {mineRevealed ? (
          <span className="yang-word-value">{room.myWord}</span>
        ) : (
          <span className="yang-word-value hidden">???</span>
        )}
      </div>
      {others.map((entry) => (
        <div key={entry.id} className="yang-word-card">
          <span className="yang-word-label">{entry.name}</span>
          <span className="yang-word-value">{entry.word}</span>
        </div>
      ))}
    </div>
  );
}

function TurnPanel({ room, onSelectMode, onPassTurn }) {
  if (room.status !== 'playing' || room.lastStand) return null;

  const modeLabel =
    room.turnMode === 'question'
      ? '질문 중'
      : room.turnMode === 'answer'
        ? '정답 시도 중'
        : null;

  return (
    <div className="yang-turn-panel">
      <div className="yang-turn-info">
        <span className="yang-turn-name">
          {room.turnPlayerName ? `${room.turnPlayerName}님의 턴` : '턴 대기'}
        </span>
        <span className="yang-turn-meta">#{room.turnNumber}</span>
        <span className={`timer ${room.timeLeft <= 10 ? 'warning' : ''}`}>⏱ {room.timeLeft}초</span>
      </div>

      {modeLabel && <p className="yang-mode-label">{modeLabel}</p>}

      {room.canSelectMode && (
        <div className="yang-turn-actions">
          <button type="button" className="yang-mode-btn question" onClick={() => onSelectMode('question')}>
            질문
          </button>
          <button type="button" className="yang-mode-btn answer" onClick={() => onSelectMode('answer')}>
            정답
          </button>
        </div>
      )}

      {room.canPassTurn && (
        <button type="button" className="yang-pass-btn" onClick={onPassTurn}>
          턴 넘기기
        </button>
      )}

      {room.isMyTurn && room.turnMode === 'answer' && (
        <p className="yang-answer-hint">채팅으로 정답을 입력하세요. 첫 메시지만 정답으로 처리됩니다.</p>
      )}
    </div>
  );
}

function LastStandPanel({ room, onGiveUp }) {
  if (!room.lastStand) return null;

  return (
    <div className="yang-turn-panel last-stand">
      <p className="yang-laststand-title">{room.lastStandPlayerName}님의 마지막 기회</p>
      <p className="yang-laststand-desc">
        자유롭게 질문하고 정답을 말하세요! 포기해도 돼요!
        <br />
        단, 다른 사람도 정답을 말해서 게임을 끝낼 수 있어요!
      </p>
      {room.canGiveUp && (
        <button type="button" className="yang-giveup-btn" onClick={onGiveUp}>
          포기
        </button>
      )}
    </div>
  );
}

function FinishedBanner({ room }) {
  const ranked = [...room.players]
    .filter((p) => p.rank != null && p.guessed)
    .sort((a, b) => a.rank - b.rank);
  const loser = room.players.find((p) => p.rank != null && !p.guessed);

  return (
    <div className="finished-banner yang-finished">
      <p className="winner-text">🏁 게임 종료!</p>
      <ol className="yang-rank-list">
        {ranked.map((p) => (
          <li key={p.id}>
            {p.rank}등 — {p.name}
          </li>
        ))}
        {loser && <li>꼴등 — {loser.name}</li>}
      </ol>
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
  const [wordInput, setWordInput] = useState(room.myDraftWord || '');
  const [memoText, setMemoText] = useState('');

  const {
    handleStartGame,
    handleConfirmWord,
    handleBeginPlaying,
    handleSelectMode,
    handlePassTurn,
    handleGiveUp,
  } = handlers;

  useEffect(() => {
    if (!room.myConfirmed) {
      setWordInput(room.myDraftWord || '');
    }
  }, [room.myDraftWord, room.myConfirmed]);

  useEffect(() => {
    if (room.status === 'assigning') {
      setMemoText('');
    }
  }, [room.status]);

  const inviteLink = buildInviteLink(room.code, gameId);
  const isFinished = room.status === 'finished';
  const isAssigningPhase = room.status === 'assigning' || room.status === 'waiting';
  const showInvite = isAssigningPhase || isFinished;

  const chatPlaceholder = room.lastStand
    ? '질문이나 정답을 입력하세요...'
    : room.status === 'playing' && room.isMyTurn && room.turnMode === 'answer'
      ? '정답을 입력하세요...'
      : '메시지 입력...';

  return (
    <div className="game game-yangsechan">
      <div className="game-main">
        <div className="status-bar yang-players-bar">
          <div className="players-bar">
            {room.players.map((p) => (
              <div
                key={p.id}
                className={`player-chip ${p.id === room.turnPlayerId && room.status === 'playing' && !room.lastStand ? 'drawing' : ''} ${p.id === room.lastStandPlayerId && room.lastStand ? 'drawing' : ''} ${p.guessed ? 'guessed' : ''}`}
              >
                {p.name}
                {p.rank != null && <span className="score">{p.rank}등</span>}
                {p.id === room.turnPlayerId && room.status === 'playing' && !p.guessed && !room.lastStand && ' 🎯'}
                {p.id === room.lastStandPlayerId && room.lastStand && ' 🎯'}
                {p.guessed && ' ✅'}
              </div>
            ))}
          </div>
        </div>

        {isAssigningPhase && !isFinished && (
          <AssigningPanel
            room={room}
            wordInput={wordInput}
            onWordChange={setWordInput}
            onConfirm={handleConfirmWord}
            onBeginPlaying={handleBeginPlaying}
            isHost={isHost}
          />
        )}

        {(room.status === 'playing' || isFinished) && (
          <>
            {isFinished && <FinishedBanner room={room} />}
            <WordCards room={room} />
            {room.status === 'playing' && (
              <>
                {room.lastStand ? (
                  <LastStandPanel room={room} onGiveUp={handleGiveUp} />
                ) : (
                  <TurnPanel room={room} onSelectMode={handleSelectMode} onPassTurn={handlePassTurn} />
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="sidebar">
        {showInvite && (
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

        {isFinished && isHost && (
          <div className="start-panel">
            <button type="button" className="btn-start" onClick={handleStartGame}>
              다시 시작
            </button>
          </div>
        )}

        <ChatPanel
          messages={room.messages || []}
          players={room.players}
          onSend={onSendChat}
          placeholder={chatPlaceholder}
        />

        {(isAssigningPhase || room.status === 'playing' || isFinished) && (
          <div className="yang-memo">
            <textarea
              className="yang-memo-input"
              placeholder="나만 보는 메모..."
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              rows={3}
            />
          </div>
        )}
      </div>
    </div>
  );
}
