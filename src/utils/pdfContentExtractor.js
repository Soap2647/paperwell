import * as pdfjsLib from 'pdfjs-dist';
import { preparePdfData } from './pdfHelper';

// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * PDF sayfasındaki metin bloklarını koordinatlarıyla çıkarır
 * @param {Uint8Array|ArrayBuffer} pdfData - PDF dosyası
 * @param {number} pageNum - Sayfa numarası (1-indexed)
 * @param {number} scale - Görüntüleme ölçeği
 * @returns {Promise<Array>} Metin blokları [{id, text, x, y, width, height, fontSize}]
 */
export async function extractTextBlocks(pdfData, pageNum, scale = 1) {
    const safeData = preparePdfData(pdfData);
    const pdf = await pdfjsLib.getDocument({ data: safeData }).promise;
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale });
    
    const textBlocks = [];
    let blockId = 0;

    for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue;

        // Transform matrix: [scaleX, skewX, skewY, scaleY, translateX, translateY]
        const tx = item.transform;
        const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);

        // PDF koordinatlarını canvas koordinatlarına dönüştür
        // PDF'de Y ekseni alttan başlar, canvas'ta üstten
        const x = tx[4] * scale;
        const y = (viewport.height / scale - tx[5]) * scale - fontSize * scale;
        const width = item.width * scale;
        const height = fontSize * scale * 1.2; // Satır yüksekliği için biraz fazla

        // Handle colors if available in textContent styling
        let colorObj = { r: 0, g: 0, b: 0 }; // default black
        let fontFamily = 'Helvetica';

        if (item.fontName) {
            const fontObj = textContent.styles[item.fontName];
            if (fontObj) {
                fontFamily = fontObj.fontFamily || 'Helvetica';
            }
        }

        // Color extraction from pdf.js can be tricky via getTextContent
        // We will pass the item color directly if available (in newer pdf.js versions)
        if (item.color) {
            // item.color is usually [R, G, B] in 0-255 or rgb string
            if (Array.isArray(item.color)) {
                colorObj = { 
                    r: item.color[0] / 255 || 0, 
                    g: item.color[1] / 255 || 0, 
                    b: item.color[2] / 255 || 0 
                };
            }
        }

        textBlocks.push({
            id: `text_${pageNum}_${blockId++}`,
            text: item.str,
            x,
            y,
            width: Math.max(width, 20), // Minimum genişlik
            height: Math.max(height, 12), // Minimum yükseklik
            fontSize,
            fontFamily,
            color: colorObj,
            // PDF koordinatları (düzenleme için)
            pdfCoords: {
                x: tx[4],
                y: tx[5] - fontSize * 0.2,
                width: item.width,
                height: fontSize * 1.2,
                baselineY: tx[5],
            }
        });
    }

    // Yakın metinleri grupla (aynı satırdaki metinler)
    pdf.destroy();
    return groupNearbyTexts(textBlocks, scale);
}

/**
 * Yakın metinleri gruplar (aynı satırdaki kelimeler)
 */
function groupNearbyTexts(textBlocks, scale) {
    if (textBlocks.length === 0) return [];

    // Y koordinatına göre sırala
    const sorted = [...textBlocks].sort((a, b) => a.y - b.y);

    const groups = [];
    let currentGroup = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const last = currentGroup[currentGroup.length - 1];

        // Aynı satırda mı? (Y farkı küçük ve X yakın)
        const yDiff = Math.abs(current.y - last.y);
        const xGap = current.x - (last.x + last.width);

        if (yDiff < 5 * scale && xGap < 50 * scale && xGap > -10) {
            currentGroup.push(current);
        } else {
            // Grubu kaydet ve yeni grup başlat
            if (currentGroup.length > 0) {
                groups.push(mergeGroup(currentGroup));
            }
            currentGroup = [current];
        }
    }

    // Son grubu ekle
    if (currentGroup.length > 0) {
        groups.push(mergeGroup(currentGroup));
    }

    return groups;
}

/**
 * Bir gruptaki metinleri birleştirir
 */
function mergeGroup(items) {
    if (items.length === 1) return items[0];

    // X'e göre sırala
    items.sort((a, b) => a.x - b.x);

    const first = items[0];
    const last = items[items.length - 1];

    return {
        id: first.id + '_group',
        text: items.map(i => i.text).join(' '),
        x: first.x,
        y: Math.min(...items.map(i => i.y)),
        width: (last.x + last.width) - first.x,
        height: Math.max(...items.map(i => i.height)),
        fontSize: Math.max(...items.map(i => i.fontSize)),
        fontFamily: first.fontFamily || 'Helvetica',
        color: first.color || { r: 0, g: 0, b: 0 },
        pdfCoords: {
            x: first.pdfCoords.x,
            y: first.pdfCoords.y,
            width: (last.pdfCoords.x + last.pdfCoords.width) - first.pdfCoords.x,
            height: Math.max(...items.map(i => i.pdfCoords.height)),
            baselineY: first.pdfCoords.baselineY,
        },
        items: items, // Orijinal öğeleri sakla
    };
}

/**
 * İki PDF dönüşüm matrisini çarpar (m1 sonra m2 uygulanır gibi: m2 x m1)
 */
function multiplyMatrix(m1, m2) {
    return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
}

/**
 * Sayfadaki görsellerin PDF koordinatlarındaki sınırlarını bulur.
 * Operatör listesindeki save/restore/transform (cm) işlemleriyle
 * gerçek dönüşüm matrisini (CTM) takip eder.
 * @returns {Promise<Array<{x, y, width, height}>>} PDF koordinatları (sol-alt orijin)
 */
export async function getPageImageRects(page) {
    const { OPS } = pdfjsLib;
    const imageOps = new Set([
        OPS.paintImageXObject,
        OPS.paintJpegXObject,
        OPS.paintInlineImageXObject,
        OPS.paintImageMaskXObject,
        OPS.paintImageXObjectRepeat,
    ].filter((op) => op !== undefined));

    const operatorList = await page.getOperatorList();
    const rects = [];
    const stack = [];
    let ctm = [1, 0, 0, 1, 0, 0];

    for (let i = 0; i < operatorList.fnArray.length; i++) {
        const fn = operatorList.fnArray[i];
        const args = operatorList.argsArray[i];

        if (fn === OPS.save) {
            stack.push(ctm);
        } else if (fn === OPS.restore) {
            ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        } else if (fn === OPS.transform) {
            ctm = multiplyMatrix(ctm, args);
        } else if (fn === OPS.paintFormXObjectBegin && args?.[0]) {
            stack.push(ctm);
            ctm = multiplyMatrix(ctm, args[0]);
        } else if (fn === OPS.paintFormXObjectEnd) {
            ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        } else if (imageOps.has(fn)) {
            // Görsel, birim kareyi (0,0)-(1,1) CTM ile sayfaya çizer
            const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [
                ctm[0] * u + ctm[2] * v + ctm[4],
                ctm[1] * u + ctm[3] * v + ctm[5],
            ]);
            const xs = corners.map((c) => c[0]);
            const ys = corners.map((c) => c[1]);
            const x = Math.min(...xs);
            const y = Math.min(...ys);
            const width = Math.max(...xs) - x;
            const height = Math.max(...ys) - y;
            if (width > 1 && height > 1) {
                rects.push({ x, y, width, height });
            }
        }
    }

    return rects;
}

/**
 * PDF sayfasındaki görselleri koordinatlarıyla çıkarır
 * @param {Uint8Array|ArrayBuffer} pdfData - PDF dosyası
 * @param {number} pageNum - Sayfa numarası (1-indexed)
 * @param {number} scale - Görüntüleme ölçeği
 * @returns {Promise<Array>} Görsel blokları [{id, x, y, width, height, type}]
 */
export async function extractImages(pdfData, pageNum, scale = 1) {
    const safeData = preparePdfData(pdfData);
    const pdf = await pdfjsLib.getDocument({ data: safeData }).promise;
    try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const rects = await getPageImageRects(page);

        return rects.map((r, imageId) => ({
            id: `img_${pageNum}_${imageId}`,
            type: 'image',
            // Canvas koordinatları (sol-üst orijin)
            x: r.x * scale,
            y: (viewport.height - r.y - r.height) * scale,
            width: r.width * scale,
            height: r.height * scale,
            pdfCoords: { ...r },
        }));
    } finally {
        pdf.destroy();
    }
}

/**
 * Sayfa içeriğinin tamamını çıkarır (metin + görsel)
 * @param {Uint8Array|ArrayBuffer} pdfData - PDF dosyası
 * @param {number} pageNum - Sayfa numarası
 * @param {number} scale - Görüntüleme ölçeği
 * @returns {Promise<{textBlocks: Array, images: Array}>}
 */
export async function extractPageContent(pdfData, pageNum, scale = 1) {
    const [textBlocks, images] = await Promise.all([
        extractTextBlocks(pdfData, pageNum, scale),
        extractImages(pdfData, pageNum, scale),
    ]);

    return { textBlocks, images };
}
