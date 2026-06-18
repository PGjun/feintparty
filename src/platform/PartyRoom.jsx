import { CopyIconButton } from './components/CopyIconButton.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { buildInviteLink } from './url.js';

export function PartyRoom({ room, isHost, games, onSelectGame, onSendChat }) {
  const inviteLink = buildInviteLink(room.code);

  return (
    <div className="party-room">
      <div className="party-room-main">
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

        <div className="players-bar party-players">
          {room.players.map((p) => (
            <div key={p.id} className="player-chip">
              {p.name}
              {p.id === room.hostId && ' 👑'}
            </div>
          ))}
        </div>
      </div>

      <div className="party-room-sidebar">
        {isHost ? (
          <>
            <h2 className="party-section-title">게임 선택</h2>
            <p className="party-section-desc">플레이할 게임을 골라주세요</p>
            <div className="game-picker">
              {games.map((game) => {
                const ready = room.players.length >= game.minPlayers;
                return (
                  <button
                    key={game.id}
                    type="button"
                    className={`game-card ${ready ? '' : 'disabled'}`}
                    onClick={() => ready && onSelectGame(game.id)}
                    disabled={!ready}
                  >
                    <span className="game-card-emoji">{game.emoji}</span>
                    <span className="game-card-name">{game.name}</span>
                    <span className="game-card-desc">{game.description}</span>
                    <span className="game-card-meta">
                      {game.minPlayers}~{game.maxPlayers}명
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="party-waiting">
            <p className="party-waiting-text">방장이 게임을 선택하는 중...</p>
          </div>
        )}

        <ChatPanel
          messages={room.messages || []}
          players={room.players}
          onSend={onSendChat}
          placeholder="메시지 입력..."
        />
      </div>
    </div>
  );
}
