import { createGameEngine } from './gameEngine.js';
import { mergeEngineRoom } from '../../platform/roomState.js';
import GameRoom from './GameRoom.jsx';
import { MAX_PLAYERS, MIN_PLAYERS } from './constants.js';

export function isFreeDrawStatus(status) {
  return status === 'waiting' || status === 'finished';
}

function handleHostMessage(msg, guestSocketId, ctx) {
  const { engine, canvasRef, hostPeers, lobbyPlayersRef, setRoom } = ctx;
  if (!engine) return false;

  if (msg.type === 'lobby-draw') {
    if (!isFreeDrawStatus(engine.getHostState().status)) return true;
    canvasRef.current?.drawStroke(msg.stroke);
    hostPeers.broadcastExcept(guestSocketId, { type: 'draw', stroke: msg.stroke });
    return true;
  }

  if (msg.type === 'lobby-clear') {
    if (!isFreeDrawStatus(engine.getHostState().status)) return true;
    canvasRef.current?.clear();
    hostPeers.broadcast({ type: 'clear' });
    return true;
  }

  if (msg.type === 'chat') {
    const player = lobbyPlayersRef.current.find((p) => p.id === guestSocketId);
    engine.handleChat(guestSocketId, player?.name || '플레이어', msg.text);
    setRoom?.((prev) =>
      prev ? mergeEngineRoom(prev, engine.getHostState()) : engine.getHostState()
    );
    return true;
  }

  return false;
}

function handleGuestMessage(msg, ctx) {
  const { setP2pStatus, setRoom, canvasRef } = ctx;
  setP2pStatus(null);

  if (msg.type === 'state') {
    setRoom((prev) => (prev ? mergeEngineRoom(prev, msg.state) : msg.state));
    return true;
  }
  if (msg.type === 'draw') {
    canvasRef.current?.drawStroke(msg.stroke);
    return true;
  }
  if (msg.type === 'clear') {
    canvasRef.current?.clear();
    return true;
  }
  return false;
}

export function createHandlers(ctx) {
  const {
    isHost,
    myId,
    myName,
    room,
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
      const engine = gameEngineRef.current;
      engine?.startGame(roundCount);
      socketRef.current?.emit('game-started', { code: roomCode });
      setRoom((prev) =>
        prev ? mergeEngineRoom(prev, engine.getHostState()) : engine?.getHostState()
      );
      setP2pStatus(null);
    },

    handleSendChat(text) {
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
        if (isHost) {
          hostPeersRef.current?.broadcast({ type: 'draw', stroke });
        } else {
          guestPeerRef.current?.send({ type: 'lobby-draw', stroke });
        }
        return;
      }
      gameEngineRef.current?.handleDraw(stroke);
    },

    handleClear() {
      const status = gameEngineRef.current?.getHostState()?.status ?? room?.status;
      if (isFreeDrawStatus(status)) {
        if (isHost) {
          canvasRef.current?.clear();
          hostPeersRef.current?.broadcast({ type: 'clear' });
        } else {
          guestPeerRef.current?.send({ type: 'lobby-clear' });
        }
        return;
      }
      gameEngineRef.current?.handleClearCanvas();
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
