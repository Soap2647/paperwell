// Metne yapışan vurgulama: sürüklenen aralıktaki karakterler satır satır vurgulanır.
// Metin yoksa (taranmış sayfa) sürüklenen dikdörtgen vurgulanır.
import { useMemo, useRef, useState } from 'react';
import { useEditor } from '../../store/editor';
import { newId } from '../../core/pageOps';
import { eventToPage, capture } from '../objects';
import { useEditModel } from './useEditModel';

function glyphView(geom, g) {
    const pts = [[g.box.x0, g.box.y0], [g.box.x1, g.box.y1]].map(([x, y]) => geom.viewPoint(x, y));
    return { x: Math.min(pts[0][0], pts[1][0]), y: Math.min(pts[0][1], pts[1][1]), w: Math.abs(pts[1][0] - pts[0][0]), h: Math.abs(pts[1][1] - pts[0][1]) };
}

export default function HighlightLayer({ page, index, zoom }) {
    const { state, dispatch } = useEditor();
    const opts = state.opts.highlight;
    const data = useEditModel(state.doc.bytes, index);
    const ref = useRef(null);
    const [sel, setSel] = useState(null); // { start, end } glif dizinleri ya da { area }

    // Okuma sırasına göre tüm glifler
    const glyphs = useMemo(() => {
        if (!data?.lines) return [];
        const out = [];
        data.lines.forEach(({ line }, li) => {
            for (const seg of line.segments) for (const g of seg.glyphs) {
                if (!g.unicode) continue;
                out.push({ li, r: glyphView(data.model.geom, g) });
            }
        });
        return out;
    }, [data]);

    const nearest = (x, y) => {
        let best = -1, bd = Infinity;
        glyphs.forEach((g, i) => {
            const cx = Math.max(g.r.x, Math.min(x, g.r.x + g.r.w));
            const cy = Math.max(g.r.y, Math.min(y, g.r.y + g.r.h));
            const d = Math.hypot((x - cx) * 0.6, (y - cy) * 2);
            if (d < bd) { bd = d; best = i; }
        });
        return { i: best, d: bd };
    };

    const rectsFor = (a, b) => {
        const [s, e] = a <= b ? [a, b] : [b, a];
        const byLine = new Map();
        for (let i = s; i <= e; i++) {
            const g = glyphs[i];
            const cur = byLine.get(g.li);
            if (!cur) byLine.set(g.li, { ...g.r });
            else {
                const x1 = Math.max(cur.x + cur.w, g.r.x + g.r.w), y1 = Math.max(cur.y + cur.h, g.r.y + g.r.h);
                cur.x = Math.min(cur.x, g.r.x); cur.y = Math.min(cur.y, g.r.y);
                cur.w = x1 - cur.x; cur.h = y1 - cur.y;
            }
        }
        return [...byLine.values()];
    };

    const down = (e) => {
        if (e.button !== 0) return;
        capture(e);
        const [x, y] = eventToPage(e, ref.current, zoom);
        const n = nearest(x, y);
        if (n.i >= 0 && n.d < 14) setSel({ start: n.i, end: n.i });
        else setSel({ area: { x0: x, y0: y, x1: x, y1: y } });
    };
    const move = (e) => {
        if (!sel) return;
        const [x, y] = eventToPage(e, ref.current, zoom);
        if (sel.area) setSel({ area: { ...sel.area, x1: x, y1: y } });
        else {
            const n = nearest(x, y);
            if (n.i >= 0) setSel({ ...sel, end: n.i });
        }
    };
    const up = () => {
        if (!sel) return;
        let rects;
        if (sel.area) {
            const { x0, y0, x1, y1 } = sel.area;
            rects = [{ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }];
            if (rects[0].w < 3 || rects[0].h < 3) rects = null;
        } else {
            rects = rectsFor(sel.start, sel.end);
        }
        if (rects?.length) {
            dispatch({
                type: 'ADD_OBJECT', pageId: page.id, select: false,
                obj: { id: newId('ob'), type: 'highlight', kind: opts.kind, color: opts.color, opacity: 0.45, rects },
            });
        }
        setSel(null);
    };

    const preview = sel ? (sel.area
        ? [{ x: Math.min(sel.area.x0, sel.area.x1), y: Math.min(sel.area.y0, sel.area.y1), w: Math.abs(sel.area.x1 - sel.area.x0), h: Math.abs(sel.area.y1 - sel.area.y0) }]
        : rectsFor(sel.start, sel.end)) : [];

    return (
        <div ref={ref} className="absolute inset-0 touch-none" style={{ cursor: 'text' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <svg className="absolute inset-0 pointer-events-none" width={page.width} height={page.height} style={{ mixBlendMode: 'multiply' }}>
                {preview.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={opts.color} opacity={0.5} />)}
            </svg>
        </div>
    );
}
