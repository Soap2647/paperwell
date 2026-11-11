// Belge tarayıcı: fotoğraflar → köşe düzeltme → taranmış görünüm → A4 PDF (isteğe bağlı OCR)
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X, ScanLine } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { withBusy } from '../../store/actions';
import { readPages } from '../../core/pageOps';
import { renderPageToCanvas } from '../../core/render';
import { detectQuad, refineQuad, insetQuad } from '../../core/scanner';
import { bitmapToImageData, scanImage, scanToPdf } from '../../core/scanPdf';
import { ocrPages } from '../../core/ocr';
import { Button, Dialog, Field, Slider, Toggle, cx } from '../../components/ui';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';

let nextId = 0;

/** Fotoğrafı hazırlar: küçük kopya (düzenleme/önizleme) + otomatik köşeler (tam çözünürlük koordinatı) */
async function makeItem(bitmap, name) {
    const small = bitmapToImageData(bitmap, 1000);
    const det = bitmapToImageData(bitmap, 400);
    let { quad, found } = detectQuad(det);
    let k = bitmap.width / det.width;
    if (found) {
        // 2 kat çözünürlükte köşeleri incelt
        const fine = bitmapToImageData(bitmap, 800);
        const f = fine.width / det.width;
        quad = insetQuad(refineQuad(fine, quad.map(([x, y]) => [x * f, y * f])), 0.008);
        k = bitmap.width / fine.width;
    }
    return { id: ++nextId, name, bitmap, small, quad: quad.map(([x, y]) => [x * k, y * k]), found };
}

function CornerEditor({ item, onChange }) {
    const canvasRef = useRef(null);
    const svgRef = useRef(null);
    const [drag, setDrag] = useState(null); // { i, quad }
    const k = item.small.width / item.bitmap.width; // tam → küçük
    const quad = (drag?.quad || item.quad).map(([x, y]) => [x * k, y * k]);

    useEffect(() => {
        const c = canvasRef.current;
        c.width = item.small.width; c.height = item.small.height;
        c.getContext('2d').putImageData(item.small, 0, 0);
    }, [item.small]);

    const toImage = (e) => {
        const r = svgRef.current.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * item.small.width, y = ((e.clientY - r.top) / r.height) * item.small.height;
        return [Math.min(item.small.width, Math.max(0, x)) / k, Math.min(item.small.height, Math.max(0, y)) / k];
    };
    const move = (e) => {
        if (!drag) return;
        const q = drag.quad.slice();
        q[drag.i] = toImage(e);
        setDrag({ ...drag, quad: q });
    };
    const up = () => {
        if (!drag) return;
        onChange(drag.quad);
        setDrag(null);
    };
    const r = Math.max(item.small.width, item.small.height) / 55;

    return (
        <div className="relative inline-block max-w-full">
            <canvas ref={canvasRef} className="block max-w-full max-h-[46vh] rounded-lg" />
            <svg ref={svgRef} viewBox={`0 0 ${item.small.width} ${item.small.height}`} className="absolute inset-0 w-full h-full touch-none"
                onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                <polygon points={quad.map((p) => p.join(',')).join(' ')} fill="rgba(124,92,255,.15)" stroke="#7c5cff" strokeWidth={r / 3} />
                {quad.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r={r} fill="#fff" stroke="#7c5cff" strokeWidth={r / 3} style={{ cursor: 'grab' }}
                        onPointerDown={(e) => { e.preventDefault(); try { svgRef.current.setPointerCapture(e.pointerId); } catch { /* yoksay */ } setDrag({ i, quad: item.quad.slice() }); }} />
                ))}
            </svg>
        </div>
    );
}

function Thumb({ item }) {
    const ref = useRef(null);
    useEffect(() => {
        const c = ref.current;
        const k = 80 / Math.max(item.small.width, item.small.height);
        c.width = Math.round(item.small.width * k); c.height = Math.round(item.small.height * k);
        const tmp = new OffscreenCanvas(item.small.width, item.small.height);
        tmp.getContext('2d').putImageData(item.small, 0, 0);
        c.getContext('2d').drawImage(tmp, 0, 0, c.width, c.height);
    }, [item.small]);
    return <canvas ref={ref} className="max-w-full max-h-full" />;
}

function Preview({ item, mode, contrast }) {
    const ref = useRef(null);
    useEffect(() => {
        const timer = setTimeout(() => {
            const k = item.small.width / item.bitmap.width;
            const out = scanImage(item.small, item.quad.map(([x, y]) => [x * k, y * k]), mode, contrast, 700);
            const c = ref.current;
            if (!c) return;
            c.width = out.width; c.height = out.height;
            c.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
        }, 40);
        return () => clearTimeout(timer);
    }, [item, mode, contrast]);
    return <canvas ref={ref} data-scan-preview className="block max-w-full max-h-[46vh] rounded-lg shadow-pop bg-white" />;
}

export default function ScanDialog({ open, onClose }) {
    const ed = useEditor();
    const [items, setItems] = useState([]);
    const [sel, setSel] = useState(0);
    const [mode, setMode] = useState('color');
    const [contrast, setContrast] = useState(40);
    const [ocr, setOcr] = useState(false);
    const fileRef = useRef(null);

    const close = () => { setItems([]); setSel(0); onClose(); };

    // Açılışta: görsel belge açıksa onu ilk fotoğraf olarak al
    useEffect(() => {
        if (!open) return;
        const s = ed.get();
        if (s.doc?.kind !== 'image') return;
        let alive = true;
        (async () => {
            const k = (s.doc.imageSize?.w || s.doc.pages[0].width) / s.doc.pages[0].width;
            const canvas = await renderPageToCanvas(s.doc.bytes, s.page, k);
            const item = await makeItem(await createImageBitmap(canvas), s.doc.name);
            if (alive) setItems([item]);
        })();
        return () => { alive = false; };
    }, [open, ed]);

    const addFiles = async (files) => {
        const list = [...files].filter((f) => /^image\//.test(f.type));
        const made = [];
        for (const f of list) {
            try { made.push(await makeItem(await createImageBitmap(f), f.name)); } catch { toast(`${t('Dosya açılamadı')}: ${f.name}`, 'error'); }
        }
        if (!made.length) return;
        setItems((prev) => { setSel(prev.length); return [...prev, ...made]; });
    };

    const remove = (id) => setItems((prev) => {
        const next = prev.filter((x) => x.id !== id);
        setSel((s) => Math.max(0, Math.min(s, next.length - 1)));
        return next;
    });

    const create = async () => {
        if (ed.get().dirty && !window.confirm(t('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?'))) return;
        const list = items;
        close();
        await withBusy(ed, t('Taranıyor...'), async (progress) => {
            let bytes = await scanToPdf(list, { mode, contrast, onProgress: (p) => progress(ocr ? p * 0.3 : p) });
            if (ocr) {
                const res = await ocrPages(bytes, list.map((_, i) => i), {
                    mode: 'searchable',
                    langs: ['tur', 'eng'],
                    onProgress: (p, stage, pageIndex) => progress(0.3 + p * 0.7, stage === 'load'
                        ? t('OCR motoru hazırlanıyor...')
                        : `${t('Metin tanınıyor...')} ${t('Sayfa')} ${pageIndex + 1}`),
                });
                bytes = res.bytes;
            }
            ed.dispatch({ type: 'LOAD', doc: { name: `${t('Tarama')}.pdf`, kind: 'pdf', bytes, pages: await readPages(bytes) } });
            toast(`${list.length} ${t('sayfa tarandı')}`, 'success');
        });
    };

    const item = items[sel];
    return (
        <Dialog open={open} onClose={close} width={980} title={t('Belge tarayıcı')}
            description={t('Fotoğraftaki belgenin köşeleri otomatik bulunur; gerekirse köşeleri sürükleyin. Her fotoğraf bir A4 sayfası olur.')}
            footer={<><Button onClick={close}>{t('İptal')}</Button><Button variant="primary" icon={ScanLine} disabled={!items.length} onClick={create}>{t('PDF oluştur')}{items.length ? ` (${items.length})` : ''}</Button></>}>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            {!item ? (
                <button type="button" onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                    className="w-full rounded-2xl border-2 border-dashed border-line-strong hover:border-accent hover:bg-surface-2 py-14 flex flex-col items-center gap-3 transition-colors">
                    <span className="w-12 h-12 rounded-2xl bg-accent text-white flex items-center justify-center shadow-pop"><ImagePlus className="w-5 h-5" /></span>
                    <span className="text-[15px] font-semibold">{t('Belge fotoğrafları ekleyin')}</span>
                    <span className="text-[13px] text-fg-2">{t('Birden çok fotoğraf tek PDF olur')}</span>
                </button>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_200px] gap-4 items-start">
                        <div className="flex flex-col items-center gap-1.5">
                            <CornerEditor key={item.id} item={item} onChange={(quad) => setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, quad } : x)))} />
                            {!item.found && <p className="text-xs text-warning">{t('Köşeler bulunamadı; elle ayarlayın.')}</p>}
                        </div>
                        <div className="flex justify-center checker rounded-lg p-2"><Preview item={item} mode={mode} contrast={contrast} /></div>
                        <div className="space-y-4">
                            <Field label={t('Görünüm')}>
                                <div className="grid grid-cols-2 gap-1">
                                    {[['original', t('Orijinal')], ['color', t('Renkli')], ['gray', t('Gri')], ['bw', t('Siyah-beyaz')]].map(([v, l]) => (
                                        <button key={v} type="button" onClick={() => setMode(v)}
                                            className={cx('h-8 rounded-lg border text-xs font-medium', mode === v ? 'border-accent bg-accent-soft text-accent-text' : 'border-line hover:border-line-strong text-fg-2')}>{l}</button>
                                    ))}
                                </div>
                            </Field>
                            {mode !== 'original' && <Slider label={mode === 'bw' ? t('Eşik') : t('Kontrast')} value={contrast} min={0} max={100} onChange={setContrast} />}
                            <Toggle checked={ocr} onChange={setOcr} label={t('Metni tanı (OCR)')} />
                        </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto scroll-thin pb-1">
                        {items.map((x, i) => (
                            <div key={x.id} className="relative group shrink-0">
                                <button type="button" onClick={() => setSel(i)} title={x.name}
                                    className={cx('w-16 h-20 rounded-lg border overflow-hidden bg-surface-2 flex items-center justify-center text-xs tabular-nums', i === sel ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-strong')}>
                                    <Thumb item={x} />
                                </button>
                                <button type="button" aria-label={t('Sil')} onClick={() => remove(x.id)}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface border border-line hidden group-hover:flex items-center justify-center text-fg-2 hover:text-danger">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={() => fileRef.current?.click()} aria-label={t('Fotoğraf ekle')}
                            className="w-16 h-20 shrink-0 rounded-lg border border-dashed border-line-strong hover:border-accent text-fg-2 hover:text-accent flex items-center justify-center">
                            <ImagePlus className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </Dialog>
    );
}
