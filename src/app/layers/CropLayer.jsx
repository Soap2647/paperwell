// Kırpma çerçevesi: içinden sürükleyerek taşınır, köşelerden boyutlanır; oran seçiliyse oran korunur.
// Dışarıda kalan alan karartılır. Koordinatlar sayfa birimi (pt).
import { useRef } from 'react';
import { useEditor } from '../../store/editor';
import { eventToPage } from '../objects';

const MIN = 20;

export default function CropLayer({ page, zoom }) {
    const { state, dispatch } = useEditor();
    const ref = useRef(null);
    const c = state.crop;
    const set = (r) => dispatch({ type: 'SET', values: { crop: { ...c, ...r } } });

    const start = (e, mode) => {
        e.stopPropagation(); e.preventDefault();
        const [sx, sy] = eventToPage(e, ref.current, zoom);
        const r0 = { x: c.x, y: c.y, w: c.w, h: c.h };
        const el = e.currentTarget;
        el.setPointerCapture?.(e.pointerId);
        const move = (ev) => {
            const [px, py] = eventToPage(ev, ref.current, zoom);
            const dx = px - sx, dy = py - sy;
            if (mode === 'move') {
                set({ x: Math.max(0, Math.min(page.width - r0.w, r0.x + dx)), y: Math.max(0, Math.min(page.height - r0.h, r0.y + dy)) });
                return;
            }
            // köşe: karşı köşe sabit
            const left = mode.includes('w'), top = mode.includes('n');
            const ax = left ? r0.x + r0.w : r0.x, ay = top ? r0.y + r0.h : r0.y;
            let bx = Math.max(0, Math.min(page.width, (left ? r0.x : r0.x + r0.w) + dx));
            let by = Math.max(0, Math.min(page.height, (top ? r0.y : r0.y + r0.h) + dy));
            let w = Math.max(MIN, Math.abs(bx - ax)), h = Math.max(MIN, Math.abs(by - ay));
            if (c.ratio) {
                // oran: genişlikten yükseklik, sayfaya sığmazsa yükseklikten genişlik
                h = w / c.ratio;
                const maxH = top ? ay : page.height - ay, maxW = left ? ax : page.width - ax;
                if (h > maxH) { h = maxH; w = h * c.ratio; }
                if (w > maxW) { w = maxW; h = w / c.ratio; }
            }
            set({ x: left ? ax - w : ax, y: top ? ay - h : ay, w, h });
        };
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
    };

    const hs = 12 / zoom;
    const handle = (mode, x, y) => (
        <div key={mode} onPointerDown={(e) => start(e, mode)} className="absolute bg-white border-2 border-accent rounded-sm"
            style={{ left: x - hs / 2, top: y - hs / 2, width: hs, height: hs, cursor: `${mode}-resize`, borderWidth: 2 / zoom }} />
    );
    return (
        <div ref={ref} className="absolute inset-0 overflow-hidden" style={{ cursor: 'crosshair' }}>
            <div className="absolute" onPointerDown={(e) => start(e, 'move')}
                style={{ left: c.x, top: c.y, width: c.w, height: c.h, cursor: 'move', boxShadow: '0 0 0 99999px rgba(0,0,0,0.55)', outline: `${2 / zoom}px solid var(--accent)` }}>
                {/* üçte bir kılavuz çizgileri */}
                {[1, 2].map((i) => <div key={`v${i}`} className="absolute top-0 bottom-0 bg-white/40" style={{ left: `${(i * 100) / 3}%`, width: 1 / zoom }} />)}
                {[1, 2].map((i) => <div key={`h${i}`} className="absolute left-0 right-0 bg-white/40" style={{ top: `${(i * 100) / 3}%`, height: 1 / zoom }} />)}
            </div>
            {handle('nw', c.x, c.y)}{handle('ne', c.x + c.w, c.y)}{handle('sw', c.x, c.y + c.h)}{handle('se', c.x + c.w, c.y + c.h)}
        </div>
    );
}
