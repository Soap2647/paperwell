// "Düzelt" aracının çekirdeği: kullanıcının kutuladığı bölgede bozuk detayı siler, yazıyı okur.
// Raster üzerinde çalışır (görsel nesnesinin kendi pikselleri ya da sayfanın render edilmiş bölgesi).
import { smartMask, dilate } from './smartMask';
import { fillHoles } from './magicLayers';
import { isLamaCached } from './inpaint/lama';
import { detectText, recognize, cropRotated } from './textDetect';
import { recognizeLine } from './ocr';
import { mergeDiacritics } from './ocrMerge';

const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

/** Kutunun çevresine bağlam payı ekleyip canvas sınırına kırpar (piksel) */
export function padBox(box, W, H, k = 0.5, min = 24) {
    const pad = Math.round(Math.max(min, Math.max(box.x1 - box.x0, box.y1 - box.y0) * k));
    return { x0: Math.max(0, Math.floor(box.x0 - pad)), y0: Math.max(0, Math.floor(box.y0 - pad)), x1: Math.min(W, Math.ceil(box.x1 + pad)), y1: Math.min(H, Math.ceil(box.y1 + pad)) };
}

/** Kutunun kenar piksellerinin çoğu saydamsa (katman nesnesi) true */
function transparentAround(d, w, box) {
    let n = 0, clear = 0;
    for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) {
        if (x > box.x0 + 1 && x < box.x1 - 2 && y > box.y0 + 1 && y < box.y1 - 2) continue;
        n++; if (d[(y * w + x) * 4 + 3] < 30) clear++;
    }
    return n > 0 && clear / n > 0.3;
}

/**
 * Bölgeyi analiz eder: silinecek maske ve ön plan rengi. canvas yerinde değişmez.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {{x0:number,y0:number,x1:number,y1:number}} box - canvas pikseli
 * @param {(x:number, y:number) => boolean} [paint] - fırçayla boyanan alan (canvas pikseli); verilirse silinen alan odur
 */
export function analyzeRegion(canvas, box, paint) {
    const r = padBox(box, canvas.width, canvas.height);
    const w = r.x1 - r.x0, h = r.y1 - r.y0;
    const img = ctx2d(canvas).getImageData(r.x0, r.y0, w, h);
    const local = { x0: box.x0 - r.x0, y0: box.y0 - r.y0, x1: box.x1 - r.x0, y1: box.y1 - r.y0 };
    const m = smartMask(img.data, w, h, local);
    if (paint) {
        // fırça: kullanıcının boyadığı yer silinir (+2 px hale payı); renk ve mürekkep ölçüsü yalnız boyanan yerin yakınından
        const pm = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (paint(r.x0 + x, r.y0 + y)) pm[y * w + x] = 1;
        const near = dilate(pm, w, h, 6);
        for (let i = 0; i < w * h; i++) if (!near[i]) m.core[i] = 0;
        m.mask = dilate(pm, w, h, 2);
        m.whole = false;
        m.painted = true;
    }
    return { region: r, img, local, ...m, transparent: transparentAround(img.data, w, { x0: Math.max(0, Math.round(local.x0)), y0: Math.max(0, Math.round(local.y0)), x1: Math.min(w, Math.round(local.x1)), y1: Math.min(h, Math.round(local.y1)) }) };
}

/**
 * Bölgedeki ön planı siler ve arka planı tamamlar (canvas yerinde güncellenir).
 * Saydam katmanda zemin yoktur: kutudaki pikseller yalnız silinir.
 * @returns {Promise<{mask: Uint8Array, region: object, fg: number[]|null}>}
 */
export async function eraseRegion(canvas, box, { a = null, onProgress } = {}) {
    a = a || analyzeRegion(canvas, box);
    const { img, region, mask } = a, w = region.x1 - region.x0, h = region.y1 - region.y0;
    if (a.transparent && a.painted) {
        for (let i = 0; i < w * h; i++) if (mask[i]) img.data[i * 4 + 3] = 0;
    } else if (a.transparent) {
        for (let y = Math.max(0, Math.floor(a.local.y0)); y < Math.min(h, Math.ceil(a.local.y1)); y++) {
            for (let x = Math.max(0, Math.floor(a.local.x0)); x < Math.min(w, Math.ceil(a.local.x1)); x++) img.data[(y * w + x) * 4 + 3] = 0;
        }
    } else {
        await fillHoles(img.data, w, h, mask.slice(), { best: await isLamaCached(), onProgress });
    }
    ctx2d(canvas).putImageData(img, region.x0, region.y0);
    return { mask, region, fg: a.fg };
}

/**
 * Kutudaki yazıyı okur (PaddleOCR satırları + Tesseract ile Türkçe harfler).
 * @returns {Promise<{text: string, lineH: number}>} lineH: ortanca satır yüksekliği (canvas pikseli), yazı yoksa 0
 */
export async function readRegionText(canvas, box) {
    const w = Math.max(8, Math.round(box.x1 - box.x0)), h = Math.max(8, Math.round(box.y1 - box.y0));
    const crop = new OffscreenCanvas(w, h);
    crop.getContext('2d').drawImage(canvas, box.x0, box.y0, w, h, 0, 0, w, h);
    const boxes = (await detectText(crop)).sort((p, q) => p.cy - q.cy || p.cx - q.cx);
    // aynı satırdaki kutuları birleştir (yükseklik yarısından yakın merkezler)
    const lines = [];
    for (const b of boxes) {
        const r = await recognize(crop, b);
        if (!r.text) continue;
        let text = r.text;
        try {
            const tr = await recognizeLine(cropRotated(crop, { ...b, w: b.w + b.h * 0.4, h: b.h * 1.2 }, 72));
            if (tr.text) text = mergeDiacritics(text, tr.text);
        } catch { /* Tesseract yoksa Paddle sonucu */ }
        const same = lines.find((l) => Math.abs(l.cy - b.cy) < Math.min(l.h, b.h) / 2);
        if (same) same.parts.push({ x: b.cx, text }); else lines.push({ cy: b.cy, h: b.h, parts: [{ x: b.cx, text }] });
    }
    if (!lines.length) return { text: '', lineH: 0 };
    const hs = lines.map((l) => l.h).sort((p, q) => p - q);
    return { text: lines.map((l) => l.parts.sort((p, q) => p.x - q.x).map((p) => p.text).join(' ')).join('\n'), lineH: hs[hs.length >> 1] };
}

/** Görselin piksellerini (en çok maxSide) canvas olarak yükler */
export async function loadImageCanvas(src, maxSide = 3000) {
    const bmp = await createImageBitmap(await (await fetch(src)).blob());
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c;
}

export const canvasToDataUrl = async (c) => {
    const b = await c.convertToBlob({ type: 'image/png' });
    return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
};

/** "#rrggbb" */
export const toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
