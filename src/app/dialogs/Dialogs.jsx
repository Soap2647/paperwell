// Belge araçları diyalogları
import { useEffect, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { useEditor } from '../../store/editor';
import { buildOutputPdf, commitBytes, downloadBlob, withBusy, baseName } from '../../store/actions';
import { addWatermark, addPageNumbers, compressPdf, parseRanges, splitToZip, exportImages, exportDocx } from '../../core/docTools';
import { Button, ColorPicker, Dialog, Field, Kbd, Segmented, Slider, Toggle } from '../../components/ui';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';
import { TOOLS } from '../tools';
import MergeDialog from './MergeDialog';
import OcrDialog from './OcrDialog';
import PrintDialog from './PrintDialog';
import SignatureDialog from './SignatureDialog';
import BgRemoveDialog from './BgRemoveDialog';
import ScanDialog from './ScanDialog';
import SocialExportDialog from './SocialExportDialog';
import BatchDialog from './BatchDialog';
import PreflightDialog from './PreflightDialog';
import NewDesignDialog from './NewDesignDialog';

function PositionGrid({ value, onChange, positions }) {
    return (
        <div className="grid grid-cols-3 gap-1.5 w-[132px]">
            {['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'].map((p) => {
                const ok = positions.includes(p);
                return (
                    <button key={p} type="button" disabled={!ok} onClick={() => onChange(p)} aria-label={p}
                        className={`h-9 rounded-md border flex items-center justify-center ${value === p ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-3'} disabled:opacity-25`}>
                        <span className={`w-2 h-2 rounded-full ${value === p ? 'bg-accent' : 'bg-fg-3'}`} />
                    </button>
                );
            })}
        </div>
    );
}

function WatermarkDialog({ open, onClose }) {
    const ed = useEditor();
    const [o, setO] = useState({ text: 'GİZLİ', size: 64, opacity: 0.18, angle: 45, color: '#6b7280', position: 'center', pages: 'all' });
    const set = (c) => setO((p) => ({ ...p, ...c }));
    const apply = async () => {
        onClose();
        await withBusy(ed, t('İşleniyor...'), async () => {
            const s = ed.get();
            await commitBytes(ed, await addWatermark(s.doc.bytes, { ...o, current: s.page }));
            toast(t('Filigran') + ' ✓', 'success');
        });
    };
    return (
        <Dialog open={open} onClose={onClose} title={t('Filigran')} footer={<><Button onClick={onClose}>{t('İptal')}</Button><Button variant="primary" disabled={!o.text.trim()} onClick={apply}>{t('Belgeye uygula')}</Button></>}>
            <div className="grid grid-cols-[1fr_150px] gap-5">
                <div className="space-y-4">
                    <Field label={t('Metin')}><input className="field" value={o.text} onChange={(e) => set({ text: e.target.value })} /></Field>
                    <Slider label={t('Boyut')} value={o.size} min={12} max={160} unit=" pt" onChange={(size) => set({ size })} />
                    <Slider label={t('Opaklık')} value={Math.round(o.opacity * 100)} min={5} max={100} unit="%" onChange={(v) => set({ opacity: v / 100 })} />
                    <Slider label={t('Açı')} value={o.angle} min={-90} max={90} unit="°" onChange={(angle) => set({ angle })} />
                    <Field label={t('Renk')}><ColorPicker value={o.color} onChange={(color) => set({ color })} /></Field>
                    <Field label={t('Hangi sayfalar')}><Segmented value={o.pages} onChange={(pages) => set({ pages })} options={[{ value: 'all', label: t('Tüm sayfalar') }, { value: 'current', label: t('Geçerli sayfa') }]} /></Field>
                </div>
                <div className="space-y-4">
                    <div className="w-[150px] aspect-[1/1.414] bg-white rounded-md shadow-pop border border-line relative overflow-hidden">
                        <div className="absolute inset-3 space-y-1.5 opacity-50">{Array.from({ length: 14 }).map((_, i) => <div key={i} className="h-1 bg-gray-300 rounded" style={{ width: `${55 + ((i * 37) % 45)}%` }} />)}</div>
                        <div className={`absolute inset-0 flex p-2 ${{ 'top-left': 'items-start justify-start', 'top-right': 'items-start justify-end', center: 'items-center justify-center', 'bottom-left': 'items-end justify-start', 'bottom-right': 'items-end justify-end' }[o.position]}`}>
                            <span className="font-bold whitespace-nowrap" style={{ fontSize: Math.max(6, o.size / 5), opacity: o.opacity, color: o.color, transform: `rotate(${-o.angle}deg)` }}>{o.text}</span>
                        </div>
                    </div>
                    <PositionGrid value={o.position} onChange={(position) => set({ position })} positions={['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right']} />
                </div>
            </div>
        </Dialog>
    );
}

function PageNumbersDialog({ open, onClose }) {
    const ed = useEditor();
    const [o, setO] = useState({ format: '{n} / {total}', position: 'bottom-center', size: 10, start: 1, skipFirst: false, color: '#374151' });
    const set = (c) => setO((p) => ({ ...p, ...c }));
    const apply = async () => {
        onClose();
        await withBusy(ed, t('İşleniyor...'), async () => {
            await commitBytes(ed, await addPageNumbers(ed.get().doc.bytes, o));
            toast(t('Sayfa numaraları') + ' ✓', 'success');
        });
    };
    return (
        <Dialog open={open} onClose={onClose} title={t('Sayfa numaraları')} footer={<><Button onClick={onClose}>{t('İptal')}</Button><Button variant="primary" onClick={apply}>{t('Belgeye uygula')}</Button></>}>
            <div className="grid grid-cols-[1fr_132px] gap-5">
                <div className="space-y-4">
                    <Field label={t('Biçim')}>
                        <select className="field" value={o.format} onChange={(e) => set({ format: e.target.value })}>
                            {['{n}', '{n} / {total}', 'Sayfa {n}', 'Sayfa {n} / {total}', 'Page {n} of {total}', '- {n} -'].map((f) => <option key={f} value={f}>{f.replace('{n}', '3').replace('{total}', '12')}</option>)}
                        </select>
                    </Field>
                    <div className="flex gap-3">
                        <Field label={t('Başlangıç numarası')}><input type="number" className="field w-24" value={o.start} min={0} onChange={(e) => set({ start: parseInt(e.target.value) || 1 })} /></Field>
                        <Field label={t('Boyut')}><input type="number" className="field w-24" value={o.size} min={6} max={40} onChange={(e) => set({ size: parseFloat(e.target.value) || 10 })} /></Field>
                    </div>
                    <Toggle checked={o.skipFirst} onChange={(skipFirst) => set({ skipFirst })} label="İlk sayfaya (kapak) ekleme" />
                    <Field label={t('Renk')}><ColorPicker value={o.color} onChange={(color) => set({ color })} /></Field>
                </div>
                <Field label={t('Konum')}><PositionGrid value={o.position} onChange={(position) => set({ position })} positions={['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']} /></Field>
            </div>
        </Dialog>
    );
}

function SplitDialog({ open, onClose }) {
    const ed = useEditor();
    const n = ed.state.doc?.pages.length || 1;
    const [mode, setMode] = useState('ranges');
    const [input, setInput] = useState(`1-${Math.ceil(n / 2)}, ${Math.ceil(n / 2) + 1}-${n}`);
    const [error, setError] = useState(null);
    const run = async () => {
        let ranges;
        try {
            ranges = mode === 'each' ? Array.from({ length: n }, (_, i) => [i + 1, i + 1]) : parseRanges(input, n);
        } catch (e) { setError(e.message); return; }
        onClose();
        await withBusy(ed, t('İşleniyor...'), async () => {
            const s = ed.get();
            const full = await buildOutputPdf(ed);
            downloadBlob(await splitToZip(full, ranges, baseName(s.doc.name)), `${baseName(s.doc.name)}-bolunmus.zip`);
        });
    };
    return (
        <Dialog open={open} onClose={onClose} title={t('Böl')} description={`${n} ${t('sayfa')}`} footer={<><Button onClick={onClose}>{t('İptal')}</Button><Button variant="primary" onClick={run}>{t('Böl ve indir')}</Button></>}>
            <div className="space-y-4">
                <Segmented value={mode} onChange={setMode} options={[{ value: 'ranges', label: t('Sayfa aralıkları') }, { value: 'each', label: t('Her sayfayı ayrı dosya yap') }]} />
                {mode === 'ranges' && (
                    <Field label={t('Sayfa aralıkları')} hint="Örn: 1-3, 5, 8-  (her aralık ayrı PDF olur)">
                        <input className="field" value={input} onChange={(e) => { setInput(e.target.value); setError(null); }} />
                    </Field>
                )}
                {error && <p className="text-xs text-danger">{error}</p>}
            </div>
        </Dialog>
    );
}

function CompressDialog({ open, onClose }) {
    const ed = useEditor();
    const [quality, setQuality] = useState('medium');
    const run = async () => {
        onClose();
        await withBusy(ed, t('İşleniyor...'), async (progress) => {
            const s = ed.get();
            const full = await buildOutputPdf(ed);
            const out = await compressPdf(full, quality, (p) => progress(p));
            const before = full.byteLength / 1048576, after = out.byteLength / 1048576;
            if (after >= before) {
                toast(`Dosya küçülmedi (${before.toFixed(2)} MB). Zaten optimize olabilir.`, 'info', 6000);
                return;
            }
            downloadBlob(new Blob([out], { type: 'application/pdf' }), `${baseName(s.doc.name)}-sikistirilmis.pdf`);
            toast(`${before.toFixed(2)} MB → ${after.toFixed(2)} MB (−%${Math.round((1 - after / before) * 100)})`, 'success', 6000);
        });
    };
    return (
        <Dialog open={open} onClose={onClose} title={t('Sıkıştır')} description="Sayfalar görsel olarak yeniden oluşturulur; metin seçilemez hale gelir. En çok taranmış belgelerde işe yarar."
            footer={<><Button onClick={onClose}>{t('İptal')}</Button><Button variant="primary" onClick={run}>{t('Sıkıştır ve indir')}</Button></>}>
            <Field label={t('Kalite')}>
                <Segmented value={quality} onChange={setQuality} options={[{ value: 'low', label: t('Düşük') }, { value: 'medium', label: t('Orta') }, { value: 'high', label: t('Yüksek') }]} />
            </Field>
        </Dialog>
    );
}

function ExportDialog({ open, onClose }) {
    const ed = useEditor();
    const [format, setFormat] = useState('png');
    const [which, setWhich] = useState('current');
    const [scale, setScale] = useState(2);
    const run = async () => {
        onClose();
        await withBusy(ed, t('İşleniyor...'), async (progress) => {
            const s = ed.get();
            const full = await buildOutputPdf(ed);
            if (format === 'docx') {
                const blob = await exportDocx(full, s.doc.pages.length, progress);
                downloadBlob(blob, `${baseName(s.doc.name)}.docx`);
                return;
            }
            const idx = which === 'current' ? [s.page] : s.doc.pages.map((_, i) => i);
            const { blob, name } = await exportImages(full, idx, { format, scale, baseName: baseName(s.doc.name) }, progress);
            downloadBlob(blob, name);
        });
    };
    return (
        <Dialog open={open} onClose={onClose} title={t('Dışa aktar')} footer={<><Button onClick={onClose}>{t('İptal')}</Button><Button variant="primary" onClick={run}>{t('İndir')}</Button></>}>
            <div className="space-y-4">
                <Segmented value={format} onChange={setFormat} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'docx', label: 'Word' }]} />
                {format === 'docx' ? (
                    <p className="text-xs text-fg-3">{t('Uyarı: Word dönüştürme yalnızca metni aktarır.')} Yazı tipi, boyut, kalın/italik ve renk korunur.</p>
                ) : (
                    <>
                        <Field label={t('Hangi sayfalar')}><Segmented value={which} onChange={setWhich} options={[{ value: 'current', label: t('Geçerli sayfa') }, { value: 'all', label: t('Tüm sayfalar') + ' (ZIP)' }]} /></Field>
                        <Slider label={t('Çözünürlük')} value={scale} min={1} max={4} step={0.5} format={(v) => `${Math.round(v * 72)} DPI`} onChange={setScale} />
                    </>
                )}
            </div>
        </Dialog>
    );
}

function PropertiesDialog({ open, onClose }) {
    const ed = useEditor();
    const [m, setM] = useState({ title: '', author: '', subject: '', keywords: '' });
    useEffect(() => {
        if (!open) return;
        PDFDocument.load(ed.get().doc.bytes, { updateMetadata: false }).then((d) => setM({
            title: d.getTitle() || '', author: d.getAuthor() || '', subject: d.getSubject() || '', keywords: d.getKeywords() || '',
        }));
    }, [open, ed]);
    const save = async () => {
        onClose();
        await withBusy(ed, t('İşleniyor...'), async () => {
            const d = await PDFDocument.load(ed.get().doc.bytes, { updateMetadata: false });
            d.setTitle(m.title); d.setAuthor(m.author); d.setSubject(m.subject); d.setKeywords(m.keywords ? [m.keywords] : []);
            await commitBytes(ed, await d.save());
        });
    };
    return (
        <Dialog open={open} onClose={onClose} title={t('Belge bilgileri')} footer={<><Button onClick={onClose}>{t('İptal')}</Button><Button variant="primary" onClick={save}>{t('Kaydet')}</Button></>}>
            <div className="space-y-3">
                {[['title', 'Başlık'], ['author', 'Yazar'], ['subject', 'Konu'], ['keywords', 'Anahtar kelimeler']].map(([k, l]) => (
                    <Field key={k} label={t(l)}><input className="field" value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} /></Field>
                ))}
            </div>
        </Dialog>
    );
}

function ShortcutsDialog({ open, onClose }) {
    const rows = [
        ...TOOLS.map((tl) => [t(tl.label), tl.key]),
        [t('Geri al'), 'Ctrl+Z'], [t('Yinele'), 'Ctrl+Y'], [t('İndir'), 'Ctrl+S'], [t('Bul ve değiştir'), 'Ctrl+F'],
        [t('Yakınlaştır') + ' / ' + t('Uzaklaştır'), 'Ctrl + / −'], [t('Genişliğe sığdır'), 'Ctrl+0'], [t('Cetveller'), 'Ctrl+R'],
        [t('Çoğalt'), 'Ctrl+D'], ['Kopyala / Yapıştır', 'Ctrl+C / V'], [t('Sil'), 'Del'], ['Taşı', '← ↑ → ↓'], [t('İptal'), 'Esc'],
    ];
    return (
        <Dialog open={open} onClose={onClose} title={t('Klavye kısayolları')} width={480}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                {rows.map(([a, k]) => (
                    <div key={a} className="flex items-center justify-between gap-2 py-1 border-b border-line/60">
                        <span className="text-fg-2">{a}</span><Kbd>{k}</Kbd>
                    </div>
                ))}
            </div>
        </Dialog>
    );
}

export default function Dialogs() {
    const { state, dispatch } = useEditor();
    const close = () => dispatch({ type: 'SET', values: { dialog: null } });
    const d = state.dialog;
    return (
        <>
            <MergeDialog open={d === 'merge'} onClose={close} />
            <SplitDialog open={d === 'split'} onClose={close} />
            <CompressDialog open={d === 'compress'} onClose={close} />
            <WatermarkDialog open={d === 'watermark'} onClose={close} />
            <PageNumbersDialog open={d === 'pagenumbers'} onClose={close} />
            <ExportDialog open={d === 'export'} onClose={close} />
            <PropertiesDialog open={d === 'properties'} onClose={close} />
            <ShortcutsDialog open={d === 'shortcuts'} onClose={close} />
            <OcrDialog open={d === 'ocr'} onClose={close} />
            <PrintDialog open={d === 'print'} onClose={close} />
            <BgRemoveDialog open={d === 'bgremove'} onClose={close} />
            <ScanDialog open={d === 'scan'} onClose={close} />
            <NewDesignDialog open={d === 'newdesign' || d === 'resize'} mode={d === 'resize' ? 'resize' : 'new'} onClose={close} />
            <SocialExportDialog open={d === 'social'} onClose={close} />
            <BatchDialog open={d === 'batch'} onClose={close} />
            <PreflightDialog open={d === 'preflight'} onClose={close} />
            <SignatureDialog
                open={d === 'signature'}
                onClose={close}
                onCreated={(sig) => dispatch({ type: 'SET_TOOL', tool: 'sign', pendingImage: sig })}
            />
        </>
    );
}
