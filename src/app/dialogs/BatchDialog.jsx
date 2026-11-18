// Toplu işlem: birçok görsele aynı şablonu (logolar, yazılar) uygula, istenirse yapay zekâyla netleştir,
// hepsini tek ZIP olarak indir. Açık belgeye dokunmaz.
import { useRef, useState } from 'react';
import { Images, LayoutTemplate, Play } from 'lucide-react';
import JSZip from 'jszip';
import { useEditor } from '../../store/editor';
import { imageToPdf, renderImageDoc, encodeCanvas, withBusy, baseName } from '../../store/actions';
import { readPages } from '../../core/pageOps';
import { useBrandKit, templateToObjects } from '../../core/brandKit';
import { saveFile, isDesktop } from '../../platform';
import { Button, Dialog, Field, Segmented, Toggle, cx } from '../../components/ui';
import { toast } from '../../components/Toaster';
import { t } from '../../i18n';

export default function BatchDialog({ open, onClose }) {
    const ed = useEditor();
    const kit = useBrandKit();
    const fileRef = useRef(null);
    const [files, setFiles] = useState([]);
    const [tplId, setTplId] = useState(null);
    const [format, setFormat] = useState('png');
    const [sharpen, setSharpen] = useState(false);
    const tpl = kit.templates.find((x) => x.id === tplId);

    const run = async () => {
        if (!files.length || (!tpl && !sharpen)) return;
        onClose();
        const zip = new JSZip();
        let done = 0;
        await withBusy(ed, t('Toplu işlem'), async (progress) => {
            const up = sharpen ? await import('../../core/upscale') : null;
            if (up) await up.loadUpscaler();
            for (const [i, f] of files.entries()) {
                progress(i / files.length, `${t('Toplu işlem')} ${i + 1}/${files.length} · ${f.name}`);
                try {
                    let { bytes, imageSize, mime } = await imageToPdf(f);
                    let pages = await readPages(bytes);
                    if (up) {
                        // görsel önce netleştirilir (2×): logolar da iki kat çözünürlükte çizilir
                        const { renderPageToCanvas } = await import('../../core/render');
                        const src = await renderPageToCanvas(bytes, 0, imageSize.w / pages[0].width, 'transparent');
                        const big = await up.upscaleCanvas(src, 2);
                        const blob = await new Promise((r) => big.toBlob(r, 'image/png'));
                        ({ bytes } = await imageToPdf(new File([blob], f.name, { type: 'image/png' })));
                        pages = await readPages(bytes);
                        imageSize = { w: big.width, h: big.height };
                    }
                    const page = pages[0];
                    const objects = tpl ? { [page.id]: templateToObjects(tpl, page) } : {};
                    const s = { doc: { bytes, pages, imageSize, mime, kind: 'image' }, objects };
                    const canvas = await renderImageDoc(s, imageSize.w / page.width);
                    const { blob, ext } = await encodeCanvas(canvas, format);
                    zip.file(`${baseName(f.name)}-paperwell.${ext}`, blob);
                    done++;
                } catch (e) {
                    toast(`${f.name}: ${e.message}`, 'error', 5000);
                }
            }
        });
        if (!done) return;
        const out = await zip.generateAsync({ type: 'blob' });
        if (await saveFile(out, `paperwell-toplu-${done}.zip`)) toast(`${done} ${t('görsel hazır')} · ${isDesktop ? t('kaydedildi') : t('indirildi')}`, 'success', 5000);
    };

    return (
        <Dialog open={open} onClose={onClose} width={560} title={t('Toplu işlem')}
            description={t('Bir etkinlik için birden çok afiş mi var? Hepsine aynı logoları ve yazıları tek seferde koyun.')}
            footer={<Button variant="primary" icon={Play} disabled={!files.length || (!tpl && !sharpen)} onClick={run}>{files.length ? `${files.length} ${t('görseli işle')}` : t('Görsel seçin')}</Button>}>
            <div className="space-y-4">
                <Field label={`1. ${t('Görseller')}`}>
                    <Button icon={Images} onClick={() => fileRef.current?.click()}>{files.length ? `${files.length} ${t('görsel seçildi')}` : t('Görselleri seç')}</Button>
                    <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { setFiles([...e.target.files]); e.target.value = ''; }} />
                    {files.length > 0 && <p className="text-xs text-fg-3 truncate">{files.map((f) => f.name).join(', ')}</p>}
                </Field>
                <Field label={`2. ${t('Şablon')}`} hint={kit.templates.length ? t('Logoları ve yazıları bir afişe yerleştirip Marka panelinden şablon yaptıysanız burada görünür.') : t('Henüz şablon yok. Bir afişe logolarınızı ve yazılarınızı koyun, Marka panelinde "Bu sayfadan" ile şablon yapın.')}>
                    <div className="grid grid-cols-2 gap-1.5">
                        {kit.templates.map((x) => (
                            <button key={x.id} type="button" onClick={() => setTplId(x.id === tplId ? null : x.id)} aria-pressed={x.id === tplId}
                                className={cx('flex items-center gap-2 rounded-lg border p-2 text-left text-[13px]', x.id === tplId ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}>
                                <LayoutTemplate className="w-4 h-4 text-accent shrink-0" /><span className="truncate">{x.name}</span>
                            </button>
                        ))}
                    </div>
                </Field>
                <Field label={`3. ${t('Çıktı')}`}>
                    <Toggle checked={sharpen} onChange={setSharpen} label={t('Yapay zekâyla netleştir (2×)')} />
                    <Segmented value={format} onChange={setFormat} options={[{ value: 'png', label: t('PNG · en yüksek kalite') }, { value: 'jpg', label: t('JPG · küçük dosya (WhatsApp)') }]} />
                </Field>
            </div>
        </Dialog>
    );
}
