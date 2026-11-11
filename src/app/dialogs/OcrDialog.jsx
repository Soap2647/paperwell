import { useState } from 'react';
import { ScanSearch, PencilLine } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { commitBytes, withBusy } from '../../store/actions';
import { ocrPages } from '../../core/ocr';
import { Button, Dialog, Field, Segmented, Toggle, cx } from '../../components/ui';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';


function Card({ value, icon: Icon, title, desc, mode, setMode }) {
    return (
        <button type="button" onClick={() => setMode(value)}
            className={cx('text-left rounded-xl border p-3.5 flex gap-3 transition-colors', mode === value ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong')}>
            <Icon className={cx('w-5 h-5 shrink-0 mt-0.5', mode === value ? 'text-accent-text' : 'text-fg-3')} />
            <span>
                <span className="block text-[13px] font-semibold">{title}</span>
                <span className="block text-xs text-fg-2 mt-1 leading-relaxed">{desc}</span>
            </span>
        </button>
    )
}

export default function OcrDialog({ open, onClose }) {
    const ed = useEditor();
    const [mode, setMode] = useState('searchable');
    const [which, setWhich] = useState('all');
    const [eng, setEng] = useState(true);

    const run = async () => {
        onClose();
        await withBusy(ed, t('Metin tanınıyor...'), async (progress) => {
            const s = ed.get();
            const pages = which === 'current' ? [s.page] : s.doc.pages.map((_, i) => i);
            const res = await ocrPages(s.doc.bytes, pages, {
                mode,
                langs: eng ? ['tur', 'eng'] : ['tur'],
                onProgress: (p, stage, pageIndex) => progress(p, stage === 'load'
                    ? t('OCR motoru hazırlanıyor...')
                    : `${t('Metin tanınıyor...')} ${t('Sayfa')} ${pageIndex + 1} · ${Math.round(p * 100)}%`),
            });
            if (!res.lines) { toast(t('Sayfada tanınacak metin bulunamadı'), 'info'); return; }
            await commitBytes(ed, res.bytes);
            toast(`${res.lines} ${t('satır tanındı')}`, 'success');
            if (mode === 'editable') ed.dispatch({ type: 'SET_TOOL', tool: 'edit' });
        });
    };

    return (
        <Dialog open={open} onClose={onClose} title={t('Metin tanıma (OCR)')} description={t('Taranmış sayfalardaki yazıyı tanır. Tamamen cihazınızda çalışır.')}
            footer={<><Button onClick={onClose}>{t('İptal')}</Button><Button variant="primary" onClick={run}>{t('Başlat')}</Button></>}>
            <div className="space-y-4">
                <div className="grid gap-2">
                    <Card mode={mode} setMode={setMode} value="searchable" icon={ScanSearch} title={t('Aranabilir yap')} desc={t('Görünüm değişmez; metin seçilebilir, aranabilir ve kopyalanabilir olur.')} />
                    <Card mode={mode} setMode={setMode} value="editable" icon={PencilLine} title={t('Düzenlenebilir yap')} desc={t('Taranmış yazı silinir, yerine gerçek metin yazılır; sonra Düzenle aracıyla değiştirebilirsiniz. Deneysel.')} />
                </div>
                <Field label={t('Hangi sayfalar')}>
                    <Segmented value={which} onChange={setWhich} options={[{ value: 'all', label: t('Tüm sayfalar') }, { value: 'current', label: t('Geçerli sayfa') }]} />
                </Field>
                <Toggle checked={eng} onChange={setEng} label={t('Türkçe + İngilizce (karışık belgeler için)')} />
            </div>
        </Dialog>
    );
}
