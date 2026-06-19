import { mergeEngineRoom } from '../../platform/roomState.js';

function syncRoom(setRoom, engine) {
  setRoom?.((prev) =>
    prev ? mergeEngineRoom(prev, engine.getHostState()) : engine.getHostState()
  );
}

export function handleHostMessage(msg, guestSocketId, ctx) {
  const { engine, roomPlayersRef, setRoom } = ctx;
  if (!engine) return false;

  if (msg.type === 'yang-action') {
    const player = roomPlayersRef.current.find((p) => p.id === guestSocketId);
    engine.handleAction(guestSocketId, player?.name || '플레이어', msg.action, msg);
    syncRoom(setRoom, engine);
    return true;
  }

  if (msg.type === 'chat') {
    const player = roomPlayersRef.current.find((p) => p.id === guestSocketId);
    engine.handleChat(guestSocketId, player?.name || '플레이어', msg.text);
    syncRoom(setRoom, engine);
    return true;
  }

  return false;
}

export function handleGuestMessage(msg, ctx) {
  const { setRoom } = ctx;

  if (msg.type === 'state') {
    setRoom((prev) => (prev ? mergeEngineRoom(prev, msg.state) : msg.state));
    return true;
  }

  return false;
}

export function onHostEngineReady(engine) {
  engine.startAssigning();
}
