import { useRef, useState } from 'react';
import { Upload, Type, Sparkles, ShieldCheck, PenLine, LayoutGrid, FileOutput, FilePlus2, Combine, ScanLine, Moon, Sun, Languages, Github } from 'lucide-react';
import { useEditor } from '../store/editor';
import { openFile } from '../store/actions';
import { isDesktop, pickFiles } from '../platform';
import { t, getLocale, setLocale } from '../i18n';
import { Button, IconButton, cx } from '../components/ui';
import { useTheme, setTheme } from './theme';
import Logo from './Logo';
import MergeDialog from './dialogs/MergeDialog';
import ScanDialog from './dialogs/ScanDialog';
import NewDesignDialog from './dialogs/NewDesignDialog';

const FEATURES = [
    { icon: Type, title: 'Metni yerinde düzenle', desc: 'Orijinal font korunur', tone: 'text-indigo-500 bg-indigo-500/10' },
    { icon: Sparkles, title: 'Akıllı silgi', desc: 'Yapay zekâ ile nesne silme', tone: 'text-fuchsia-500 bg-fuchsia-500/10' },
    { icon: ShieldCheck, title: 'Gerçek karartma', desc: 'Metin içerikten silinir', tone: 'text-emerald-500 bg-emerald-500/10' },
    { icon: PenLine, title: 'İmzala ve doldur', desc: 'Çiz, yaz veya yükle', tone: 'text-amber-500 bg-amber-500/10' },
    { icon: LayoutGrid, title: 'Sayfa düzeni', desc: 'Sırala, döndür, sil, ekle', tone: 'text-sky-500 bg-sky-500/10' },
    { icon: FileOutput, title: 'Dönüştür', desc: 'PNG, JPG, Word', tone: 'text-rose-500 bg-rose-500/10' },
];

export default function Landing() {
    const ed = useEditor();
    const inputRef = useRef(null);
    const [drag, setDrag] = useState(false);
    const [mergeOpen, setMergeOpen] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const [newOpen, setNewOpen] = useState(false);
    const theme = useTheme();
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const onFiles = (files) => {
        const f = files?.[0];
        if (f) openFile(ed, f);
    };

    return (
        <div className="h-full overflow-y-auto scroll-thin bg-bg">
            <header className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <Logo className="w-8 h-8" />
                    <span className="font-semibold text-[15px] tracking-tight">Paperwell</span>
                </div>
                <div className="flex items-center gap-1">
                    <IconButton icon={Languages} label={getLocale() === 'tr' ? 'English' : 'Türkçe'} onClick={() => setLocale(getLocale() === 'tr' ? 'en' : 'tr')} />
                    <IconButton icon={dark ? Sun : Moon} label={t('Tema')} onClick={() => setTheme(dark ? 'light' : 'dark')} />
                    <a href="https://github.com/" target="_blank" rel="noreferrer" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-fg-2 hover:bg-surface-3 hover:text-fg" aria-label="GitHub">
                        <Github className="w-[18px] h-[18px]" />
                    </a>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 pt-10 pb-20">
                <section className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1]">
                        {t('PDF ve görselleriniz için özgür editör')}
                    </h1>
                    <p className="mt-5 text-[15px] sm:text-base text-fg-2 leading-relaxed">
                        {t('Metni orijinal fontuyla düzenleyin, akıllı silgiyle istemediğiniz şeyleri yok edin, imzalayın, işaretleyin. Hepsi tarayıcınızda; dosyalarınız cihazınızdan hiç çıkmaz.')}
                    </p>
                </section>

                <section className="mt-10 max-w-3xl mx-auto">
                    <button
                        type="button"
                        onClick={async () => {
                            if (isDesktop) { const files = await pickFiles(); onFiles(files); return; }
                            inputRef.current?.click();
                        }}
                        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                        onDragLeave={() => setDrag(false)}
                        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
                        className={cx(
                            'w-full rounded-2xl border-2 border-dashed px-6 py-14 flex flex-col items-center gap-4 transition-all bg-surface',
                            drag ? 'border-accent bg-accent-soft scale-[1.01]' : 'border-line-strong hover:border-accent hover:bg-surface-2',
                        )}
                    >
                        <span className="w-14 h-14 rounded-2xl bg-accent text-white flex items-center justify-center shadow-pop">
                            <Upload className="w-6 h-6" />
                        </span>
                        <span className="text-lg font-semibold">{t('PDF veya görsel bırakın')}</span>
                        <span className="text-[13px] text-fg-2">{t('ya da dosya seçmek için tıklayın')} · {t('PDF, PNG, JPG, WebP')}</span>
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp"
                        className="hidden"
                        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
                    />
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <Button variant="ghost" icon={FilePlus2} onClick={() => setNewOpen(true)}>{t('Yeni tasarım oluştur')}</Button>
                        <Button variant="ghost" icon={Combine} onClick={() => setMergeOpen(true)}>{t('PDF birleştir')}</Button>
                        <Button variant="ghost" icon={ScanLine} onClick={() => setScanOpen(true)}>{t('Belge tara')}</Button>
                    </div>
                </section>

                <section className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {FEATURES.map((f) => (
                        <div key={f.title} className="rounded-xl border border-line bg-surface p-4 flex items-start gap-3.5">
                            <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', f.tone)}>
                                <f.icon className="w-5 h-5" />
                            </span>
                            <div>
                                <div className="font-medium text-[14px]">{t(f.title)}</div>
                                <div className="text-[13px] text-fg-2 mt-0.5">{t(f.desc)}</div>
                            </div>
                        </div>
                    ))}
                </section>

                <p className="mt-12 text-center text-[13px] text-fg-3 flex items-center justify-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    {t('Açık kaynak · Ücretsiz · Reklamsız · Hesap gerektirmez')}
                </p>
            </main>
            <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} standalone />
            <ScanDialog open={scanOpen} onClose={() => setScanOpen(false)} />
            <NewDesignDialog open={newOpen} onClose={() => setNewOpen(false)} />
        </div>
    );
}
