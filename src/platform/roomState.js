export function mergeEngineRoom(prev, engineState) {
  if (!prev) return engineState;
  return {
    ...engineState,
    gameId: prev.gameId,
    hostId: prev.hostId,
    maxPlayers: prev.maxPlayers,
  };
}

export function appendMessage(messages, message) {
  return [...(messages || []), message].slice(-50);
}
