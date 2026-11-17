// "Sosyal medyaya hazırla": bir ya da birkaç boyut seç. Tek boyut: belge o boyuta gelir ve dosya iner.
// Birden çok: her boyut ayrı hazırlanır (görselde kenarlar tamamlanır), hepsi tek ZIP'te iner, belge eski haline döner.
import { useEffect, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import JSZip from 'jszip';
import { useEditor } from '../../store/editor';
import { resizeCurrentPage, exportPng, withBusy, renderExportCanvas, encodeCanvas, baseName } from '../../store/actions';
import { PRESET_GROUPS, sizeToPage, sizeLabel } from '../../core/pageSize';
import { isMiganCached, loadMigan } from '../../core/inpaint/migan';
import { saveFile, isDesktop } from '../../platform';
import { Button, Dialog, Field, Segmented, cx } from '../../components/ui';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';

const SOCIAL = PRESET_GROUPS.find((g) => g.title === 'Sosyal medya').items;

export default function SocialExportDialog({ open, onClose }) {
    const ed = useEditor();
    const isImage = ed.state.doc?.kind === 'image';
    const [sel, setSel] = useState([]);
    const [format, setFormat] = useState('png');
    useEffect(() => { if (open) setSel([]); }, [open]);
    const toggle = (id) => setSel((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

    const sameSize = (s) => {
        const target = sizeToPage(s), page = ed.get().doc.pages[ed.get().page];
        return Math.abs(page.width - target.width) < 0.5 && Math.abs(page.height - target.height) < 0.5;
    };
    // görsel: kenarlar görselin devamıyla tamamlanır (model yoksa bir kez iner)
    const ensureModel = async () => {
        if (!isImage || (await isMiganCached())) return true;
        if (!window.confirm(`${t('Kenarları tamamlamak için yapay zekâ modeli indirilecek. Bir kez iner, sonra çevrimdışı çalışır.')} (~28 MB)`)) return false;
        return !!(await withBusy(ed, t('Model indiriliyor'), async (progress) => { await loadMigan((p) => progress(p, `${t('Model indiriliyor')} ${Math.round((p || 0) * 100)}%`)); return true; }));
    };
    const resizeTo = (s) => resizeCurrentPage(ed, { ...sizeToPage(s), fit: isImage ? 'extend' : true, background: ed.get().doc.background || '#ffffff' });

    const go = async () => {
        const items = SOCIAL.filter((s) => sel.includes(s.id));
        if (!items.length) return;
        if (items.some((s) => !sameSize(s)) && !(await ensureModel())) return;
        onClose();
        if (items.length === 1) {
            const s = items[0], same = sameSize(s);
            if (!same) await resizeTo(s);
            await exportPng(ed, { format });
            if (!same) toast(t('Yeni boyut belgede kaldı; eski boyuta dönmek için Ctrl+Z.'), 'info', 5000);
            return;
        }
        const zip = new JSZip(), name = baseName(ed.get().doc.name);
        for (const [i, s] of items.entries()) {
            const same = sameSize(s);
            if (!same) await resizeTo(s);
            const { blob, ext } = await withBusy(ed, `${t('Hazırlanıyor')} ${i + 1}/${items.length}`, async () => encodeCanvas(await renderExportCanvas(ed), format));
            zip.file(`${name}-${s.w}x${s.h}.${ext}`, blob);
            if (!same) ed.dispatch({ type: 'UNDO' }); // belge her boyuttan sonra eski haline döner
        }
        const out = await zip.generateAsync({ type: 'blob' });
        if (await saveFile(out, `${name}-sosyal-medya.zip`)) toast(`${items.length} ${t('boyut tek dosyada')} ${isDesktop ? t('kaydedildi') : t('indirildi')}`, 'success', 4000);
    };

    return (
        <Dialog open={open} onClose={onClose} width={580} title={t('Sosyal medyaya hazırla')}
            description={t('Nerede paylaşacaksınız? Bir ya da birkaç boyut seçin; görsel her boyuta getirilir, boş kenarlar tamamlanır.')}
            footer={<Button variant="primary" icon={Share2} disabled={!sel.length} onClick={go}>{sel.length > 1 ? `${sel.length} ${t('boyutu hazırla')}` : t('Hazırla ve indir')}</Button>}>
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SOCIAL.map((s) => {
                        const k = 44 / Math.max(s.w, s.h), on = sel.includes(s.id);
                        return (
                            <button key={s.id} type="button" onClick={() => toggle(s.id)} aria-pressed={on}
                                className={cx('relative flex items-center gap-3 text-left rounded-xl border p-3 transition-colors', on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2')}>
                                <span className="w-12 h-12 shrink-0 flex items-center justify-center">
                                    <span className={cx('border-2 rounded-[3px]', on ? 'border-accent' : 'border-fg-3 bg-surface-2')} style={{ width: s.w * k, height: s.h * k }} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[13px] font-semibold leading-snug">{t(s.name)}</span>
                                    <span className="block text-xs text-fg-2 tabular-nums mt-0.5">{sizeLabel(s)}</span>
                                </span>
                                {on && <Check className="absolute top-2 right-2 w-4 h-4 text-accent" />}
                            </button>
                        );
                    })}
                </div>
                <Field label={t('Dosya')}>
                    <Segmented value={format} onChange={setFormat} options={[{ value: 'png', label: t('PNG · en yüksek kalite') }, { value: 'jpg', label: t('JPG · küçük dosya (WhatsApp)') }]} />
                </Field>
            </div>
        </Dialog>
    );
}
