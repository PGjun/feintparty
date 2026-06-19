const INTERP_MS = 1000 / 30;
const RENDER_DELAY_MS = 90;
const MAX_EXTRAP_SEC = 0.12;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hermite1D(p0, p1, v0, v1, t, spanSec) {
  const t2 = t * t;
  const t3 = t2 * t;
  const m0 = v0 * spanSec;
  const m1 = v1 * spanSec;
  return (
    (2 * t3 - 3 * t2 + 1) * p0 +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * p1 +
    (t3 - t2) * m1
  );
}

function ballVelocity(ball) {
  return {
    vx: ball.vx ?? 0,
    vy: ball.vy ?? 0,
  };
}

export function captureSnapshot(room) {
  if (!room?.paddles || !room?.ball) return null;
  const vel = ballVelocity(room.ball);
  return {
    paddles: room.paddles.map((p) => ({ x: p.x, y: p.y })),
    ball: {
      x: room.ball.x,
      y: room.ball.y,
      vx: vel.vx,
      vy: vel.vy,
    },
    at: performance.now(),
  };
}

export function interpolateSnapshots(prev, curr, now) {
  if (!curr) return null;
  if (!prev) return { paddles: curr.paddles, ball: curr.ball };

  const renderTime = now - RENDER_DELAY_MS;
  const span = curr.at - prev.at || INTERP_MS;
  const spanSec = span / 1000;
  const elapsed = renderTime - prev.at;
  const alpha = Math.min(1, Math.max(0, elapsed / span));
  const paddleElapsed = now - prev.at;
  const paddleAlpha = Math.min(1, Math.max(0, paddleElapsed / span));

  const prevVel = ballVelocity(prev.ball);
  const currVel = ballVelocity(curr.ball);

  let ball;
  if (elapsed <= span) {
    ball = {
      x: hermite1D(prev.ball.x, curr.ball.x, prevVel.vx, currVel.vx, alpha, spanSec),
      y: hermite1D(prev.ball.y, curr.ball.y, prevVel.vy, currVel.vy, alpha, spanSec),
    };
  } else {
    const extra = Math.min((elapsed - span) / 1000, MAX_EXTRAP_SEC);
    ball = {
      x: curr.ball.x + currVel.vx * extra,
      y: curr.ball.y + currVel.vy * extra,
    };
  }

  return {
    paddles: curr.paddles.map((p, i) => ({
      x: lerp(prev.paddles[i].x, p.x, paddleAlpha),
      y: lerp(prev.paddles[i].y, p.y, paddleAlpha),
    })),
    ball,
  };
}
