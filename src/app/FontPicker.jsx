// Aranabilir, bölümlü font seçici (+ kendi fontunu ekle)
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, Trash2, Upload } from 'lucide-react';
import { FONT_FAMILIES, registerCssFonts } from '../core/fonts';
import { FONT_ACCEPT, addFontFile, removeCustomFont, useFonts } from '../core/fontStore';
import { filterFonts, groupFonts, pushRecent } from '../core/fontSearch';
import { toast } from '../components/Toaster';
import { cx } from '../components/ui';
import { t } from '../i18n';

const BRAND_KEYS = ['googlesans', 'googlesanscode'];
const RECENT_KEY = 'paperwell.fontRecents';

const loadRecents = () => {
    try { const r = JSON.parse(localStorage.getItem(RECENT_KEY)); return Array.isArray(r) ? r.filter((k) => typeof k === 'string') : []; } catch { return []; }
};
const saveRecents = (r) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch { /* depolama kapalı */ } };

function Highlight({ text, range }) {
    if (!range) return text;
    return <>{text.slice(0, range[0])}<mark className="bg-accent-soft text-accent-text rounded-sm">{text.slice(range[0], range[1])}</mark>{text.slice(range[1])}</>;
}

export default function FontPicker({ value, onChange, originalLabel }) {
    const version = useFonts();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [hi, setHi] = useState(0);
    const [pos, setPos] = useState(null);
    const [recents, setRecents] = useState([]);
    const btnRef = useRef(null), panelRef = useRef(null), inputRef = useRef(null), listRef = useRef(null), fileRef = useRef(null);
    const byKeyboard = useRef(false);

    const { sections, flat } = useMemo(() => {
        const entries = Object.entries(FONT_FAMILIES).map(([key, f]) => ({ key, label: f.label, kind: f.kind }));
        const orig = originalLabel ? { key: 'original', label: `${t('Orijinal font')} (${originalLabel})` } : null;
        let secs;
        if (q.trim()) secs = [{ id: 'results', items: filterFonts(orig ? [orig, ...entries] : entries, q) }];
        else {
            secs = groupFonts(entries, BRAND_KEYS, recents).map((s) => ({ ...s, title: t(s.title) }));
            if (orig) secs.unshift({ id: 'orig', items: [{ ...orig, range: null }] });
        }
        secs = secs.filter((s) => s.items.length);
        let i = 0;
        const withIdx = secs.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it, i: i++, sid: s.id })) }));
        return { sections: withIdx, flat: withIdx.flatMap((s) => s.items) };
    // version: font eklenince/silinince liste yenilensin
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, originalLabel, recents, version]);

    const current = value === 'original' && originalLabel ? `${t('Orijinal font')} (${originalLabel})` : (FONT_FAMILIES[value] || FONT_FAMILIES.sans).label;
    const currentCss = value === 'original' ? undefined : (FONT_FAMILIES[value] || FONT_FAMILIES.sans).css;

    const close = (refocus) => { setOpen(false); if (refocus) btnRef.current?.focus(); };
    const openPicker = () => {
        registerCssFonts(); // örnekler boş görünmesin (yüklemeyi tarayıcı satır göründükçe tembel yapar)
        setQ('');
        setRecents(loadRecents());
        setHi(0);
        setOpen(true);
    };
    const pick = (key) => {
        const r = pushRecent(loadRecents(), key);
        if (key !== 'original') saveRecents(r);
        close(true);
        onChange(key);
    };

    // Açılışta mevcut fontu vurgula
    useEffect(() => {
        if (!open || q) return;
        const idx = flat.findIndex((f) => f.key === value && f.sid !== 'recent');
        if (idx >= 0) { byKeyboard.current = true; setHi(idx); }
    // yalnız açılışta
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Konum: butonun altında, yer yoksa üstünde
    useLayoutEffect(() => {
        if (!open || !btnRef.current) return;
        const r = btnRef.current.getBoundingClientRect();
        const width = Math.max(r.width, 300);
        const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
        const below = window.innerHeight - r.bottom - 14, above = r.top - 14;
        const up = below < 340 && above > below;
        setPos({ left, width, ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }), maxHeight: Math.min(500, up ? above : below) });
    }, [open]);

    useEffect(() => { if (open && pos) inputRef.current?.focus(); }, [open, pos]);

    // Dışarı tıklama / Esc / kaydırma-yeniden boyutlandırma
    useEffect(() => {
        if (!open) return;
        const down = (e) => { if (!panelRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false); };
        const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } };
        const scroll = (e) => { if (!panelRef.current?.contains(e.target)) setOpen(false); };
        window.addEventListener('pointerdown', down);
        window.addEventListener('keydown', esc);
        window.addEventListener('scroll', scroll, true);
        const resize = () => setOpen(false);
        window.addEventListener('resize', resize);
        return () => {
            window.removeEventListener('pointerdown', down);
            window.removeEventListener('keydown', esc);
            window.removeEventListener('scroll', scroll, true);
            window.removeEventListener('resize', resize);
        };
    }, [open]);

    // Klavyeyle gezerken vurgulanan satır görünür kalsın
    useEffect(() => {
        if (!open || !byKeyboard.current) return;
        byKeyboard.current = false;
        listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [hi, open, flat.length]);

    const active = flat.length ? Math.min(hi, flat.length - 1) : -1;
    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!flat.length) return;
            byKeyboard.current = true;
            setHi((active + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (active >= 0) pick(flat[active].key);
        } else if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation(); close(true);
        }
    };

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const r = await addFontFile(file);
            toast(`${r.label} ${r.persisted ? t('eklendi; her açılışta hazır olacak') : t('eklendi; bu oturumda kullanılabilir')}`, 'success');
            pick(r.key);
        } catch (err) {
            toast(t(err.message || 'Font eklenemedi'), 'error', 5000);
        }
    };
    const remove = (e, key, label) => {
        e.stopPropagation();
        if (!window.confirm(`"${label}" ${t('fontu silinsin mi? Bu fontu kullanan yazılar varsayılan fonta döner.')}`)) return;
        removeCustomFont(key);
    };

    return (
        <>
            <button ref={btnRef} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? close(false) : openPicker())}
                className="field flex items-center gap-2 text-left w-full">
                <span className="flex-1 truncate" style={{ fontFamily: currentCss }}>{current}</span>
                <ChevronDown className="w-4 h-4 shrink-0 text-fg-3" />
            </button>
            {open && pos && createPortal(
                <div ref={panelRef} className="fixed z-[160] flex flex-col rounded-xl border border-line bg-surface shadow-float overflow-hidden" style={pos}>
                    <div className="relative p-2 border-b border-line shrink-0">
                        <Search className="w-4 h-4 text-fg-3 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input ref={inputRef} className="field pl-8" placeholder={t('Font ara…')} value={q} role="combobox" aria-expanded="true" aria-autocomplete="list"
                            onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={onKeyDown} spellCheck={false} autoComplete="off" />
                    </div>
                    <div ref={listRef} role="listbox" className="overflow-y-auto min-h-[120px] flex-1 py-1">
                        {!flat.length && <p className="px-4 py-6 text-center text-[13px] text-fg-3">{t('Eşleşen font yok. Aşağıdan kendi fontunuzu ekleyebilirsiniz.')}</p>}
                        {sections.map((s) => (
                            <div key={s.id}>
                                {s.title && <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">{s.title}</div>}
                                {s.items.map((it) => {
                                    const f = FONT_FAMILIES[it.key];
                                    return (
                                        <div key={it.key} role="option" aria-selected={it.key === value} data-i={it.i}
                                            onMouseMove={() => it.i !== active && setHi(it.i)} onClick={() => pick(it.key)}
                                            className={cx('flex items-center gap-2 pl-3 pr-2 h-9 cursor-pointer', it.i === active && 'bg-surface-3')}>
                                            <span className="flex-1 truncate text-base leading-none" style={{ fontFamily: f?.css }}><Highlight text={it.label} range={it.range} /></span>
                                            {f?.kind === 'custom' && (
                                                <button type="button" title={t('Fontu sil')} onClick={(e) => remove(e, it.key, it.label)} className="w-6 h-6 rounded-md flex items-center justify-center text-fg-3 hover:text-danger hover:bg-surface-2">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {it.key === value && <Check className="w-4 h-4 text-accent shrink-0" />}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                    <div className="p-2 border-t border-line shrink-0 space-y-1.5">
                        <button type="button" onClick={() => fileRef.current?.click()}
                            className="w-full h-9 rounded-lg border border-line hover:bg-surface-3 text-[13px] font-medium inline-flex items-center justify-center gap-2">
                            <Upload className="w-4 h-4" />{t('Kendi fontunu ekle')}
                        </button>
                        <p className="text-[11px] leading-snug text-fg-3">{t('Marka fontunuz listede yoksa .ttf / .otf dosyasını ekleyin; bir kez eklemek yeter.')}</p>
                        <input ref={fileRef} type="file" accept={FONT_ACCEPT} className="hidden" onChange={onFile} />
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
