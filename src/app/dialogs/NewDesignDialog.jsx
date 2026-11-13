// "Yeni tasarım" (boş belge, hazır boyutlar) ve "Boyutu değiştir" (açık belgenin geçerli sayfası) diyaloğu
import { useEffect, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { createBlank, resizeCurrentPage } from '../../store/actions';
import { PRESET_GROUPS, sizeLabel, sizeToPage, validSize, toPt, fromPt } from '../../core/pageSize';
import { Button, Dialog, Field, Segmented, cx } from '../../components/ui';
import { t } from '../../i18n';

const LAST_KEY = 'paperwell.lastSize';
const loadLast = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY)) || null; } catch { return null; } };
const saveLast = (s) => { try { localStorage.setItem(LAST_KEY, JSON.stringify(s)); } catch { /* yoksay */ } };

const BACKGROUNDS = [
    { c: '#FFFFFF', n: 'Beyaz' },
    { c: '#000000', n: 'Siyah' },
    { c: '#4285F4', n: 'Mavi' },
    { c: '#FBBC04', n: 'Sarı' },
];

/** Gerçek en-boy oranında küçük çerçeve + ad + ölçü + ipucu. Tıklayınca seçilir */
function SizeCard({ s, active, onClick }) {
    const k = 52 / Math.max(s.w, s.h);
    return (
        <button
            type="button"
            onClick={onClick}
            className={cx(
                'flex items-center gap-3 text-left rounded-xl border p-3 transition-colors hover:bg-surface-2 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent',
                active ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
            )}
        >
            <span className="w-14 h-14 shrink-0 flex items-center justify-center">
                <span className={cx('border-2 rounded-[3px]', active ? 'border-accent bg-surface' : 'border-fg-3 bg-surface-2')} style={{ width: Math.max(8, s.w * k), height: Math.max(8, s.h * k) }} />
            </span>
            <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-snug">{t(s.name)}</span>
                <span className="block text-xs text-fg-2 tabular-nums mt-0.5">{sizeLabel(s)}</span>
                {s.hint && <span className="block text-xs text-fg-3 mt-0.5 leading-snug">{t(s.hint)}</span>}
            </span>
        </button>
    );
}

export default function NewDesignDialog({ open, onClose, mode = 'new' }) {
    const ed = useEditor();
    const resize = mode === 'resize';
    const [last, setLast] = useState(null);
    const [bg, setBg] = useState('#FFFFFF');
    const [fit, setFit] = useState(true);
    const [c, setC] = useState({ w: '1080', h: '1080', unit: 'px' });

    useEffect(() => {
        if (!open) return;
        setLast(loadLast());
        setBg('#FFFFFF');
        setFit(true);
    }, [open]);

    const go = async (s) => {
        saveLast({ id: s.id, name: s.name, w: s.w, h: s.h, unit: s.unit });
        onClose();
        const page = sizeToPage(s);
        if (resize) await resizeCurrentPage(ed, { ...page, fit, background: bg });
        else await createBlank(ed, { ...page, background: bg, label: s.id === 'custom' ? t('Yeni tasarım') : t(s.name) });
    };

    const num = { w: parseFloat(String(c.w).replace(',', '.')), h: parseFloat(String(c.h).replace(',', '.')) };
    const custom = { id: 'custom', name: 'Özel boyut', w: num.w, h: num.h, unit: c.unit };
    const customOk = validSize(custom);
    const setUnit = (unit) => {
        // aynı fiziksel boyutu yeni birimde göster
        const conv = (v) => (Number.isFinite(v) ? String(unit === 'px' ? Math.round(fromPt(toPt(v, c.unit), unit)) : Math.round(fromPt(toPt(v, c.unit), unit) * 10) / 10) : '');
        setC({ unit, w: conv(num.w), h: conv(num.h) });
    };
    const submitCustom = (e) => { e.preventDefault(); if (customOk) go(custom); };

    const isLast = (s) => last?.id === s.id;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            width={780}
            title={resize ? t('Boyutu değiştir') : t('Yeni tasarım')}
            description={resize ? t('Geçerli sayfanın boyutunu seçin. Bir boyuta tıklamanız yeterli; geri almak için Ctrl+Z.') : t('Ne için tasarlıyorsunuz? Bir boyuta tıklayın, boş sayfa hemen açılır.')}
        >
            <div className="space-y-5">
                {resize && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">
                        {[
                            { v: true, title: 'İçeriği yeni boyuta sığdır (önerilen)', desc: 'Her şey orantılı küçülür ya da büyür ve ortalanır' },
                            { v: false, title: 'Sadece sayfayı değiştir (içerik yerinde kalsın)', desc: 'İçerik aynı boyutta kalır, sayfanın ortasına gelir' },
                        ].map((o) => (
                            <button key={String(o.v)} type="button" role="radio" aria-checked={fit === o.v} onClick={() => setFit(o.v)}
                                className={cx('text-left rounded-xl border p-3 transition-colors', fit === o.v ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}>
                                <span className="block text-[13px] font-semibold">{t(o.title)}</span>
                                <span className="block text-xs text-fg-2 mt-0.5">{t(o.desc)}</span>
                            </button>
                        ))}
                    </div>
                )}

                <Field label={resize ? t('Boş kalan yerlerin rengi') : t('Sayfa rengi')}>
                    <div className="flex flex-wrap items-center gap-2">
                        {BACKGROUNDS.map((b) => (
                            <button key={b.c} type="button" onClick={() => setBg(b.c)} aria-pressed={bg === b.c}
                                className={cx('h-8 pl-1.5 pr-3 rounded-full border inline-flex items-center gap-2 text-xs font-medium', bg === b.c ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}>
                                <span className="w-5 h-5 rounded-full border border-black/15" style={{ background: b.c }} />
                                {t(b.n)}
                            </button>
                        ))}
                        <label className={cx('h-8 pl-1.5 pr-3 rounded-full border inline-flex items-center gap-2 text-xs font-medium cursor-pointer', !BACKGROUNDS.some((b) => b.c === bg) ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}>
                            <span className="w-5 h-5 rounded-full border border-black/15 overflow-hidden relative" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                                <input type="color" value={bg.toLowerCase()} onChange={(e) => setBg(e.target.value.toUpperCase())} className="absolute inset-0 opacity-0 cursor-pointer" />
                            </span>
                            {t('Başka renk')}
                        </label>
                    </div>
                </Field>

                {last && (
                    <section>
                        <h3 className="text-xs font-semibold text-fg-2 mb-2">{t('Son kullanılan')}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <SizeCard s={last} active onClick={() => go(last)} />
                        </div>
                    </section>
                )}

                {PRESET_GROUPS.map((g) => (
                    <section key={g.title}>
                        <h3 className="text-xs font-semibold text-fg-2 mb-2">{t(g.title)}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {g.items.map((s) => <SizeCard key={s.id} s={s} active={isLast(s)} onClick={() => go(s)} />)}
                        </div>
                    </section>
                ))}

                <section>
                    <h3 className="text-xs font-semibold text-fg-2 mb-2">{t('Özel boyut')}</h3>
                    <form onSubmit={submitCustom} className="rounded-xl border border-line p-3 flex flex-wrap items-end gap-3">
                        <Field label={t('Genişlik')}><input type="number" inputMode="decimal" min="0" step="any" className="field w-28" value={c.w} onChange={(e) => setC({ ...c, w: e.target.value })} /></Field>
                        <Button type="button" icon={ArrowLeftRight} onClick={() => setC({ ...c, w: c.h, h: c.w })}>{t('Yönü çevir')}</Button>
                        <Field label={t('Yükseklik')}><input type="number" inputMode="decimal" min="0" step="any" className="field w-28" value={c.h} onChange={(e) => setC({ ...c, h: e.target.value })} /></Field>
                        <Segmented className="w-40" value={c.unit} onChange={setUnit} options={[{ value: 'px', label: 'px' }, { value: 'mm', label: 'mm' }, { value: 'cm', label: 'cm' }]} />
                        <Button type="submit" variant="primary" disabled={!customOk} className="ml-auto">{resize ? t('Uygula') : t('Oluştur')}</Button>
                        {!customOk && <p className="basis-full text-xs text-fg-3">{t('Geçerli bir genişlik ve yükseklik yazın (en az yaklaşık 5 mm).')}</p>}
                    </form>
                </section>
            </div>
        </Dialog>
    );
}
