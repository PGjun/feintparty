import { createGameEngine } from './gameEngine.js';
import { mergeEngineRoom } from '../../platform/roomState.js';
import GameRoom from './GameRoom.jsx';
import { MAX_PLAYERS, MIN_PLAYERS } from './constants.js';
import {
  handleHostMessage,
  handleGuestMessage,
  onHostEngineReady,
} from './protocol.js';

function syncRoom(setRoom, engine) {
  setRoom?.((prev) =>
    prev ? mergeEngineRoom(prev, engine.getHostState()) : engine.getHostState()
  );
}

function sendAction(ctx, action, payload = {}) {
  const { isServerMode, emitGameInput, isHost, myId, myName, gameEngineRef, guestPeerRef, setRoom } =
    ctx;

  if (isServerMode) {
    emitGameInput({ type: 'yang-action', action, ...payload });
    return;
  }

  if (isHost) {
    const engine = gameEngineRef.current;
    if (!engine) return;
    engine.handleAction(myId, myName, action, payload);
    syncRoom(setRoom, engine);
  } else {
    guestPeerRef.current?.send({ type: 'yang-action', action, ...payload });
  }
}

function sendChatMessage(ctx, text) {
  const { isServerMode, emitGameInput, isHost, myId, myName, gameEngineRef, guestPeerRef, setRoom } =
    ctx;
  const trimmed = text.trim();
  if (!trimmed) return;

  if (isServerMode) {
    emitGameInput({ type: 'chat', text: trimmed });
    return;
  }

  if (isHost) {
    const engine = gameEngineRef.current;
    if (!engine) return;
    engine.handleChat(myId, myName, trimmed);
    syncRoom(setRoom, engine);
  } else {
    guestPeerRef.current?.send({ type: 'chat', text: trimmed });
  }
}

function sendTurnChat(ctx, text, mode) {
  const { room } = ctx;
  if (room?.status !== 'playing' || room.freeTalk) return;

  const isActionPlayer = room.lastStand ? room.isLastStandPlayer : room.isMyTurn;
  if (!isActionPlayer) return;

  if (!room.lastStand) {
    sendAction(ctx, 'select-mode', { mode });
  }

  sendChatMessage(ctx, text);
}

export function createHandlers(ctx) {
  const { isHost, isServerMode, emitGameInput, gameEngineRef, socketRef, roomCode, setRoom } = ctx;

  return {
    handleStartGame() {
      if (!isHost) return;
      if (isServerMode) {
        emitGameInput({ type: 'host-start-game' });
        return;
      }
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
      if (isServerMode) {
        emitGameInput({ type: 'host-begin-playing' });
        return;
      }
      const engine = gameEngineRef.current;
      engine?.beginPlaying(() => {
        socketRef.current?.emit('game-started', { code: roomCode });
      });
      syncRoom(setRoom, engine);
    },

    handleSelectMode(mode) {
      sendAction(ctx, 'select-mode', { mode });
    },

    handleGiveUp() {
      sendAction(ctx, 'give-up');
    },

    handlePassTurn() {
      sendAction(ctx, 'pass-turn');
    },

    handleSendQuestion(text) {
      sendTurnChat(ctx, text, 'question');
    },

    handleSendAnswer(text) {
      sendTurnChat(ctx, text, 'answer');
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
  onHostEngineReady,
  handleHostMessage,
  handleGuestMessage,
  createHandlers,
};

export default yangsechan;
