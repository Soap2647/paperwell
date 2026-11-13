/* eslint-disable react-refresh/only-export-components */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../store/editor';
import { newId } from '../core/pageOps';

export const ptToMm = (v) => (v / 72) * 25.4;
const MM_PT = 72 / 25.4;
const SIZE = 20;
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const SUBS = { 1: 5, 2: 2, 5: 5 }; // ana adımın ilk hanesine göre ara bölme sayısı

// Eksen boyunca işaretler: origin = sayfa 0'ının ekran konumu (px), len = cetvel uzunluğu (px)
function buildTicks(origin, len, zoom) {
    const pxMm = zoom * MM_PT;
    const major = STEPS.find((s) => s * pxMm >= 50) ?? STEPS[STEPS.length - 1];
    const subs = SUBS[String(major)[0]] || 5;
    const minor = major / subs;
    const showMinor = minor * pxMm >= 4;
    const from = Math.floor((0 - origin) / pxMm / minor) * minor;
    const to = (len - origin) / pxMm;
    const ticks = [];
    for (let i = 0, mm = from; mm <= to && i < 3000; i++, mm = from + i * minor) {
        const isMajor = Math.round(mm / minor) % subs === 0;
        if (!isMajor && !showMinor) continue;
        ticks.push({ px: origin + mm * pxMm, major: isMajor, label: isMajor ? String(Math.round(mm * 100) / 100) : null });
    }
    return ticks;
}

function Ruler({ vertical, origin, len, zoom, markerRef, onPointerDown }) {
    const ticks = useMemo(() => buildTicks(origin, len, zoom), [origin, len, zoom]);
    const d = ticks.map((k) => {
        const a = k.major ? 0 : SIZE * 0.6;
        return vertical ? `M${a} ${k.px.toFixed(1)}H${SIZE}` : `M${k.px.toFixed(1)} ${a}V${SIZE}`;
    }).join('');
    return (
        <svg
            data-ruler
            width={vertical ? SIZE : len}
            height={vertical ? len : SIZE}
            className="absolute left-0 top-0 bg-surface text-fg-3 select-none"
            style={{
                pointerEvents: 'auto',
                cursor: vertical ? 'col-resize' : 'row-resize',
                ...(vertical ? { borderRight: '1px solid var(--border)' } : { borderBottom: '1px solid var(--border)' }),
            }}
            onPointerDown={onPointerDown}
        >
            <path d={d} stroke="currentColor" strokeWidth="1" opacity="0.7" fill="none" />
            {ticks.filter((k) => k.label !== null).map((k) => (
                <text
                    key={k.px}
                    fill="currentColor"
                    fontSize="9"
                    className="tabular-nums"
                    {...(vertical
                        ? { x: 8, y: k.px + 3, transform: `rotate(-90 8 ${k.px + 3})`, textAnchor: 'end' }
                        : { x: k.px + 3, y: 9 })}
                >{k.label}</text>
            ))}
            <line
                ref={markerRef}
                stroke="#06b6d4"
                strokeWidth="1"
                style={{ display: 'none' }}
                {...(vertical ? { x1: 0, x2: SIZE, y1: 0, y2: 0 } : { y1: 0, y2: SIZE, x1: 0, x2: 0 })}
            />
        </svg>
    );
}

// Üst/sol cetveller (mm). Sıfır noktası geçerli sayfanın sol üst köşesi; kaydırma ve zoom'u izler.
export default function Rulers({ scrollRef, pageRefs, zoom, page, pageIndex }) {
    const { dispatch } = useEditor();
    const rootRef = useRef(null);
    const topMark = useRef(null);
    const leftMark = useRef(null);
    const [m, setM] = useState({ ox: 0, oy: 0, w: 0, h: 0 });
    const [drag, setDrag] = useState(null); // { axis, pos, x, y } (x,y: cetvel kutusuna göre)

    const measure = () => {
        const sc = scrollRef.current, el = pageRefs.current[pageIndex];
        if (!sc || !el) return;
        const next = { ox: el.offsetLeft - sc.scrollLeft, oy: el.offsetTop - sc.scrollTop, w: sc.clientWidth, h: sc.clientHeight };
        setM((p) => (p.ox === next.ox && p.oy === next.oy && p.w === next.w && p.h === next.h ? p : next));
    };

    // Zoom / sayfa değişince hemen ölç
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => { measure(); }, [pageIndex, zoom, page.width, page.height]);

    // Kaydırma, boyut değişimi (rAF ile sınırlı) ve fare konumu işaretçisi
    useEffect(() => {
        const sc = scrollRef.current;
        if (!sc) return;
        let raf = 0;
        const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); }); };
        const onMove = (e) => {
            const r = sc.getBoundingClientRect();
            const x = e.clientX - r.left, y = e.clientY - r.top;
            const show = x >= 0 && y >= 0 && x <= sc.clientWidth && y <= sc.clientHeight ? '' : 'none';
            if (topMark.current) { topMark.current.style.display = show; topMark.current.setAttribute('x1', x); topMark.current.setAttribute('x2', x); }
            if (leftMark.current) { leftMark.current.style.display = show; leftMark.current.setAttribute('y1', y); leftMark.current.setAttribute('y2', y); }
        };
        sc.addEventListener('scroll', schedule, { passive: true });
        sc.addEventListener('pointermove', onMove);
        const ro = new ResizeObserver(schedule);
        ro.observe(sc);
        if (sc.firstElementChild) ro.observe(sc.firstElementChild);
        return () => {
            sc.removeEventListener('scroll', schedule);
            sc.removeEventListener('pointermove', onMove);
            ro.disconnect();
            cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scrollRef, pageIndex]);

    // Cetvelden kılavuz sürükleme
    const stopDrag = useRef(null);
    useEffect(() => () => stopDrag.current?.(), []);
    const startGuide = (axis) => (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const posOf = (ev) => {
            const r = pageRefs.current[pageIndex].getBoundingClientRect();
            return axis === 'x' ? (ev.clientX - r.left) / zoom : (ev.clientY - r.top) / zoom;
        };
        const move = (ev) => { const r = rootRef.current.getBoundingClientRect(); setDrag({ axis, pos: posOf(ev), x: ev.clientX - r.left, y: ev.clientY - r.top }); };
        const up = (ev) => {
            stopDrag.current?.();
            setDrag(null);
            const sc = scrollRef.current, r = sc.getBoundingClientRect();
            const inArea = ev.clientX >= r.left && ev.clientX <= r.left + sc.clientWidth && ev.clientY >= r.top && ev.clientY <= r.top + sc.clientHeight;
            const pos = posOf(ev);
            const max = axis === 'x' ? page.width : page.height;
            if (inArea && !ev.target?.closest?.('[data-ruler]') && pos >= 0 && pos <= max) {
                dispatch({ type: 'ADD_GUIDE', pageId: page.id, guide: { id: newId('gd'), axis, pos } });
            }
        };
        stopDrag.current = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            stopDrag.current = null;
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        move(e);
    };

    return (
        <div ref={rootRef} className="absolute left-0 top-0 pointer-events-none" style={{ width: m.w, height: m.h }}>
            {drag && (
                <>
                    <div
                        className="absolute"
                        style={drag.axis === 'x'
                            ? { left: drag.x, top: 0, width: 1, height: '100%', background: 'rgba(6,182,212,0.85)' }
                            : { top: drag.y, left: 0, height: 1, width: '100%', background: 'rgba(6,182,212,0.85)' }}
                    />
                    <div
                        className="absolute px-1.5 py-0.5 rounded bg-surface border border-line text-[11px] tabular-nums shadow z-10"
                        style={{ left: drag.x + 12, top: drag.y + 12 }}
                    >{ptToMm(drag.pos).toFixed(1)} mm</div>
                </>
            )}
            <Ruler origin={m.ox} len={m.w} zoom={zoom} markerRef={topMark} onPointerDown={startGuide('y')} />
            <Ruler vertical origin={m.oy} len={m.h} zoom={zoom} markerRef={leftMark} onPointerDown={startGuide('x')} />
            <div data-ruler className="absolute left-0 top-0 bg-surface-2 border-r border-b border-line" style={{ width: SIZE, height: SIZE, pointerEvents: 'auto' }} />
        </div>
    );
}
