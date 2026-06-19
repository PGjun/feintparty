import { useCallback, useEffect, useRef } from 'react';
import {
  BALL_RADIUS,
  GOAL_HALF_WIDTH,
  PADDLE_RADIUS,
} from './constants.js';
import { captureSnapshot, interpolateSnapshots } from './interpolate.js';

const PADDLE_SEND_MS = 16;
const PADDLE_RENDER_BLEND = 0.7;

function drawTable(ctx, width, height, { flip, goalCelebration, inactive }) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const toX = (x) => x * width;
  const toY = (y) => y * height;
  const mapX = (x) => (flip ? 1 - x : x);
  const mapY = (y) => (flip ? 1 - y : y);

  ctx.fillStyle = inactive ? '#1a2744' : '#1e3a5f';
  ctx.fillRect(0, 0, width, height);

  const goalW = GOAL_HALF_WIDTH * 2 * width;
  const goalX = (width - goalW) / 2;
  const wallH = Math.max(8, height * 0.018);

  ctx.fillStyle = inactive ? '#2a3548' : '#334155';

  ctx.fillRect(0, 0, width, wallH);
  ctx.fillRect(0, 0, (width - goalW) / 2, height);
  ctx.fillRect(width - (width - goalW) / 2, 0, (width - goalW) / 2, height);
  ctx.fillRect(0, height - wallH, width, wallH);

  ctx.fillStyle = inactive ? '#1f2937' : '#0f172a';
  ctx.fillRect(goalX, 0, goalW, wallH + 4);
  ctx.fillRect(goalX, height - wallH - 4, goalW, wallH + 4);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, width * 0.18, 0, Math.PI * 2);
  ctx.stroke();

  if (goalCelebration) {
    ctx.fillStyle = 'rgba(233, 69, 96, 0.25)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎉 GOAL!', width / 2, height / 2);
  }

  ctx.restore();

  return { toX, toY, mapX, mapY };
}

function drawDisc(ctx, x, y, radius, color, { toX, toY, mapX, mapY }) {
  ctx.beginPath();
  ctx.arc(toX(mapX(x)), toY(mapY(y)), radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function HockeyTable({
  room,
  onPaddleMove,
  inactive = false,
}) {
  const canvasRef = useRef(null);
  const flip = room.myPlayerIndex === 1;
  const animRef = useRef(null);
  const lastPaddleEmit = useRef(0);
  const snapshotsRef = useRef({ prev: null, curr: null });
  const localPaddleRef = useRef(null);
  const pointerActiveRef = useRef(false);

  useEffect(() => {
    if (!room.paddles || !room.ball) return;
    const next = captureSnapshot(room);
    if (!next) return;

    const { curr } = snapshotsRef.current;
    if (
      curr &&
      curr.ball.x === next.ball.x &&
      curr.ball.y === next.ball.y &&
      curr.ball.vx === next.ball.vx &&
      curr.ball.vy === next.ball.vy &&
      curr.paddles[0].x === next.paddles[0].x &&
      curr.paddles[0].y === next.paddles[0].y &&
      curr.paddles[1].x === next.paddles[1].x &&
      curr.paddles[1].y === next.paddles[1].y
    ) {
      return;
    }

    snapshotsRef.current = {
      prev: curr ?? next,
      curr: next,
    };
  }, [room.paddles, room.ball, room.physicsStep, room.serverTime]);

  const getRenderState = useCallback(() => {
    const { prev, curr } = snapshotsRef.current;
    const interpolated = interpolateSnapshots(prev, curr, performance.now());

    const paddles = (interpolated?.paddles ?? room.paddles).map((p, i) => {
      if (i !== room.myPlayerIndex) return p;
      if (room.status !== 'playing') return p;
      if (pointerActiveRef.current && localPaddleRef.current) {
        const server = room.paddles[i] ?? p;
        const local = localPaddleRef.current;
        const t = PADDLE_RENDER_BLEND;
        return {
          x: server.x + (local.x - server.x) * t,
          y: server.y + (local.y - server.y) * t,
        };
      }
      return room.paddles[i] ?? p;
    });

    const ball = interpolated?.ball ?? room.ball;

    return { paddles, ball };
  }, [room.paddles, room.ball, room.myPlayerIndex, room.status]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !room.paddles) return;

    const { paddles, ball } = getRenderState();

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const scale = width;
    const helpers = drawTable(ctx, width, height, {
      flip,
      goalCelebration: room.status === 'goalCelebration' ? room.goalCelebration : null,
      inactive,
    });

    const paddleR = PADDLE_RADIUS * scale;
    const ballR = BALL_RADIUS * scale;

    room.paddles.forEach((paddle, i) => {
      const isMine = i === room.myPlayerIndex;
      const p = paddles[i] ?? paddle;
      drawDisc(
        ctx,
        p.x,
        p.y,
        paddleR,
        isMine ? '#4ade80' : '#f87171',
        helpers
      );
    });

    if (ball && room.status !== 'countdown') {
      drawDisc(ctx, ball.x, ball.y, ballR, '#f8fafc', helpers);
    }

    if (room.status === 'countdown' && room.countdown > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 64px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(room.countdown), width / 2, height / 2);
    }
  }, [room, flip, inactive, getRenderState]);

  useEffect(() => {
    const loop = () => {
      paint();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [paint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      paint();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [paint]);

  const handlePointer = useCallback(
    (clientX, clientY, force = false) => {
      if (inactive || room.status !== 'playing' || !onPaddleMove) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const viewX = clamp((clientX - rect.left) / rect.width, 0, 1);
      const viewY = clamp((clientY - rect.top) / rect.height, 0, 1);
      const serverX = flip ? 1 - viewX : viewX;
      const serverY = flip ? 1 - viewY : viewY;

      pointerActiveRef.current = true;
      localPaddleRef.current = { x: serverX, y: serverY };

      const now = Date.now();
      if (!force && now - lastPaddleEmit.current < PADDLE_SEND_MS) return;
      lastPaddleEmit.current = now;
      onPaddleMove(serverX, serverY);
    },
    [inactive, room.status, onPaddleMove, flip]
  );

  return (
    <div className="hockey-table-wrap">
      <canvas
        ref={canvasRef}
        className="hockey-table"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handlePointer(e.clientX, e.clientY, true);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType !== 'touch') return;
          handlePointer(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          pointerActiveRef.current = false;
          localPaddleRef.current = null;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }}
      />
    </div>
  );
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
