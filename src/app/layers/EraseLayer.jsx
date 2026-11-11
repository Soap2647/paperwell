import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../../store/editor';
import { commitBytes, withBusy } from '../../store/actions';
import { magicErase } from '../../core/eraser';
import { eventToPage, capture } from '../objects';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';

const MASK_SCALE = 2;

export default function EraseLayer({ page, index, zoom }) {
    const ed = useEditor();
    const { state } = ed;
    const { size, mode } = state.opts.erase;
    const ref = useRef(null);
    const maskRef = useRef(null);
    const painting = useRef(null);
    const [cursor, setCursor] = useState(null);
    const [working, setWorking] = useState(false);

    useEffect(() => {
        const c = maskRef.current;
        c.width = Math.round(page.width * MASK_SCALE);
        c.height = Math.round(page.height * MASK_SCALE);
    }, [page.width, page.height]);

    const paint = (from, to) => {
        const ctx = maskRef.current.getContext('2d');
        ctx.strokeStyle = '#7c5cff';
        ctx.fillStyle = '#7c5cff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = size * MASK_SCALE;
        ctx.beginPath();
        ctx.moveTo(from[0] * MASK_SCALE, from[1] * MASK_SCALE);
        ctx.lineTo(to[0] * MASK_SCALE + 0.01, to[1] * MASK_SCALE);
        ctx.stroke();
    };

    const down = (e) => {
        if (e.button !== 0 || working) return;
        capture(e);
        const p = eventToPage(e, ref.current, zoom);
        painting.current = p;
        paint(p, p);
    };
    const move = (e) => {
        const p = eventToPage(e, ref.current, zoom);
        setCursor(p);
        if (!painting.current) return;
        paint(painting.current, p);
        painting.current = p;
    };
    const up = async () => {
        if (!painting.current) return;
        painting.current = null;
        setWorking(true);
        const mask = maskRef.current;
        await withBusy(ed, t('Siliniyor...'), async (progress) => {
            const bytes = await magicErase({
                bytes: ed.get().doc.bytes,
                pageIndex: index,
                mask,
                maskScale: MASK_SCALE,
                mode,
                onProgress: (stage, p) => {
                    if (stage === 'model') progress(p, `${t('Model indiriliyor')} ${Math.round((p || 0) * 100)}%`);
                },
            });
            if (bytes) {
                await commitBytes(ed, bytes);
                toast(t('Silindi'), 'success', 2000);
            }
        });
        mask.getContext('2d').clearRect(0, 0, mask.width, mask.height);
        setWorking(false);
    };

    return (
        <div
            ref={ref}
            className="absolute inset-0 touch-none"
            style={{ cursor: 'none' }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={() => setCursor(null)}
        >
            <canvas ref={maskRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.45 }} />
            {cursor && !working && (
                <div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                        left: cursor[0] - size / 2,
                        top: cursor[1] - size / 2,
                        width: size,
                        height: size,
                        border: `${1.5 / zoom}px solid #fff`,
                        boxShadow: `0 0 0 ${1 / zoom}px rgba(0,0,0,.6), inset 0 0 0 ${1 / zoom}px rgba(0,0,0,.35)`,
                        background: 'rgba(124,92,255,.18)',
                    }}
                />
            )}
        </div>
    );
}
