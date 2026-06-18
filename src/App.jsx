import { useCallback, useEffect, useState } from 'react';
import { GAMES } from './games/registry.js';
import { HeaderStatus } from './platform/components/HeaderStatus.jsx';
import { Toast } from './platform/components/Toast.jsx';
import { PartyLobby } from './platform/PartyLobby.jsx';
import { PartyRoom } from './platform/PartyRoom.jsx';
import { useRoomSession } from './platform/useRoomSession.js';
import { confirmLeaveRoom, confirmReturnToLobby, parseRoomUrl } from './platform/url.js';

export default function App() {
  const [defaultRoomCode] = useState(() => parseRoomUrl().roomCode);

  const {
    room,
    activeGame,
    isHost,
    toast,
    dismissToast,
    p2pStatus,
    signalingStatus,
    canvasRef,
    createRoom,
    joinRoom,
    selectGame,
    returnToLobby,
    leaveRoom,
    sendChat,
    handlers,
  } = useRoomSession();

  const handleBack = useCallback(() => {
    const inPartyLobby = room && !room.gameId;

    if (inPartyLobby) {
      if (!confirmLeaveRoom()) return;
      leaveRoom();
      return;
    }

    if (isHost) {
      if (!confirmReturnToLobby()) return;
      returnToLobby();
      return;
    }

    if (!confirmLeaveRoom()) return;
    leaveRoom();
  }, [room, isHost, leaveRoom, returnToLobby]);

  const inPartyLobby = room && !room.gameId;
  const backLabel = inPartyLobby
    ? '방 나가기'
    : isHost
      ? '대기방으로'
      : '방 나가기';

  useEffect(() => {
    if (!room) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [room]);

  const RoomView = activeGame?.RoomView;
  const hideHeaderStatusWhenOk = Boolean(room?.gameId && room?.status === 'playing');

  return (
    <div className={`app${!room ? ' lobby-page' : ''}`}>
      {room && (
        <header className="header header-room">
          <button
            type="button"
            className="btn-back"
            onClick={handleBack}
            aria-label={backLabel}
            title={backLabel}
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
          {activeGame ? (
            <div className="header-game-title">
              <span className="header-game-emoji">{activeGame.emoji}</span>
              <span className="header-game-name">{activeGame.name}</span>
            </div>
          ) : (
            <span className="header-party-label">Feint Party</span>
          )}
          <HeaderStatus
            room={room}
            isHost={isHost}
            p2pStatus={p2pStatus}
            signalingStatus={signalingStatus}
            hideWhenOk={hideHeaderStatusWhenOk}
          />
        </header>
      )}

      {!room ? (
        <PartyLobby
          onCreate={createRoom}
          onJoin={joinRoom}
          defaultRoomCode={defaultRoomCode}
        />
      ) : inPartyLobby ? (
        <PartyRoom
          room={room}
          isHost={isHost}
          games={GAMES}
          onSelectGame={selectGame}
          onSendChat={sendChat}
        />
      ) : (
        RoomView && (
          <RoomView
            gameId={room.gameId}
            room={room}
            isHost={isHost}
            canvasRef={canvasRef}
            onSendChat={sendChat}
            handlers={handlers}
            onStartGame={handlers.handleStartGame}
            onDraw={handlers.handleDraw}
            onClear={handlers.handleClear}
          />
        )
      )}

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}
