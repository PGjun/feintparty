import { createGameEngine } from './gameEngine.js';
import GameRoom from './GameRoom.jsx';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
} from './constants.js';
import { handleHostMessage, handleGuestMessage } from './protocol.js';

export function createHandlers(ctx) {
  const { isHost, emitGameInput } = ctx;

  return {
    handleStartGame(targetScore) {
      if (!isHost) return;
      emitGameInput({ type: 'host-start-game', targetScore });
    },

    handleReturnToGameWaiting() {
      if (!isHost) return;
      emitGameInput({ type: 'host-return-to-game-waiting' });
    },

    handlePaddleMove(x, y) {
      emitGameInput({ type: 'paddle', x, y });
    },

    handleEmoji(emoji) {
      emitGameInput({ type: 'emoji', emoji });
    },
  };
}

export const airhockey = {
  id: 'airhockey',
  name: '에어 하키',
  emoji: '🏒',
  description: '2인 대결! 패들로 공을 쳐서 상대 골에 넣어보세요!',
  maxPlayers: MAX_PLAYERS,
  minPlayers: MIN_PLAYERS,
  RoomView: GameRoom,
  createEngine: createGameEngine,
  handleHostMessage,
  handleGuestMessage,
  createHandlers,
};

export default airhockey;
