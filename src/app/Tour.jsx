// Tanıtım turu arayüzü: vurgulu adım adım genel tur ve araçların ilk kullanım kartları
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, X } from 'lucide-react';
import { Button } from '../components/ui';
import { t } from '../i18n';
import { GENERAL_STEPS, TOOL_TIPS, markSeen, useTourState } from './tourData';
import { TOOLS } from './tools';

/** Hedef öğenin ekrandaki kutusu (görünmüyorsa null) */
function useTargetRect(target) {
    const [rect, setRect] = useState(null);
    useLayoutEffect(() => {
        if (!target) { setRect(null); return undefined; }
        const measure = () => {
            const el = document.querySelector(`[data-tour="${target}"]`);
            const r = el?.getBoundingClientRect();
            setRect(r && r.width > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [target]);
    return rect;
}

/** Düzenleyici ilk açıldığında bir kez: ekranın bölümleri vurgulanarak anlatılır */
export function GeneralTour() {
    const seen = useTourState();
    const [i, setI] = useState(0);
    const step = GENERAL_STEPS[i];
    const rect = useTargetRect(step?.target);
    const done = () => markSeen('general');
    useEffect(() => {
        if (seen.general) return undefined;
        // tur açıkken tuşlar düzenleyiciye geçmez (ok tuşları nesne kaydırmasın)
        const onKey = (e) => {
            if (!['Escape', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(e.key)) return;
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape') done();
            if (e.key === 'ArrowRight' || e.key === 'Enter') setI((v) => Math.min(GENERAL_STEPS.length - 1, v + 1));
            if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [seen.general]);
    if (seen.general || !step) return null;

    const pad = 6, W = 330;
    const vw = window.innerWidth, vh = window.innerHeight;
    // kart hedefin sağına (yer yoksa soluna / altına) konur, ekrana sığdırılır
    let pos = { left: vw / 2 - W / 2, top: vh / 2 - 110 };
    if (rect) {
        const right = rect.x + rect.w + 16, left = rect.x - W - 16;
        if (right + W < vw) pos = { left: right, top: rect.y };
        else if (left > 0) pos = { left, top: rect.y };
        else pos = { left: rect.x + rect.w / 2 - W / 2, top: rect.y + rect.h + 16 };
        pos.left = Math.max(12, Math.min(vw - W - 12, pos.left));
        pos.top = Math.max(12, Math.min(vh - 230, pos.top));
    }
    const last = i === GENERAL_STEPS.length - 1;
    return createPortal(
        <div className="fixed inset-0 z-[200]" role="dialog" aria-label={t(step.title)}>
            {rect
                ? <div className="absolute rounded-xl ring-2 ring-accent transition-all duration-300 pointer-events-none"
                    style={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2, boxShadow: '0 0 0 9999px rgba(10,10,20,0.62)' }} />
                : <div className="absolute inset-0 bg-[rgba(10,10,20,0.62)]" />}
            <div className="absolute rounded-2xl bg-surface border border-line shadow-pop p-4 space-y-3 transition-all duration-300" style={{ ...pos, width: W }}>
                <div className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                    <h3 className="text-[14px] font-semibold flex-1">{t(step.title)}</h3>
                    <span className="text-[11px] text-fg-3 tabular-nums">{i + 1}/{GENERAL_STEPS.length}</span>
                </div>
                <p className="text-[13px] text-fg-2 leading-relaxed">{t(step.text)}</p>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={done} className="text-xs text-fg-3 hover:text-fg mr-auto">{t('Turu geç')}</button>
                    {i > 0 && <Button size="sm" variant="ghost" onClick={() => setI(i - 1)}>{t('Geri')}</Button>}
                    <Button size="sm" variant="primary" onClick={() => (last ? done() : setI(i + 1))}>{last ? t('Başlayalım') : t('İleri')}</Button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

/** Bir araç ilk seçildiğinde sağ panelin başında: o aracın bütün özellikleri madde madde */
export function ToolIntro({ tool }) {
    const seen = useTourState();
    const tips = TOOL_TIPS[tool];
    if (!tips || seen[`tool:${tool}`] || !seen.general) return null;
    const meta = TOOLS.find((x) => x.id === tool);
    return (
        <div className="mx-3 mt-3 rounded-xl border border-accent/30 bg-accent-soft/60 p-3 space-y-2 relative">
            <button type="button" aria-label={t('Kapat')} onClick={() => markSeen(`tool:${tool}`)} className="absolute top-2 right-2 text-fg-3 hover:text-fg"><X className="w-3.5 h-3.5" /></button>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-text pr-5">
                {meta && <meta.icon className="w-4 h-4" />}{t(meta?.label || '')}: {t('neler yapabilirsiniz?')}
            </div>
            <ol className="space-y-1.5">
                {tips.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-xs text-fg-2 leading-relaxed">
                        <span className="w-4 h-4 mt-px shrink-0 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
                        <span>{t(tip)}</span>
                    </li>
                ))}
            </ol>
            <Button size="sm" variant="primary" className="w-full" onClick={() => markSeen(`tool:${tool}`)}>{t('Anladım')}</Button>
        </div>
    );
}
