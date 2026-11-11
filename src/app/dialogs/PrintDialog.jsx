// Yazdır: yerleşim (normal / N-up / kitapçık), kâğıt, sayfa aralığı, elle çift taraf, hedef (Inkwell / sistem / PDF)
import { useEffect, useState } from 'react';
import { Printer, FileDown, Repeat, BookOpen, LayoutGrid, File } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { buildOutputPdf, withBusy, baseName } from '../../store/actions';
import { nUp, booklet, fitToPaper, splitForManualDuplex } from '../../core/imposition';
import { parseRanges } from '../../core/docTools';
import { isDesktop, inkwellAvailable, openInInkwell, saveFile } from '../../platform';
import { Button, Dialog, Field, Segmented, Toggle } from '../../components/ui';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';

/** PDF'i gizli bir çerçevede açıp tarayıcının yazdırma penceresini gösterir */
function systemPrint(bytes) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
        frame.src = url;
        frame.onload = () => {
            setTimeout(() => {
                try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { window.open(url, '_blank'); }
                resolve();
            }, 300);
            setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 120000);
        };
        document.body.appendChild(frame);
    });
}

export default function PrintDialog({ open, onClose }) {
    const ed = useEditor();
    const n = ed.state.doc?.pages.length || 1;
    const [layout, setLayout] = useState('normal');
    const [paper, setPaper] = useState('a4');
    const [which, setWhich] = useState('all');
    const [range, setRange] = useState(`1-${n}`);
    const [manualDuplex, setManualDuplex] = useState(false);
    const [hasInkwell, setHasInkwell] = useState(false);
    const [phase, setPhase] = useState(null); // { back: Uint8Array, dest }
    const [error, setError] = useState(null);

    useEffect(() => { if (open) inkwellAvailable().then(setHasInkwell); }, [open]);
    useEffect(() => { if (!open) { setPhase(null); setError(null); } }, [open]);

    const prepare = async () => {
        const s = ed.get();
        const full = await buildOutputPdf(ed);
        let idx;
        if (which === 'current') idx = [s.page];
        else if (which === 'range') idx = parseRanges(range, n).flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a - 1 + k));
        else idx = s.doc.pages.map((_, i) => i);
        if (layout === 'booklet') return booklet(full, idx, { paper });
        if (layout === '2up') return nUp(full, idx, { n: 2, paper });
        if (layout === '4up') return nUp(full, idx, { n: 4, paper });
        return paper === 'original' ? full : fitToPaper(full, idx, { paper });
    };

    const send = async (bytes, dest, label) => {
        const name = `${baseName(ed.get().doc.name)}${label || ''}.pdf`;
        if (dest === 'inkwell') {
            await openInInkwell(bytes, name);
            toast(t('Inkwell\'e gönderildi'), 'success');
        } else if (dest === 'pdf') {
            await saveFile(bytes, name);
        } else {
            await systemPrint(bytes);
        }
    };

    const run = async (dest) => {
        setError(null);
        try { if (which === 'range') parseRanges(range, n); } catch (e) { setError(e.message); return; }
        await withBusy(ed, t('Yazdırmaya hazırlanıyor...'), async () => {
            const bytes = await prepare();
            // Kitapçık zaten ön/arka sıralı üretilir; elle çift tarafta ön ve arka ayrı basılır
            if (manualDuplex && dest !== 'pdf') {
                const { front, back } = await splitForManualDuplex(bytes);
                await send(front, dest, '-on');
                if (back) setPhase({ back, dest });
            } else {
                await send(bytes, dest);
                if (dest !== 'pdf') onClose();
            }
        });
    };

    const printBack = async () => {
        const p = phase;
        setPhase(null);
        await withBusy(ed, t('Yazdırmaya hazırlanıyor...'), () => send(p.back, p.dest, '-arka'));
        onClose();
    };

    if (phase) {
        return (
            <Dialog open={open} onClose={onClose} title={t('Kâğıtları çevirin')} width={460}
                footer={<><Button onClick={onClose}>{t('Kapat')}</Button><Button variant="primary" icon={Printer} onClick={printBack}>{t('Arka yüzleri yazdır')}</Button></>}>
                <div className="flex gap-4 items-start">
                    <Repeat className="w-10 h-10 text-accent shrink-0" />
                    <ol className="text-[13px] text-fg-2 space-y-2 list-decimal pl-4 leading-relaxed">
                        <li>{t('Ön yüzlerin basılmasını bekleyin.')}</li>
                        <li>{t('Basılan desteyi sırasını bozmadan alın, yazılı yüzü aşağı gelecek şekilde ve üst kenarı yazıcıya girecek biçimde kâğıt tepsisine geri koyun.')}</li>
                        <li>{t('Hazır olunca aşağıdaki düğmeye basın.')}</li>
                    </ol>
                </div>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onClose={onClose} title={t('Yazdır')} width={540}
            footer={
                <>
                    <Button icon={FileDown} onClick={() => run('pdf')}>{t('PDF olarak kaydet')}</Button>
                    {isDesktop && hasInkwell && <Button icon={Printer} onClick={() => run('inkwell')}>{t('Inkwell ile yazdır')}</Button>}
                    <Button variant="primary" icon={Printer} onClick={() => run('system')}>{t('Yazdır')}</Button>
                </>
            }>
            <div className="space-y-4">
                <Field label={t('Yerleşim')}>
                    <Segmented value={layout} onChange={setLayout} options={[
                        { value: 'normal', icon: File, label: t('Normal') },
                        { value: '2up', icon: LayoutGrid, label: t('2 sayfa') },
                        { value: '4up', icon: LayoutGrid, label: t('4 sayfa') },
                        { value: 'booklet', icon: BookOpen, label: t('Kitapçık') },
                    ]} />
                </Field>
                {layout === 'booklet' && <p className="text-xs text-fg-3 -mt-2">{t('Kâğıdın iki yüzüne basılır; katlayıp ortadan zımbalayınca kitapçık olur. Yazıcıda "kısa kenardan çevir" seçin ya da elle çift tarafı açın.')}</p>}
                <div className="grid grid-cols-2 gap-4">
                    <Field label={t('Kâğıt')}>
                        <select className="field" value={paper} onChange={(e) => setPaper(e.target.value)}>
                            <option value="a4">A4</option>
                            <option value="letter">Letter</option>
                            <option value="a3">A3</option>
                            {layout === 'normal' && <option value="original">{t('Orijinal boyut')}</option>}
                        </select>
                    </Field>
                    <Field label={t('Hangi sayfalar')}>
                        <select className="field" value={which} onChange={(e) => setWhich(e.target.value)}>
                            <option value="all">{t('Tüm sayfalar')} ({n})</option>
                            <option value="current">{t('Geçerli sayfa')}</option>
                            <option value="range">{t('Sayfa aralıkları')}</option>
                        </select>
                    </Field>
                </div>
                {which === 'range' && <input className="field" value={range} onChange={(e) => setRange(e.target.value)} placeholder="1-3, 5" />}
                <Toggle checked={manualDuplex} onChange={setManualDuplex} label={t('Elle çift taraf (yazıcı otomatik çift taraf basmıyorsa)')} />
                {error && <p className="text-xs text-danger">{error}</p>}
                {isDesktop && !hasInkwell && (
                    <p className="text-xs text-fg-3">{t('Inkwell kuruluysa baskı ve yazıcı bakımı tek pencerede yapılabilir.')}</p>
                )}
            </div>
        </Dialog>
    );
}
