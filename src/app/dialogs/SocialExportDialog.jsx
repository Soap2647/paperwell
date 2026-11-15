// "Sosyal medyaya hazırla": tek tıkla boyuta getir (görselde kenarlar tamamlanır) ve tam piksel PNG indir
import { useEditor } from '../../store/editor';
import { resizeCurrentPage, exportPng, withBusy } from '../../store/actions';
import { PRESET_GROUPS, sizeToPage, sizeLabel } from '../../core/pageSize';
import { isMiganCached, loadMigan } from '../../core/inpaint/migan';
import { Dialog, cx } from '../../components/ui';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';

const SOCIAL = PRESET_GROUPS.find((g) => g.title === 'Sosyal medya').items;

export default function SocialExportDialog({ open, onClose }) {
    const ed = useEditor();
    const isImage = ed.state.doc?.kind === 'image';

    const go = async (s) => {
        onClose();
        const target = sizeToPage(s);
        const page = ed.get().doc.pages[ed.get().page];
        const same = Math.abs(page.width - target.width) < 0.5 && Math.abs(page.height - target.height) < 0.5;
        if (!same) {
            // görsel: kenarlar görselin devamıyla tamamlanır (model yoksa bir kez iner); tasarım: içerik sığdırılır
            if (isImage && !(await isMiganCached())) {
                if (!window.confirm(`${t('Kenarları tamamlamak için yapay zekâ modeli indirilecek. Bir kez iner, sonra çevrimdışı çalışır.')} (~28 MB)`)) return;
                if (!(await withBusy(ed, t('Model indiriliyor'), async (progress) => { await loadMigan((p) => progress(p, `${t('Model indiriliyor')} ${Math.round((p || 0) * 100)}%`)); return true; }))) return;
            }
            await resizeCurrentPage(ed, { ...target, fit: isImage ? 'extend' : true, background: ed.get().doc.background || '#ffffff' });
        }
        await exportPng(ed);
        if (!same) toast(t('Yeni boyut belgede kaldı; eski boyuta dönmek için Ctrl+Z.'), 'info', 5000);
    };

    return (
        <Dialog open={open} onClose={onClose} width={560} title={t('Sosyal medyaya hazırla')}
            description={t('Nerede paylaşacaksınız? Tıklayın: görsel o boyuta getirilir ve PNG olarak iner.')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SOCIAL.map((s) => {
                    const k = 44 / Math.max(s.w, s.h);
                    return (
                        <button key={s.id} type="button" onClick={() => go(s)}
                            className={cx('flex items-center gap-3 text-left rounded-xl border border-line bg-surface p-3 transition-colors hover:bg-surface-2 hover:border-accent')}>
                            <span className="w-12 h-12 shrink-0 flex items-center justify-center">
                                <span className="border-2 border-fg-3 bg-surface-2 rounded-[3px]" style={{ width: s.w * k, height: s.h * k }} />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-[13px] font-semibold leading-snug">{t(s.name)}</span>
                                <span className="block text-xs text-fg-2 tabular-nums mt-0.5">{sizeLabel(s)}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </Dialog>
    );
}
