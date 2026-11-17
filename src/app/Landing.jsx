// Başlangıç ekranı: boyut seçip yeni tasarıma başlamak, dosya açmak, son açılanlara dönmek
import { useRef, useState } from 'react';
import { Upload, Combine, ScanLine, Moon, Sun, Languages, ShieldCheck, FileText, Image as ImageIcon, X, Ruler } from 'lucide-react';
import { useEditor } from '../store/editor';
import { openFile, createBlank } from '../store/actions';
import { isDesktop, pickFiles, pathToFile } from '../platform';
import { PRESET_GROUPS, sizeToPage, sizeLabel } from '../core/pageSize';
import { t, getLocale, setLocale } from '../i18n';
import { Button, IconButton, cx } from '../components/ui';
import { toast } from '../components/Toaster';
import { useTheme, setTheme } from './theme';
import { useRecent, removeRecent } from './recent';
import Logo from './Logo';
import MergeDialog from './dialogs/MergeDialog';
import ScanDialog from './dialogs/ScanDialog';
import NewDesignDialog from './dialogs/NewDesignDialog';

/** Boyut kutucuğu: gerçek en-boy oranında çerçeve, ad ve ölçü; tıklayınca o boyutta boş tasarım açılır */
function SizeTile({ s, onClick }) {
    const k = 56 / Math.max(s.w, s.h);
    return (
        <button type="button" onClick={onClick}
            className="group rounded-2xl border border-line bg-surface p-3 flex flex-col items-center gap-2 text-center transition-all hover:border-accent hover:-translate-y-0.5 hover:shadow-pop focus-visible:outline-2 focus-visible:outline-accent">
            <span className="h-16 flex items-center justify-center">
                <span className="rounded-[4px] border-2 border-fg-3 bg-surface-2 group-hover:border-accent group-hover:bg-accent-soft transition-colors"
                    style={{ width: Math.max(10, s.w * k), height: Math.max(10, s.h * k) }} />
            </span>
            <span className="text-[12.5px] font-semibold leading-snug">{t(s.name)}</span>
            <span className="text-[11px] text-fg-3 tabular-nums -mt-1.5">{sizeLabel(s)}</span>
        </button>
    );
}

export default function Landing() {
    const ed = useEditor();
    const inputRef = useRef(null);
    const [drag, setDrag] = useState(false);
    const [mergeOpen, setMergeOpen] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const [newOpen, setNewOpen] = useState(false);
    const recent = useRecent();
    const theme = useTheme();
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const onFiles = (files) => {
        const f = files?.[0];
        if (f) openFile(ed, f);
    };
    const pick = async () => {
        if (isDesktop) { onFiles(await pickFiles()); return; }
        inputRef.current?.click();
    };
    const create = (s) => {
        try { localStorage.setItem('paperwell.lastSize', JSON.stringify({ id: s.id, name: s.name, w: s.w, h: s.h, unit: s.unit })); } catch { /* yoksay */ }
        createBlank(ed, { ...sizeToPage(s), background: '#FFFFFF', label: t(s.name) });
    };
    const openRecent = async (r) => {
        try { openFile(ed, await pathToFile(r.path)); }
        catch { toast(`${r.name}: ${t('dosya bulunamadı, listeden kaldırıldı')}`, 'error', 4000); removeRecent(r.path); }
    };

    return (
        <div className="h-full overflow-y-auto scroll-thin bg-bg"
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}>
            <header className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <Logo className="w-8 h-8" />
                    <span className="font-semibold text-[15px] tracking-tight">Paperwell</span>
                </div>
                <div className="flex items-center gap-1">
                    <IconButton icon={Languages} label={getLocale() === 'tr' ? 'English' : 'Türkçe'} onClick={() => setLocale(getLocale() === 'tr' ? 'en' : 'tr')} />
                    <IconButton icon={dark ? Sun : Moon} label={t('Tema')} onClick={() => setTheme(dark ? 'light' : 'dark')} />
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 pt-4 pb-16 space-y-10">
                <section className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
                    <button type="button" onClick={pick}
                        className={cx('rounded-2xl border-2 border-dashed p-6 flex items-center gap-5 text-left transition-all bg-surface',
                            drag ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-accent hover:bg-surface-2')}>
                        <span className="w-14 h-14 rounded-2xl bg-accent text-white flex items-center justify-center shadow-pop shrink-0"><Upload className="w-6 h-6" /></span>
                        <span>
                            <span className="block text-lg font-semibold">{t('Görsel ya da PDF aç')}</span>
                            <span className="block text-[13px] text-fg-2 mt-1">{t('Tıklayın ya da dosyayı bu pencereye bırakın')} · PNG, JPG, WebP, PDF, .paperwell</span>
                        </span>
                    </button>
                    <div className="rounded-2xl border border-line bg-surface p-3 flex flex-col gap-1.5 justify-center">
                        <Button variant="ghost" icon={Combine} className="justify-start" onClick={() => setMergeOpen(true)}>{t('PDF birleştir')}</Button>
                        <Button variant="ghost" icon={ScanLine} className="justify-start" onClick={() => setScanOpen(true)}>{t('Belge tara')}</Button>
                    </div>
                    <input ref={inputRef} type="file" accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp,.paperwell" className="hidden"
                        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
                </section>

                {recent.length > 0 && (
                    <section>
                        <h2 className="text-sm font-semibold text-fg-2 mb-3">{t('Son açılanlar')}</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                            {recent.map((r) => (
                                <div key={r.path} className="group relative">
                                    <button type="button" onClick={() => openRecent(r)} title={r.path}
                                        className="w-full rounded-xl border border-line bg-surface overflow-hidden text-left hover:border-accent transition-colors">
                                        <span className="block aspect-square bg-surface-2 checker">
                                            {r.thumb ? <img src={r.thumb} alt="" className="w-full h-full object-contain" draggable={false} />
                                                : <span className="w-full h-full flex items-center justify-center text-fg-3">{r.kind === 'image' ? <ImageIcon className="w-6 h-6" /> : <FileText className="w-6 h-6" />}</span>}
                                        </span>
                                        <span className="block px-2 py-1.5 text-[12px] font-medium truncate">{r.name}</span>
                                    </button>
                                    <button type="button" aria-label={t('Listeden kaldır')} onClick={() => removeRecent(r.path)}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-surface/90 border border-line hidden group-hover:flex items-center justify-center text-fg-2 hover:text-danger"><X className="w-3 h-3" /></button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section>
                    <div className="flex items-end justify-between mb-3">
                        <div>
                            <h2 className="text-xl font-semibold tracking-tight">{t('Yeni tasarım')}</h2>
                            <p className="text-[13px] text-fg-2 mt-0.5">{t('Bir boyut seçin, boş sayfa hemen açılır.')}</p>
                        </div>
                        <Button icon={Ruler} onClick={() => setNewOpen(true)}>{t('Özel boyut…')}</Button>
                    </div>
                    {PRESET_GROUPS.map((g) => (
                        <div key={g.title} className="mb-4">
                            <h3 className="text-xs font-semibold text-fg-3 uppercase tracking-wide mb-2">{t(g.title)}</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                {g.items.map((s) => <SizeTile key={s.id} s={s} onClick={() => create(s)} />)}
                            </div>
                        </div>
                    ))}
                </section>

                <p className="text-center text-[13px] text-fg-3 flex items-center justify-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    {t('Dosyalarınız bilgisayarınızdan çıkmaz · Ücretsiz · Hesap gerektirmez')}
                </p>
            </main>
            <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} standalone />
            <ScanDialog open={scanOpen} onClose={() => setScanOpen(false)} />
            <NewDesignDialog open={newOpen} onClose={() => setNewOpen(false)} />
            {drag && <div className="fixed inset-0 pointer-events-none border-4 border-dashed border-accent rounded-xl bg-accent/5" />}
        </div>
    );
}
