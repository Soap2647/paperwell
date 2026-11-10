// Belge araçları: filigran, sayfa numarası, sıkıştırma, bölme, birleştirme, görsel/Word dışa aktarma.
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun, PageBreak } from 'docx';
import { embedFallbackFont } from './fonts';
import { getPdfjsDoc, renderPageToCanvas } from './render';
import { getPageModel } from './modelCache';
import { hexToRgb01 } from './export';

const load = (bytes) => PDFDocument.load(bytes, { updateMetadata: false });

export async function addWatermark(bytes, { text, size = 60, opacity = 0.2, angle = 45, color = '#9ca3af', position = 'center', family = 'sans', bold = true, pages = 'all', current = 0 }) {
    const doc = await load(bytes);
    const font = await embedFallbackFont(doc, family, bold, false);
    const tw = font.widthOfTextAtSize(text, size);
    const th = font.heightAtSize(size, { descender: false });
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const boxW = Math.abs(tw * cos) + Math.abs(th * sin);
    const boxH = Math.abs(tw * sin) + Math.abs(th * cos);
    const margin = 36;
    doc.getPages().forEach((page, i) => {
        if (pages === 'current' && i !== current) return;
        const { width, height } = page.getSize();
        const { x: ox, y: oy } = page.getMediaBox();
        let cx = ox + width / 2, cy = oy + height / 2;
        if (position.includes('left')) cx = ox + margin + boxW / 2;
        if (position.includes('right')) cx = ox + width - margin - boxW / 2;
        if (position.includes('top')) cy = oy + height - margin - boxH / 2;
        if (position.includes('bottom')) cy = oy + margin + boxH / 2;
        // Sayfa döndürülmüşse filigran da görünümde aynı açıda dursun
        const rot = page.getRotation().angle || 0;
        const a = angle + rot;
        const ar = (a * Math.PI) / 180;
        page.drawText(text, {
            x: cx - (tw / 2) * Math.cos(ar) + (th / 2) * Math.sin(ar),
            y: cy - (tw / 2) * Math.sin(ar) - (th / 2) * Math.cos(ar),
            size, font, opacity,
            color: rgb(...hexToRgb01(color)),
            rotate: degrees(a),
        });
    });
    return doc.save();
}

export async function addPageNumbers(bytes, { format = '{n}', position = 'bottom-center', size = 10, start = 1, margin = 28, color = '#374151', skipFirst = false }) {
    const doc = await load(bytes);
    const font = await embedFallbackFont(doc, 'sans', false, false);
    const pages = doc.getPages();
    const total = pages.length;
    pages.forEach((page, i) => {
        if (skipFirst && i === 0) return;
        const label = format.replace('{n}', String(start + i)).replace('{total}', String(total + start - 1));
        const { width, height } = page.getSize();
        const { x: ox, y: oy } = page.getMediaBox();
        const tw = font.widthOfTextAtSize(label, size);
        const [v, h] = position.split('-');
        const x = h === 'left' ? ox + margin : h === 'right' ? ox + width - margin - tw : ox + (width - tw) / 2;
        const y = v === 'top' ? oy + height - margin - size : oy + margin;
        page.drawText(label, { x, y, size, font, color: rgb(...hexToRgb01(color)) });
    });
    return doc.save();
}

/** Sayfaları JPEG olarak yeniden oluşturarak sıkıştırır */
export async function compressPdf(bytes, quality = 'medium', onProgress) {
    const q = { low: [0.45, 1.1], medium: [0.65, 1.5], high: [0.82, 2] }[quality] || [0.65, 1.5];
    const pdf = await getPdfjsDoc(bytes);
    const out = await PDFDocument.create();
    for (let i = 0; i < pdf.numPages; i++) {
        onProgress?.(i / pdf.numPages);
        const page = await pdf.getPage(i + 1);
        const vp1 = page.getViewport({ scale: 1 });
        const canvas = await renderPageToCanvas(bytes, i, q[1]);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q[0]));
        const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const p = out.addPage([vp1.width, vp1.height]);
        p.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
    }
    return out.save();
}

/** "1-3, 5, 8-" gibi aralıkları ayrıştırır (1 tabanlı) */
export function parseRanges(input, max) {
    const ranges = [];
    for (const part of input.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
        const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
        let a, b;
        if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : max; } else { a = b = +part; }
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > max || a > b) throw new Error(`Geçersiz aralık: ${part}`);
        ranges.push([a, b]);
    }
    if (!ranges.length) throw new Error('En az bir aralık girin');
    return ranges;
}

export async function splitToZip(bytes, ranges, baseName) {
    const src = await load(bytes);
    const zip = new JSZip();
    for (const [a, b] of ranges) {
        const d = await PDFDocument.create();
        const copied = await d.copyPages(src, Array.from({ length: b - a + 1 }, (_, k) => a - 1 + k));
        copied.forEach((p) => d.addPage(p));
        zip.file(`${baseName}_${a === b ? a : `${a}-${b}`}.pdf`, await d.save());
    }
    return zip.generateAsync({ type: 'blob' });
}

export async function mergeFiles(list) {
    const out = await PDFDocument.create();
    for (const bytes of list) {
        const d = await load(bytes);
        const pages = await out.copyPages(d, d.getPageIndices());
        pages.forEach((p) => out.addPage(p));
    }
    return out.save();
}

export async function exportImages(bytes, pageIndices, { format = 'png', scale = 2, baseName = 'sayfa' }, onProgress) {
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const blobs = [];
    for (let k = 0; k < pageIndices.length; k++) {
        onProgress?.(k / pageIndices.length);
        const canvas = await renderPageToCanvas(bytes, pageIndices[k], scale, format === 'jpg' ? '#fff' : null);
        blobs.push(await new Promise((r) => canvas.toBlob(r, mime, 0.92)));
    }
    if (blobs.length === 1) return { blob: blobs[0], name: `${baseName}-${pageIndices[0] + 1}.${format}` };
    const zip = new JSZip();
    blobs.forEach((b, k) => zip.file(`${baseName}-${String(pageIndices[k] + 1).padStart(3, '0')}.${format}`, b));
    return { blob: await zip.generateAsync({ type: 'blob' }), name: `${baseName}-gorseller.zip` };
}

/** Metin satırlarını yazı tipi, boyut, kalın/italik ve renkleriyle Word'e aktarır */
export async function exportDocx(bytes, pageCount, onProgress) {
    const children = [];
    for (let i = 0; i < pageCount; i++) {
        onProgress?.(i / pageCount);
        const model = await getPageModel(bytes, i);
        if (!model) continue;
        // Görünüm sırasına göre (yukarıdan aşağı, soldan sağa) sırala
        const lines = model.lines
            .filter((l) => !l.invisible)
            .map((l) => ({ l, y: model.geom.viewPoint(l.origin[0], l.origin[1]) }))
            .sort((a, b) => (Math.abs(a.y[1] - b.y[1]) < 3 ? a.y[0] - b.y[0] : a.y[1] - b.y[1]));
        let lastY = null;
        for (const { l, y } of lines) {
            const gap = lastY === null ? 0 : y[1] - lastY;
            const hex = l.color.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
            children.push(new Paragraph({
                spacing: { before: gap > l.fontSize * 1.8 ? 160 : 0, after: 0 },
                children: [new TextRun({
                    text: l.text,
                    bold: l.font.bold,
                    italics: l.font.italic,
                    size: Math.max(12, Math.round(l.fontSize * 2)),
                    color: hex === '000000' ? undefined : hex,
                    font: l.font.displayName.replace(/(MT|PS)$/,'').replace(/-.*$/, ''),
                })],
            }));
            lastY = y[1];
        }
        if (i < pageCount - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    const doc = new Document({ sections: [{ children }] });
    return Packer.toBlob(doc);
}
