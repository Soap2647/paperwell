import { useEffect, useRef, useState } from 'react';
import { Eraser, Type, BadgeCheck, X, ArrowLeft, Check, Upload, Loader2 } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { eventToPage, capture } from '../objects';
import { fixErase, fixStartText, fixApplyText, fixApplyLogo, clearFix, setFixStep } from '../fixActions';
import { useBrandKit, addBrandAsset } from '../../core/brandKit';
import { Button } from '../../components/ui';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';

// Düzelt aracı: bozuk bölgeyi kutula, altında çıkan menüden ne yapılacağını seç
export default function FixLayer({ page, index, zoom }) {
    const ed = useEditor();
    const fix = ed.state.fix?.pageIndex === index ? ed.state.fix : null;
    const ref = useRef(null);
    const [d, setD] = useState(null);

    // Esc: kutuyu kaldır; Delete: doğrudan sil
    useEffect(() => {
        if (!fix) return;
        const onKey = (e) => {
            if (ed.get().busy || ed.get().dialog || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); clearFix(ed); }
            if ((e.key === 'Delete' || e.key === 'Backspace') && fix.step === 'menu') { e.preventDefault(); e.stopImmediatePropagation(); fixErase(ed); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [fix, ed]);

    const down = (e) => {
        if (e.button !== 0) return;
        // seçili metin varken tarayıcı yerel sürüklemeyi başlatıp işaretçiyi iptal etmesin
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
        capture(e);
        const p = eventToPage(e, ref.current, zoom);
        setD({ a: p, b: p });
    };
    const move = (e) => d && setD({ ...d, b: eventToPage(e, ref.current, zoom) });
    const up = () => {
        if (!d) return;
        const r = { x: Math.max(0, Math.min(d.a[0], d.b[0])), y: Math.max(0, Math.min(d.a[1], d.b[1])) };
        r.w = Math.min(page.width, Math.max(d.a[0], d.b[0])) - r.x;
        r.h = Math.min(page.height, Math.max(d.a[1], d.b[1])) - r.y;
        setD(null);
        if (r.w > 4 && r.h > 4) ed.dispatch({ type: 'SET', values: { fix: { pageIndex: index, rect: r, step: 'menu' } } });
        else clearFix(ed);
    };

    const preview = d ? { x: Math.min(d.a[0], d.b[0]), y: Math.min(d.a[1], d.b[1]), w: Math.abs(d.b[0] - d.a[0]), h: Math.abs(d.b[1] - d.a[1]) } : fix?.rect;

    return (
        <div ref={ref} className="absolute inset-0 touch-none" style={{ cursor: 'crosshair' }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            {preview && (
                <div className="absolute pointer-events-none" style={{
                    left: preview.x, top: preview.y, width: preview.w, height: preview.h,
                    outline: `${2 / zoom}px dashed #7c5cff`, background: 'rgba(124,92,255,.10)', boxShadow: `0 0 0 ${1 / zoom}px rgba(255,255,255,.8)`,
                }} />
            )}
            {fix && !d && <FixBar fix={fix} page={page} zoom={zoom} />}
        </div>
    );
}

function FixBar({ fix, page, zoom }) {
    const ed = useEditor();
    const r = fix.rect;
    // kutunun altında ortada; sayfanın altına taşarsa üstünde
    const below = r.y + r.h + 220 / zoom < page.height;
    const style = {
        left: Math.min(page.width - 10, Math.max(10, r.x + r.w / 2)), top: below ? r.y + r.h + 10 / zoom : Math.max(0, r.y - 10 / zoom),
        transform: `translate(-50%, ${below ? 0 : '-100%'}) scale(${1 / zoom})`, transformOrigin: below ? '50% 0' : '50% 100%',
    };
    return (
        <div className="absolute z-10" style={style} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <div className="p-1.5 rounded-xl bg-surface border border-line shadow-float">
                {fix.step === 'menu' && <Menu ed={ed} />}
                {fix.step === 'text' && <TextStep ed={ed} fix={fix} />}
                {fix.step === 'logo' && <LogoStep ed={ed} />}
            </div>
        </div>
    );
}

function Menu({ ed }) {
    return (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Button size="sm" variant="primary" icon={Eraser} onClick={() => fixErase(ed)} title={t('Bölgedeki bozuk detayı siler, arkasını tamamlar (Delete)')}>{t('Sil')}</Button>
            <Button size="sm" icon={Type} onClick={() => fixStartText(ed)} title={t('Yazıyı okur, doğrusunu yazarsınız')}>{t('Yazıyı düzelt')}</Button>
            <Button size="sm" icon={BadgeCheck} onClick={() => setFixStep(ed, 'logo')} title={t('Bozuk logoyu marka kitindeki logoyla değiştirir')}>{t('Logo koy')}</Button>
            <Button size="sm" icon={X} onClick={() => clearFix(ed)} aria-label={t('İptal')} />
        </div>
    );
}

function TextStep({ ed, fix }) {
    const [text, setText] = useState(fix.text || '');
    const [seen, setSeen] = useState(fix.text);
    // okuma bitince okunan yazı kutuya gelir (kullanıcı henüz yazmadıysa)
    if (fix.text !== seen) { setSeen(fix.text); if (!text) setText(fix.text || ''); }
    const apply = () => fixApplyText(ed, text);
    return (
        <div className="w-72 space-y-2">
            <div className="text-xs font-medium text-fg-2 px-0.5 flex items-center gap-1.5">
                {fix.reading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('Yazı okunuyor...')}</> : t('Doğru yazıyı girin')}
            </div>
            <textarea autoFocus rows={Math.min(5, Math.max(2, text.split('\n').length))} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); } if (e.key === 'Escape') clearFix(ed); }}
                placeholder={fix.reading ? '' : t('Buraya yazın')}
                className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[13px] resize-none focus:outline-none focus:border-accent" />
            <div className="flex items-center gap-1.5 justify-end">
                <Button size="sm" icon={ArrowLeft} onClick={() => setFixStep(ed, 'menu')}>{t('Geri')}</Button>
                <Button size="sm" variant="primary" icon={Check} disabled={!text.trim()} onClick={apply}>{t('Uygula')}</Button>
            </div>
            <p className="text-[11px] text-fg-3 leading-snug px-0.5">{t('Eski yazı silinir, yerine marka fontuyla düzenlenebilir yazı gelir.')}</p>
        </div>
    );
}

function LogoStep({ ed }) {
    const kit = useBrandKit();
    const fileRef = useRef(null);
    const fromFile = async (f) => {
        if (!f) return;
        try { const a = await addBrandAsset(f); fixApplyLogo(ed, a); } catch (e) { toast(t(e.message), 'error'); }
    };
    return (
        <div className="w-72 space-y-2">
            <div className="text-xs font-medium text-fg-2 px-0.5">{kit.assets.length ? t('Hangi logo gelsin?') : t('Marka kitinizde henüz logo yok')}</div>
            {kit.assets.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto scroll-thin">
                    {kit.assets.map((a) => (
                        <button key={a.id} type="button" title={a.name} onClick={() => fixApplyLogo(ed, a)}
                            className="aspect-square rounded-lg border border-line checker flex items-center justify-center hover:border-accent hover:ring-2 hover:ring-accent-soft">
                            <img src={a.src} alt={a.name} className="max-w-[85%] max-h-[85%] object-contain" draggable={false} />
                        </button>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-1.5 justify-end">
                <Button size="sm" icon={ArrowLeft} onClick={() => setFixStep(ed, 'menu')}>{t('Geri')}</Button>
                <Button size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>{t('Dosyadan seç')}</Button>
            </div>
            <p className="text-[11px] text-fg-3 leading-snug px-0.5">{t('Dosyadan seçtiğiniz logo marka kitine de eklenir; bir dahakine burada hazır olur.')}</p>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={(e) => { fromFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
    );
}
