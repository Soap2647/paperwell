// Arka planı kaldır: görsel belgenin geçerli sayfasına ya da seçili görsel nesnesine uygulanır.
import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, Sparkles, Zap } from 'lucide-react';
import { useEditor, findObject } from '../../store/editor';
import { withBusy } from '../../store/actions';
import { readPages, rebuildPages } from '../../core/pageOps';
import { renderPageToCanvas } from '../../core/render';
import { BG_MODELS, isBgModelCached, predictAlpha, composite } from '../../core/bgremove';
import { Button, ColorPicker, Dialog, Field, Segmented, Slider, Spinner } from '../../components/ui';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';

const PREVIEW = 640;

/** Kaynak görsel: seçili nesnenin görseli ya da görsel belgenin sayfası (orijinal çözünürlükte) */
async function loadSource(s, objectId) {
    if (objectId) {
        const f = findObject(s.objects, objectId);
        return createImageBitmap(await (await fetch(f.obj.src)).blob());
    }
    const p = s.doc.pages[s.page];
    const k = (s.doc.imageSize?.w || p.width) / s.doc.pages[0].width;
    return renderPageToCanvas(s.doc.bytes, s.page, k, s.doc.mime === 'image/jpeg' ? '#fff' : 'transparent');
}

function downscale(img, max) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = new OffscreenCanvas(Math.round(img.width * k), Math.round(img.height * k));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
}

function scaleAlpha(alpha, w, h, tw, th) {
    const out = new Uint8ClampedArray(tw * th);
    for (let y = 0; y < th; y++) {
        const sy = Math.min(h - 1, Math.floor((y * h) / th));
        for (let x = 0; x < tw; x++) out[y * tw + x] = alpha[sy * w + Math.min(w - 1, Math.floor((x * w) / tw))];
    }
    return out;
}

export default function BgRemoveDialog({ open, onClose }) {
    const ed = useEditor();
    const objectId = ed.state.bgTarget || null;
    const [quality, setQuality] = useState('fast');
    const [bg, setBg] = useState({ mode: 'transparent', color: '#ffffff', blur: 12 });
    const [cached, setCached] = useState({});
    const [result, setResult] = useState(null); // { source, alpha, quality }
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        Promise.all(Object.keys(BG_MODELS).map(async (q) => [q, await isBgModelCached(q)])).then((r) => setCached(Object.fromEntries(r)));
    }, [open]);

    // Kapanınca sıfırla
    useEffect(() => { if (!open) { setResult(null); setProgress(null); } }, [open]);

    const run = async (q) => {
        setRunning(true);
        try {
            const source = await loadSource(ed.get(), objectId);
            const alpha = await predictAlpha(source, q, (p) => setProgress(p < 1 ? p : null));
            setCached((c) => ({ ...c, [q]: true }));
            setResult({ source, alpha, quality: q });
        } catch (e) {
            console.error(e);
            toast(e?.message || String(e), 'error');
        } finally {
            setRunning(false);
            setProgress(null);
        }
    };

    // Model önbellekteyse açılışta / kalite değişince kendiliğinden çalış
    useEffect(() => {
        if (open && !running && cached[quality] && result?.quality !== quality) run(quality);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, quality, cached[quality]]);

    // Önizleme
    useEffect(() => {
        const c = canvasRef.current;
        if (!c || !result) return;
        const small = downscale(result.source, PREVIEW);
        const a = scaleAlpha(result.alpha, result.source.width, result.source.height, small.width, small.height);
        const out = composite(small, a, bg);
        c.width = out.width; c.height = out.height;
        c.getContext('2d').drawImage(out, 0, 0);
    }, [result, bg]);

    const apply = async () => {
        const r = result;
        onClose();
        await withBusy(ed, t('İşleniyor...'), async () => {
            const s = ed.get();
            const out = composite(r.source, r.alpha, bg);
            if (objectId) {
                const blob = await out.convertToBlob({ type: 'image/png' });
                const src = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
                ed.dispatch({ type: 'UPDATE_OBJECT', id: objectId, changes: { src } });
            } else {
                // Sayfayı yeni görselle değiştir (aynı görünüm boyutu, kimlikler korunur)
                const jpeg = bg.mode !== 'transparent' && s.doc.mime === 'image/jpeg';
                const blob = await out.convertToBlob(jpeg ? { type: 'image/jpeg', quality: 0.95 } : { type: 'image/png' });
                const imgBytes = new Uint8Array(await blob.arrayBuffer());
                const page = s.doc.pages[s.page];
                const one = await PDFDocument.create();
                const emb = jpeg ? await one.embedJpg(imgBytes) : await one.embedPng(imgBytes);
                one.addPage([page.width, page.height]).drawImage(emb, { x: 0, y: 0, width: page.width, height: page.height });
                // pdf-lib görselleri kaydederken gömer: kopyalamadan önce kaydedip yeniden yükle
                const fromDoc = await PDFDocument.load(await one.save());
                const plan = s.doc.pages.map((p, i) => (i === s.page ? { fromDoc, srcIndex: 0, id: p.id } : { srcIndex: i, id: p.id }));
                const bytes = await rebuildPages(s.doc.bytes, plan);
                const pages = await readPages(bytes, plan.map((p) => p.id));
                // Şeffaf sonuç PNG olarak indirilsin
                ed.dispatch({ type: 'COMMIT', bytes, pages, docChanges: bg.mode === 'transparent' ? { mime: 'image/png' } : undefined });
            }
            toast(t('Arka plan kaldırıldı'), 'success');
        });
    };

    const mb = (q) => Math.round(BG_MODELS[q].bytes / 1e6);
    const needsDownload = !cached[quality] && !result;

    return (
        <Dialog open={open} onClose={onClose} width={720} title={t('Arka planı kaldır')} description={t('Yapay zekâ ana nesneyi ayırır. Tamamen cihazınızda çalışır.')}
            footer={<><Button onClick={onClose}>{t('İptal')}</Button><Button variant="primary" disabled={!result || running} onClick={apply}>{t('Uygula')}</Button></>}>
            <div className="grid grid-cols-[1fr_220px] gap-5">
                <div className="rounded-xl border border-line checker min-h-[280px] flex items-center justify-center overflow-hidden">
                    {result && !running ? (
                        <canvas ref={canvasRef} className="max-w-full max-h-[52vh] object-contain" />
                    ) : running ? (
                        <div className="flex flex-col items-center gap-2 text-[13px] text-fg-2 bg-surface/90 rounded-xl px-4 py-3">
                            <Spinner className="w-5 h-5" />
                            {progress != null ? `${t('Model indiriliyor')} ${Math.round(progress * 100)}%` : t('Arka plan ayrılıyor...')}
                        </div>
                    ) : needsDownload ? (
                        <div className="text-center space-y-3 bg-surface/90 rounded-xl px-5 py-4 max-w-[300px]">
                            <p className="text-[13px] text-fg-2 leading-relaxed">{t('Model bir kez indirilir, sonra çevrimdışı çalışır.')}</p>
                            <Button variant="primary" icon={Download} onClick={() => run(quality)}>{t('Modeli indir ve çalıştır')} (~{mb(quality)} MB)</Button>
                        </div>
                    ) : null}
                </div>
                <div className="space-y-4">
                    <Field label={t('Model')} hint={quality === 'fast' ? t('Hızlı, küçük model; çoğu fotoğraf için yeterli.') : t('Saç ve ince kenarlarda daha iyi; daha yavaş.')}>
                        <Segmented value={quality} onChange={setQuality} options={[{ value: 'fast', icon: Zap, label: t('Hızlı') }, { value: 'quality', icon: Sparkles, label: t('Kaliteli') }]} />
                    </Field>
                    <Field label={t('Arka plan')}>
                        <Segmented value={bg.mode} onChange={(mode) => setBg((b) => ({ ...b, mode }))} options={[{ value: 'transparent', label: t('Şeffaf') }, { value: 'color', label: t('Renk') }, { value: 'blur', label: t('Bulanık') }]} />
                    </Field>
                    {bg.mode === 'color' && <Field label={t('Renk')}><ColorPicker value={bg.color} onChange={(color) => setBg((b) => ({ ...b, color }))} /></Field>}
                    {bg.mode === 'blur' && <Slider label={t('Bulanıklık')} value={bg.blur} min={2} max={40} onChange={(blur) => setBg((b) => ({ ...b, blur }))} />}
                    {bg.mode === 'transparent' && !objectId && <p className="text-xs text-fg-3 leading-relaxed">{t('Şeffaf sonuç PNG olarak indirilir.')}</p>}
                </div>
            </div>
        </Dialog>
    );
}
