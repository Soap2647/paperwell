import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { eventToPage } from '../objects';

export default function RedactLayer({ page, zoom, interactive }) {
    const { state, dispatch } = useEditor();
    const rects = state.redactions[page.id] || [];
    const ref = useRef(null);
    const [d, setD] = useState(null);
    const fill = state.opts.redact.fill === 'white' ? '#ffffff' : '#000000';

    const down = (e) => {
        if (!interactive || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = eventToPage(e, ref.current, zoom);
        setD({ a: p, b: p });
    };
    const move = (e) => d && setD({ ...d, b: eventToPage(e, ref.current, zoom) });
    const up = () => {
        if (!d) return;
        const r = { x: Math.min(d.a[0], d.b[0]), y: Math.min(d.a[1], d.b[1]), w: Math.abs(d.b[0] - d.a[0]), h: Math.abs(d.b[1] - d.a[1]) };
        if (r.w > 2 && r.h > 2) dispatch({ type: 'SET_REDACTIONS', pageId: page.id, rects: [...rects, r] });
        setD(null);
    };

    const preview = d && { x: Math.min(d.a[0], d.b[0]), y: Math.min(d.a[1], d.b[1]), w: Math.abs(d.b[0] - d.a[0]), h: Math.abs(d.b[1] - d.a[1]) };

    return (
        <div ref={ref} className="absolute inset-0 touch-none" style={{ cursor: interactive ? 'crosshair' : undefined, pointerEvents: interactive ? 'auto' : 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            {[...rects, ...(preview ? [preview] : [])].map((r, i) => (
                <div
                    key={i}
                    className="absolute"
                    style={{
                        left: r.x, top: r.y, width: r.w, height: r.h,
                        background: `repeating-linear-gradient(45deg, ${fill}cc 0 ${4 / zoom}px, ${fill}88 ${4 / zoom}px ${8 / zoom}px)`,
                        outline: `${1.5 / zoom}px solid #e5484d`,
                    }}
                >
                    {interactive && i < rects.length && (
                        <button
                            type="button"
                            className="absolute bg-danger text-white rounded-full flex items-center justify-center shadow-pop"
                            style={{ width: 18 / zoom, height: 18 / zoom, right: -9 / zoom, top: -9 / zoom }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => dispatch({ type: 'SET_REDACTIONS', pageId: page.id, rects: rects.filter((_, k) => k !== i) })}
                            aria-label="Kaldır"
                        >
                            <X style={{ width: 11 / zoom, height: 11 / zoom }} />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
