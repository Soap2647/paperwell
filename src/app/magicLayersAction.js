// "Sihirli Katmanlar" eylemi: geçerli sayfayı katmanlara ayırır (tek geri alma adımı).
import { PDFDocument } from 'pdf-lib';
import { withBusy } from '../store/actions';
import { newId, readPages, rebuildPages } from '../core/pageOps';
import { renderPageToCanvas } from '../core/render';
import { isTextModelCached, loadTextModels, OCR_BYTES } from '../core/textDetect';
import { isSam2Cached, loadSam2, SAM2_BYTES, SAM2_LARGE_BYTES } from '../core/segment2';
import { isLamaCached, loadLama, LAMA_BYTES } from '../core/inpaint/lama';
import { isMiganCached, loadMigan } from '../core/inpaint/migan';
import { magicLayers, textToObject, layerdAvailable } from '../core/magicLayers';
import { BG_MODELS, isBgModelCached, loadBgModel } from '../core/bgremove';
import { toast } from '../components/Toaster';
import { t } from '../i18n';

const STAGES = { segment: 'Nesneler bulunuyor...', text: 'Yazılar okunuyor...', fill: 'Arka plan dolduruluyor...' };

export async function runMagicLayers(ed, { fill = 'best' } = {}) {
    // Eksik modelleri listele, kullanıcı onayıyla indir
    // masaüstü GPU'da nesneleri LayerD ayırır (SAM 2 gerekmez)
    const layerd = await layerdAvailable();
    const needs = [
        [await isTextModelCached(), OCR_BYTES, loadTextModels],
        ...(layerd
            ? [[await isBgModelCached('layerd'), BG_MODELS.layerd.bytes, (p) => loadBgModel('layerd', p)], [await isBgModelCached('birefnetLite'), BG_MODELS.birefnetLite.bytes, (p) => loadBgModel('birefnetLite', p)],
                // illüstrasyon türü afişlerde nesneleri SAM 2 base-plus ayırır
                [await isSam2Cached('basePlus'), SAM2_LARGE_BYTES, (p) => loadSam2(p, 'basePlus')]]
            : [[await isSam2Cached(), SAM2_BYTES, loadSam2]]),
        [await isMiganCached(), 28e6, loadMigan],
        [fill !== 'best' || (await isLamaCached()), LAMA_BYTES, loadLama],
    ].filter(([cached]) => !cached);
    if (needs.length) {
        const mb = Math.round(needs.reduce((s, [, b]) => s + b, 0) / 1e6);
        if (!window.confirm(`${t('Sihirli Katmanlar için yapay zekâ modelleri indirilecek. Bir kez iner, sonra çevrimdışı çalışır.')} (~${mb} MB)`)) return;
        const ok = await withBusy(ed, t('Model indiriliyor'), async (progress) => {
            for (let i = 0; i < needs.length; i++) {
                await needs[i][2]((p) => progress((i + (p || 0)) / needs.length, `${t('Model indiriliyor')} ${Math.round(((i + (p || 0)) / needs.length) * 100)}%`));
            }
            return true;
        });
        if (!ok) return;
    }

    await withBusy(ed, t('Katmanlara ayrılıyor...'), async (progress) => {
        const s = ed.get();
        const pageIndex = s.page;
        const page = s.doc.pages[pageIndex];
        // Görsel belgede orijinal çözünürlük; PDF'te ~1600 px
        const scale = s.doc.kind === 'image' ? (s.doc.imageSize?.w || page.width) / s.doc.pages[0].width : Math.min(3, 1600 / Math.max(page.width, page.height));
        const canvas = await renderPageToCanvas(s.doc.bytes, pageIndex, scale);
        const res = await magicLayers(canvas, { fill, onProgress: (p, stage) => progress(p, t(STAGES[stage] || 'Katmanlara ayrılıyor...')) });

        // Arka plan: sayfa yeni (temizlenmiş) görselle değiştirilir
        const blob = await res.background.convertToBlob(s.doc.mime === 'image/png' ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.95 });
        const bytesImg = new Uint8Array(await blob.arrayBuffer());
        const one = await PDFDocument.create();
        const emb = s.doc.mime === 'image/png' ? await one.embedPng(bytesImg) : await one.embedJpg(bytesImg);
        one.addPage([page.width, page.height]).drawImage(emb, { x: 0, y: 0, width: page.width, height: page.height });
        const fromDoc = await PDFDocument.load(await one.save());
        const plan = s.doc.pages.map((p, i) => (i === pageIndex ? { fromDoc, srcIndex: 0, id: p.id } : { srcIndex: i, id: p.id }));
        const bytes = await rebuildPages(s.doc.bytes, plan);
        const pages = await readPages(bytes, plan.map((p) => p.id));

        const k = page.width / canvas.width;
        const layers = [];
        const image = async (c, name, extra) => {
            const src = await new Promise((r) => { c.canvas.convertToBlob({ type: 'image/png' }).then((b) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); });
            return { id: newId('ob'), type: 'image', x: c.x * k, y: c.y * k, w: c.w * k, h: c.h * k, src, opacity: 1, name, ...extra };
        };
        // derindeki (LayerD'nin sonraki turlarında çıkan) ve büyük nesneler altta, küçükler üstte; yazılar en üstte
        for (const e of [...res.elements].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0) || b.area - a.area)) layers.push(await image(e, t('Nesne')));
        // yazı afişin kendi pikselleriyle (font aynen); "Metni düzenle" tahmini fontla canlı metne çevirir
        // (textSource konumu görsel katmana göreli: katman taşınsa da metin yerinde açılır)
        for (const tx of res.texts) {
            const o = textToObject(tx, k);
            layers.push(await image(tx.layer, tx.text, { textSource: { ...o, x: o.x - tx.layer.x * k, y: o.y - tx.layer.y * k } }));
        }

        ed.dispatch({ type: 'SET_TOOL', tool: 'select' });
        ed.dispatch({ type: 'COMMIT', bytes, pages, objects: { ...s.objects, [page.id]: [...(s.objects[page.id] || []), ...layers] } });
        toast(`${res.texts.length} ${t('yazı')}, ${res.elements.length} ${t('nesne katmanı oluşturuldu')}`, 'success', 5000);
    });
}
