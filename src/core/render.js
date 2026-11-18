// pdf.js ile belge yükleme/render yardımcıları (tarayıcı).
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const docCache = new WeakMap(); // Uint8Array → Promise<PDFDocumentProxy>

/** Aynı bayt dizisi için tek pdf.js belgesi döndürür */
export function getPdfjsDoc(bytes) {
    if (!docCache.has(bytes)) {
        const task = pdfjsLib.getDocument({
            data: bytes.slice(), // pdf.js tamponu worker'a aktarır; orijinali koru
            standardFontDataUrl: '/standard_fonts/',
            cMapUrl: '/cmaps/',
            cMapPacked: true,
            isEvalSupported: false,
        });
        docCache.set(bytes, task.promise);
    }
    return docCache.get(bytes);
}

export function releasePdfjsDoc(bytes) {
    const p = docCache.get(bytes);
    if (p) {
        docCache.delete(bytes);
        p.then((d) => d.destroy()).catch(() => {});
    }
}

/**
 * Sayfanın görünüm uzayındaki bir bölgesini render eder.
 * @param {{x:number,y:number,w:number,h:number}} rect - ölçek 1 görünüm koordinatları
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderRegion(bytes, pageIndex, rect, scale) {
    const doc = await getPdfjsDoc(bytes);
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale, offsetX: -rect.x * scale, offsetY: -rect.y * scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.w * scale));
    canvas.height = Math.max(1, Math.round(rect.h * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 'print' amacı requestAnimationFrame kullanmaz: sekme arka plandayken de tamamlanır
    await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
    return canvas;
}

/** background: renk, null (pdf.js varsayılanı: beyaz) ya da 'transparent' (alfa korunur) */
export async function renderPageToCanvas(bytes, pageIndex, scale, background = '#fff') {
    const doc = await getPdfjsDoc(bytes);
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (background && background !== 'transparent') {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // 'print' amacı requestAnimationFrame kullanmaz: sekme arka plandayken de tamamlanır
    const transparent = background === 'transparent' ? { background: 'rgba(0,0,0,0)' } : {};
    await page.render({ canvasContext: ctx, viewport, intent: 'print', ...transparent }).promise;
    return canvas;
}

/**
 * Kaydetmek için net render: sayfa 2 kat büyük çizilip yüksek kaliteyle küçültülür (süper örnekleme).
 * pdf.js büyük görselleri (logolar) küçültürken tırtıklı bırakıyor; bu yol kenarları yumuşak ve keskin tutar.
 * Çıktı boyutu renderPageToCanvas(bytes, pageIndex, scale) ile aynıdır.
 */
export async function renderPageSharp(bytes, pageIndex, scale, background = '#fff') {
    const doc = await getPdfjsDoc(bytes);
    const vp = (await doc.getPage(pageIndex + 1)).getViewport({ scale });
    const w = Math.round(vp.width), h = Math.round(vp.height);
    const ss = Math.min(2, Math.sqrt(48e6 / (w * h)));
    if (ss < 1.3) return renderPageToCanvas(bytes, pageIndex, scale, background);
    const big = await renderPageToCanvas(bytes, pageIndex, scale * ss, background);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(big, 0, 0, w, h);
    big.width = big.height = 0;
    return out;
}

export { pdfjsLib };
