export const PLAYER_COLORS = [
  '#ff6b9d',
  '#64ffda',
  '#ffd166',
  '#c084fc',
  '#4ade80',
  '#fb923c',
];

export function getPlayerColorByIndex(index) {
  return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length];
}

export function getPlayerColor(players, name) {
  const index = players.findIndex((p) => p.name === name);
  return getPlayerColorByIndex(index === -1 ? 0 : index);
}

export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};
