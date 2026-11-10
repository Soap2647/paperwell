import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { preparePdfData } from './pdfHelper';
import { getPageImageRects } from './pdfContentExtractor';

// PDF.js worker setup - yerel dosya kullan
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * PDF'deki görselleri tespit eder
 * @param {Uint8Array|ArrayBuffer} pdfData - PDF dosyası
 * @returns {Promise<Array>} Tespit edilen görseller
 */
export async function detectImages(pdfData) {
    const safeData = preparePdfData(pdfData);
    const pdf = await pdfjsLib.getDocument({ data: safeData }).promise;
    const images = [];

    try {
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1 });
            const rects = await getPageImageRects(page);

            for (const r of rects) {
                images.push({
                    id: `page${pageNum}_img${images.length}`,
                    pageNum,
                    // Görüntüleme koordinatları (sol-üst orijin)
                    x: r.x,
                    y: viewport.height - r.y - r.height,
                    width: r.width,
                    height: r.height,
                    // pdf-lib koordinatları (sol-alt orijin)
                    pdfLibCoords: { ...r },
                });
            }
        }
    } finally {
        pdf.destroy();
    }

    return images;
}

/**
 * PDF'den belirtilen görselleri siler (üzerini örterek)
 * @param {Uint8Array|ArrayBuffer} pdfData - Orijinal PDF
 * @param {Array} imagesToRemove - Silinecek görsellerin koordinatları
 * @param {Object} options - Seçenekler
 * @returns {Promise<Uint8Array>} Düzenlenmiş PDF
 */
export async function removeImages(pdfData, imagesToRemove, options = {}) {
    const {
        fillColor = { r: 1, g: 1, b: 1 }, // Default: white
        addBorder = false,
    } = options;

    const safeData = preparePdfData(pdfData);
    const pdfDoc = await PDFDocument.load(safeData);
    const pages = pdfDoc.getPages();

    for (const img of imagesToRemove) {
        const pageIndex = img.pageNum - 1;
        if (pageIndex < 0 || pageIndex >= pages.length) continue;

        const page = pages[pageIndex];
        const { x, y, width, height } = img.pdfLibCoords;

        // Draw a rectangle over the image to "remove" it
        page.drawRectangle({
            x,
            y,
            width,
            height,
            color: rgb(fillColor.r, fillColor.g, fillColor.b),
            borderWidth: addBorder ? 1 : 0,
            borderColor: addBorder ? rgb(0.8, 0.8, 0.8) : undefined,
        });
    }

    return await pdfDoc.save();
}

/**
 * PDF'deki tüm görselleri siler
 * @param {ArrayBuffer} pdfData - Orijinal PDF
 * @param {Object} options - Seçenekler
 * @returns {Promise<Uint8Array>} Düzenlenmiş PDF
 */
export async function removeAllImages(pdfData, options = {}) {
    const images = await detectImages(pdfData);
    return await removeImages(pdfData, images, options);
}

/**
 * Belirli bir sayfadaki görselleri siler
 * @param {ArrayBuffer} pdfData - Orijinal PDF  
 * @param {number} pageNum - Sayfa numarası (1-indexed)
 * @param {Object} options - Seçenekler
 * @returns {Promise<Uint8Array>} Düzenlenmiş PDF
 */
export async function removeImagesFromPage(pdfData, pageNum, options = {}) {
    const allImages = await detectImages(pdfData);
    const pageImages = allImages.filter(img => img.pageNum === pageNum);
    return await removeImages(pdfData, pageImages, options);
}

/**
 * Koordinat bazlı görsel silme - kullanıcının seçtiği alan
 * @param {Uint8Array|ArrayBuffer} pdfData - Orijinal PDF
 * @param {number} pageNum - Sayfa numarası
 * @param {Object} rect - {x, y, width, height} koordinatları
 * @param {Object} options - Seçenekler
 * @returns {Promise<Uint8Array>} Düzenlenmiş PDF
 */
export async function removeRegion(pdfData, pageNum, rect, options = {}) {
    const {
        fillColor = { r: 1, g: 1, b: 1 },
    } = options;

    const safeData = preparePdfData(pdfData);
    const pdfDoc = await PDFDocument.load(safeData);
    const pages = pdfDoc.getPages();
    const page = pages[pageNum - 1];

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
 * Belirtilen alana yeni bir görsel yerleştirerek eski görselin üstünü örter (Değiştirme İşlemi)
 * @param {Uint8Array|ArrayBuffer} pdfData - Orijinal PDF
 * @param {number} pageNum - Sayfa numarası
 * @param {Object} rect - Değiştirilecek görselin {x, y, width, height} koordinatları
 * @param {string} newImageDataUrl - Yeni görselin base64 Data URL formatı
 * @returns {Promise<Uint8Array>} Düzenlenmiş PDF
 */
export async function replaceImage(pdfData, pageNum, rect, newImageDataUrl) {
    const safeData = preparePdfData(pdfData);
    const pdfDoc = await PDFDocument.load(safeData);
    const pages = pdfDoc.getPages();
    const page = pages[pageNum - 1];

    if (!page) {
        throw new Error(`Sayfa ${pageNum} bulunamadı`);
    }

    // 1. Önce alanı beyazla (veya arka planla) maskele ki eski resmin kalıntıları görünmesin
    page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: rgb(1, 1, 1), // Şimdilik beyaz arka plan
    });

    // 2. Yeni resmi yerleştir
    let pdfImage;
    if (newImageDataUrl.includes('image/jpeg') || newImageDataUrl.includes('image/jpg')) {
        pdfImage = await pdfDoc.embedJpg(newImageDataUrl);
    } else if (newImageDataUrl.includes('image/png')) {
        pdfImage = await pdfDoc.embedPng(newImageDataUrl);
    } else {
        throw new Error('Sadece PNG ve JPG formatları desteklenir');
    }

    page.drawImage(pdfImage, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    });

    return await pdfDoc.save();
}
