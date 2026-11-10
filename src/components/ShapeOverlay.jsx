import { useState, useEffect, useRef } from 'react';

const MIN_SIZE = 10;

/**
 * Overlay for rendering and interacting with shapes (Rect, Ellipse, Line, Arrow, Image)
 * Uses SVG to ensure crisp rendering at any zoom level.
 * interactive=false iken şekiller sadece gösterilir (diğer araçlar açıkken).
 */
export default function ShapeOverlay({
  width,
  height,
  scale,
  shapes = [],
  interactive = true,
  onUpdateShape, // (id, changes, {transient}) => void
  onRemoveShape, // (id) => void
  onBeginChange, // () => void - sürükleme başlamadan önce geçmişe kayıt
}) {
  const [selectedId, setSelectedId] = useState(null);
  const dragRef = useRef(null); // { id, handle, startX, startY, orig }

  const effectiveSelectedId = interactive ? selectedId : null;

  const beginDrag = (e, shape, handle) => {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(shape.id);
    dragRef.current = {
      moved: false,
      id: shape.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    };
  };

  // Fare olaylarını pencereye bağla: imleç şeklin dışına çıksa da sürükleme devam etsin
  useEffect(() => {
    const handleMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.moved) {
        drag.moved = true;
        onBeginChange?.(); // ilk harekette geçmişe kaydet (tıklama geçmiş oluşturmasın)
      }
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;
      let { x, y, w, h } = drag.orig;

      switch (drag.handle) {
        case 'move':
          x += dx; y += dy;
          break;
        case 'start': // çizgi/ok başlangıç noktası
          x += dx; y += dy; w -= dx; h -= dy;
          break;
        case 'end': // çizgi/ok bitiş noktası
          w += dx; h += dy;
          break;
        default: {
          if (drag.handle.includes('w')) {
            const nw = Math.max(MIN_SIZE, w - dx);
            x += w - nw; w = nw;
          }
          if (drag.handle.includes('e')) w = Math.max(MIN_SIZE, w + dx);
          if (drag.handle.includes('n')) {
            const nh = Math.max(MIN_SIZE, h - dy);
            y += h - nh; h = nh;
          }
          if (drag.handle.includes('s')) h = Math.max(MIN_SIZE, h + dy);
        }
      }

      onUpdateShape?.(drag.id, { x, y, w, h }, { transient: true });
    };

    const handleUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [scale, onUpdateShape, onBeginChange]);

  // Keyboard delete / escape
  useEffect(() => {
    if (!effectiveSelectedId) return;
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRemoveShape?.(effectiveSelectedId);
        setSelectedId(null);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [effectiveSelectedId, onRemoveShape]);

  const handleCircle = (cx, cy, handle, cursor, shape) => (
    <circle
      key={handle}
      cx={cx} cy={cy} r="6"
      fill="#ffffff" stroke="#a855f7" strokeWidth="2"
      style={{ cursor }}
      onMouseDown={(e) => beginDrag(e, shape, handle)}
    />
  );

  return (
    <div
      className="absolute top-0 left-0 z-20"
      style={{ width, height, pointerEvents: interactive ? 'auto' : 'none' }}
      onMouseDown={() => setSelectedId(null)}
    >
      <svg width={width} height={height} className="block" style={{ overflow: 'visible' }}>
        {shapes.map(shape => {
          const isSelected = shape.id === effectiveSelectedId;
          const sx = shape.x * scale;
          const sy = shape.y * scale;
          const sw = shape.w * scale;
          const sh = shape.h * scale;
          const slw = (shape.lineWidth || 2) * scale;
          const isLine = shape.shapeType === 'line' || shape.shapeType === 'arrow';
          // Seçim kutusu için normalize edilmiş sınırlar (negatif w/h olabilir)
          const bx = Math.min(sx, sx + sw);
          const by = Math.min(sy, sy + sh);
          const bw = Math.abs(sw);
          const bh = Math.abs(sh);
          const angle = Math.atan2(sh, sw);
          const head = Math.max(10, slw * 3);

          return (
            <g
              key={shape.id}
              style={{ cursor: interactive ? 'move' : 'default' }}
              onMouseDown={(e) => beginDrag(e, shape, 'move')}
            >
              {shape.shapeType === 'rect' && (
                <rect
                  x={sx} y={sy} width={sw} height={sh}
                  fill={shape.fillColor || 'transparent'}
                  stroke={shape.color}
                  strokeWidth={slw}
                  opacity={shape.opacity ?? 1}
                />
              )}
              {shape.shapeType === 'ellipse' && (
                <ellipse
                  cx={sx + sw / 2} cy={sy + sh / 2} rx={sw / 2} ry={sh / 2}
                  fill={shape.fillColor || 'transparent'}
                  stroke={shape.color} strokeWidth={slw}
                  opacity={shape.opacity ?? 1}
                />
              )}
              {isLine && (
                <g opacity={shape.opacity ?? 1}>
                  {/* Geniş, görünmez tıklama alanı */}
                  <line x1={sx} y1={sy} x2={sx + sw} y2={sy + sh} stroke="transparent" strokeWidth={Math.max(slw, 14)} />
                  <line
                    x1={sx} y1={sy} x2={sx + sw} y2={sy + sh}
                    stroke={shape.color} strokeWidth={slw} strokeLinecap="round"
                  />
                  {shape.shapeType === 'arrow' && (
                    <polyline
                      points={`${sx + sw - head * Math.cos(angle - Math.PI / 6)},${sy + sh - head * Math.sin(angle - Math.PI / 6)} ${sx + sw},${sy + sh} ${sx + sw - head * Math.cos(angle + Math.PI / 6)},${sy + sh - head * Math.sin(angle + Math.PI / 6)}`}
                      fill="none" stroke={shape.color} strokeWidth={slw} strokeLinecap="round" strokeLinejoin="round"
                    />
                  )}
                </g>
              )}
              {shape.shapeType === 'image' && (
                <image
                  href={shape.imageUrl}
                  x={sx} y={sy} width={sw} height={sh}
                  preserveAspectRatio="none"
                  opacity={shape.opacity ?? 1}
                />
              )}

              {/* Selection Box & Handles */}
              {isSelected && (
                <g>
                  {!isLine && (
                    <rect
                      x={bx - 3} y={by - 3} width={bw + 6} height={bh + 6}
                      fill="transparent" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="5 3"
                      pointerEvents="none"
                    />
                  )}

                  {/* Delete Button */}
                  <g
                    transform={`translate(${bx + bw + 14}, ${by - 14})`}
                    onMouseDown={(e) => { e.stopPropagation(); onRemoveShape?.(shape.id); setSelectedId(null); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>Sil (Delete)</title>
                    <circle cx="0" cy="0" r="11" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
                    <path d="M-4,-4 L4,4 M-4,4 L4,-4" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </g>

                  {!isLine && [
                    handleCircle(sx, sy, 'nw', 'nwse-resize', shape),
                    handleCircle(sx + sw / 2, sy, 'n', 'ns-resize', shape),
                    handleCircle(sx + sw, sy, 'ne', 'nesw-resize', shape),
                    handleCircle(sx + sw, sy + sh / 2, 'e', 'ew-resize', shape),
                    handleCircle(sx + sw, sy + sh, 'se', 'nwse-resize', shape),
                    handleCircle(sx + sw / 2, sy + sh, 's', 'ns-resize', shape),
                    handleCircle(sx, sy + sh, 'sw', 'nesw-resize', shape),
                    handleCircle(sx, sy + sh / 2, 'w', 'ew-resize', shape),
                  ]}
                  {isLine && [
                    handleCircle(sx, sy, 'start', 'crosshair', shape),
                    handleCircle(sx + sw, sy + sh, 'end', 'crosshair', shape),
                  ]}
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
