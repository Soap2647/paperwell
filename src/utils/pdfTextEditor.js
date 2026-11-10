import { PDFDocument, rgb } from 'pdf-lib';
import { preparePdfData } from './pdfHelper';
import { embedUnicodeFont, fontVariantFromName } from './pdfFonts';

/**
 * PDF üzerine metin ekler
 * @param {ArrayBuffer} pdfData - PDF dosyası
 * @param {number} pageNum - Sayfa numarası (1-indexed)
 * @param {string} text - Eklenecek metin (çok satırlı olabilir)
 * @param {Object} position - {x, y} koordinatları (ilk satırın baseline'ı)
 * @param {Object} options - Stil seçenekleri
 * @returns {Promise<Uint8Array>} Düzenlenmiş PDF
 */
export async function addText(pdfData, pageNum, text, position, options = {}) {
    const {
        fontSize = 12,
        color = { r: 0, g: 0, b: 0 },
        fontFamily = '',
    } = options;

    const safeData = preparePdfData(pdfData);
    const pdfDoc = await PDFDocument.load(safeData);
    const page = pdfDoc.getPages()[pageNum - 1];

    if (!page) {
        throw new Error(`Sayfa ${pageNum} bulunamadı`);
    }

    const font = await embedUnicodeFont(pdfDoc, fontVariantFromName(fontFamily));

    page.drawText(text, {
        x: position.x,
        y: position.y,
        size: fontSize,
        lineHeight: fontSize * 1.2,
        font,
        color: rgb(color.r, color.g, color.b),
    });

    return await pdfDoc.save();
}

/**
 * PDF'deki belirli bir alanı maskeler (metin silme için)
 */
export async function maskArea(pdfData, pageNum, rect, options = {}) {
    const {
        fillColor = { r: 1, g: 1, b: 1 }, // Varsayılan beyaz
    } = options;

    const safeData = preparePdfData(pdfData);
    const pdfDoc = await PDFDocument.load(safeData);
    const page = pdfDoc.getPages()[pageNum - 1];

    if (!page) {
        throw new Error(`Sayfa ${pageNum} bulunamadı`);
    }

    page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: rgb(fillColor.r, fillColor.g, fillColor.b),
    });

    return await pdfDoc.save();
}

/**
 * Metni maskeler ve yerine yeni metin yazar
 * @param {ArrayBuffer} pdfData - PDF dosyası
 * @param {number} pageNum - Sayfa numarası
 * @param {Object} rect - Maskelenecek alan {x, y, width, height, baselineY?}
 * @param {string} newText - Yeni metin
 * @param {Object} options - Seçenekler
 * @returns {Promise<Uint8Array>} Düzenlenmiş PDF
 */
export async function replaceText(pdfData, pageNum, rect, newText, options = {}) {
    const {
        fontSize = 12,
        textColor = { r: 0, g: 0, b: 0 },
        backgroundColor = { r: 1, g: 1, b: 1 },
        fontFamily = '',
        padding = 1,
    } = options;

    const safeData = preparePdfData(pdfData);
    const pdfDoc = await PDFDocument.load(safeData);
    const page = pdfDoc.getPages()[pageNum - 1];

    if (!page) {
        throw new Error(`Sayfa ${pageNum} bulunamadı`);
    }

    const font = await embedUnicodeFont(pdfDoc, fontVariantFromName(fontFamily));

    // Önce alanı maskele
    page.drawRectangle({
        x: rect.x - padding,
        y: rect.y - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        color: rgb(backgroundColor.r, backgroundColor.g, backgroundColor.b),
    });

    // Yeni metni orijinal satırın baseline'ına yaz
    if (newText) {
        page.drawText(newText, {
            x: rect.x,
            y: rect.baselineY ?? rect.y + rect.height * 0.2,
            size: fontSize,
            font,
            color: rgb(textColor.r, textColor.g, textColor.b),
        });
    }

    return await pdfDoc.save();
}
