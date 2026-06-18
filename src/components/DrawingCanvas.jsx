import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

const COLORS = ['#000', '#e94560', '#533483', '#0f3460', '#64ffda', '#ffd700', '#ff6b35', '#fff'];
const ASPECT_RATIO = 4 / 3;
const MAX_CANVAS_WIDTH = 480;

const DrawingCanvas = forwardRef(function DrawingCanvas(
  { isDrawer, onDraw, onClear },
  ref
) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const canvasSize = useRef({ width: 0, height: 0 });
  const [color, setColor] = useState('#000');
  const [size, setSize] = useState(4);

  const drawStroke = useCallback((ctx, stroke, w, h) => {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size * w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.from.x * w, stroke.from.y * h);
    ctx.lineTo(stroke.to.x * w, stroke.to.y * h);
    ctx.stroke();
  }, []);

  const drawRemoteStroke = useCallback(
    (stroke) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { width, height } = canvasSize.current;
      const ctx = canvas.getContext('2d');
      drawStroke(ctx, stroke, width, height);
    },
    [drawStroke]
  );

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  useImperativeHandle(ref, () => ({
    drawStroke: drawRemoteStroke,
    clear: clearCanvas,
  }));

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const width = Math.min(wrapper.clientWidth, MAX_CANVAS_WIDTH);
    const height = Math.round(width / ASPECT_RATIO);

    canvas.width = width;
    canvas.height = height;
    canvasSize.current = { width, height };
  }, []);

  const getPosNorm = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] ?? e.changedTouches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;

    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const emitStroke = useCallback(
    (from, to) => {
      const { width, height } = canvasSize.current;
      const stroke = { from, to, color, size: size / width };
      const ctx = canvasRef.current.getContext('2d');
      drawStroke(ctx, stroke, width, height);
      onDraw?.(stroke);
    },
    [color, size, onDraw, drawStroke]
  );

  useEffect(() => {
    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isDrawer) return;

    const blurActiveInput = () => {
      document.activeElement instanceof HTMLElement && document.activeElement.blur();
    };

    const preventScroll = (e) => {
      if (drawing.current) e.preventDefault();
    };

    const onTouchStart = (e) => {
      e.preventDefault();
      blurActiveInput();
      drawing.current = true;
      lastPos.current = getPosNorm(e);
      document.body.classList.add('is-drawing');
    };

    const onTouchMove = (e) => {
      if (!drawing.current) return;
      e.preventDefault();
      const pos = getPosNorm(e);
      emitStroke(lastPos.current, pos);
      lastPos.current = pos;
    };

    const onTouchEnd = (e) => {
      e.preventDefault();
      drawing.current = false;
      lastPos.current = null;
      document.body.classList.remove('is-drawing');
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      document.removeEventListener('touchmove', preventScroll);
      document.body.classList.remove('is-drawing');
    };
  }, [isDrawer, getPosNorm, emitStroke]);

  const handleStart = (e) => {
    if (!isDrawer) return;
    drawing.current = true;
    lastPos.current = getPosNorm(e);
  };

  const handleMove = (e) => {
    if (!isDrawer || !drawing.current) return;
    const pos = getPosNorm(e);
    emitStroke(lastPos.current, pos);
    lastPos.current = pos;
  };

  const handleEnd = () => {
    drawing.current = false;
    lastPos.current = null;
  };

  const handleClear = () => {
    if (!isDrawer) return;
    clearCanvas();
    onClear?.();
  };

  return (
    <div
      ref={wrapperRef}
      className={`canvas-wrapper ${!isDrawer ? 'readonly' : ''} ${isDrawer ? 'drawing' : ''}`}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
      />
      {isDrawer && (
        <div className="toolbar">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-btn ${color === c ? 'active' : ''}`}
              style={{ background: c, border: c === '#fff' ? '1px solid #ccc' : undefined }}
              onClick={() => setColor(c)}
            />
          ))}
          <input
            type="range"
            className="size-slider"
            min="2"
            max="20"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <button type="button" className="btn-clear" onClick={handleClear}>
            지우기
          </button>
        </div>
      )}
    </div>
  );
});

export default DrawingCanvas;
