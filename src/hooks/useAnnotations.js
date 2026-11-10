import { useCallback, useReducer, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
// Annotation: { id, type: 'path'|'highlight'|'shape'|'text', pageNum, color,
//              lineWidth, points[], shapeType?, x?, y?, w?, h?, text?, fontSize?,
//              opacity }
// Shape:      { id, type:'shape', shapeType:'rect'|'ellipse'|'line'|'arrow',
//              pageNum, x, y, w, h, color, fillColor, lineWidth, opacity }
// TextBox:    { id, type:'textbox', pageNum, x, y, text, fontSize, color }

const MAX_HISTORY = 50;

// ─── Reducer ─────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case 'ADD': {
      const { annotation } = action;
      const pageNum = annotation.pageNum;
      const newPages = {
        ...state.pages,
        [pageNum]: [...(state.pages[pageNum] || []), annotation],
      };
      const snapshot = newPages;
      const past = [...state.past, state.pages].slice(-MAX_HISTORY);
      return { ...state, pages: snapshot, past, future: [] };
    }
    case 'REMOVE': {
      const { id, pageNum } = action;
      const newPages = {
        ...state.pages,
        [pageNum]: (state.pages[pageNum] || []).filter(a => a.id !== id),
      };
      const past = [...state.past, state.pages].slice(-MAX_HISTORY);
      return { ...state, pages: newPages, past, future: [] };
    }
    case 'UPDATE': {
      const { id, pageNum, changes, transient } = action;
      const newPages = {
        ...state.pages,
        [pageNum]: (state.pages[pageNum] || []).map(a =>
          a.id === id ? { ...a, ...changes } : a
        ),
      };
      // Sürükleme sırasındaki ara güncellemeler geçmişe yazılmaz (bkz. CHECKPOINT)
      if (transient) return { ...state, pages: newPages };
      const past = [...state.past, state.pages].slice(-MAX_HISTORY);
      return { ...state, pages: newPages, past, future: [] };
    }
    case 'CHECKPOINT': {
      const past = [...state.past, state.pages].slice(-MAX_HISTORY);
      return { ...state, past, future: [] };
    }
    case 'REPLACE_ALL': {
      const past = [...state.past, state.pages].slice(-MAX_HISTORY);
      return { pages: action.pages, past, future: [] };
    }
    case 'CLEAR_PAGE': {
      const { pageNum } = action;
      const newPages = { ...state.pages, [pageNum]: [] };
      const past = [...state.past, state.pages].slice(-MAX_HISTORY);
      return { ...state, pages: newPages, past, future: [] };
    }
    case 'CLEAR_ALL': {
      const past = [...state.past, state.pages].slice(-MAX_HISTORY);
      return { ...state, pages: {}, past, future: [] };
    }
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      const future = [state.pages, ...state.future].slice(0, MAX_HISTORY);
      return { pages: previous, past: newPast, future };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      const past = [...state.past, state.pages].slice(-MAX_HISTORY);
      return { pages: next, past, future: newFuture };
    }
    case 'LOAD': {
      return { pages: action.pages, past: [], future: [] };
    }
    default:
      return state;
  }
}

const initialState = { pages: {}, past: [], future: [] };

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAnnotations() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const idCounter = useRef(0);

  const generateId = () => `ann_${Date.now()}_${idCounter.current++}`;

  // Get annotations for a specific page
  const getPageAnnotations = useCallback(
    (pageNum) => state.pages[pageNum] || [],
    [state.pages]
  );

  // Add a freehand path annotation
  const addPath = useCallback((pageNum, points, { color, lineWidth, tool, opacity = 1 }) => {
    const annotation = {
      id: generateId(),
      type: tool === 'highlight' ? 'highlight' : 'path',
      pageNum,
      points: [...points],
      color,
      lineWidth,
      tool,
      opacity: tool === 'highlight' ? 0.4 : opacity,
    };
    dispatch({ type: 'ADD', annotation });
    return annotation.id;
  }, []);

  // Add a shape annotation
  const addShape = useCallback((pageNum, { shapeType, x, y, w, h, color, fillColor, lineWidth, opacity = 1, imageUrl }) => {
    const annotation = {
      id: generateId(),
      type: 'shape',
      shapeType, // 'rect' | 'ellipse' | 'line' | 'arrow' | 'image'
      pageNum,
      x, y, w, h,
      color,
      fillColor: fillColor || null,
      lineWidth,
      opacity,
      ...(imageUrl ? { imageUrl } : {}),
    };
    dispatch({ type: 'ADD', annotation });
    return annotation.id;
  }, []);

  // Add a text box
  const addTextBox = useCallback((pageNum, { x, y, text, fontSize, color }) => {
    const annotation = {
      id: generateId(),
      type: 'textbox',
      pageNum,
      x, y, text, fontSize, color,
    };
    dispatch({ type: 'ADD', annotation });
    return annotation.id;
  }, []);

  const removeAnnotation = useCallback((id, pageNum) => {
    dispatch({ type: 'REMOVE', id, pageNum });
  }, []);

  const updateAnnotation = useCallback((id, pageNum, changes, { transient = false } = {}) => {
    dispatch({ type: 'UPDATE', id, pageNum, changes, transient });
  }, []);

  // Sürükleme başlamadan önceki durumu geri alma geçmişine kaydeder
  const checkpoint = useCallback(() => {
    dispatch({ type: 'CHECKPOINT' });
  }, []);

  // Tüm sayfaları değiştirir (geri alınabilir) - sayfa yeniden sıralamada kullanılır
  const replaceAll = useCallback((pages) => {
    dispatch({ type: 'REPLACE_ALL', pages });
  }, []);

  const clearPage = useCallback((pageNum) => {
    dispatch({ type: 'CLEAR_PAGE', pageNum });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const load = useCallback((pages) => {
    dispatch({ type: 'LOAD', pages });
  }, []);

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;
  const allPages = state.pages;

  return {
    getPageAnnotations,
    allPages,
    addPath,
    addShape,
    addTextBox,
    removeAnnotation,
    updateAnnotation,
    checkpoint,
    replaceAll,
    clearPage,
    clearAll,
    undo,
    redo,
    load,
    canUndo,
    canRedo,
  };
}

// ─── Canvas Renderer ──────────────────────────────────────────────────────────
/**
 * Draws all annotations for a page onto a canvas context.
 * Used both for live preview and PDF export.
 */
export function renderAnnotationsToCanvas(ctx, annotations, scale = 1) {
  if (!annotations || annotations.length === 0) return;

  ctx.save();

  for (const ann of annotations) {
    ctx.save();
    ctx.globalAlpha = ann.opacity ?? 1;

    if (ann.type === 'path' || ann.type === 'highlight') {
      renderPath(ctx, ann, scale);
    } else if (ann.type === 'shape') {
      renderShape(ctx, ann, scale);
    } else if (ann.type === 'textbox') {
      renderTextBox(ctx, ann, scale);
    }

    ctx.restore();
  }

  ctx.restore();
}

function renderPath(ctx, ann, scale) {
  if (!ann.points || ann.points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(ann.points[0].x * scale, ann.points[0].y * scale);

  for (let i = 1; i < ann.points.length; i++) {
    const prev = ann.points[i - 1];
    const curr = ann.points[i];
    // Smooth curves
    const mx = (prev.x + curr.x) / 2 * scale;
    const my = (prev.y + curr.y) / 2 * scale;
    ctx.quadraticCurveTo(prev.x * scale, prev.y * scale, mx, my);
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ann.color;
  ctx.lineWidth = ann.lineWidth * scale;

  if (ann.type === 'highlight') {
    ctx.globalCompositeOperation = 'multiply';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.stroke();
}

function renderShape(ctx, ann, scale) {
  const { shapeType, x, y, w, h, color, fillColor, lineWidth } = ann;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth * scale;
  ctx.globalCompositeOperation = 'source-over';

  const sx = x * scale;
  const sy = y * scale;
  const sw = w * scale;
  const sh = h * scale;

  if (fillColor) {
    ctx.fillStyle = fillColor;
  }

  ctx.beginPath();

  switch (shapeType) {
    case 'rect':
      ctx.rect(sx, sy, sw, sh);
      if (fillColor) ctx.fill();
      ctx.stroke();
      break;

    case 'ellipse': {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      ctx.ellipse(cx, cy, Math.abs(sw / 2), Math.abs(sh / 2), 0, 0, Math.PI * 2);
      if (fillColor) ctx.fill();
      ctx.stroke();
      break;
    }

    case 'line':
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + sw, sy + sh);
      ctx.stroke();
      break;

    case 'arrow': {
      drawArrow(ctx, sx, sy, sx + sw, sy + sh, lineWidth * scale * 3);
      ctx.stroke();
      break;
    }
  }
}

function drawArrow(ctx, x1, y1, x2, y2, headSize) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(
    x2 - headSize * Math.cos(angle - Math.PI / 6),
    y2 - headSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headSize * Math.cos(angle + Math.PI / 6),
    y2 - headSize * Math.sin(angle + Math.PI / 6)
  );
}

function renderTextBox(ctx, ann, scale) {
  ctx.font = `${ann.fontSize * scale}px Inter, sans-serif`;
  ctx.fillStyle = ann.color;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillText(ann.text, ann.x * scale, ann.y * scale);
}
