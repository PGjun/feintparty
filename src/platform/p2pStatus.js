/** @typedef {'connecting' | 'reconnecting' | 'connected' | 'degraded' | 'disconnected' | 'idle'} P2pPhase */

/**
 * @typedef {object} P2pStatusInfo
 * @property {P2pPhase} phase
 * @property {number} connected
 * @property {number} expected
 * @property {number} [attempt]
 * @property {number} [maxAttempts]
 * @property {boolean} [isHost]
 */

/**
 * @typedef {object} StatusBarDisplay
 * @property {'ok' | 'warn' | 'error'} level
 * @property {string} text
 */

/**
 * @param {P2pStatusInfo | null | undefined} info
 * @returns {StatusBarDisplay | null}
 */
export function formatP2pStatus(info) {
  if (!info) return null;

  switch (info.phase) {
    case 'idle':
    case 'connected':
      return null;
    case 'connecting':
      return { level: 'warn', text: '📡 연결 중...' };
    case 'reconnecting':
      return {
        level: 'warn',
        text: `🔄 재연결 중... (${info.attempt ?? 1}/${info.maxAttempts ?? 5})`,
      };
    case 'degraded':
      return { level: 'warn', text: '⚠️ 연결 불안정' };
    case 'disconnected':
      return { level: 'error', text: '🔴 연결이 끊어졌어요' };
    default:
      return null;
  }
}

/**
 * @param {{ players: { length: number }[]; maxPlayers: number }} room
 * @param {boolean} isHost
 */
export function formatParticipantStatus(room, isHost) {
  const count = `${room.players.length}/${room.maxPlayers}명`;
  return isHost ? `👑 방장 — 참가자 ${count}` : `참가자 ${count}`;
}

/**
 * @param {object} params
 * @param {StatusBarDisplay | null | undefined} params.signalingStatus
 * @param {StatusBarDisplay | null | undefined} params.p2pStatus
 * @param {{ players: unknown[]; maxPlayers: number }} params.room
 * @param {boolean} params.isHost
 * @param {boolean} [params.hideWhenOk]
 * @returns {StatusBarDisplay | null}
 */
export function resolveRoomStatusBar({
  signalingStatus,
  p2pStatus,
  room,
  isHost,
  hideWhenOk = false,
}) {
  if (signalingStatus?.level === 'error' || signalingStatus?.level === 'warn') {
    return signalingStatus;
  }

  if (p2pStatus?.level === 'error' || p2pStatus?.level === 'warn') {
    return p2pStatus;
  }

  if (signalingStatus?.level === 'ok') {
    return signalingStatus;
  }

  if (hideWhenOk) {
    return null;
  }

  return { level: 'ok', text: formatParticipantStatus(room, isHost) };
}

/** @param {'ok' | 'warn' | 'error'} level */
export function p2pStatusClassName(level) {
  if (level === 'ok') return 'header-status ok';
  if (level === 'error') return 'header-status error';
  return 'header-status warn';
}

/** @param {StatusBarDisplay} status */
function formatServerHeaderStatus(status) {
  const emojiMatch = status.text.match(/^(\p{Extended_Pictographic}+)\s*(.*)$/u);
  if (emojiMatch) {
    return {
      level: status.level,
      icon: emojiMatch[1],
      text: emojiMatch[2],
      useDot: false,
    };
  }
  return { level: status.level, icon: null, text: status.text, useDot: true };
}

/**
 * @typedef {object} HeaderStatusDisplay
 * @property {'ok' | 'warn' | 'error'} level
 * @property {string | null} icon
 * @property {string} text
 * @property {boolean} useDot
 */

/**
 * @param {object} params
 * @param {StatusBarDisplay | null | undefined} params.signalingStatus
 * @param {StatusBarDisplay | null | undefined} params.p2pStatus
 * @param {{ players: unknown[]; maxPlayers: number }} params.room
 * @param {boolean} params.isHost
 * @param {boolean} [params.hideWhenOk]
 * @returns {HeaderStatusDisplay | null}
 */
export function resolveHeaderStatus({
  signalingStatus,
  p2pStatus,
  room,
  isHost,
  hideWhenOk = false,
}) {
  if (room?.mode === 'server') {
    if (signalingStatus?.level === 'error' || signalingStatus?.level === 'warn') {
      return formatServerHeaderStatus(signalingStatus);
    }
    if (hideWhenOk) return null;
    const count = `${room.players.length}/${room.maxPlayers}명`;
    return isHost
      ? { level: 'ok', icon: '👑', text: count, useDot: false }
      : { level: 'ok', icon: null, text: count, useDot: true };
  }

  const resolved = resolveRoomStatusBar({
    signalingStatus,
    p2pStatus,
    room,
    isHost,
    hideWhenOk,
  });

  if (!resolved) return null;

  const count = `${room.players.length}/${room.maxPlayers}명`;

  if (resolved.level === 'ok') {
    if (isHost) {
      return { level: 'ok', icon: '👑', text: count, useDot: false };
    }
    return { level: 'ok', icon: null, text: count, useDot: true };
  }

  const emojiMatch = resolved.text.match(/^(\p{Extended_Pictographic}+)\s*(.*)$/u);
  if (emojiMatch) {
    return {
      level: resolved.level,
      icon: emojiMatch[1],
      text: emojiMatch[2],
      useDot: false,
    };
  }

  return {
    level: resolved.level,
    icon: null,
    text: resolved.text,
    useDot: true,
  };
}
