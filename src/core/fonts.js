// Gömülebilir Unicode fontlar (Türkçe dahil). pdf-lib'in standart fontları ğ, ş, ı, İ yazamaz.
import fontkit from '@pdf-lib/fontkit';

export const FONT_FAMILIES = {
    sans: { label: 'Sans (Arial uyumlu)', css: '"Liberation Sans", Arial, Helvetica, sans-serif', file: 'LiberationSans' },
    serif: { label: 'Serif', css: '"Noto Serif", Georgia, "Times New Roman", serif', file: 'NotoSerif' },
    mono: { label: 'Mono', css: '"DejaVu Sans Mono", Consolas, monospace', file: 'DejaVuSansMono' },
};

const variantSuffix = (bold, italic) => (bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular');

export function fontUrl(family, bold, italic) {
    const f = FONT_FAMILIES[family] || FONT_FAMILIES.sans;
    return `/fonts/${f.file}-${variantSuffix(bold, italic)}.ttf`;
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
    if (!doc.__nebulaFonts) {
        doc.registerFontkit(fontkit);
        doc.__nebulaFonts = {};
    }
    const url = fontUrl(family, bold, italic);
    if (!doc.__nebulaFonts[url]) {
        doc.__nebulaFonts[url] = doc.embedFont(await loadBytes(url), { subset: true });
    }
    return doc.__nebulaFonts[url];
}

/** Tarayıcıda düzenleme sırasında aynı fontları CSS ile göstermek için FontFace kaydı */
let cssRegistered = false;
export function registerCssFonts() {
    if (cssRegistered || typeof document === 'undefined') return;
    cssRegistered = true;
    const names = { sans: 'Liberation Sans', serif: 'Noto Serif', mono: 'DejaVu Sans Mono' };
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
}
