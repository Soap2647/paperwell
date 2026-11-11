// OCR: taranmış sayfaları aranabilir ya da düzenlenebilir hale getirir (Tesseract.js, tamamen yerel).
import {
    PDFDocument, pushGraphicsState, popGraphicsState, beginText, endText, setFontAndSize,
    setTextRenderingMode, TextRenderingMode, setTextMatrix, setCharacterSqueeze, showText, setFillingRgbColor,
} from 'pdf-lib';
import { createWorker, OEM } from 'tesseract.js';
import { pageGeometry } from './pdf/geometry';
import { pageBox, pageRotation } from './pdf/pageModel';
import { viewBoxToPdf } from './pdf/placement';
import { renderPageToCanvas } from './render';
import { embedFallbackFont } from './fonts';
import { inpaintTelea } from './inpaint/telea';

let workerPromise = null;
let workerLangs = '';

async function getWorker(langs, onProgress) {
    const key = langs.join('+');
    if (!workerPromise || workerLangs !== key) {
        if (workerPromise) (await workerPromise).terminate();
        workerLangs = key;
        workerPromise = createWorker(langs, OEM.LSTM_ONLY, {
            workerPath: '/tesseract/worker.min.js',
            corePath: '/tesseract/core',
            langPath: '/tesseract/lang',
            gzip: true,
            logger: (m) => {
                if (m.status === 'recognizing text') workerProgress?.(m.progress);
                else if (/loading|initializ/.test(m.status)) onProgress?.(m.progress, 'load');
            },
        }).catch((e) => { workerPromise = null; throw e; });
    }
    return workerPromise;
}
let workerProgress = null;

/**
 * Sayfayı tanır. Dönen satırlar görünüm uzayında (ölçek 1).
 * @returns {Promise<{lines: Array<{text, x, y, w, h, baseline, words}>, canvas, scale}>}
 */
export async function recognizePage(bytes, pageIndex, { langs = ['tur', 'eng'], onProgress } = {}) {
    const worker = await getWorker(langs, onProgress);
    // ~300 DPI, ama çok büyük sayfalarda piksel bütçesini aşma
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const page = doc.getPage(pageIndex);
    const geom = pageGeometry(pageBox(page), pageRotation(page));
    const scale = Math.min(300 / 72, Math.sqrt(16e6 / (geom.width * geom.height)));
    const canvas = await renderPageToCanvas(bytes, pageIndex, scale, '#fff');
    workerProgress = (p) => onProgress?.(p, 'recognize');
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    workerProgress = null;

    const lines = [];
    for (const block of data.blocks || []) {
        for (const para of block.paragraphs) {
            for (const line of para.lines) {
                const text = line.words.map((w) => w.text).join(' ').trim();
                if (!text || line.confidence < 35) continue;
                const b = line.bbox;
                lines.push({
                    text,
                    confidence: line.confidence,
                    x: b.x0 / scale,
                    y: b.y0 / scale,
                    w: (b.x1 - b.x0) / scale,
                    h: (b.y1 - b.y0) / scale,
                    baseline: (line.baseline.y0 + line.baseline.y1) / 2 / scale,
                    words: line.words.map((w) => ({ text: w.text, x: w.bbox.x0 / scale, y: w.bbox.y0 / scale, w: (w.bbox.x1 - w.bbox.x0) / scale, h: (w.bbox.y1 - w.bbox.y0) / scale })),
                });
            }
        }
    }
    return { lines, canvas, scale, geom };
}

/** Tek satırlık bir kesiti tanır (PSM 7). Görsel katmanlarda Türkçe harfleri doğrulamak için. */
export async function recognizeLine(canvas, langs = ['tur', 'eng']) {
    const worker = await getWorker(langs);
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    try {
        const { data } = await worker.recognize(canvas);
        return { text: data.text.trim(), conf: data.confidence / 100 };
    } finally {
        await worker.setParameters({ tessedit_pageseg_mode: '3' });
    }
}

/** Satır yüksekliğinden yazı boyutunu tahmin eder (büyük harf/çıkıntı yüksekliği ≈ 0,72 em) */
function estimateSize(line) {
    const asc = Math.max(1, line.baseline - line.y);
    return Math.max(4, Math.min(line.h * 1.1, asc / 0.72));
}

/** Mürekkep piksellerinin ortanca rengini bulur */
function inkColor(ctx, scale, line) {
    const x = Math.round(line.x * scale), y = Math.round(line.y * scale);
    const w = Math.max(1, Math.round(line.w * scale)), h = Math.max(1, Math.round(line.h * scale));
    const d = ctx.getImageData(x, y, w, h).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4 * 3) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        px.push([lum, d[i], d[i + 1], d[i + 2]]);
    }
    px.sort((a, b) => a[0] - b[0]);
    const dark = px.slice(0, Math.max(1, Math.floor(px.length * 0.08)));
    const mid = dark[Math.floor(dark.length / 2)];
    return [mid[1] / 255, mid[2] / 255, mid[3] / 255];
}

function drawLine(page, geom, fontKey, font, line, { invisible, color }) {
    const size = estimateSize(line);
    const natural = font.widthOfTextAtSize(line.text, size);
    const squeeze = natural > 0 ? Math.max(40, Math.min(250, (line.w / natural) * 100)) : 100;
    const [px, py] = geom.pdfPoint(line.x, line.baseline);
    const r = (geom.rotate * Math.PI) / 180;
    const cos = Math.cos(r), sin = Math.sin(r);
    page.pushOperators(
        pushGraphicsState(),
        beginText(),
        setFontAndSize(fontKey, size),
        setTextRenderingMode(invisible ? TextRenderingMode.Invisible : TextRenderingMode.Fill),
        setCharacterSqueeze(squeeze),
        ...(invisible ? [] : [setFillingRgbColor(...color)]),
        setTextMatrix(cos, sin, -sin, cos, px, py),
        showText(font.encodeText(line.text)),
        endText(),
        popGraphicsState(),
    );
}

/**
 * @param {'searchable'|'editable'} mode
 *   searchable: görünüm aynı kalır, görünmez metin katmanı eklenir
 *   editable: taranmış yazı silinir, yerine gerçek (düzenlenebilir) metin yazılır
 */
export async function ocrPages(bytes, pageIndices, { mode = 'searchable', langs, onProgress } = {}) {
    let current = bytes;
    let totalLines = 0;
    for (let k = 0; k < pageIndices.length; k++) {
        const pageIndex = pageIndices[k];
        const base = k / pageIndices.length;
        const span = 1 / pageIndices.length;
        const res = await recognizePage(current, pageIndex, {
            langs,
            onProgress: (p, stage) => onProgress?.(stage === 'load' ? 0 : base + span * 0.85 * p, stage, pageIndex),
        });
        if (!res.lines.length) continue;
        totalLines += res.lines.length;

        const doc = await PDFDocument.load(current, { updateMetadata: false });
        const page = doc.getPage(pageIndex);
        const font = await embedFallbackFont(doc, 'sans', false, false);
        const fontKey = page.node.newFontDictionary(font.name, font.ref);

        if (mode === 'editable') {
            // Yazı piksellerini sil (Telea ile onar) ve tek bir yama olarak göm
            const { canvas, scale } = res;
            const W = canvas.width, H = canvas.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const colors = res.lines.map((l) => inkColor(ctx, scale, l));
            const img = ctx.getImageData(0, 0, W, H);
            const mask = new Uint8Array(W * H);
            for (const l of res.lines) {
                for (const w of l.words) {
                    const x0 = Math.max(0, Math.floor(w.x * scale) - 2), y0 = Math.max(0, Math.floor(w.y * scale) - 2);
                    const x1 = Math.min(W, Math.ceil((w.x + w.w) * scale) + 2), y1 = Math.min(H, Math.ceil((w.y + w.h) * scale) + 2);
                    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1;
                }
            }
            inpaintTelea(img.data, mask, W, H, 5);
            for (let i = 0; i < W * H; i++) img.data[i * 4 + 3] = mask[i] ? 255 : 0;
            ctx.putImageData(img, 0, 0);
            const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
            const png = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
            page.drawImage(png, viewBoxToPdf(res.geom, { x: 0, y: 0, w: res.geom.width, h: res.geom.height }));
            res.lines.forEach((l, i) => drawLine(page, res.geom, fontKey, font, l, { invisible: false, color: colors[i] }));
        } else {
            res.lines.forEach((l) => drawLine(page, res.geom, fontKey, font, l, { invisible: true }));
        }
        current = await doc.save();
        onProgress?.(base + span, 'done', pageIndex);
    }
    return { bytes: current, lines: totalLines };
}

