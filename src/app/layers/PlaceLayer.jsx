// Tıklayarak yerleştirme: metin kutusu, görsel, imza, not
import { useRef, useState } from 'react';
import { useEditor } from '../../store/editor';
import { newId } from '../../core/pageOps';
import { eventToPage } from '../objects';
import { t } from '../../i18n';

export default function PlaceLayer({ page, zoom }) {
    const { state, dispatch } = useEditor();
    const { tool, pendingImage, opts } = state;
    const ref = useRef(null);
    const [hover, setHover] = useState(null);

    const imgSize = () => {
        if (!pendingImage) return null;
        const maxW = tool === 'sign' ? 170 : Math.min(page.width * 0.45, pendingImage.w);
        const w = Math.min(maxW, pendingImage.w);
        return { w, h: w * (pendingImage.h / pendingImage.w) };
    };

    const click = (e) => {
        if (e.button !== 0) return;
        const [x, y] = eventToPage(e, ref.current, zoom);
        if (tool === 'text') {
            const o = opts.text;
            const obj = { id: newId('ob'), type: 'text', x, y: y - o.size * 0.7, w: 0, h: 0, text: '', ...o, lineHeight: 1.25 };
            dispatch({ type: 'ADD_OBJECT', pageId: page.id, obj });
            dispatch({ type: 'SET', values: { tool: 'select', editing: { kind: 'text', id: obj.id } } });
        } else if (tool === 'note') {
            const obj = { id: newId('ob'), type: 'note', x: x - 12, y: y - 12, w: 24, h: 24, text: '', color: opts.note.color };
            dispatch({ type: 'ADD_OBJECT', pageId: page.id, obj });
            dispatch({ type: 'SET', values: { tool: 'select', editing: { kind: 'note', id: obj.id } } });
        } else if ((tool === 'image' || tool === 'sign') && pendingImage) {
            const s = imgSize();
            const obj = { id: newId('ob'), type: 'image', x: x - s.w / 2, y: y - s.h / 2, w: s.w, h: s.h, src: pendingImage.src, opacity: 1, signature: tool === 'sign' };
            dispatch({ type: 'ADD_OBJECT', pageId: page.id, obj });
            dispatch({ type: 'SET', values: { tool: 'select' } });
        } else if (tool === 'sign') {
            dispatch({ type: 'SET', values: { dialog: 'signature' } });
        }
    };

    const s = imgSize();
    return (
        <div
            ref={ref}
            className="absolute inset-0"
            style={{ cursor: tool === 'text' ? 'text' : pendingImage ? 'copy' : 'crosshair' }}
            onPointerDown={click}
            onPointerMove={(e) => setHover(eventToPage(e, ref.current, zoom))}
            onPointerLeave={() => setHover(null)}
        >
            {hover && s && (
                <img src={pendingImage.src} alt="" className="absolute pointer-events-none opacity-70" style={{ left: hover[0] - s.w / 2, top: hover[1] - s.h / 2, width: s.w, height: s.h, outline: `${1 / zoom}px dashed var(--accent)` }} />
            )}
            {hover && tool === 'sign' && !pendingImage && (
                <div className="absolute pointer-events-none px-2 py-1 rounded bg-surface border border-line text-xs shadow-pop whitespace-nowrap" style={{ left: hover[0] + 10, top: hover[1] + 10, transform: `scale(${1 / zoom})`, transformOrigin: '0 0' }}>
                    {t('İmza ekle')}
                </div>
            )}
        </div>
    );
}
