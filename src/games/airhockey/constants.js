export const MAX_PLAYERS = 2;
export const MIN_PLAYERS = 2;
export const MIN_TARGET_SCORE = 1;
export const MAX_TARGET_SCORE = 20;
export const DEFAULT_TARGET_SCORE = 7;

export const EMOJIS = ['👏', '🔥', '😱', '😂', '😭'];
export const EMOJI_COOLDOWN_MS = 1500;

export const PHYSICS_HZ = 60;
export const TICK_MS = 1000 / PHYSICS_HZ;
export const PADDLE_RADIUS = 0.055;
export const BALL_RADIUS = 0.024;
export const GOAL_HALF_WIDTH = 0.19;
export const GOAL_CELEBRATION_MS = 900;
export const COUNTDOWN_SECONDS = 3;

export const CENTER_Y = 0.5;
export const PADDLE_EDGE_INSET = 0.02;
/** 골라인 ↔ 패들 가장자리 간격 (측면 벽보다 훨씬 좁게) */
export const GOAL_LINE_GAP = 0.006;

/** @param {0 | 1} playerIndex */
export function getGoalFrontY(playerIndex) {
  if (playerIndex === 0) {
    return 1 - PADDLE_RADIUS - GOAL_LINE_GAP;
  }
  return PADDLE_RADIUS + GOAL_LINE_GAP;
}

/** @param {0 | 1} playerIndex */
export function getPaddleBounds(playerIndex) {
  const side = PADDLE_RADIUS + PADDLE_EDGE_INSET;
  const centerGap = PADDLE_RADIUS + PADDLE_EDGE_INSET;
  const goalY = getGoalFrontY(playerIndex);

  if (playerIndex === 0) {
    return {
      minX: side,
      maxX: 1 - side,
      minY: CENTER_Y + centerGap,
      maxY: goalY,
    };
  }

  return {
    minX: side,
    maxX: 1 - side,
    minY: goalY,
    maxY: CENTER_Y - centerGap,
  };
}

/** @param {0 | 1} playerIndex — 골대 바로 앞 수비 위치 */
export function getDefaultPaddlePosition(playerIndex) {
  return { x: 0.5, y: getGoalFrontY(playerIndex) };
}
