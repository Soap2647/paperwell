import { useEffect, useRef, useState } from 'react';
import { Eraser, Type, BadgeCheck, X, ArrowLeft, Check, Upload, Loader2, Bold } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { eventToPage, capture } from '../objects';
import { fixErase, fixStartText, fixApplyText, fixApplyLogo, clearFix, setFixStep, fixPreview } from '../fixActions';
import { useBrandKit, addBrandAsset } from '../../core/brandKit';
import { Button, cx } from '../../components/ui';
import FontPicker from '../FontPicker';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';

const MASK_SCALE = 2; // fırça maskesi: sayfa birimi başına piksel

// Düzelt aracı: bozuk bölgeyi kutula ya da fırçayla boya, altında çıkan menüden ne yapılacağını seç
export default function FixLayer({ page, index, zoom }) {
    const ed = useEditor();
    const fix = ed.state.fix?.pageIndex === index ? ed.state.fix : null;
    const { mode, size } = ed.state.opts.fix;
    const brush = mode === 'brush';
    const ref = useRef(null);
    const maskRef = useRef(null);
    const paintRef = useRef(null); // { last: [x, y], x0, y0, x1, y1 }
    const [d, setD] = useState(null);
    const [cursor, setCursor] = useState(null);
    const [painting, setPainting] = useState(false);

    // fırça maskesi sayfa boyutunda; düzeltme bitince (fix temizlenince) silinir
    useEffect(() => {
        const c = maskRef.current;
        if (!c) return;
        c.width = Math.round(page.width * MASK_SCALE);
        c.height = Math.round(page.height * MASK_SCALE);
    }, [page.width, page.height, brush]);
    useEffect(() => {
        if (!fix?.brush && maskRef.current && !paintRef.current) maskRef.current.getContext('2d').clearRect(0, 0, maskRef.current.width, maskRef.current.height);
    }, [fix]);

    const paint = (from, to) => {
        const ctx = maskRef.current.getContext('2d');
        ctx.strokeStyle = '#7c5cff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = size * MASK_SCALE;
        ctx.beginPath();
        ctx.moveTo(from[0] * MASK_SCALE, from[1] * MASK_SCALE);
        ctx.lineTo(to[0] * MASK_SCALE + 0.01, to[1] * MASK_SCALE);
        ctx.stroke();
        const p = paintRef.current, r = size / 2;
        p.x0 = Math.min(p.x0, to[0] - r); p.y0 = Math.min(p.y0, to[1] - r); p.x1 = Math.max(p.x1, to[0] + r); p.y1 = Math.max(p.y1, to[1] + r);
        p.last = to;
    };
    const brushUp = () => {
        const p = paintRef.current;
        paintRef.current = null;
        setPainting(false);
        if (!p) return;
        const c = maskRef.current;
        const px = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
        const data = new Uint8Array(c.width * c.height);
        for (let i = 0; i < data.length; i++) if (px[i * 4 + 3] > 10) data[i] = 1;
        const r = { x: Math.max(0, p.x0), y: Math.max(0, p.y0) };
        r.w = Math.min(page.width, p.x1) - r.x;
        r.h = Math.min(page.height, p.y1) - r.y;
        ed.dispatch({ type: 'SET', values: { fix: { pageIndex: index, rect: r, step: 'menu', brush: { data, w: c.width, h: c.height, scale: MASK_SCALE } } } });
    };

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
        if (brush) {
            // yeni boyama: önceki seçim kalkar; Shift ile önceki boyamaya eklenir
            if (!e.shiftKey || !fix?.brush) maskRef.current.getContext('2d').clearRect(0, 0, maskRef.current.width, maskRef.current.height);
            const prev = e.shiftKey && fix?.brush ? fix.rect : null;
            paintRef.current = prev ? { x0: prev.x, y0: prev.y, x1: prev.x + prev.w, y1: prev.y + prev.h } : { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
            if (fix) clearFix(ed);
            setPainting(true);
            paint(p, p);
            return;
        }
        setD({ a: p, b: p });
    };
    const move = (e) => {
        const p = eventToPage(e, ref.current, zoom);
        if (brush) { setCursor(p); if (paintRef.current) paint(paintRef.current.last, p); return; }
        if (d) setD({ ...d, b: p });
    };
    const up = () => {
        if (brush) { brushUp(); return; }
        if (!d) return;
        const r = { x: Math.max(0, Math.min(d.a[0], d.b[0])), y: Math.max(0, Math.min(d.a[1], d.b[1])) };
        r.w = Math.min(page.width, Math.max(d.a[0], d.b[0])) - r.x;
        r.h = Math.min(page.height, Math.max(d.a[1], d.b[1])) - r.y;
        setD(null);
        if (r.w > 4 && r.h > 4) {
            const next = { pageIndex: index, rect: r, step: 'menu' };
            ed.dispatch({ type: 'SET', values: { fix: next } });
            fixPreview(ed, next);
        }
        else clearFix(ed);
    };

    const preview = d ? { x: Math.min(d.a[0], d.b[0]), y: Math.min(d.a[1], d.b[1]), w: Math.abs(d.b[0] - d.a[0]), h: Math.abs(d.b[1] - d.a[1]) } : fix?.brush || fix?.step === 'all' ? null : fix?.rect;

    return (
        <div ref={ref} className="absolute inset-0 touch-none" style={{ cursor: brush ? 'none' : 'crosshair' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => setCursor(null)}>
            {brush && <canvas ref={maskRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.45 }} />}
            {brush && cursor && (
                <div className="absolute rounded-full pointer-events-none" style={{
                    left: cursor[0] - size / 2, top: cursor[1] - size / 2, width: size, height: size,
                    border: `${1.5 / zoom}px solid #fff`, boxShadow: `0 0 0 ${1 / zoom}px rgba(0,0,0,.6)`, background: 'rgba(124,92,255,.18)',
                }} />
            )}
            {fix?.preview && !d && fix.step !== 'all' && (
                <img src={fix.preview.src} alt="" className="absolute pointer-events-none" draggable={false}
                    style={{ left: fix.preview.x, top: fix.preview.y, width: fix.preview.w, height: fix.preview.h, imageRendering: 'pixelated' }} />
            )}
            {preview && (
                <div className="absolute pointer-events-none" style={{
                    left: preview.x, top: preview.y, width: preview.w, height: preview.h,
                    outline: `${2 / zoom}px dashed #7c5cff`, background: 'rgba(124,92,255,.10)', boxShadow: `0 0 0 ${1 / zoom}px rgba(255,255,255,.8)`,
                }} />
            )}
            {fix?.step === 'all' && fix.items.map((it, i) => (
                <div key={i} className="absolute pointer-events-none" style={{
                    left: it.rect.x, top: it.rect.y, width: it.rect.w, height: it.rect.h,
                    outline: `${(fix.hover === i ? 2.5 : 1.5) / zoom}px solid ${fix.hover === i ? '#ff2d95' : '#7c5cff'}`, background: fix.hover === i ? 'rgba(255,45,149,.12)' : undefined,
                }}>
                    <span className="absolute rounded-full bg-accent text-white font-semibold flex items-center justify-center"
                        style={{ left: -9 / zoom, top: -9 / zoom, width: 18 / zoom, height: 18 / zoom, fontSize: 10.5 / zoom }}>{i + 1}</span>
                </div>
            ))}
            {fix && fix.step !== 'all' && !d && !painting && <FixBar fix={fix} page={page} zoom={zoom} />}
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
    const kit = useBrandKit();
    const [text, setText] = useState(fix.text || '');
    // stil: yazı tipi marka fontundan başlar; renk ve kalınlık "Otomatik" iken eski yazıdan ölçülür
    const [family, setFamily] = useState(ed.state.opts.text.family);
    const [color, setColor] = useState('auto');
    const [bold, setBold] = useState('auto');
    const [seen, setSeen] = useState(fix.text);
    // okuma bitince okunan yazı kutuya gelir (kullanıcı henüz yazmadıysa)
    if (fix.text !== seen) { setSeen(fix.text); if (!text) setText(fix.text || ''); }
    const apply = () => fixApplyText(ed, text, { family, color: color === 'auto' ? null : color, bold: bold === 'auto' ? null : bold === 'bold' });
    const chip = (on) => cx('h-7 px-2 rounded-md border text-[11.5px] font-medium', on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line hover:bg-surface-2');
    return (
        <div className="w-72 space-y-2">
            <div className="text-xs font-medium text-fg-2 px-0.5 flex items-center gap-1.5">
                {fix.reading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('Yazı okunuyor...')}</> : t('Doğru yazıyı girin')}
            </div>
            <textarea autoFocus rows={Math.min(5, Math.max(2, text.split('\n').length))} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); } if (e.key === 'Escape') clearFix(ed); }}
                placeholder={fix.reading ? '' : t('Buraya yazın')}
                className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[13px] resize-none focus:outline-none focus:border-accent" />
            <FontPicker value={family} onChange={setFamily} />
            <div className="flex flex-wrap items-center gap-1">
                <button type="button" className={chip(color === 'auto')} onClick={() => setColor('auto')} title={t('Eski yazının rengi')}>{t('Otomatik')}</button>
                {kit.colors.slice(0, 8).map((c) => (
                    <button key={c.hex} type="button" aria-label={c.hex} title={c.hex} onClick={() => setColor(c.hex)}
                        className={cx('w-6 h-6 rounded-full border border-black/15', color === c.hex && 'ring-2 ring-accent ring-offset-1 ring-offset-surface')} style={{ background: c.hex }} />
                ))}
            </div>
            <div className="flex items-center gap-1">
                <Bold className="w-3.5 h-3.5 text-fg-3 mr-0.5" />
                {[['auto', 'Otomatik'], ['normal', 'Normal'], ['bold', 'Kalın']].map(([v, l]) => (
                    <button key={v} type="button" className={chip(bold === v)} onClick={() => setBold(v)}>{t(l)}</button>
                ))}
            </div>
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
