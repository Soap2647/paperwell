// Gömülebilir Unicode fontlar (Türkçe dahil). pdf-lib'in standart fontları ğ, ş, ı, İ yazamaz.
import fontkit from '@pdf-lib/fontkit';
import { FONT_CATALOG } from './fontCatalog';

const GENERIC = { sans: 'sans-serif', serif: 'serif', display: 'sans-serif', script: 'cursive', mono: 'monospace' };

/** Temel aileler (dört biçim) + açık lisanslı Google Fonts kataloğu (Regular/Bold; italik tarayıcıda eğik çizilir) */
export const FONT_FAMILIES = {
    sans: { label: 'Sans (Arial uyumlu)', css: '"Liberation Sans", Arial, Helvetica, sans-serif', file: 'LiberationSans', kind: 'sans', base: true },
    serif: { label: 'Serif', css: '"DejaVu Serif", Georgia, "Times New Roman", serif', file: 'DejaVuSerif', kind: 'serif', base: true },
    mono: { label: 'Mono', css: '"DejaVu Sans Mono", Consolas, monospace', file: 'DejaVuSansMono', kind: 'mono', base: true },
    ...Object.fromEntries(Object.entries(FONT_CATALOG).map(([k, f]) => [k, {
        // yüklü bir yerel fontla karışmasın diye ön ekli ad
        label: f.label, css: `"PW ${f.label}", ${GENERIC[f.kind]}`, cssName: `PW ${f.label}`, file: f.file, kind: f.kind, bold: f.bold,
    }])),
};

const variantSuffix = (bold, italic) => (bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular');

export function fontUrl(family, bold, italic) {
    const f = FONT_FAMILIES[family] || FONT_FAMILIES.sans;
    if (f.base) return `/fonts/${f.file}-${variantSuffix(bold, italic)}.ttf`;
    return `/fonts/g/${f.file}-${bold && f.bold ? 'Bold' : 'Regular'}.ttf`;
}

let loader = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Font yüklenemedi: ' + url);
    return res.arrayBuffer();
};
/** Testlerde (Node) dosya sisteminden okumak için */
export function setFontLoader(fn) { loader = fn; }

const cache = new Map();
function loadBytes(url) {
    if (!cache.has(url)) cache.set(url, loader(url));
    return cache.get(url);
}

/** Belgeye font gömer; aynı belge içinde önbellekli */
export async function embedFallbackFont(doc, family = 'sans', bold = false, italic = false) {
    if (!doc.__paperwellFonts) {
        doc.registerFontkit(fontkit);
        doc.__paperwellFonts = {};
    }
    const url = fontUrl(family, bold, italic);
    if (!doc.__paperwellFonts[url]) {
        doc.__paperwellFonts[url] = doc.embedFont(await loadBytes(url), { subset: true });
    }
    return doc.__paperwellFonts[url];
}

/** Tarayıcıda düzenleme sırasında aynı fontları CSS ile göstermek için FontFace kaydı */
let cssRegistered = false;
const faces = [];
export function registerCssFonts() {
    if (cssRegistered || typeof document === 'undefined') return;
    cssRegistered = true;
    const names = { sans: 'Liberation Sans', serif: 'DejaVu Serif', mono: 'DejaVu Sans Mono' };
    for (const fam of Object.keys(names)) {
        for (const [bold, italic] of [[false, false], [true, false], [false, true], [true, true]]) {
            const face = new FontFace(names[fam], `url(${fontUrl(fam, bold, italic)})`, {
                weight: bold ? '700' : '400',
                style: italic ? 'italic' : 'normal',
                display: 'swap',
            });
            document.fonts.add(face);
        }
    }
    for (const [key, f] of Object.entries(FONT_FAMILIES)) {
        if (f.base) continue;
        for (const bold of f.bold ? [false, true] : [false]) {
            const face = new FontFace(f.cssName, `url(${fontUrl(key, bold, false)})`, { weight: bold ? '700' : '400', display: 'swap' });
            document.fonts.add(face);
            faces.push(face);
        }
    }
}

/** Tüm katalog fontlarını yükler (font eşleştirmesinden önce: ölçüm yüklenmemiş fontla yapılmasın) */
export async function loadAllFonts() {
    registerCssFonts();
    await Promise.all(faces.map((f) => f.load().catch(() => null)));
}
