// Taranan fotoğrafları (köşeleri düzeltilmiş, filtrelenmiş) A4 sayfalı tek PDF'e çevirir.
import { PDFDocument } from 'pdf-lib';
import { warp, outputSize, scanFilter } from './scanner';

const A4 = [595.28, 841.89];

export function bitmapToImageData(bitmap, maxSide = Infinity) {
    const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
}

/** Tek fotoğrafı tarar: perspektif + filtre. quad, kaynak görüntünün piksel koordinatlarında */
export function scanImage(src, quad, mode, contrast, maxSide) {
    const { width, height } = outputSize(quad, maxSide, src.width, src.height);
    return scanFilter(warp(src, quad, width, height), mode, contrast);
}

/**
 * @param {{bitmap: ImageBitmap, quad: number[][]}[]} items
 * @param {{mode: string, contrast: number, onProgress?: (p:number)=>void}} opts
 */
export async function scanToPdf(items, { mode, contrast, onProgress }) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < items.length; i++) {
        const { bitmap, quad } = items[i];
        const src = bitmapToImageData(bitmap);
        // A4 300 dpi uzun kenarı (3508 px) yeter
        const out = scanImage(src, quad, mode, contrast, 3508);
        const c = new OffscreenCanvas(out.width, out.height);
        c.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
        const png = mode === 'bw';
        const blob = await c.convertToBlob(png ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.88 });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const img = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const [pw, ph] = out.width > out.height ? [A4[1], A4[0]] : A4;
        const k = Math.min(pw / out.width, ph / out.height);
        const w = out.width * k, h = out.height * k;
        doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        onProgress?.((i + 1) / items.length);
    }
    doc.setTitle('Tarama');
    return doc.save();
}
