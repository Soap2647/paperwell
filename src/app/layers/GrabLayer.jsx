import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { eventToPage } from '../objects';
import { grabClick, applyGrab, clearGrab } from '../grabActions';
import { Button } from '../../components/ui';
import { t } from '../../i18n';

// Nesne aracı: tıkla (Shift: nokta ekle, Alt: çıkar), maske önizlemesi, Enter ile katmana çıkar
export default function GrabLayer({ page, index, zoom }) {
    const ed = useEditor();
    const grab = ed.state.grab?.pageIndex === index ? ed.state.grab : null;
    const ref = useRef(null);
    const maskRef = useRef(null);
    const [working, setWorking] = useState(false);

    // Maske önizlemesi: dolgu + kontur
    useEffect(() => {
        const c = maskRef.current;
        if (!c) return;
        if (!grab?.mask) { c.width = 1; c.height = 1; return; }
        const { logits, w, h } = grab.mask;
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(w, h);
        const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && logits[y * w + x] > 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!on(x, y)) continue;
                const edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
                const i = (y * w + x) * 4;
                img.data[i] = edge ? 255 : 124; img.data[i + 1] = edge ? 255 : 92; img.data[i + 2] = 255;
                img.data[i + 3] = edge ? 255 : 110;
            }
        }
        ctx.putImageData(img, 0, 0);
    }, [grab?.mask]);

    // Enter: uygula, Esc: temizle (araçtan çıkmadan)
    useEffect(() => {
        if (!grab) return;
        const onKey = (e) => {
            if (ed.get().busy || ed.get().dialog) return;
            if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); applyGrab(ed); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); clearGrab(ed); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [grab, ed]);

    const down = async (e) => {
        if (e.button !== 0 || working) return;
        e.preventDefault();
        const p = eventToPage(e, ref.current, zoom);
        setWorking(true);
        try {
            await grabClick(ed, index, p, { add: e.shiftKey || e.altKey, positive: !e.altKey });
        } finally {
            setWorking(false);
        }
    };

    // Onay çubuğu: maskenin altında ortada, zoom'dan bağımsız boyutta
    let bar = null;
    if (grab?.mask) {
        const ys = grab.points.map((p) => p.y);
        const xs = grab.points.map((p) => p.x);
        const bx = Math.min(page.width - 10, Math.max(10, (Math.min(...xs) + Math.max(...xs)) / 2));
        const by = Math.min(page.height - 50 / zoom, Math.max(...ys) + 24 / zoom);
        bar = (
            <div className="absolute" style={{ left: bx, top: by, transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: '50% 0' }} onPointerDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-surface border border-line shadow-float whitespace-nowrap">
                    <Button size="sm" variant="primary" icon={Check} onClick={() => applyGrab(ed)}>{t('Katmana çıkar')}</Button>
                    <Button size="sm" icon={X} onClick={() => clearGrab(ed)} aria-label={t('İptal')} />
                </div>
            </div>
        );
    }

    return (
        <div ref={ref} className="absolute inset-0" style={{ cursor: working ? 'progress' : 'crosshair' }} onPointerDown={down}>
            <canvas ref={maskRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            {grab?.points.map((p, i) => (
                <span key={i} className="absolute rounded-full pointer-events-none"
                    style={{
                        left: p.x, top: p.y, width: 10 / zoom, height: 10 / zoom, transform: 'translate(-50%,-50%)',
                        background: p.positive ? '#22c55e' : '#e11d48', border: `${2 / zoom}px solid #fff`, boxShadow: `0 0 0 ${1 / zoom}px rgba(0,0,0,.5)`,
                    }} />
            ))}
            {bar}
        </div>
    );
}
