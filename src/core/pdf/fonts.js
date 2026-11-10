// PDF font sözlüğünden kod ↔ Unicode eşlemesi, glif genişlikleri ve stil bilgisi çıkarır.
import { PDFName, PDFArray, PDFDict, PDFNumber, PDFRawStream, PDFString, PDFHexString, decodePDFRawStream } from 'pdf-lib';
import { Font as StdFont } from '@pdf-lib/standard-fonts';
import { BASE_ENCODINGS, glyphNameToUnicode } from './encodings';

const nameOf = (o) => (o instanceof PDFName ? o.decodeText() : null);
const numOf = (o, d = 0) => (o instanceof PDFNumber ? o.asNumber() : d);

export function streamBytes(stream) {
    if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
    if (stream?.getContents) return stream.getContents(); // PDFContentStream vb.
    return new Uint8Array();
}

// ─── ToUnicode CMap ─────────────────────────────────────────────────────────

function hexToBytes(h) {
    const out = [];
    for (let k = 0; k + 1 < h.length; k += 2) out.push(parseInt(h.slice(k, k + 2), 16));
    if (h.length % 2) out.push(parseInt(h[h.length - 1] + '0', 16));
    return out;
}
const bytesToInt = (b) => b.reduce((v, x) => v * 256 + x, 0);
function utf16beToString(bytes) {
    let s = '';
    for (let k = 0; k + 1 < bytes.length; k += 2) s += String.fromCharCode((bytes[k] << 8) | bytes[k + 1]);
    return s;
}

/** @returns {{map: Map<number,string>, codeLengths: number[]}} */
export function parseToUnicode(text) {
    const map = new Map();
    const codeLengths = new Set();

    const csRe = /begincodespacerange([\s\S]*?)endcodespacerange/g;
    let m;
    while ((m = csRe.exec(text))) {
        for (const h of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) codeLengths.add(Math.ceil(h[1].length / 2));
    }

    const charRe = /beginbfchar([\s\S]*?)endbfchar/g;
    while ((m = charRe.exec(text))) {
        for (const p of m[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
            map.set(bytesToInt(hexToBytes(p[1])), utf16beToString(hexToBytes(p[2])));
            codeLengths.add(Math.ceil(p[1].length / 2));
        }
    }

    const rangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = rangeRe.exec(text))) {
        const body = m[1];
        const itemRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]*)>|\[([^\]]*)\])/g;
        let r;
        while ((r = itemRe.exec(body))) {
            const lo = bytesToInt(hexToBytes(r[1]));
            const hi = bytesToInt(hexToBytes(r[2]));
            codeLengths.add(Math.ceil(r[1].length / 2));
            if (hi - lo > 65535) continue;
            if (r[3] !== undefined) {
                const dst = hexToBytes(r[3]);
                for (let c = lo; c <= hi; c++) {
                    const d = dst.slice();
                    // son baytı artır (taşmayı önceki bayta aktar)
                    let add = c - lo;
                    for (let k = d.length - 1; k >= 0 && add; k--) {
                        const v = d[k] + add;
                        d[k] = v & 0xff;
                        add = v >> 8;
                    }
                    map.set(c, utf16beToString(d));
                }
            } else {
                const items = [...r[4].matchAll(/<([0-9A-Fa-f]*)>/g)];
                items.forEach((it, k) => map.set(lo + k, utf16beToString(hexToBytes(it[1]))));
            }
        }
    }
    return { map, codeLengths: [...codeLengths] };
}

// ─── Standart 14 font eşleme ────────────────────────────────────────────────

const STD_ALIASES = [
    [/^(helvetica|arial|liberationsans|nimbussans)/i, 'Helvetica'],
    [/^(times|timesnewroman|liberationserif|nimbusroman)/i, 'Times'],
    [/^(courier|couriernew|liberationmono|nimbusmono)/i, 'Courier'],
];

function standardFontName(base, bold, italic) {
    const clean = base.replace(/^[A-Z]{6}\+/, '').replace(/[\s,-]/g, '');
    if (/^symbol/i.test(clean)) return 'Symbol';
    if (/^zapfdingbats/i.test(clean)) return 'ZapfDingbats';
    for (const [re, fam] of STD_ALIASES) {
        if (!re.test(clean)) continue;
        if (fam === 'Times') return bold && italic ? 'Times-BoldItalic' : bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman';
        const sfx = bold && italic ? '-BoldOblique' : bold ? '-Bold' : italic ? '-Oblique' : '';
        return fam + sfx;
    }
    return null;
}

const stdCache = {};
function loadStd(name) {
    if (!(name in stdCache)) {
        try { stdCache[name] = StdFont.load(name); } catch { stdCache[name] = null; }
    }
    return stdCache[name];
}

// ─── Font bilgisi ───────────────────────────────────────────────────────────

export class FontInfo {
    /**
     * @param {PDFDict} dict
     * @param {import('pdf-lib').PDFContext} context
     */
    constructor(dict, context) {
        this.dict = dict;
        this.context = context;
        this.subtype = nameOf(dict.lookup(PDFName.of('Subtype'))) || 'Type1';
        this.baseFont = nameOf(dict.lookup(PDFName.of('BaseFont'))) || 'Unknown';
        this.isSubset = /^[A-Z]{6}\+/.test(this.baseFont);
        this.isType0 = this.subtype === 'Type0';
        this.isType3 = this.subtype === 'Type3';
        this.bytesPerCode = this.isType0 ? 2 : 1;

        let descriptor = dict.lookup(PDFName.of('FontDescriptor'));
        let cidFont = null;
        if (this.isType0) {
            const desc = dict.lookup(PDFName.of('DescendantFonts'));
            cidFont = desc instanceof PDFArray ? desc.lookup(0) : null;
            if (cidFont instanceof PDFDict) descriptor = cidFont.lookup(PDFName.of('FontDescriptor'));
        }
        this.descriptor = descriptor instanceof PDFDict ? descriptor : null;

        const flags = this.descriptor ? numOf(this.descriptor.lookup(PDFName.of('Flags'))) : 0;
        const weight = this.descriptor ? numOf(this.descriptor.lookup(PDFName.of('FontWeight')), 400) : 400;
        const italicAngle = this.descriptor ? numOf(this.descriptor.lookup(PDFName.of('ItalicAngle'))) : 0;
        const lname = this.baseFont.toLowerCase();
        this.bold = weight >= 600 || (flags & 0x40000) !== 0 || /bold|black|heavy|semibold|demi|w[6-9]\b/.test(lname);
        this.italic = (flags & 0x40) !== 0 || italicAngle !== 0 || /italic|oblique/.test(lname);
        this.mono = (flags & 0x1) !== 0 || /mono|courier|consol|menlo|code/.test(lname);
        this.serif = !this.mono && ((flags & 0x2) !== 0 || /times|serif|roman|georgia|garamond|cambria|book|minion|palatino/.test(lname)) && !/sans/.test(lname);
        this.embedded = !!(this.descriptor && (this.descriptor.lookup(PDFName.of('FontFile')) || this.descriptor.lookup(PDFName.of('FontFile2')) || this.descriptor.lookup(PDFName.of('FontFile3'))));

        this.ascent = this.descriptor ? numOf(this.descriptor.lookup(PDFName.of('Ascent')), 800) / 1000 : 0.8;
        this.descent = this.descriptor ? numOf(this.descriptor.lookup(PDFName.of('Descent')), -200) / 1000 : -0.2;
        if (!this.ascent || this.ascent > 1.5) this.ascent = 0.8;
        if (this.descent > 0 || this.descent < -1) this.descent = -0.2;

        // Type3: FontMatrix ile ölçeklenir
        this.fontMatrix = [0.001, 0, 0, 0.001, 0, 0];
        if (this.isType3) {
            const fm = dict.lookup(PDFName.of('FontMatrix'));
            if (fm instanceof PDFArray) this.fontMatrix = fm.asArray().map((n) => numOf(n));
        }

        // ToUnicode
        this.toUnicode = new Map();
        const tu = dict.lookup(PDFName.of('ToUnicode'));
        if (tu && (tu instanceof PDFRawStream || tu.getContents)) {
            try {
                const text = new TextDecoder('latin1').decode(streamBytes(tu));
                const parsed = parseToUnicode(text);
                this.toUnicode = parsed.map;
                if (!this.isType0 && parsed.codeLengths.length === 1 && parsed.codeLengths[0] === 2) this.bytesPerCode = 2;
            } catch { /* bozuk CMap */ }
        }

        if (this.isType0) this.#initCid(cidFont);
        else this.#initSimple();

        // Ters eşleme: Unicode karakteri → kod
        this.reverse = new Map();
        for (const [code, str] of this.toUnicode) {
            if (str && !this.reverse.has(str)) this.reverse.set(str, code);
        }
        if (!this.isType0 && this.glyphNames) {
            this.glyphNames.forEach((name, code) => {
                const u = glyphNameToUnicode(name);
                if (u && !this.reverse.has(u) && !this.toUnicode.has(code)) this.reverse.set(u, code);
            });
        }
        this.usedCodes = new Set(this.toUnicode.keys());
    }

    #initSimple() {
        const dict = this.dict;
        this.firstChar = numOf(dict.lookup(PDFName.of('FirstChar')), 0);
        const widths = dict.lookup(PDFName.of('Widths'));
        this.widths = widths instanceof PDFArray ? widths.asArray().map((n) => numOf(this.context.lookup(n))) : null;
        this.missingWidth = this.descriptor ? numOf(this.descriptor.lookup(PDFName.of('MissingWidth')), 0) : 0;

        // Kodlama
        const symbolic = /symbol|dingbat|wingding/i.test(this.baseFont);
        let names = (!this.embedded && !symbolic) || this.subtype === 'Type1' ? BASE_ENCODINGS.StandardEncoding.slice() : BASE_ENCODINGS.WinAnsiEncoding.slice();
        const encObj = dict.lookup(PDFName.of('Encoding'));
        if (encObj instanceof PDFName) {
            names = (BASE_ENCODINGS[encObj.decodeText()] || names).slice();
        } else if (encObj instanceof PDFDict) {
            const base = nameOf(encObj.lookup(PDFName.of('BaseEncoding')));
            if (base && BASE_ENCODINGS[base]) names = BASE_ENCODINGS[base].slice();
            const diffs = encObj.lookup(PDFName.of('Differences'));
            if (diffs instanceof PDFArray) {
                let code = 0;
                for (const item of diffs.asArray()) {
                    const v = this.context.lookup(item);
                    if (v instanceof PDFNumber) code = v.asNumber();
                    else if (v instanceof PDFName) names[code++] = v.decodeText();
                }
            }
        }
        this.glyphNames = names;

        this.stdName = !this.widths ? standardFontName(this.baseFont, this.bold, this.italic) : null;
        this.std = this.stdName ? loadStd(this.stdName) : null;
        if (this.std && !this.descriptor) {
            this.ascent = (this.std.Ascender || 750) / 1000;
            this.descent = (this.std.Descender || -250) / 1000;
        }
    }

    #initCid(cidFont) {
        this.dw = cidFont ? numOf(cidFont.lookup(PDFName.of('DW')), 1000) : 1000;
        this.cidWidths = new Map();
        const W = cidFont?.lookup(PDFName.of('W'));
        if (W instanceof PDFArray) {
            const arr = W.asArray().map((o) => this.context.lookup(o));
            for (let k = 0; k < arr.length;) {
                const first = numOf(arr[k]);
                const next = arr[k + 1];
                if (next instanceof PDFArray) {
                    next.asArray().forEach((w, j) => this.cidWidths.set(first + j, numOf(this.context.lookup(w))));
                    k += 2;
                } else {
                    const last = numOf(next);
                    const w = numOf(arr[k + 2]);
                    for (let c = first; c <= last && c - first < 65536; c++) this.cidWidths.set(c, w);
                    k += 3;
                }
            }
        }
    }

    /** Dize baytlarını kodlara böler */
    codes(bytes) {
        const out = [];
        if (this.bytesPerCode === 2) {
            for (let k = 0; k + 1 < bytes.length; k += 2) out.push((bytes[k] << 8) | bytes[k + 1]);
        } else {
            for (const b of bytes) out.push(b);
        }
        return out;
    }

    unicode(code) {
        const u = this.toUnicode.get(code);
        if (u !== undefined) return u;
        if (this.glyphNames) {
            const g = glyphNameToUnicode(this.glyphNames[code]);
            if (g) return g;
        }
        if (this.bytesPerCode === 1 && code >= 0x20 && code < 0x7f) return String.fromCharCode(code);
        return '';
    }

    /** Glif genişliği, metin uzayı birimi (1/1000 em değil; font boyutuyla çarpılacak) */
    width(code) {
        if (this.isType0) return (this.cidWidths.get(code) ?? this.dw) / 1000;
        if (this.isType3) {
            const w = this.widths ? this.widths[code - this.firstChar] : 0;
            return (w || 0) * this.fontMatrix[0];
        }
        if (this.widths) {
            const w = this.widths[code - this.firstChar];
            return (w ?? this.missingWidth) / 1000;
        }
        if (this.std) {
            const w = this.std.getWidthOfGlyph(this.glyphNames?.[code] || '');
            if (w !== undefined) return w / 1000;
        }
        return this.missingWidth ? this.missingWidth / 1000 : 0.5;
    }

    /** Bu font yeni bir kodu çizebilir mi? (alt küme fontlarda yalnız kullanılmış glifler güvenli) */
    #canDraw(code) {
        if (this.isType3) return false;
        if (this.isType0) return this.toUnicode.has(code);
        if (this.isSubset) return this.usedCodes.has(code) || (this.toUnicode.size === 0 && this.width(code) > 0);
        if (this.widths) {
            const w = this.widths[code - this.firstChar];
            return w !== undefined && w > 0;
        }
        return !!this.std && this.std.getWidthOfGlyph(this.glyphNames?.[code] || '') !== undefined;
    }

    /**
     * Metni bu fontun kodlarına çevirir. Boşluk glifi yoksa TJ kaydırması kullanır.
     * @returns {(Uint8Array|number)[] | null} TJ dizisi öğeleri ya da çizilemiyorsa null
     */
    encode(text) {
        const items = [];
        let buf = [];
        const flush = () => {
            if (buf.length) items.push(Uint8Array.from(buf));
            buf = [];
        };
        for (const ch of text) {
            const code = this.reverse.get(ch);
            if (code !== undefined && this.#canDraw(code)) {
                if (this.bytesPerCode === 2) buf.push(code >> 8, code & 0xff);
                else buf.push(code);
            } else if (ch === ' ' || ch === ' ') {
                flush();
                items.push(-250); // çeyrek em boşluk
            } else {
                return null;
            }
        }
        flush();
        return items;
    }

    /** Arayüzde gösterilecek sade font adı */
    get displayName() {
        return this.baseFont.replace(/^[A-Z]{6}\+/, '').replace(/[-,](Regular|Roman)$/i, '');
    }
}

export function pdfStringBytes(obj) {
    if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.asBytes();
    return new Uint8Array();
}
