import { useRef, useEffect, useState, useCallback, forwardRef } from 'react';
import { renderAnnotationsToCanvas } from '../hooks/useAnnotations';

/**
 * Overlay for both drawing new freehand/highlight annotations
 * and displaying existing ones for the current page.
 */
const AnnotationOverlay = forwardRef(({
  width,
  height,
  scale,
  tool,           // 'pen' | 'highlight' | 'eraser'
  color,
  lineWidth,
  annotations = [], // from useAnnotations
  onAddAnnotation,  // (points, {tool, color, lineWidth}) => void
  onRemoveAnnotation, // (id) => void
  interactive = true, // false: sadece göster (başka araç açıkken)
}, ref) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);

  // Render existing annotations + current drawing path
  const renderAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Clear canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Draw persistent annotations
    renderAnnotationsToCanvas(ctx, annotations, scale);

    // 2. Draw current path if drawing
    if (isDrawing && currentPath.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x * scale, currentPath[0].y * scale);
      
      for (let i = 1; i < currentPath.length; i++) {
        const prev = currentPath[i - 1];
        const curr = currentPath[i];
        const mx = (prev.x + curr.x) / 2 * scale;
        const my = (prev.y + curr.y) / 2 * scale;
        ctx.quadraticCurveTo(prev.x * scale, prev.y * scale, mx, my);
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth * scale;

      if (tool === 'highlight') {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = lineWidth * scale * 2; // Thicker for highlight
      } else if (tool === 'eraser') {
        // Just for visual feedback during erase
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.stroke();
      ctx.restore();
    }
  }, [annotations, scale, isDrawing, currentPath, tool, color, lineWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      renderAll();
    }
  }, [width, height, renderAll]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale, // Save in normalized coordinates (scale=1)
      y: (e.clientY - rect.top) / scale
    };
  };

  const startDrawing = (e) => {
    if (!interactive || e.button !== 0) return;
    setIsDrawing(true);
    setCurrentPath([getPos(e)]);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    setCurrentPath(prev => [...prev, getPos(e)]);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (tool === 'eraser' || currentPath.length > 1) {
      if (tool === 'eraser') {
        // Find if we hit any existing annotation and erase it
        // Basic hit detection (distance from eraser path to annotation points)
        let idToRemove = null;

        for (const ann of annotations) {
          if (ann.type !== 'path' && ann.type !== 'highlight') continue;
          
          let hit = false;
          const hitRadius = Math.max(8, (ann.lineWidth || 4) / 2 + 4);
          for (const p of ann.points) {
            for (const ep of currentPath) {
              const dx = p.x - ep.x;
              const dy = p.y - ep.y;
              if (dx * dx + dy * dy < hitRadius * hitRadius) {
                hit = true;
                break;
              }
            }
            if (hit) break;
          }

          if (hit) {
            idToRemove = ann.id;
            break; // Remove one at a time
          }
        }

        if (idToRemove && onRemoveAnnotation) {
          onRemoveAnnotation(idToRemove);
        }
      } else {
        // Save the finished path
        if (onAddAnnotation) {
          onAddAnnotation(currentPath, { 
            tool, 
            color, 
            lineWidth: tool === 'highlight' ? lineWidth * 2 : lineWidth 
          });
        }
      }
    }
    
    setCurrentPath([]);
  };

  return (
    <canvas
      ref={canvasRef}
      className={`absolute top-0 left-0 touch-none z-10 ${
        tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'
      }`}
      // multiply: vurgulayıcı alttaki metni örtmeden boyar
      style={{ width, height, mixBlendMode: 'multiply', pointerEvents: interactive ? 'auto' : 'none' }}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
    />
  );
});

AnnotationOverlay.displayName = 'AnnotationOverlay';
export default AnnotationOverlay;
