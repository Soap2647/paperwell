import { useRef, useState } from 'react';
import { useEditor } from '../../store/editor';
import { newId } from '../../core/pageOps';
import { eventToPage } from '../objects';
import { ShapeSvg } from './ObjectLayer';

function build(kind, a, b, o, square) {
    if (kind === 'line' || kind === 'arrow') {
        let [x2, y2] = b;
        if (square) {
            // 45° adımlara kilitle
            const ang = Math.round(Math.atan2(y2 - a[1], x2 - a[0]) / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot(x2 - a[0], y2 - a[1]);
            x2 = a[0] + Math.cos(ang) * len; y2 = a[1] + Math.sin(ang) * len;
        }
        return { type: kind, x1: a[0], y1: a[1], x2, y2, stroke: o.stroke || '#111827', width: o.width, opacity: o.opacity };
    }
    let w = b[0] - a[0], h = b[1] - a[1];
    if (square) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    return { type: kind, x: Math.min(a[0], a[0] + w), y: Math.min(a[1], a[1] + h), w: Math.abs(w), h: Math.abs(h), stroke: o.stroke, fill: o.fill, width: o.width, opacity: o.opacity };
}

export default function ShapeLayer({ page, zoom }) {
    const { state, dispatch } = useEditor();
    const o = state.opts.shape;
    const ref = useRef(null);
    const [d, setD] = useState(null);

    const down = (e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = eventToPage(e, ref.current, zoom);
        setD({ a: p, b: p, shift: e.shiftKey });
    };
    const move = (e) => d && setD({ ...d, b: eventToPage(e, ref.current, zoom), shift: e.shiftKey });
    const up = () => {
        if (!d) return;
        let { a, b } = d;
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 4) {
            // tıklama: varsayılan boyutta oluştur
            b = o.kind === 'line' || o.kind === 'arrow' ? [a[0] + 120, a[1]] : [a[0] + 120, a[1] + 80];
        }
        const obj = { id: newId('ob'), ...build(o.kind, a, b, o, d.shift) };
        dispatch({ type: 'ADD_OBJECT', pageId: page.id, obj });
        dispatch({ type: 'SET', values: { tool: 'select' } });
        setD(null);
    };

    return (
        <div ref={ref} className="absolute inset-0 touch-none" style={{ cursor: 'crosshair' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setD(null)}>
            {d && (
                <svg className="absolute inset-0 overflow-visible pointer-events-none" width={page.width} height={page.height}>
                    <ShapeSvg o={build(o.kind, d.a, d.b, o, d.shift)} />
                </svg>
            )}
        </div>
    );
}
