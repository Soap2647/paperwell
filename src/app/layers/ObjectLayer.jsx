import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { StickyNote } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { arrowHead } from '../../core/export';
import { bbox, resizeObject, textStyle, pointsToPath, moveBy, eventToPage } from '../objects';
import { snapTargets, snapMove, snapResize, matchedLines, mmText } from '../snap';
import { t } from '../../i18n';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CORNERS = ['nw', 'ne', 'se', 'sw'];
const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

export default function ObjectLayer({ page, zoom, interactive, objects }) {
    const { state, dispatch } = useEditor();
    // objects: dışarıdan verilen liste (sayfa küçük resmi gecikmeli değer kullanır); yoksa mağazadaki
    const objs = (objects ?? state.objects[page.id] ?? []).filter((o) => !o.hidden);
    const selectedId = state.selected?.pageId === page.id ? state.selected.id : null;
    // çoklu seçim (kutu seçimi ya da Shift+tık): selected.ids
    const multiIds = state.selected?.pageId === page.id && state.selected.ids?.length > 1 ? state.selected.ids : null;
    const rootRef = useRef(null);
    const bandRef = useRef(null);
    const [band, setBand] = useState(null);
    const editingId = state.editing?.kind === 'text' || state.editing?.kind === 'note' ? state.editing.id : null;
    const drag = useRef(null);
    const [fx, setFx] = useState(null); // sürükleme sırasında akıllı kılavuz çizgileri ve ölçü etiketi
    const guidesRef = useRef([]);
    guidesRef.current = state.guides?.[page.id] || [];

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
            // Akıllı kılavuz: kenar/orta çizgileri sayfa kenarına, diğer nesnelere ve kılavuzlara yakalanır (Alt: kapat)
            const snapOn = !e.altKey && d.targets;
            const thr = 6 / zoom;
            let ndx = dx, ndy = dy;
            const edge = d.handle !== 'move' && d.handle !== 'p1' && d.handle !== 'p2' && d.orig.type !== 'text';
            if (snapOn && d.handle === 'move') ({ dx: ndx, dy: ndy } = snapMove(d.box, dx, dy, d.targets, thr));
            else if (snapOn && edge) ({ dx: ndx, dy: ndy } = snapResize(d.box, d.handle, dx, dy, d.targets, thr));
            const changes = d.handle === 'move' ? moveBy(d.orig, ndx, ndy) : resizeObject(d.orig, d.handle, ndx, ndy, d.keepAspect !== e.shiftKey);
            if (d.members.length > 1) dispatch({ type: 'UPDATE_OBJECTS', updates: d.members.map((q) => ({ id: q.id, changes: moveBy(q, ndx, ndy) })), transient: true });
            else dispatch({ type: 'UPDATE_OBJECT', id: d.id, changes, transient: true });
            const nb = d.members.length > 1 ? { x: d.box.x + ndx, y: d.box.y + ndy, w: d.box.w, h: d.box.h } : bbox({ ...d.orig, ...changes });
            const label = d.handle === 'move' ? `X ${mmText(nb.x)}  Y ${mmText(nb.y)} mm`
                : d.orig.type === 'text' ? `${changes.size} pt`
                    : d.handle === 'p1' || d.handle === 'p2' ? null : `${mmText(nb.w)} × ${mmText(nb.h)} mm`;
            setFx({ lines: snapOn && (d.handle === 'move' || edge) ? matchedLines(nb, d.targets) : [], label, box: nb });
        };
        const up = () => {
            const d = drag.current;
            // çoklu seçimde bir nesneye tıklayıp sürüklemeden bırakmak yalnız onu seçer
            if (d && !d.moved && d.single) dispatch({ type: 'SET', values: { selected: { pageId: d.pageId, id: d.single } } });
            drag.current = null; setFx(null);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    }, [zoom, dispatch]);

    const startDrag = (e, o, handle = 'move') => {
        if (!interactive || e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        // Shift+tık: seçime ekle / çıkar
        if (e.shiftKey && handle === 'move') {
            const cur = multiIds || (selectedId ? [selectedId] : []);
            const ids = cur.includes(o.id) ? cur.filter((i) => i !== o.id) : [...cur, o.id];
            dispatch({ type: 'SET', values: { selected: ids.length ? { pageId: page.id, id: ids[ids.length - 1], ...(ids.length > 1 ? { ids } : {}) } : null, editing: null } });
            return;
        }
        const inMulti = handle === 'move' && !!multiIds?.includes(o.id);
        if (!inMulti && selectedId !== o.id) dispatch({ type: 'SET', values: { selected: { pageId: page.id, id: o.id }, editing: null } });
        if (o.locked && !inMulti) return; // kilitli katman seçilir ama taşınmaz
        // Çoklu seçim ve gruplar (ör. buton + içindeki yazı) birlikte taşınır; kılavuz yakalama toplam kutuya göre
        const pick = new Set(inMulti ? multiIds : [o.id]);
        const gids = new Set(objs.filter((q) => pick.has(q.id) && q.groupId).map((q) => q.groupId));
        const members = handle === 'move' ? objs.filter((q) => (pick.has(q.id) || (q.groupId && gids.has(q.groupId))) && !q.locked) : [o];
        if (!members.length) return;
        const boxes = members.map(bbox);
        const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
        const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
        const ids = new Set(members.map((q) => q.id));
        drag.current = {
            id: o.id, handle, sx: e.clientX, sy: e.clientY, orig: o, keepAspect: o.type === 'image', members, single: inMulti ? o.id : null, pageId: page.id,
            box: members.length > 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : bbox(o),
            targets: snapTargets(objs.filter((q) => !ids.has(q.id)), null, page, guidesRef.current, bbox),
        };
    };

    const selected = multiIds ? null : objs.find((o) => o.id === selectedId);
    const multiObjs = multiIds ? objs.filter((o) => multiIds.includes(o.id)) : [];

    // Boş yerden sürükleme: kutu seçimi (değdiği her nesne seçilir; Shift: mevcut seçime ekler)
    const bandDown = (e) => {
        if (e.button !== 0) return;
        const p = eventToPage(e, rootRef.current, zoom);
        if (!e.shiftKey && (selectedId || editingId)) dispatch({ type: 'SET', values: { selected: null, editing: null } });
        e.currentTarget.setPointerCapture?.(e.pointerId);
        bandRef.current = { a: p, add: e.shiftKey ? multiIds || (selectedId ? [selectedId] : []) : [] };
    };
    const bandMove = (e) => {
        const b = bandRef.current;
        if (!b) return;
        const p = eventToPage(e, rootRef.current, zoom);
        setBand({ x: Math.min(b.a[0], p[0]), y: Math.min(b.a[1], p[1]), w: Math.abs(p[0] - b.a[0]), h: Math.abs(p[1] - b.a[1]) });
    };
    const bandUp = () => {
        const b = bandRef.current, r = band;
        bandRef.current = null;
        setBand(null);
        if (!b || !r || (r.w < 3 / zoom && r.h < 3 / zoom)) return;
        const hit = objs.filter((o) => {
            if (o.locked) return false;
            const q = bbox(o);
            return q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y;
        }).map((o) => o.id);
        const ids = [...new Set([...b.add, ...hit])];
        if (!ids.length) return;
        dispatch({ type: 'SET', values: { selected: { pageId: page.id, id: ids[ids.length - 1], ...(ids.length > 1 ? { ids } : {}) }, editing: null } });
    };
    const pe = interactive ? 'auto' : 'none';

    return (
        // isolation: nesnelerin z-index'i (liste sırası) sayfanın diğer katmanlarını aşmasın
        <div ref={rootRef} className="absolute inset-0" style={{ pointerEvents: 'none', isolation: 'isolate' }}>
            {interactive && (
                <div className="absolute inset-0 touch-none" style={{ pointerEvents: 'auto' }} onPointerDown={bandDown} onPointerMove={bandMove} onPointerUp={bandUp} onPointerCancel={bandUp} />
            )}

            {/* Yığın sırası liste sırasıdır (dışa aktarımla aynı): görsel, şekil ve metin birbirinin üstüne geçebilir; notlar hep üstte */}
            {objs.map((o, i) => (o.type === 'text' ? (
                <TextObject
                    key={o.id}
                    o={o}
                    z={i + 1}
                    measure={!objects}
                    editing={editingId === o.id}
                    interactive={interactive}
                    onPointerDown={(e) => startDrag(e, o)}
                    onDoubleClick={() => interactive && dispatch({ type: 'SET', values: { editing: { kind: 'text', id: o.id }, selected: { pageId: page.id, id: o.id } } })}
                />
            ) : o.type !== 'note' && (
                <svg key={o.id} className="absolute inset-0 overflow-visible" width={page.width} height={page.height} style={{ pointerEvents: 'none', zIndex: i + 1 }}>
                    <g style={{ pointerEvents: pe, cursor: interactive ? 'move' : undefined }} onPointerDown={(e) => startDrag(e, o)}>
                        <ShapeSvg o={o} hit={interactive} />
                    </g>
                </svg>
            )))}

            <div className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: 900000 }}>
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
            </div>

            {fx && (
                <div className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: 1000001 }}>
                    <svg className="absolute inset-0 overflow-visible" width={page.width} height={page.height}>
                        {fx.lines.map((l) => (l.axis === 'x'
                            ? <line key={'x' + l.pos} x1={l.pos} y1={0} x2={l.pos} y2={page.height} stroke="#ff2d95" strokeWidth={1 / zoom} />
                            : <line key={'y' + l.pos} x1={0} y1={l.pos} x2={page.width} y2={l.pos} stroke="#ff2d95" strokeWidth={1 / zoom} />))}
                    </svg>
                    {fx.label && (
                        <div
                            className="absolute whitespace-nowrap rounded bg-[#ff2d95] text-white font-medium tabular-nums"
                            style={{ left: fx.box.x + fx.box.w / 2, top: fx.box.y + fx.box.h + 8 / zoom, transform: 'translateX(-50%)', fontSize: 11 / zoom, padding: `${2 / zoom}px ${6 / zoom}px` }}
                        >
                            {fx.label}
                        </div>
                    )}
                </div>
            )}

            {band && (
                <div className="absolute pointer-events-none" style={{ left: band.x, top: band.y, width: band.w, height: band.h, zIndex: 1000002, border: `${1 / zoom}px solid var(--accent)`, background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }} />
            )}

            {multiObjs.length > 1 && interactive && <MultiSelection objs={multiObjs} zoom={zoom} />}

            {selected && interactive && editingId !== selected.id && (
                <div className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: 1000000 }}>
                    <Selection o={selected} zoom={zoom} onHandle={startDrag} />
                </div>
            )}
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
            return <image href={o.src} x={o.x} y={o.y} width={o.w} height={o.h} preserveAspectRatio="none" opacity={op}
                transform={o.rotation ? `rotate(${o.rotation} ${o.x + o.w / 2} ${o.y + o.h / 2})` : undefined} />;
        default:
            return null;
    }
}

function TextObject({ o, z, editing, interactive, onPointerDown, onDoubleClick, measure }) {
    const { dispatch } = useEditor();
    const ref = useRef(null);

    // Gerçek boyutu ölç (seçim kutusu ve dışa aktarım hizalaması için)
    // ölçüyü yalnız asıl sayfa yazar: küçük resim gecikmeli kopyayı çizer, ölçü gönderirse kopya yetişene kadar döngüye girer
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !measure) return;
        const w = el.offsetWidth, h = el.offsetHeight;
        if (Math.abs(w - (o.w || 0)) > 0.5 || Math.abs(h - (o.h || 0)) > 0.5) {
            dispatch({ type: 'UPDATE_OBJECT', id: o.id, changes: { w, h }, transient: true });
        }
    });

    useEffect(() => {
        if (!editing || !ref.current) return;
        const el = ref.current;
        // Düzenleme elemanı React tarafından yönetilmez; içeriği burada verilir
        el.textContent = o.text || '';
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
            key={editing ? 'edit' : 'view'}
            ref={ref}
            className="absolute outline-none"
            style={{
                left: o.x,
                top: o.y,
                zIndex: z,
                ...textStyle(o),
                transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined,
                transformOrigin: 'center',
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
            {editing ? null : o.text}
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

/** Çoklu seçim: her nesnenin ince çerçevesi + hepsini saran kesikli kutu */
function MultiSelection({ objs, zoom }) {
    const bs = objs.map(bbox), sw = 1.25 / zoom, p = 3 / zoom;
    const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
    const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
    return (
        <div className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: 1000000 }}>
            <svg className="absolute inset-0 overflow-visible" style={{ width: '100%', height: '100%' }}>
                {bs.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="var(--accent)" strokeWidth={sw} opacity={0.7} />)}
                <rect x={x0 - p} y={y0 - p} width={x1 - x0 + 2 * p} height={y1 - y0 + 2 * p} fill="none" stroke="var(--accent)" strokeWidth={sw * 1.4} strokeDasharray={`${5 / zoom} ${3 / zoom}`} />
            </svg>
        </div>
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
    const resizable = !['path', 'highlight', 'note'].includes(o.type) && !o.locked;
    const handles = o.type === 'text' || o.type === 'image' ? CORNERS : HANDLES;
    const pos = (h) => [b.x + (h.includes('w') ? 0 : h.includes('e') ? b.w : b.w / 2), b.y + (h.includes('n') ? 0 : h.includes('s') ? b.h : b.h / 2)];
    const rot = (o.type === 'text' || o.type === 'image') && o.rotation ? `rotate(${o.rotation} ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined;
    return (
        <svg className="absolute inset-0 overflow-visible" style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>
            <g transform={rot}>
            <rect x={b.x - 2 / zoom} y={b.y - 2 / zoom} width={b.w + 4 / zoom} height={b.h + 4 / zoom} fill="none" stroke="var(--accent)" strokeWidth={sw} />
            {resizable && handles.map((h) => {
                const [x, y] = pos(h);
                return <rect key={h} x={x - r} y={y - r} width={r * 2} height={r * 2} rx={r / 3} fill="#fff" stroke="var(--accent)" strokeWidth={sw * 1.4} style={{ pointerEvents: 'auto', cursor: CURSORS[h] }} onPointerDown={(e) => onHandle(e, o, h)} />;
            })}
            </g>
        </svg>
    );
}
