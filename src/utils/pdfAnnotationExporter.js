import { PDFDocument, rgb, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { renderAnnotationsToCanvas } from '../hooks/useAnnotations';
import { embedUnicodeFont } from './pdfFonts';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/**
 * Renders all annotation layers (paths, shapes, text) for every page
 * and embeds them into the PDF as image overlays using pdf-lib.
 *
 * @param {Uint8Array} pdfData - Original PDF bytes
 * @param {Object} allPageAnnotations - { [pageNum]: Annotation[] }
 * @param {Object} options
 * @param {number} options.renderScale - Scale for rendering (default: 2 for retina quality)
 * @returns {Promise<Uint8Array>} Modified PDF bytes
 */
export async function embedAnnotationsIntoPdf(pdfData, allPageAnnotations, options = {}) {
  const { renderScale = 2 } = options;

  // Check if there are any annotations to embed
  const hasAnnotations = Object.values(allPageAnnotations).some(arr => arr && arr.length > 0);
  if (!hasAnnotations) return pdfData;

  // Load source PDF with pdf-lib
  const safeData = pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
  const pdfDoc = await PDFDocument.load(safeData);
  const pages = pdfDoc.getPages();

  // Load with pdfjs for rendering
  const pdfSource = await pdfjsLib.getDocument({ data: safeData.slice() }).promise;

  for (let pageNum = 1; pageNum <= pdfSource.numPages; pageNum++) {
    const annotations = allPageAnnotations[pageNum];
    if (!annotations || annotations.length === 0) continue;

    const page = pages[pageNum - 1];
    if (!page) continue;

    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    // İmza gibi görseller doğrudan pdf-lib ile gömülür (canvas'a çizilmez)
    const imageShapes = annotations.filter(a => a.type === 'shape' && a.shapeType === 'image' && a.imageUrl);
    const drawable = annotations.filter(a => !(a.type === 'shape' && a.shapeType === 'image'));

    if (drawable.length > 0) {
      // Render page to canvas at high resolution
      const pdfPage = await pdfSource.getPage(pageNum);
      const viewport = pdfPage.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      // Transparent background (annotations only)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Annotations are stored in unscaled PDF point coords (normalized to scale=1)
      renderAnnotationsToCanvas(ctx, drawable, renderScale);

      const pngBytes = dataUrlToBytes(canvas.toDataURL('image/png'));
      const pngImage = await pdfDoc.embedPng(pngBytes);

      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight,
        opacity: 1,
      });
    }

    for (const shape of imageShapes) {
      const bytes = dataUrlToBytes(shape.imageUrl);
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      const image = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      page.drawImage(image, {
        x: shape.x,
        y: pdfHeight - shape.y - shape.h,
        width: shape.w,
        height: shape.h,
        opacity: shape.opacity ?? 1,
      });
    }
  }

  pdfSource.destroy();
  return await pdfDoc.save();
}

/**
 * Adds a text watermark to all pages of a PDF.
 */
export async function addWatermark(pdfData, watermark) {
  const {
    text = 'WATERMARK',
    fontSize = 48,
    color = { r: 0.7, g: 0.7, b: 0.7 },
    opacity = 0.3,
    angle = -45,
    position = 'center',
  } = watermark;

  const safeData = pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
  const pdfDoc = await PDFDocument.load(safeData);
  const pages = pdfDoc.getPages();

  const font = await embedUnicodeFont(pdfDoc, 'bold');
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize, { descender: false });
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Döndürülmüş metnin kapladığı kutu (konumlandırma için)
  const boxW = Math.abs(textWidth * cos) + Math.abs(textHeight * sin);
  const boxH = Math.abs(textWidth * sin) + Math.abs(textHeight * cos);
  const margin = 24;

  for (const page of pages) {
    const { width, height } = page.getSize();

    // Hedef merkez noktası
    let cx = width / 2;
    let cy = height / 2;
    if (position.includes('left')) cx = margin + boxW / 2;
    if (position.includes('right')) cx = width - margin - boxW / 2;
    if (position.includes('top')) cy = height - margin - boxH / 2;
    if (position.includes('bottom')) cy = margin + boxH / 2;

    // drawText sol-alt köşeden döndürür; metnin merkezini hedefe oturt
    const x = cx - (textWidth / 2) * cos + (textHeight / 2) * sin;
    const y = cy - (textWidth / 2) * sin - (textHeight / 2) * cos;

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity,
      rotate: degrees(angle),
    });
  }

  return await pdfDoc.save();
}

/**
 * Adds page numbers to all pages.
 */
export async function addPageNumbers(pdfData, options = {}) {
  const {
    position = 'bottom-center',
    format = '{page}',
    fontSize = 11,
    color = { r: 0, g: 0, b: 0 },
    margin = 20,
  } = options;

  const safeData = pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
  const pdfDoc = await PDFDocument.load(safeData);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  const font = await embedUnicodeFont(pdfDoc, 'regular');

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const pageNum = i + 1;
    const text = format
      .replace('{page}', pageNum)
      .replace('{total}', totalPages);

    const textWidth = font.widthOfTextAtSize(text, fontSize);

    let x, y;
    const [vPos, hPos] = position.split('-');

    y = vPos === 'top' ? height - margin - fontSize : margin;
    x = hPos === 'left' ? margin
      : hPos === 'right' ? width - textWidth - margin
        : (width - textWidth) / 2;

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
    });
  }

  return await pdfDoc.save();
}

/**
 * Compresses a PDF by re-rendering pages as JPEG images.
 * quality: 'low'(0.4) | 'medium'(0.7) | 'high'(0.9)
 */
export async function compressPdf(pdfData, quality = 'medium') {
  const qualityMap = { low: 0.4, medium: 0.7, high: 0.9 };
  const jpegQuality = qualityMap[quality] ?? 0.7;
  const renderScale = quality === 'low' ? 1 : quality === 'medium' ? 1.2 : 1.5;

  const safeData = pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
  const pdfSource = await pdfjsLib.getDocument({ data: safeData.slice() }).promise;
  const newPdfDoc = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= pdfSource.numPages; pageNum++) {
    const pdfPage = await pdfSource.getPage(pageNum);
    const viewport = pdfPage.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await pdfPage.render({ canvasContext: ctx, viewport }).promise;

    const jpegDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    const base64 = jpegDataUrl.split(',')[1];
    const jpegBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const jpegImage = await newPdfDoc.embedJpg(jpegBytes);

    const page = newPdfDoc.addPage([viewport.width / renderScale, viewport.height / renderScale]);
    page.drawImage(jpegImage, {
      x: 0,
      y: 0,
      width: viewport.width / renderScale,
      height: viewport.height / renderScale,
    });
  }

  return await newPdfDoc.save();
}

/**
 * Merges multiple PDFs into one.
 * @param {Uint8Array[]} pdfDataArray
 */
export async function mergePdfs(pdfDataArray) {
  const mergedDoc = await PDFDocument.create();

  for (const pdfData of pdfDataArray) {
    const safeData = pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
    const doc = await PDFDocument.load(safeData);
    const pageIndices = doc.getPageIndices();
    const copiedPages = await mergedDoc.copyPages(doc, pageIndices);
    copiedPages.forEach(page => mergedDoc.addPage(page));
  }

  return await mergedDoc.save();
}

/**
 * Splits a PDF into multiple PDFs by page ranges.
 * @param {Uint8Array} pdfData
 * @param {Array<{start: number, end: number}>} ranges - 1-indexed
 * @returns {Promise<Uint8Array[]>}
 */
export async function splitPdf(pdfData, ranges) {
  const safeData = pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
  const sourceDoc = await PDFDocument.load(safeData);
  const results = [];

  for (const range of ranges) {
    const newDoc = await PDFDocument.create();
    const indices = [];
    for (let i = range.start - 1; i < range.end; i++) {
      if (i >= 0 && i < sourceDoc.getPageCount()) {
        indices.push(i);
      }
    }
    const copiedPages = await newDoc.copyPages(sourceDoc, indices);
    copiedPages.forEach(page => newDoc.addPage(page));
    results.push(await newDoc.save());
  }

  return results;
}

/**
 * Embeds an image (PNG/JPG bytes) as a signature onto a specific page.
 */
export async function embedSignature(pdfData, pageNum, signatureImageBytes, rect) {
  const safeData = pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
  const pdfDoc = await PDFDocument.load(safeData);
  const pages = pdfDoc.getPages();
  const page = pages[pageNum - 1];
  if (!page) throw new Error(`Page ${pageNum} not found`);

  let image;
  // Detect PNG vs JPEG by magic bytes
  const header = signatureImageBytes.slice(0, 4);
  const isPng = header[0] === 0x89 && header[1] === 0x50;
  if (isPng) {
    image = await pdfDoc.embedPng(signatureImageBytes);
  } else {
    image = await pdfDoc.embedJpg(signatureImageBytes);
  }

  const { width: pdfW, height: pdfH } = page.getSize();
  page.drawImage(image, {
    x: rect.x,
    y: pdfH - rect.y - rect.height,
    width: rect.width,
    height: rect.height,
    opacity: 1,
  });

  return await pdfDoc.save();
}

/**
 * Redraws content-erase (redaction) regions with a solid color.
 */
export async function redactRegions(pdfData, redactions) {
  // redactions: [{ pageNum, x, y, width, height, color }]
  const safeData = pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
  const pdfDoc = await PDFDocument.load(safeData);
  const pages = pdfDoc.getPages();

  for (const r of redactions) {
    const page = pages[r.pageNum - 1];
    if (!page) continue;

    const fillColor = r.color || { r: 0, g: 0, b: 0 };
    page.drawRectangle({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      color: rgb(fillColor.r, fillColor.g, fillColor.b),
    });
  }

  return await pdfDoc.save();
}
