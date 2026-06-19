import { mergeEngineRoom } from '../../platform/roomState.js';

export function isFreeDrawStatus(status) {
  return status === 'waiting' || status === 'finished';
}

export function handleHostMessage(msg, guestSocketId, ctx) {
  const { engine, canvasRef, hostPeers, roomPlayersRef, setRoom } = ctx;
  if (!engine) return false;

  if (msg.type === 'free-draw') {
    if (!isFreeDrawStatus(engine.getHostState().status)) return true;
    canvasRef.current?.drawStroke(msg.stroke);
    hostPeers.broadcastExcept(guestSocketId, { type: 'draw', stroke: msg.stroke });
    return true;
  }

  if (msg.type === 'game-draw') {
    const hostState = engine.getHostState();
    if (hostState.status !== 'playing') return true;
    const drawer = hostState.players[hostState.drawerIndex];
    if (drawer?.id !== guestSocketId) return true;
    canvasRef.current?.drawStroke(msg.stroke);
    hostPeers.broadcastExcept(guestSocketId, { type: 'draw', stroke: msg.stroke });
    return true;
  }

  if (msg.type === 'free-clear') {
    if (!isFreeDrawStatus(engine.getHostState().status)) return true;
    canvasRef.current?.clear();
    hostPeers.broadcast({ type: 'clear' });
    return true;
  }

  if (msg.type === 'game-clear') {
    const hostState = engine.getHostState();
    if (hostState.status !== 'playing') return true;
    const drawer = hostState.players[hostState.drawerIndex];
    if (drawer?.id !== guestSocketId) return true;
    engine.handleClearCanvas();
    return true;
  }

  if (msg.type === 'chat') {
    const player = roomPlayersRef.current.find((p) => p.id === guestSocketId);
    engine.handleChat(guestSocketId, player?.name || '플레이어', msg.text);
    setRoom?.((prev) =>
      prev ? mergeEngineRoom(prev, engine.getHostState()) : engine.getHostState()
    );
    return true;
  }

  return false;
}

export function handleGuestMessage(msg, ctx) {
  const { setRoom, canvasRef } = ctx;

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
