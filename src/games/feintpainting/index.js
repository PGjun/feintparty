import { createGameEngine } from './gameEngine.js';
import GameRoom from './GameRoom.jsx';
import { MAX_PLAYERS, MIN_PLAYERS } from './constants.js';
import {
  handleHostMessage,
  handleGuestMessage,
  isFreeDrawStatus,
} from './protocol.js';

export { isFreeDrawStatus };

export function createHandlers(ctx) {
  const { emitGameInput, room } = ctx;

  return {
    handleStartGame(roundCount) {
      emitGameInput({ type: 'host-start-game', roundCount });
    },

    handleDraw(stroke) {
      const status = room?.status;
      if (isFreeDrawStatus(status)) {
        emitGameInput({ type: 'lobby-draw', stroke });
        return;
      }
      emitGameInput({ type: 'game-draw', stroke });
    },

    handleClear() {
      const status = room?.status;
      if (isFreeDrawStatus(status)) {
        emitGameInput({ type: 'lobby-clear' });
        return;
      }
      emitGameInput({ type: 'game-clear' });
    },
  };
}

export const feintpainting = {
  id: 'feintpainting',
  name: 'FeintPainting',
  emoji: '🎨',
  description: '친구들과 함께 실시간으로 그림을 맞춰보세요!',
  maxPlayers: MAX_PLAYERS,
  minPlayers: MIN_PLAYERS,
  RoomView: GameRoom,
  createEngine: createGameEngine,
  handleHostMessage,
  handleGuestMessage,
  createHandlers,
};

export default feintpainting;
