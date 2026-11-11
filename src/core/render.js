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

export async function renderPageToCanvas(bytes, pageIndex, scale, background = '#fff') {
    const doc = await getPdfjsDoc(bytes);
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // 'print' amacı requestAnimationFrame kullanmaz: sekme arka plandayken de tamamlanır
    await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
    return canvas;
}

export { pdfjsLib };
