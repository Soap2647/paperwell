// Belgenin kendi içeriğini düzenleme: metin satırları orijinal fontla yerinde, görseller taşınır/boyutlanır.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../../store/editor';
import { commitBytes, withBusy } from '../../store/actions';
import { useEditModel } from './useEditModel';
import { replaceLineText, transformImage, deleteImage } from '../../core/pdf/editOps';
import { mul } from '../../core/pdf/geometry';
import { FONT_FAMILIES } from '../../core/fonts';
import { sampleBackground } from '../pageRegistry';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';

const rgbHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');

function viewRectToPdf(geom, r) {
    const a = geom.pdfPoint(r.x, r.y), b = geom.pdfPoint(r.x + r.w, r.y + r.h);
    return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
}

export default function EditLayer({ index, zoom }) {
    const ed = useEditor();
    const { state, dispatch } = ed;
    const data = useEditModel(state.doc.bytes, index);
    const editing = state.editing?.pageIndex === index ? state.editing : null;

    if (!data) return null;
    if (data.empty || (!data.lines.length && !data.images.length)) {
        return (
            <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none" style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top center' }}>
                <span className="px-3 py-1.5 rounded-full bg-surface border border-line shadow-pop text-xs text-fg-2">
                    {t('Bu sayfada düzenlenebilir metin yok (taranmış olabilir). Akıllı silgi ve Metin aracını kullanın.')}
                </span>
            </div>
        );
    }

    const startLine = (entry) => {
        const g = data.model.geom;
        const T = entry.line.segments[0].glyphs[0].Trm;
        const [x0, y0] = g.viewPoint(T[4], T[5]);
        const [x1, y1] = g.viewPoint(T[4] + T[0], T[5] + T[1]);
        if (Math.abs(Math.atan2(y1 - y0, x1 - x0)) > 0.02) {
            toast(t('Döndürülmüş metin henüz yerinde düzenlenemiyor; Akıllı silgi ve Metin aracını kullanın.'), 'info');
            return;
        }
        dispatch({
            type: 'SET',
            values: {
                editing: {
                    kind: 'line',
                    pageIndex: index,
                    lineId: entry.line.id,
                    style: { family: 'original', size: Math.round(entry.line.fontSize * 10) / 10, color: rgbHex(entry.line.color), bold: entry.line.font.bold, italic: entry.line.font.italic },
                    fontName: entry.line.font.displayName,
                },
            },
        });
    };

    return (
        <div className="absolute inset-0">
            {data.images.map(({ img, rect }) => (
                editing?.kind === 'image' && editing.imageId === img.id ? null : (
                    <button
                        key={img.id}
                        type="button"
                        className="absolute edit-box rounded-[1px]"
                        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, outlineWidth: 1 / zoom }}
                        onClick={() => dispatch({ type: 'SET', values: { editing: { kind: 'image', pageIndex: index, imageId: img.id } } })}
                        aria-label={t('Görsel')}
                    />
                )
            ))}
            {data.lines.map((entry) => (
                editing?.kind === 'line' && editing.lineId === entry.line.id ? (
                    <LineEditor key={entry.line.id} entry={entry} index={index} geom={data.model.geom} editing={editing} zoom={zoom} />
                ) : (
                    <div
                        key={entry.line.id}
                        className="absolute edit-box cursor-text rounded-[1px]"
                        style={{ left: entry.rect.x - 1, top: entry.rect.y - 1, width: entry.rect.w + 2, height: entry.rect.h + 2, outlineWidth: 1 / zoom }}
                        onClick={() => startLine(entry)}
                        title={entry.line.font.displayName}
                    />
                )
            ))}
            {editing?.kind === 'image' && (() => {
                const entry = data.images.find((i) => i.img.id === editing.imageId);
                return entry ? <ImageEditor key={entry.img.id} entry={entry} index={index} geom={data.model.geom} zoom={zoom} /> : null;
            })()}
        </div>
    );
}

function LineEditor({ entry, index, geom, editing, zoom }) {
    const ed = useEditor();
    const { dispatch } = ed;
    const ref = useRef(null);
    const { line, rect, pdfFont } = entry;
    const style = editing.style;
    const [bg] = useState(() => sampleBackground(index, rect));
    const done = useRef(false);

    useEffect(() => {
        const el = ref.current;
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    }, []);

    // Panelden "Kaydet/Vazgeç" ve dışarı tıklama
    const finishRef = useRef(null);
    useEffect(() => {
        const onCmd = (e) => finishRef.current?.(e.detail !== 'cancel');
        const onDown = (e) => {
            if (ref.current?.parentElement?.contains(e.target) || e.target.closest?.('[data-inspector]')) return;
            finishRef.current?.(true);
        };
        window.addEventListener('paperwell:line-edit', onCmd);
        window.addEventListener('pointerdown', onDown, true);
        return () => {
            window.removeEventListener('paperwell:line-edit', onCmd);
            window.removeEventListener('pointerdown', onDown, true);
        };
    }, []);

    const [bx, by] = geom.viewPoint(...line.origin);
    const asc = Math.max(0.7, line.font.ascent || 0.8);
    const desc = Math.min(-0.1, line.font.descent || -0.2);
    const size = style.size;
    const generic = line.font.mono ? 'monospace' : line.font.serif ? 'serif' : 'sans-serif';
    const fontFamily = style.family === 'original'
        ? `${pdfFont ? `"${pdfFont}", ` : ''}${line.font.mono ? FONT_FAMILIES.mono.css : line.font.serif ? FONT_FAMILIES.serif.css : FONT_FAMILIES.sans.css}, ${generic}`
        : FONT_FAMILIES[style.family].css;

    const finish = async (save) => {
        if (done.current) return;
        done.current = true;
        const text = (ref.current?.innerText || '').replace(/\n/g, ' ');
        const s = ed.get();
        const styleChanged = style.family !== 'original' || style.bold !== line.font.bold || style.italic !== line.font.italic
            || Math.abs(style.size - line.fontSize) > 0.05 || style.color.toLowerCase() !== rgbHex(line.color);
        dispatch({ type: 'SET', values: { editing: null } });
        if (!save || (text === line.text && !styleChanged)) return;
        await withBusy(ed, t('İşleniyor...'), async () => {
            const color = [1, 3, 5].map((k) => parseInt(style.color.slice(k, k + 2), 16) / 255);
            const r = await replaceLineText(s.doc.bytes, index, line.id, text, {
                forceFallback: style.family !== 'original' || style.bold !== line.font.bold || style.italic !== line.font.italic,
                family: style.family === 'original' ? undefined : style.family,
                bold: style.bold,
                italic: style.italic,
                size: Math.abs(style.size - line.fontSize) > 0.05 ? style.size : undefined,
                color: style.color.toLowerCase() !== rgbHex(line.color) ? color : undefined,
            });
            await commitBytes(ed, r.bytes);
            if (!r.usedOriginalFont && style.family === 'original' && !styleChanged) toast(t('Orijinal fontta bu karakterler yok; benzer bir font kullanıldı.'), 'info', 5000);
            else toast(t('Metin güncellendi'), 'success');
        });
    };

    finishRef.current = finish;

    return (
        <div
            className="absolute"
            style={{ left: rect.x - 2, top: by - asc * size - 1, minWidth: rect.w + 4, height: (asc - desc) * size + 2, background: bg, boxShadow: `0 0 0 ${1.5 / zoom}px var(--accent)`, borderRadius: 1 }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <span
                ref={ref}
                contentEditable="plaintext-only"
                suppressContentEditableWarning
                spellCheck={false}
                className="block outline-none whitespace-pre"
                style={{
                    fontFamily,
                    fontSize: size,
                    lineHeight: `${(asc - desc) * size}px`,
                    paddingLeft: 2 + (bx - rect.x),
                    paddingRight: 2,
                    color: style.color,
                    fontWeight: style.bold ? 700 : 400,
                    fontStyle: style.italic ? 'italic' : 'normal',
                    caretColor: 'var(--accent)',
                }}
                onBlur={(e) => {
                    // Özellikler paneline geçişte kaydetme; dışarı tıklama ya da Enter kaydeder
                    if (e.relatedTarget?.closest?.('[data-inspector]')) return;
                    finish(true);
                }}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
                    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
                }}
            >
                {line.text}
            </span>
        </div>
    );
}

function ImageEditor({ entry, index, geom, zoom }) {
    const ed = useEditor();
    const { dispatch } = ed;
    const [rect, setRect] = useState(entry.rect);
    const drag = useRef(null);
    const rectRef = useRef(rect);
    rectRef.current = rect;

    const apply = useMemo(() => async (r) => {
        const s = ed.get();
        const oldPdf = viewRectToPdf(geom, entry.rect);
        const newPdf = viewRectToPdf(geom, r);
        const sx = (newPdf.x1 - newPdf.x0) / (oldPdf.x1 - oldPdf.x0 || 1);
        const sy = (newPdf.y1 - newPdf.y0) / (oldPdf.y1 - oldPdf.y0 || 1);
        const A = [sx, 0, 0, sy, newPdf.x0 - oldPdf.x0 * sx, newPdf.y0 - oldPdf.y0 * sy];
        await withBusy(ed, t('İşleniyor...'), async () => {
            const bytes = await transformImage(s.doc.bytes, index, entry.img.id, mul(entry.img.ctm, A));
            await commitBytes(ed, bytes);
            toast(t('Görsel güncellendi'), 'success');
        });
    }, [ed, geom, entry, index]);

    useEffect(() => {
        const move = (e) => {
            const d = drag.current;
            if (!d) return;
            const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom;
            d.moved = d.moved || Math.hypot(dx, dy) > 1;
            const o = d.orig;
            let r;
            if (d.handle === 'move') r = { ...o, x: o.x + dx, y: o.y + dy };
            else {
                const ratio = o.w / o.h;
                let w = Math.max(8, o.w + (d.handle.includes('e') ? dx : -dx));
                if (!e.shiftKey) w = Math.max(8, w);
                const h = e.shiftKey ? Math.max(8, o.h + (d.handle.includes('s') ? dy : -dy)) : w / ratio;
                r = { x: d.handle.includes('w') ? o.x + o.w - w : o.x, y: d.handle.includes('n') ? o.y + o.h - h : o.y, w, h };
            }
            setRect(r);
        };
        const up = () => {
            const d = drag.current;
            drag.current = null;
            if (d?.moved) apply(rectRef.current);
        };
        const key = (e) => {
            if (e.target.closest?.('input,textarea,[contenteditable]')) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                withBusy(ed, t('İşleniyor...'), async () => {
                    const bytes = await deleteImage(ed.get().doc.bytes, index, entry.img.id);
                    await commitBytes(ed, bytes);
                    toast(t('Görsel silindi'), 'success');
                });
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('keydown', key);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('keydown', key);
        };
    }, [zoom, apply, ed, index, entry.img.id]);

    const start = (e, handle) => {
        e.stopPropagation();
        e.preventDefault();
        drag.current = { handle, sx: e.clientX, sy: e.clientY, orig: rectRef.current };
    };
    const r = 5 / zoom;
    return (
        <div className="absolute inset-0" onPointerDown={() => dispatch({ type: 'SET', values: { editing: null } })}>
            {/* orijinal konum hayaleti */}
            <div className="absolute border border-dashed border-fg-3/60" style={{ left: entry.rect.x, top: entry.rect.y, width: entry.rect.w, height: entry.rect.h, borderWidth: 1 / zoom }} />
            <div
                className="absolute cursor-move"
                style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxShadow: `0 0 0 ${1.5 / zoom}px var(--accent)`, background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
                onPointerDown={(e) => start(e, 'move')}
            >
                {['nw', 'ne', 'se', 'sw'].map((h) => (
                    <span
                        key={h}
                        className="absolute bg-white"
                        style={{
                            width: r * 2, height: r * 2, border: `${1.5 / zoom}px solid var(--accent)`, borderRadius: r / 3,
                            left: h.includes('w') ? -r : undefined, right: h.includes('e') ? -r : undefined,
                            top: h.includes('n') ? -r : undefined, bottom: h.includes('s') ? -r : undefined,
                            cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
                        }}
                        onPointerDown={(e) => start(e, h)}
                    />
                ))}
            </div>
        </div>
    );
}
