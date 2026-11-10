import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { StickyNote } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { arrowHead } from '../../core/export';
import { bbox, resizeObject, textStyle, pointsToPath, moveBy } from '../objects';
import { t } from '../../i18n';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CORNERS = ['nw', 'ne', 'se', 'sw'];
const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

export default function ObjectLayer({ page, zoom, interactive }) {
    const { state, dispatch } = useEditor();
    const objs = state.objects[page.id] || [];
    const selectedId = state.selected?.pageId === page.id ? state.selected.id : null;
    const editingId = state.editing?.kind === 'text' || state.editing?.kind === 'note' ? state.editing.id : null;
    const drag = useRef(null);

    // Sürükleme / boyutlandırma: olaylar pencereye bağlanır
    useEffect(() => {
        const move = (e) => {
            const d = drag.current;
            if (!d) return;
            const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom;
            if (!d.moved) {
                if (Math.hypot(dx, dy) * zoom < 3) return;
                d.moved = true;
                dispatch({ type: 'CHECKPOINT' });
            }
            const changes = d.handle === 'move' ? moveBy(d.orig, dx, dy) : resizeObject(d.orig, d.handle, dx, dy, d.keepAspect !== e.shiftKey);
            dispatch({ type: 'UPDATE_OBJECT', id: d.id, changes, transient: true });
        };
        const up = () => { drag.current = null; };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    }, [zoom, dispatch]);

    const startDrag = (e, o, handle = 'move') => {
        if (!interactive || e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        if (selectedId !== o.id) dispatch({ type: 'SET', values: { selected: { pageId: page.id, id: o.id }, editing: null } });
        drag.current = { id: o.id, handle, sx: e.clientX, sy: e.clientY, orig: o, keepAspect: o.type === 'image' };
    };

    const selected = objs.find((o) => o.id === selectedId);
    const pe = interactive ? 'auto' : 'none';

    return (
        <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
            {interactive && (
                <div
                    className="absolute inset-0"
                    style={{ pointerEvents: 'auto' }}
                    onPointerDown={() => (selectedId || editingId) && dispatch({ type: 'SET', values: { selected: null, editing: null } })}
                />
            )}

            <svg className="absolute inset-0 overflow-visible" width={page.width} height={page.height} style={{ pointerEvents: 'none' }}>
                {objs.map((o) => o.type !== 'text' && o.type !== 'note' && (
                    <g key={o.id} style={{ pointerEvents: pe, cursor: interactive ? 'move' : undefined }} onPointerDown={(e) => startDrag(e, o)}>
                        <ShapeSvg o={o} hit={interactive} />
                    </g>
                ))}
            </svg>

            {objs.map((o) => o.type === 'text' && (
                <TextObject
                    key={o.id}
                    o={o}
                    editing={editingId === o.id}
                    interactive={interactive}
                    onPointerDown={(e) => startDrag(e, o)}
                    onDoubleClick={() => interactive && dispatch({ type: 'SET', values: { editing: { kind: 'text', id: o.id }, selected: { pageId: page.id, id: o.id } } })}
                />
            ))}

            {objs.map((o) => o.type === 'note' && (
                <NoteObject
                    key={o.id}
                    o={o}
                    open={editingId === o.id}
                    interactive={interactive}
                    onPointerDown={(e) => startDrag(e, o)}
                    onOpen={() => dispatch({ type: 'SET', values: { editing: { kind: 'note', id: o.id }, selected: { pageId: page.id, id: o.id } } })}
                />
            ))}

            {selected && interactive && editingId !== selected.id && <Selection o={selected} zoom={zoom} onHandle={startDrag} />}
        </div>
    );
}

export function ShapeSvg({ o, hit }) {
    const op = o.opacity ?? 1;
    switch (o.type) {
        case 'path':
            return (
                <path
                    d={pointsToPath(o.points)}
                    fill="none"
                    stroke={o.color}
                    strokeWidth={o.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={op}
                    style={{ mixBlendMode: o.blend === 'multiply' ? 'multiply' : undefined }}
                    pointerEvents={hit ? 'stroke' : 'none'}
                />
            );
        case 'highlight':
            return (
                <g style={{ mixBlendMode: o.kind === 'highlight' ? 'multiply' : undefined }}>
                    {o.rects.map((r, i) => {
                        if (o.kind === 'underline') return <rect key={i} x={r.x} y={r.y + r.h - Math.max(1, r.h * 0.08)} width={r.w} height={Math.max(1, r.h * 0.08)} fill={o.color} />;
                        if (o.kind === 'strike') return <rect key={i} x={r.x} y={r.y + r.h * 0.52} width={r.w} height={Math.max(1, r.h * 0.07)} fill={o.color} />;
                        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={o.color} opacity={op} />;
                    })}
                    {hit && o.rects.map((r, i) => <rect key={`h${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="transparent" />)}
                </g>
            );
        case 'rect':
            return <rect x={o.x} y={o.y} width={o.w} height={o.h} fill={o.fill || 'none'} stroke={o.stroke || 'none'} strokeWidth={o.stroke ? o.width : 0} opacity={op} strokeLinejoin="round" pointerEvents={hit ? 'all' : 'none'} />;
        case 'ellipse':
            return <ellipse cx={o.x + o.w / 2} cy={o.y + o.h / 2} rx={o.w / 2} ry={o.h / 2} fill={o.fill || 'none'} stroke={o.stroke || 'none'} strokeWidth={o.stroke ? o.width : 0} opacity={op} pointerEvents={hit ? 'all' : 'none'} />;
        case 'line':
        case 'arrow': {
            const head = o.type === 'arrow' ? arrowHead(o.x1, o.y1, o.x2, o.y2, o.width) : null;
            return (
                <g opacity={op}>
                    {hit && <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} stroke="transparent" strokeWidth={Math.max(12, o.width + 8)} />}
                    <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} stroke={o.stroke} strokeWidth={o.width} strokeLinecap="round" />
                    {head && <polyline points={head.map((p) => p.join(',')).join(' ')} fill="none" stroke={o.stroke} strokeWidth={o.width} strokeLinecap="round" strokeLinejoin="round" />}
                </g>
            );
        }
        case 'image':
            return <image href={o.src} x={o.x} y={o.y} width={o.w} height={o.h} preserveAspectRatio="none" opacity={op} />;
        default:
            return null;
    }
}

function TextObject({ o, editing, interactive, onPointerDown, onDoubleClick }) {
    const { dispatch } = useEditor();
    const ref = useRef(null);

    // Gerçek boyutu ölç (seçim kutusu ve dışa aktarım hizalaması için)
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const w = el.offsetWidth, h = el.offsetHeight;
        if (Math.abs(w - (o.w || 0)) > 0.5 || Math.abs(h - (o.h || 0)) > 0.5) {
            dispatch({ type: 'UPDATE_OBJECT', id: o.id, changes: { w, h }, transient: true });
        }
    });

    useEffect(() => {
        if (!editing || !ref.current) return;
        const el = ref.current;
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }, [editing]);

    const commit = () => {
        const text = ref.current?.innerText.replace(/\n$/, '') ?? '';
        if (!text.trim()) dispatch({ type: 'REMOVE_OBJECT', id: o.id });
        else if (text !== o.text) dispatch({ type: 'UPDATE_OBJECT', id: o.id, changes: { text } });
        dispatch({ type: 'SET', values: { editing: null } });
    };

    return (
        <div
            ref={ref}
            className="absolute outline-none"
            style={{
                left: o.x,
                top: o.y,
                ...textStyle(o),
                minWidth: editing ? 20 : undefined,
                pointerEvents: interactive || editing ? 'auto' : 'none',
                cursor: editing ? 'text' : interactive ? 'move' : undefined,
                boxShadow: editing ? '0 0 0 1px var(--accent)' : undefined,
                background: editing ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : undefined,
                userSelect: editing ? 'text' : 'none',
            }}
            contentEditable={editing ? 'plaintext-only' : false}
            suppressContentEditableWarning
            onPointerDown={editing ? (e) => e.stopPropagation() : onPointerDown}
            onDoubleClick={onDoubleClick}
            onBlur={editing ? commit : undefined}
            onKeyDown={editing ? (e) => {
                e.stopPropagation();
                if (e.key === 'Escape') { e.preventDefault(); ref.current.blur(); }
            } : undefined}
        >
            {o.text}
        </div>
    );
}

function NoteObject({ o, open, interactive, onPointerDown, onOpen }) {
    const { dispatch } = useEditor();
    const [text, setText] = useState(o.text || '');
    useEffect(() => setText(o.text || ''), [o.text]);
    return (
        <>
            <button
                type="button"
                className="absolute w-6 h-6 rounded-md shadow-pop flex items-center justify-center border border-black/15"
                style={{ left: o.x, top: o.y, background: o.color, pointerEvents: 'auto', cursor: interactive ? 'move' : 'pointer' }}
                onPointerDown={interactive ? onPointerDown : undefined}
                onClick={onOpen}
                aria-label={t('Not')}
                title={o.text}
            >
                <StickyNote className="w-3.5 h-3.5 text-black/70" />
            </button>
            {open && (
                <div className="absolute z-10 w-56 rounded-xl bg-surface border border-line shadow-float p-2 animate-[popIn_.12s_ease-out]" style={{ left: o.x + 30, top: o.y, pointerEvents: 'auto' }} onPointerDown={(e) => e.stopPropagation()}>
                    <textarea
                        autoFocus
                        value={text}
                        placeholder={t('Notunuzu yazın...')}
                        onChange={(e) => setText(e.target.value)}
                        onBlur={() => { if (text !== o.text) dispatch({ type: 'UPDATE_OBJECT', id: o.id, changes: { text } }); }}
                        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') dispatch({ type: 'SET', values: { editing: null } }); }}
                        className="field min-h-[90px] resize-none text-[13px]"
                    />
                </div>
            )}
        </>
    );
}

function Selection({ o, zoom, onHandle }) {
    const b = bbox(o);
    const r = 5 / zoom;
    const sw = 1.25 / zoom;
    if (o.type === 'line' || o.type === 'arrow') {
        return (
            <svg className="absolute inset-0 overflow-visible" style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>
                {[['p1', o.x1, o.y1], ['p2', o.x2, o.y2]].map(([h, x, y]) => (
                    <circle key={h} cx={x} cy={y} r={r * 1.2} fill="#fff" stroke="var(--accent)" strokeWidth={sw * 1.5} style={{ pointerEvents: 'auto', cursor: 'crosshair' }} onPointerDown={(e) => onHandle(e, o, h)} />
                ))}
            </svg>
        );
    }
    const resizable = !['path', 'highlight', 'note'].includes(o.type);
    const handles = o.type === 'text' || o.type === 'image' ? CORNERS : HANDLES;
    const pos = (h) => [b.x + (h.includes('w') ? 0 : h.includes('e') ? b.w : b.w / 2), b.y + (h.includes('n') ? 0 : h.includes('s') ? b.h : b.h / 2)];
    return (
        <svg className="absolute inset-0 overflow-visible" style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>
            <rect x={b.x - 2 / zoom} y={b.y - 2 / zoom} width={b.w + 4 / zoom} height={b.h + 4 / zoom} fill="none" stroke="var(--accent)" strokeWidth={sw} />
            {resizable && handles.map((h) => {
                const [x, y] = pos(h);
                return <rect key={h} x={x - r} y={y - r} width={r * 2} height={r * 2} rx={r / 3} fill="#fff" stroke="var(--accent)" strokeWidth={sw * 1.4} style={{ pointerEvents: 'auto', cursor: CURSORS[h] }} onPointerDown={(e) => onHandle(e, o, h)} />;
            })}
        </svg>
    );
}
