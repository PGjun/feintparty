import { createGameEngine } from './gameEngine.js';
import GameRoom from './GameRoom.jsx';
import { MAX_PLAYERS, MIN_PLAYERS } from './constants.js';
import {
  handleHostMessage,
  handleGuestMessage,
  onHostEngineReady,
} from './protocol.js';

function sendAction(ctx, action, payload = {}) {
  ctx.emitGameInput({ type: 'yang-action', action, ...payload });
}

function sendChatMessage(ctx, text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  ctx.emitGameInput({ type: 'chat', text: trimmed });
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
  const { isHost, emitGameInput } = ctx;

  return {
    handleStartGame() {
      if (!isHost) return;
      emitGameInput({ type: 'host-start-game' });
    },

    handleSubmitWord(word) {
      sendAction(ctx, 'submit-word', { word });
    },

    handleConfirmWord(word) {
      sendAction(ctx, 'confirm-word', { word });
    },

    handleBeginPlaying() {
      if (!isHost) return;
      emitGameInput({ type: 'host-begin-playing' });
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
