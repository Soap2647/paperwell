// Görsel belgede temel fotoğraf ayarları (parlaklık, kontrast, doygunluk, sıcaklık) ve kırpma.
// Ayarlar ekranda CSS filtresiyle canlı önizlenir, "Uygula"da aynı filtre tuvalde görsele işlenir (tek geri alma adımı).
import { PDFDocument } from 'pdf-lib';
import { renderPageToCanvas } from '../core/render';
import { readPages, rebuildPages } from '../core/pageOps';
import { withBusy } from '../store/actions';
import { moveBy } from './objects';
import { t } from '../i18n';
import { toast } from '../components/Toaster';

export const NEUTRAL = { brightness: 100, contrast: 100, saturate: 100, warmth: 0 };
export const isNeutral = (a) => !a || Object.keys(NEUTRAL).every((k) => a[k] === NEUTRAL[k]);

/** CSS filtresi (önizleme ve tuval için aynı); sıcaklık sayfadaki SVG filtresiyle (#pw-warm) */
export const cssFilter = (a, withWarm = true) =>
    `brightness(${a.brightness / 100}) contrast(${a.contrast / 100}) saturate(${a.saturate / 100})${withWarm && a.warmth ? ' url(#pw-warm)' : ''}`;

/** Sıcaklık: kırmızıyı artır, maviyi azalt (ya da tersi); -100…100 → ±%15 */
export const warmGains = (w) => [1 + (w / 100) * 0.15, 1, 1 - (w / 100) * 0.15];

/** Görsel belgenin sayfasını yeni bir rasterla değiştirir (sayfa boyutu pt olarak verilir) */
async function replaceRaster(ed, canvas, width, height, extra = {}) {
    const s = ed.get();
    const png = s.doc.mime !== 'image/jpeg';
    const blob = await new Promise((r) => canvas.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.95));
    const one = await PDFDocument.create();
    const img = new Uint8Array(await blob.arrayBuffer());
    const emb = png ? await one.embedPng(img) : await one.embedJpg(img);
    one.addPage([width, height]).drawImage(emb, { x: 0, y: 0, width, height });
    const fromDoc = await PDFDocument.load(await one.save());
    const plan = s.doc.pages.map((p, i) => (i === s.page ? { fromDoc, srcIndex: 0, id: p.id } : { srcIndex: i, id: p.id }));
    const bytes = await rebuildPages(s.doc.bytes, plan);
    const pages = await readPages(bytes, s.doc.pages.map((p) => p.id));
    ed.dispatch({ type: 'COMMIT', bytes, pages, docChanges: { imageSize: { w: canvas.width, h: canvas.height } }, ...extra });
}

const pixelScale = (s) => (s.doc.imageSize?.w || s.doc.pages[s.page].width) / s.doc.pages[s.page].width;

export async function applyAdjust(ed, a) {
    await withBusy(ed, t('Ayarlar uygulanıyor...'), async () => {
        const s = ed.get(), page = s.doc.pages[s.page];
        const src = await renderPageToCanvas(s.doc.bytes, s.page, pixelScale(s), 'transparent');
        const out = document.createElement('canvas');
        out.width = src.width; out.height = src.height;
        const ctx = out.getContext('2d', { willReadFrequently: true });
        ctx.filter = cssFilter(a, false);
        ctx.drawImage(src, 0, 0);
        ctx.filter = 'none';
        if (a.warmth) {
            const g = warmGains(a.warmth), d = ctx.getImageData(0, 0, out.width, out.height);
            for (let i = 0; i < d.data.length; i += 4) { d.data[i] *= g[0]; d.data[i + 2] *= g[2]; }
            ctx.putImageData(d, 0, 0);
        }
        await replaceRaster(ed, out, page.width, page.height);
        ed.dispatch({ type: 'SET', values: { adjust: null } });
        toast(t('Ayarlar uygulandı'), 'success', 2500);
    });
}

/** Kırp: sayfa kırpma kutusuna (pt) daralır, nesneler aynı yerde kalacak şekilde kaydırılır */
export async function applyCrop(ed, r) {
    await withBusy(ed, t('Kırpılıyor...'), async () => {
        const s = ed.get(), page = s.doc.pages[s.page], k = pixelScale(s);
        const src = await renderPageToCanvas(s.doc.bytes, s.page, k, 'transparent');
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(r.w * k)); out.height = Math.max(1, Math.round(r.h * k));
        out.getContext('2d').drawImage(src, Math.round(r.x * k), Math.round(r.y * k), out.width, out.height, 0, 0, out.width, out.height);
        const objects = { ...s.objects, [page.id]: (s.objects[page.id] || []).map((o) => ({ ...o, ...moveBy(o, -r.x, -r.y) })) };
        await replaceRaster(ed, out, out.width / k, out.height / k, { objects });
        ed.dispatch({ type: 'SET', values: { crop: null } });
        toast(t('Kırpıldı'), 'success', 2500);
    });
}
