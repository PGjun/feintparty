import { mergeEngineRoom } from '../../platform/roomState.js';

export function handleHostMessage(msg, guestSocketId, ctx) {
  const { engine, hostPeers } = ctx;
  if (!engine) return false;

  if (msg.type === 'paddle') {
    engine.setPaddlePosition(guestSocketId, msg.x, msg.y);
    return true;
  }

  if (msg.type === 'emoji') {
    const player = ctx.roomPlayersRef?.current?.find((p) => p.id === guestSocketId);
    hostPeers.broadcast({
      type: 'emoji',
      playerId: guestSocketId,
      name: player?.name ?? '플레이어',
      emoji: msg.emoji,
    });
    return true;
  }

  if (msg.type === 'chat') {
    const player = ctx.roomPlayersRef?.current?.find((p) => p.id === guestSocketId);
    engine.handleChat(guestSocketId, player?.name || '플레이어', msg.text);
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

  if (msg.type === 'emoji') {
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            emojiEvent: {
              emoji: msg.emoji,
              name: msg.name,
              time: Date.now(),
            },
          }
        : prev
    );
    return true;
  }

  return false;
}
