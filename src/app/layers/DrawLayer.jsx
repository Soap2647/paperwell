import { useRef, useState } from 'react';
import { useEditor } from '../../store/editor';
import { newId } from '../../core/pageOps';
import { eventToPage, pointsToPath, simplify, capture } from '../objects';

export default function DrawLayer({ page, zoom }) {
    const { state, dispatch } = useEditor();
    const o = state.opts.draw;
    const marker = o.mode === 'marker';
    const ref = useRef(null);
    const [pts, setPts] = useState(null);
    const width = marker ? Math.max(8, o.width * 3) : o.width;

    const down = (e) => {
        if (e.button !== 0) return;
        capture(e);
        setPts([eventToPage(e, ref.current, zoom)]);
    };
    const move = (e) => {
        if (!pts) return;
        const p = eventToPage(e, ref.current, zoom);
        const last = pts[pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) * zoom < 1.5) return;
        setPts([...pts, p]);
    };
    const up = () => {
        if (!pts) return;
        const points = simplify(pts, 0.35 / zoom).map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
        dispatch({
            type: 'ADD_OBJECT',
            pageId: page.id,
            select: false,
            obj: { id: newId('ob'), type: 'path', points, color: o.color, width, opacity: marker ? 0.45 : o.opacity ?? 1, blend: marker ? 'multiply' : undefined },
        });
        setPts(null);
    };

    return (
        <div ref={ref} className="absolute inset-0 touch-none" style={{ cursor: 'crosshair' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            {pts && (
                <svg className="absolute inset-0 overflow-visible pointer-events-none" width={page.width} height={page.height}>
                    <path d={pointsToPath(pts)} fill="none" stroke={o.color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" opacity={marker ? 0.45 : o.opacity ?? 1} style={{ mixBlendMode: marker ? 'multiply' : undefined }} />
                </svg>
            )}
        </div>
    );
}
