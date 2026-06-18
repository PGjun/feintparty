import { createGameEngine } from './gameEngine.js';
import { mergeEngineRoom } from '../../platform/roomState.js';
import GameRoom from './GameRoom.jsx';
import { MAX_PLAYERS, MIN_PLAYERS } from './constants.js';

function syncRoom(setRoom, engine) {
  setRoom?.((prev) =>
    prev ? mergeEngineRoom(prev, engine.getHostState()) : engine.getHostState()
  );
}

function handleHostMessage(msg, guestSocketId, ctx) {
  const { engine, lobbyPlayersRef, setRoom } = ctx;
  if (!engine) return false;

  if (msg.type === 'yang-action') {
    const player = lobbyPlayersRef.current.find((p) => p.id === guestSocketId);
    engine.handleAction(guestSocketId, player?.name || '플레이어', msg.action, msg);
    syncRoom(setRoom, engine);
    return true;
  }

  if (msg.type === 'chat') {
    const player = lobbyPlayersRef.current.find((p) => p.id === guestSocketId);
    engine.handleChat(guestSocketId, player?.name || '플레이어', msg.text);
    syncRoom(setRoom, engine);
    return true;
  }

  return false;
}

function handleGuestMessage(msg, ctx) {
  const { setP2pStatus, setRoom } = ctx;
  setP2pStatus(null);

  if (msg.type === 'state') {
    setRoom((prev) => (prev ? mergeEngineRoom(prev, msg.state) : msg.state));
    return true;
  }

  return false;
}

function sendAction(ctx, action, payload = {}) {
  const { isHost, myId, myName, gameEngineRef, guestPeerRef, setRoom } = ctx;

  if (isHost) {
    const engine = gameEngineRef.current;
    if (!engine) return;
    engine.handleAction(myId, myName, action, payload);
    syncRoom(setRoom, engine);
  } else {
    guestPeerRef.current?.send({ type: 'yang-action', action, ...payload });
  }
}

export function createHandlers(ctx) {
  const { isHost, gameEngineRef, socketRef, roomCode, setRoom } = ctx;

  return {
    handleStartGame() {
      if (!isHost) return;
      const engine = gameEngineRef.current;
      engine?.startAssigning();
      syncRoom(setRoom, engine);
    },

    handleSubmitWord(word) {
      sendAction(ctx, 'submit-word', { word });
    },

    handleConfirmWord(word) {
      sendAction(ctx, 'confirm-word', { word });
    },

    handleBeginPlaying() {
      if (!isHost) return;
      const engine = gameEngineRef.current;
      engine?.beginPlaying(() => {
        socketRef.current?.emit('game-started', { code: roomCode });
      });
      syncRoom(setRoom, engine);
    },

    handleSelectMode(mode) {
      sendAction(ctx, 'select-mode', { mode });
    },

    handlePassTurn() {
      sendAction(ctx, 'pass-turn');
    },

    handleGiveUp() {
      sendAction(ctx, 'give-up');
    },
  };
}

export const yangsechan = {
  id: 'yangsechan',
  name: '양세찬 게임',
  emoji: '🃏',
  description: '머리에 붙은 단어를 유추해보세요! 질문과 추론으로 승부!',
  maxPlayers: MAX_PLAYERS,
  minPlayers: MIN_PLAYERS,
  RoomView: GameRoom,
  createEngine: createGameEngine,
  onHostEngineReady(engine) {
    engine.startAssigning();
  },
  handleHostMessage,
  handleGuestMessage,
  createHandlers,
};

export default yangsechan;
