import fontkit from '@pdf-lib/fontkit';

// pdf-lib'in standart fontları (Helvetica vb.) WinAnsi kodlaması kullanır ve
// ğ, ş, ı, İ gibi Türkçe karakterleri yazamaz. Bu yüzden Unicode bir TTF gömüyoruz.
const FONT_FILES = {
    regular: '/fonts/LiberationSans-Regular.ttf',
    bold: '/fonts/LiberationSans-Bold.ttf',
    italic: '/fonts/LiberationSans-Italic.ttf',
    boldItalic: '/fonts/LiberationSans-BoldItalic.ttf',
};

const bytesCache = {};

async function loadFontBytes(variant) {
    if (!bytesCache[variant]) {
        bytesCache[variant] = fetch(FONT_FILES[variant]).then((res) => {
            if (!res.ok) throw new Error('Font dosyası yüklenemedi');
            return res.arrayBuffer();
        });
    }
    return bytesCache[variant];
}

/**
 * Font adından (ör. "Arial-BoldMT") kalın/italik varyantını tahmin eder.
 */
export function fontVariantFromName(fontName = '') {
    const name = fontName.toLowerCase();
    const bold = /bold|black|heavy|semibold|w[7-9]/.test(name);
    const italic = /italic|oblique|slanted/.test(name);
    if (bold && italic) return 'boldItalic';
    if (bold) return 'bold';
    if (italic) return 'italic';
    return 'regular';
}

/**
 * Belgeye Türkçe karakter destekli font gömer (aynı belge için önbellekli).
 */
export async function embedUnicodeFont(pdfDoc, variant = 'regular') {
    if (!pdfDoc.__nebulaFonts) {
        pdfDoc.registerFontkit(fontkit);
        pdfDoc.__nebulaFonts = {};
    }
    if (!pdfDoc.__nebulaFonts[variant]) {
        const bytes = await loadFontBytes(variant);
        pdfDoc.__nebulaFonts[variant] = await pdfDoc.embedFont(bytes, { subset: true });
    }
    return pdfDoc.__nebulaFonts[variant];
}
