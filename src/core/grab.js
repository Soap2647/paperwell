// Nesneyi katmana çıkar: SAM maskesindeki nesneyi şeffaf PNG olarak keser,
// arkasını akıllı silgi hattıyla (Telea / MI-GAN) doldurup sayfaya gömer.
import { renderPageToCanvas, renderRegion } from './render';
import { encodeImage, sampleLogit } from './segment';
import { magicErase } from './eraser';

const embeddings = new WeakMap(); // bayt sürümü → Map(sayfa → Promise)

/**
 * Sayfanın SAM kodlamasını (önbellekli) döndürür.
 * @returns {Promise<{emb: object, k: number}>} k: görünüm birimini kodlanan piksele çevirir; hazırsa .ready = true
 */
export function pageEmbedding(bytes, pageIndex, page, onProgress) {
    if (!embeddings.has(bytes)) embeddings.set(bytes, new Map());
    const m = embeddings.get(bytes);
    if (!m.has(pageIndex)) {
        const p = (async () => {
            const r = 1024 / Math.max(page.width, page.height);
            const canvas = await renderPageToCanvas(bytes, pageIndex, r);
            const emb = await encodeImage(canvas, onProgress);
            return { emb, k: r * emb.scale };
        })();
        p.then(() => { p.ready = true; }, () => m.delete(pageIndex));
        m.set(pageIndex, p);
    }
    return m.get(pageIndex);
}

/** Maskenin görünüm uzayındaki sınırları (logit > eşik) */
function maskBounds(mask, threshold) {
    const { logits, w, h, k } = mask;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (logits[y * w + x] > threshold) {
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        }
    }
    if (x1 < 0) return null;
    return { x: x0 / k, y: y0 / k, w: (x1 + 1 - x0) / k, h: (y1 + 1 - y0) / k };
}

/**
 * @param {object} p
 * @param {Uint8Array} p.bytes
 * @param {number} p.pageIndex
 * @param {{width:number,height:number}} p.page - görünüm boyutu
 * @param {{logits:Float32Array,w:number,h:number,k:number}} p.mask
 * @param {'fast'|'ai'} p.fill - arkayı doldurma yöntemi
 * @returns {Promise<{bytes: Uint8Array, obj: {x,y,w,h,src}}|null>}
 */
export async function grabObject({ bytes, pageIndex, page, mask, fill = 'ai', onProgress }) {
    const b = maskBounds(mask, -2);
    if (!b) return null;
    const pad = 2;
    const rect = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad) };
    rect.w = Math.min(page.width, b.x + b.w + pad) - rect.x;
    rect.h = Math.min(page.height, b.y + b.h + pad) - rect.y;

    // 1) Nesneyi yüksek çözünürlükte kes (yumuşak kenarlı alfa)
    onProgress?.('cut');
    const scale = Math.max(2, Math.min(4, Math.sqrt(2.5e6 / (rect.w * rect.h))));
    const canvas = await renderRegion(bytes, pageIndex, rect, scale);
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, W, H);
    let cx0 = W, cy0 = H, cx1 = -1, cy1 = -1;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const l = sampleLogit(mask, (rect.x + (x + 0.5) / scale) * mask.k, (rect.y + (y + 0.5) / scale) * mask.k);
            const a = 255 / (1 + Math.exp(-1.5 * l));
            img.data[(y * W + x) * 4 + 3] = a;
            if (a > 8) {
                if (x < cx0) cx0 = x; if (x > cx1) cx1 = x;
                if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
            }
        }
    }
    if (cx1 < 0) return null;
    ctx.putImageData(img, 0, 0);
    const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1;
    const crop = document.createElement('canvas');
    crop.width = cw; crop.height = ch;
    crop.getContext('2d').drawImage(canvas, cx0, cy0, cw, ch, 0, 0, cw, ch);
    const obj = { x: rect.x + cx0 / scale, y: rect.y + cy0 / scale, w: cw / scale, h: ch / scale, src: crop.toDataURL('image/png') };

    // 2) Arkasını doldur: görünüm uzayında (2x) silgi maskesi, kenar halesi kalmasın diye biraz geniş
    const MS = 2;
    const em = document.createElement('canvas');
    em.width = Math.round(page.width * MS);
    em.height = Math.round(page.height * MS);
    const ectx = em.getContext('2d');
    const ex0 = Math.floor(rect.x * MS), ey0 = Math.floor(rect.y * MS);
    const ew = Math.min(em.width - ex0, Math.ceil(rect.w * MS) + 1), eh = Math.min(em.height - ey0, Math.ceil(rect.h * MS) + 1);
    const ed = ectx.createImageData(ew, eh);
    for (let y = 0; y < eh; y++) {
        for (let x = 0; x < ew; x++) {
            const l = sampleLogit(mask, ((ex0 + x + 0.5) / MS) * mask.k, ((ey0 + y + 0.5) / MS) * mask.k);
            if (l > -2) ed.data[(y * ew + x) * 4 + 3] = 255;
        }
    }
    ectx.putImageData(ed, ex0, ey0);
    const erased = await magicErase({
        bytes, pageIndex, mask: em, maskScale: MS, mode: fill, grow: 1.5,
        onProgress: (stage, p) => onProgress?.(stage, p),
    });
    return { bytes: erased || bytes, obj };
}
