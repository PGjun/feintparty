export function parseRoomUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    gameId: params.get('game') || null,
    roomCode: params.get('room')?.toUpperCase() || '',
  };
}

export function buildInviteLink(roomCode, gameId = null) {
  const url = new URL(window.location.origin);
  url.searchParams.set('room', roomCode);
  if (gameId) url.searchParams.set('game', gameId);
  return url.toString().replace(/\/$/, '');
}

export function setUrlParams({ gameId, roomCode }) {
  const url = new URL(window.location.href);
  if (gameId) url.searchParams.set('game', gameId);
  else url.searchParams.delete('game');
  if (roomCode) url.searchParams.set('room', roomCode);
  else url.searchParams.delete('room');
  window.history.replaceState({}, '', url.pathname + url.search);
}

export function confirmLeaveRoom() {
  return window.confirm('방에서 나가시겠습니까?');
}

export function confirmReturnToWaitingRoom() {
  return window.confirm('게임을 나가고 대기방으로 돌아가시겠습니까?');
}
