// Akıllı silgi: fırçayla boyanan alanı belgeden siler.
// 1) Maske altındaki metin glifleri içerik akışından gerçekten kaldırılır.
// 2) Bölge render edilip onarılır (Telea ya da MI-GAN), sonuç yama olarak sayfaya gömülür.
import { PDFDocument } from 'pdf-lib';
import { removeContent } from './pdf/editOps';
import { pageGeometry } from './pdf/geometry';
import { pageBox, pageRotation } from './pdf/pageModel';
import { viewBoxToPdf } from './pdf/placement';
import { renderRegion } from './render';
import { inpaintTelea } from './inpaint/telea';
import { inpaintMigan } from './inpaint/migan';

/**
 * @param {Object} p
 * @param {Uint8Array} p.bytes
 * @param {number} p.pageIndex
 * @param {HTMLCanvasElement} p.mask - görünüm uzayında, ölçek p.maskScale; alfa>0 = silinecek
 * @param {number} p.maskScale
 * @param {'fast'|'ai'} p.mode
 * @param {number} [p.grow] - maskeyi ek olarak genişlet (görünüm birimi)
 * @param {(stage:string, progress?:number) => void} [p.onProgress]
 * @returns {Promise<Uint8Array|null>}
 */
export async function magicErase({ bytes, pageIndex, mask, maskScale, mode = 'fast', grow = 0, onProgress }) {
    const mctx = mask.getContext('2d', { willReadFrequently: true });
    const md = mctx.getImageData(0, 0, mask.width, mask.height).data;

    // Maske sınırları (görünüm uzayı)
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < mask.height; y++) {
        for (let x = 0; x < mask.width; x++) {
            if (md[(y * mask.width + x) * 4 + 3] > 10) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null;
    const maskAt = (vx, vy) => {
        const x = Math.round(vx * maskScale), y = Math.round(vy * maskScale);
        if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
        return md[(y * mask.width + x) * 4 + 3] > 10;
    };

    onProgress?.('text');
    // 1) Metni gerçekten sil
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const page = doc.getPage(pageIndex);
    const geom = pageGeometry(pageBox(page), pageRotation(page));
    removeContent(doc, pageIndex, (g) => {
        const [cx, cy] = geom.viewPoint((g.box.x0 + g.box.x1) / 2, (g.box.y0 + g.box.y1) / 2);
        return maskAt(cx, cy);
    });
    const cleaned = await doc.save();

    // 2) Bölgeyi render et (kenarlardan bağlam payı ile)
    const vx0 = minX / maskScale, vy0 = minY / maskScale, vx1 = (maxX + 1) / maskScale, vy1 = (maxY + 1) / maskScale;
    const pad = Math.max(12, Math.max(vx1 - vx0, vy1 - vy0) * (mode === 'ai' ? 0.6 : 0.15)) + grow;
    const rect = {
        x: Math.max(0, vx0 - pad),
        y: Math.max(0, vy0 - pad),
    };
    rect.w = Math.min(geom.width, vx1 + pad) - rect.x;
    rect.h = Math.min(geom.height, vy1 + pad) - rect.y;

    // Çözünürlük: belge netliği için ≥2x, ama piksel bütçesini aşma
    const budget = mode === 'ai' ? 1.5e6 : 0.9e6;
    const scale = Math.max(1, Math.min(3, Math.sqrt(budget / (rect.w * rect.h))));
    onProgress?.('render');
    const canvas = await renderRegion(cleaned, pageIndex, rect, scale);
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, W, H);

    // Bölge çözünürlüğünde maske (+2 px genişletme: kenar halesi kalmasın)
    const hole = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (maskAt(rect.x + (x + 0.5) / scale, rect.y + (y + 0.5) / scale)) hole[y * W + x] = 1;
        }
    }
    const grown = dilate(hole, W, H, Math.max(2, Math.round(scale * 1.5)) + Math.round(grow * scale));

    onProgress?.('inpaint', 0);
    if (mode === 'ai') {
        await inpaintMigan(img.data, grown, W, H, (p) => onProgress?.('model', p));
    } else {
        // Telea küçük yarıçapla en iyi; çok büyük alanlarda hız için ölçek düşür
        inpaintTelea(img.data, grown, W, H, Math.max(4, Math.round(scale * 3)));
    }

    // 3) Yama: yalnız maskeli pikseller opak, kenarlar yumuşak
    const soft = feather(grown, W, H, Math.max(1, Math.round(scale)));
    for (let i = 0; i < W * H; i++) img.data[i * 4 + 3] = soft[i];
    ctx.putImageData(img, 0, 0);
    const png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const pngBytes = new Uint8Array(await png.arrayBuffer());

    onProgress?.('embed');
    const doc2 = await PDFDocument.load(cleaned, { updateMetadata: false });
    const page2 = doc2.getPage(pageIndex);
    const embedded = await doc2.embedPng(pngBytes);
    page2.drawImage(embedded, viewBoxToPdf(geom, rect));
    return await doc2.save();
}

function dilate(mask, w, h, r) {
    const out = new Uint8Array(mask);
    // ayrılabilir kare genişletme
    const tmp = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        let last = -1e9;
        for (let x = 0; x < w; x++) { if (mask[y * w + x]) last = x; if (x - last <= r) tmp[y * w + x] = 1; }
        last = 1e9;
        for (let x = w - 1; x >= 0; x--) { if (mask[y * w + x]) last = x; if (last - x <= r) tmp[y * w + x] = 1; }
    }
    for (let x = 0; x < w; x++) {
        let last = -1e9;
        for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 1; }
        last = 1e9;
        for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 1; }
    }
    return out;
}

/** Maskeden yumuşak kenarlı alfa kanalı (0-255) üretir */
function feather(mask, w, h, r) {
    const a = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = mask[i] ? 255 : 0;
    // basit kutu bulanıklığı, yalnız kenarları yumuşatır
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let s = 0, n = 0;
            for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } }
            tmp[y * w + x] = s / n;
        }
    }
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let s = 0, n = 0;
            for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } }
            // içerisi tamamen opak kalsın
            out[y * w + x] = mask[y * w + x] ? 255 : s / n;
        }
    }
    return out;
}
