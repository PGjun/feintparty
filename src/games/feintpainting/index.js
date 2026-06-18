import { createGameEngine } from './gameEngine.js';
import { mergeEngineRoom } from '../../platform/roomState.js';
import GameRoom from './GameRoom.jsx';
import { MAX_PLAYERS, MIN_PLAYERS } from './constants.js';
import {
  handleHostMessage,
  handleGuestMessage,
  isFreeDrawStatus,
} from './protocol.js';

export { isFreeDrawStatus };

export function createHandlers(ctx) {
  const {
    isHost,
    myId,
    myName,
    room,
    isServerMode,
    emitGameInput,
    gameEngineRef,
    hostPeersRef,
    guestPeerRef,
    canvasRef,
    socketRef,
    roomCode,
    setRoom,
    setP2pStatus,
  } = ctx;

  return {
    handleStartGame(roundCount) {
      if (isServerMode) {
        emitGameInput({ type: 'host-start-game', roundCount });
        return;
      }
      const engine = gameEngineRef.current;
      engine?.startGame(roundCount);
      socketRef.current?.emit('game-started', { code: roomCode });
      setRoom((prev) =>
        prev ? mergeEngineRoom(prev, engine.getHostState()) : engine?.getHostState()
      );
      setP2pStatus(null);
    },

    handleSendChat(text) {
      if (isServerMode) {
        emitGameInput({ type: 'chat', text });
        return;
      }
      if (isHost) {
        const engine = gameEngineRef.current;
        engine?.handleChat(myId, myName, text);
        setRoom((prev) =>
          prev ? mergeEngineRoom(prev, engine.getHostState()) : engine?.getHostState()
        );
      } else {
        guestPeerRef.current?.send({ type: 'chat', text });
      }
    },

    handleDraw(stroke) {
      const status = gameEngineRef.current?.getHostState()?.status ?? room?.status;
      if (isFreeDrawStatus(status)) {
        if (isServerMode) {
          emitGameInput({ type: 'lobby-draw', stroke });
          return;
        }
        if (isHost) {
          hostPeersRef.current?.broadcast({ type: 'draw', stroke });
        } else {
          guestPeerRef.current?.send({ type: 'lobby-draw', stroke });
        }
        return;
      }
      if (isServerMode) {
        emitGameInput({ type: 'game-draw', stroke });
        return;
      }
      if (isHost) {
        gameEngineRef.current?.handleDraw(stroke);
      } else if (room?.isDrawer) {
        guestPeerRef.current?.send({ type: 'game-draw', stroke });
      }
    },

    handleClear() {
      const status = gameEngineRef.current?.getHostState()?.status ?? room?.status;
      if (isFreeDrawStatus(status)) {
        if (isServerMode) {
          emitGameInput({ type: 'lobby-clear' });
          return;
        }
        if (isHost) {
          canvasRef.current?.clear();
          hostPeersRef.current?.broadcast({ type: 'clear' });
        } else {
          guestPeerRef.current?.send({ type: 'lobby-clear' });
        }
        return;
      }
      if (isServerMode) {
        emitGameInput({ type: 'game-clear' });
        return;
      }
      if (isHost) {
        gameEngineRef.current?.handleClearCanvas();
      } else if (room?.isDrawer) {
        guestPeerRef.current?.send({ type: 'game-clear' });
      }
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
