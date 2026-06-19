/** @typedef {object} StatusBarDisplay
 * @property {'ok' | 'warn' | 'error'} level
 * @property {string} text
 */

/**
 * @typedef {object} HeaderStatusDisplay
 * @property {'ok' | 'warn' | 'error'} level
 * @property {string | null} icon
 * @property {string} text
 * @property {boolean} useDot
 */

/** @param {'ok' | 'warn' | 'error'} level */
export function statusClassName(level) {
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
 * @param {object} params
 * @param {StatusBarDisplay | null | undefined} params.signalingStatus
 * @param {{ players: unknown[]; maxPlayers: number }} params.room
 * @param {boolean} params.isHost
 * @param {boolean} [params.hideWhenOk]
 * @returns {HeaderStatusDisplay | null}
 */
export function resolveHeaderStatus({
  signalingStatus,
  room,
  isHost,
  hideWhenOk = false,
}) {
  if (signalingStatus?.level === 'error' || signalingStatus?.level === 'warn') {
    return formatServerHeaderStatus(signalingStatus);
  }

  if (signalingStatus?.level === 'ok') {
    return formatServerHeaderStatus(signalingStatus);
  }

  if (hideWhenOk) return null;

  const count = `${room.players.length}/${room.maxPlayers}명`;
  return isHost
    ? { level: 'ok', icon: '👑', text: count, useDot: false }
    : { level: 'ok', icon: null, text: count, useDot: true };
}
