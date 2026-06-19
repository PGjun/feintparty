import {
  BALL_RADIUS,
  GOAL_HALF_WIDTH,
  PADDLE_RADIUS,
  getPaddleBounds,
} from './constants.js';

export const FIXED_DT = 1 / 60;
export const BROADCAST_EVERY_STEPS = 2;
export const BALL_MAX_SPEED = 0.92;
export const BALL_MIN_SPEED = 0.1;
export const SPAWN_RAMP_SEC = 1.6;
export const SPAWN_INITIAL_SPEED = 0.045;
export const PADDLE_HIT_COOLDOWN_STEPS = 4;
export const PADDLE_POWER_SOFT = 0.1;
export const PADDLE_POWER_FULL = 0.72;
export const TRANSFER_MIN = 0.28;
export const TRANSFER_MAX = 1.2;
export const RESTITUTION_MIN = 0.88;
export const RESTITUTION_MAX = 1.18;
export const SWIPE_BOOST = 0.5;
const SEPARATION_EPS = 0.005;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function length(x, y) {
  return Math.hypot(x, y);
}

function inGoalMouth(x) {
  return Math.abs(x - 0.5) < GOAL_HALF_WIDTH;
}

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function getSpeedLimits(ball) {
  if (ball.spawnRamp > 0) {
    const t = 1 - ball.spawnRamp / SPAWN_RAMP_SEC;
    const eased = smoothstep(t);
    return {
      min: 0,
      max: SPAWN_INITIAL_SPEED + (BALL_MAX_SPEED - SPAWN_INITIAL_SPEED) * eased,
    };
  }
  return { min: BALL_MIN_SPEED, max: BALL_MAX_SPEED };
}

function capSpeed(ball, dt) {
  if (ball.spawnRamp > 0) {
    ball.spawnRamp = Math.max(0, ball.spawnRamp - dt);
  }

  const { min, max } = getSpeedLimits(ball);
  const speed = length(ball.vx, ball.vy);
  if (speed > max) {
    ball.vx = (ball.vx / speed) * max;
    ball.vy = (ball.vy / speed) * max;
  } else if (min > 0 && speed > 0.04 && speed < min) {
    ball.vx = (ball.vx / speed) * min;
    ball.vy = (ball.vy / speed) * min;
  }
}

function hitPowerFactor(paddleVx, paddleVy) {
  const speed = length(paddleVx, paddleVy);
  const t = (speed - PADDLE_POWER_SOFT) / (PADDLE_POWER_FULL - PADDLE_POWER_SOFT);
  return smoothstep(t);
}

function resolveWallCollisions(ball) {
  const minX = BALL_RADIUS;
  const maxX = 1 - BALL_RADIUS;
  const minY = BALL_RADIUS;
  const maxY = 1 - BALL_RADIUS;

  if (ball.x < minX) {
    ball.x = minX;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x > maxX) {
    ball.x = maxX;
    ball.vx = -Math.abs(ball.vx);
  }

  if (ball.y < minY) {
    if (inGoalMouth(ball.x)) {
      return { goal: 0 };
    }
    ball.y = minY;
    ball.vy = Math.abs(ball.vy);
  } else if (ball.y > maxY) {
    if (inGoalMouth(ball.x)) {
      return { goal: 1 };
    }
    ball.y = maxY;
    ball.vy = -Math.abs(ball.vy);
  }

  return null;
}

function contactNormal(ball, paddle) {
  const dx = ball.x - paddle.x;
  const dy = ball.y - paddle.y;
  const dist = length(dx, dy);
  if (dist < 1e-8) {
    return { nx: 0, ny: ball.y >= paddle.y ? 1 : -1, dist: 0 };
  }
  return { nx: dx / dist, ny: dy / dist, dist };
}

function separateBallFromPaddle(ball, paddle) {
  const { nx, ny, dist } = contactNormal(ball, paddle);
  const minDist = BALL_RADIUS + PADDLE_RADIUS;
  if (dist >= minDist) return null;

  const push = minDist - dist + SEPARATION_EPS;
  ball.x += nx * push;
  ball.y += ny * push;
  return { nx, ny };
}

function applyPaddleImpulse(ball, nx, ny, paddleVx, paddleVy, cooldowns, paddleIndex, dt) {
  if (cooldowns[paddleIndex] > 0) return false;

  const relVx = ball.vx - paddleVx;
  const relVy = ball.vy - paddleVy;
  const relDot = relVx * nx + relVy * ny;
  if (relDot >= 0) return false;

  const power = hitPowerFactor(paddleVx, paddleVy);
  const restitution = RESTITUTION_MIN + (RESTITUTION_MAX - RESTITUTION_MIN) * power;
  const transfer = TRANSFER_MIN + (TRANSFER_MAX - TRANSFER_MIN) * power;

  ball.vx -= (1 + restitution) * relDot * nx;
  ball.vy -= (1 + restitution) * relDot * ny;
  ball.vx += paddleVx * transfer;
  ball.vy += paddleVy * transfer;

  const paddleSpeed = length(paddleVx, paddleVy);
  if (paddleSpeed > PADDLE_POWER_SOFT) {
    const boost = power * paddleSpeed * SWIPE_BOOST;
    ball.vx += (paddleVx / paddleSpeed) * boost;
    ball.vy += (paddleVy / paddleSpeed) * boost;
  }

  if (ball.spawnRamp > 0) ball.spawnRamp = 0;

  capSpeed(ball, dt);
  cooldowns[paddleIndex] = PADDLE_HIT_COOLDOWN_STEPS;
  return true;
}

function resolvePaddleContact(
  ball,
  paddle,
  paddleIndex,
  cooldowns,
  paddleVx,
  paddleVy,
  dt,
  hitThisStep
) {
  if (cooldowns[paddleIndex] > 0 || hitThisStep[paddleIndex]) {
    return false;
  }

  const normal = separateBallFromPaddle(ball, paddle);
  if (!normal) return false;

  const hit = applyPaddleImpulse(
    ball,
    normal.nx,
    normal.ny,
    paddleVx,
    paddleVy,
    cooldowns,
    paddleIndex,
    dt
  );
  if (hit) hitThisStep[paddleIndex] = true;
  return hit;
}

function resolvePaddleSweep(
  ball,
  paddle,
  prevX,
  prevY,
  paddleIndex,
  cooldowns,
  paddleVx,
  paddleVy,
  dt,
  hitThisStep
) {
  if (hitThisStep[paddleIndex]) return false;

  const minDist = BALL_RADIUS + PADDLE_RADIUS;
  const mx = ball.x - prevX;
  const my = ball.y - prevY;
  const travel = length(mx, my);
  if (travel < 1e-10) {
    return resolvePaddleContact(
      ball,
      paddle,
      paddleIndex,
      cooldowns,
      paddleVx,
      paddleVy,
      dt,
      hitThisStep
    );
  }

  const fx = prevX - paddle.x;
  const fy = prevY - paddle.y;
  const a = mx * mx + my * my;
  const b = 2 * (fx * mx + fy * my);
  const c = fx * fx + fy * fy - minDist * minDist;
  const disc = b * b - 4 * a * c;

  if (disc < 0) {
    return resolvePaddleContact(
      ball,
      paddle,
      paddleIndex,
      cooldowns,
      paddleVx,
      paddleVy,
      dt,
      hitThisStep
    );
  }

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);
  let tHit = null;
  if (t1 >= 0 && t1 <= 1) tHit = t1;
  else if (t2 >= 0 && t2 <= 1) tHit = t2;

  if (tHit == null) {
    return resolvePaddleContact(
      ball,
      paddle,
      paddleIndex,
      cooldowns,
      paddleVx,
      paddleVy,
      dt,
      hitThisStep
    );
  }

  const hitX = prevX + mx * tHit;
  const hitY = prevY + my * tHit;
  const nx = (hitX - paddle.x) / minDist;
  const ny = (hitY - paddle.y) / minDist;

  ball.x = hitX + nx * SEPARATION_EPS;
  ball.y = hitY + ny * SEPARATION_EPS;

  const hit = applyPaddleImpulse(
    ball,
    nx,
    ny,
    paddleVx,
    paddleVy,
    cooldowns,
    paddleIndex,
    dt
  );
  if (hit) hitThisStep[paddleIndex] = true;
  return hit;
}

function resolvePaddlePath(
  ball,
  ax,
  ay,
  bx,
  by,
  paddleIndex,
  cooldowns,
  paddleVx,
  paddleVy,
  dt,
  hitThisStep
) {
  if (hitThisStep[paddleIndex] || cooldowns[paddleIndex] > 0) return false;

  const mx = bx - ax;
  const my = by - ay;
  const travel = length(mx, my);
  const minDist = BALL_RADIUS + PADDLE_RADIUS;

  if (travel < minDist * 0.08) {
    return resolvePaddleContact(
      ball,
      { x: bx, y: by },
      paddleIndex,
      cooldowns,
      paddleVx,
      paddleVy,
      dt,
      hitThisStep
    );
  }

  const steps = Math.min(20, Math.max(2, Math.ceil(travel / (minDist * 0.25))));
  for (let s = 1; s <= steps; s++) {
    if (hitThisStep[paddleIndex] || cooldowns[paddleIndex] > 0) break;

    const t = s / steps;
    const paddle = { x: ax + mx * t, y: ay + my * t };
    if (
      resolvePaddleContact(
        ball,
        paddle,
        paddleIndex,
        cooldowns,
        paddleVx,
        paddleVy,
        dt / steps,
        hitThisStep
      )
    ) {
      return true;
    }
  }
  return hitThisStep[paddleIndex];
}

/**
 * @param {Array<{ from: {x:number,y:number}, to: {x:number,y:number} }>} paddleSegments
 * @returns {{ goal: 0 | 1 } | null}
 */
export function stepPhysicsWorld(world, dt, paddleSegments = []) {
  const ball = world.ball;
  const prevX = ball.x;
  const prevY = ball.y;

  if (!world.paddleHitCooldown) {
    world.paddleHitCooldown = [0, 0];
  }
  for (let i = 0; i < world.paddleHitCooldown.length; i++) {
    if (world.paddleHitCooldown[i] > 0) {
      world.paddleHitCooldown[i] -= 1;
    }
  }

  const hitThisStep = [false, false];

  for (let i = 0; i < world.paddles.length; i++) {
    const seg = paddleSegments[i];
    if (!seg) continue;
    const paddleVel = world.paddleVel?.[i] ?? { x: 0, y: 0 };
    resolvePaddlePath(
      ball,
      seg.from.x,
      seg.from.y,
      seg.to.x,
      seg.to.y,
      i,
      world.paddleHitCooldown,
      paddleVel.x,
      paddleVel.y,
      dt,
      hitThisStep
    );
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  const goal = resolveWallCollisions(ball);
  if (goal) return goal;

  for (let i = 0; i < world.paddles.length; i++) {
    const paddle = world.paddles[i];
    const paddleVel = world.paddleVel?.[i] ?? { x: 0, y: 0 };
    resolvePaddleSweep(
      ball,
      paddle,
      prevX,
      prevY,
      i,
      world.paddleHitCooldown,
      paddleVel.x,
      paddleVel.y,
      dt,
      hitThisStep
    );
  }

  capSpeed(ball, dt);
  return null;
}

export function clampPaddle(index, x, y) {
  const bounds = getPaddleBounds(index);
  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    y: clamp(y, bounds.minY, bounds.maxY),
  };
}

export function serveFromCenter(towardPlayerIndex) {
  const speed = 0.45;
  return {
    x: 0.5,
    y: 0.5,
    vx: (Math.random() - 0.5) * 0.12,
    vy: towardPlayerIndex === 0 ? speed : -speed,
  };
}

export function spawnBallForPlayer(playerIndex) {
  const bounds = getPaddleBounds(playerIndex);
  const y = bounds.minY + (bounds.maxY - bounds.minY) * 0.35;
  const dir = playerIndex === 0 ? -1 : 1;
  return {
    x: 0.5,
    y,
    vx: 0,
    vy: dir * SPAWN_INITIAL_SPEED,
    spawnRamp: SPAWN_RAMP_SEC,
  };
}
