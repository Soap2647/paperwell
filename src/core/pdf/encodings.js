// Basit (tek baytlık) PDF font kodlamaları ve glif adı → Unicode tablosu.
import { Encodings } from '@pdf-lib/standard-fonts';

// WinAnsi tablosundan glif adı → kod noktası ve kod → ad
const winAnsiMap = Encodings.WinAnsi.unicodeMappings || {};
export const GLYPH_TO_UNICODE = {};
const WIN_ANSI_NAMES = new Array(256).fill(null);
for (const [cp, [code, name]] of Object.entries(winAnsiMap)) {
    // Aynı glife birden çok kod noktası eşlenebilir (ör. hyphen → U+002D ve U+00AD); küçüğü tercih et
    if (!(name in GLYPH_TO_UNICODE) || Number(cp) < GLYPH_TO_UNICODE[name]) GLYPH_TO_UNICODE[name] = Number(cp);
    if (!WIN_ANSI_NAMES[code]) WIN_ANSI_NAMES[code] = name;
}

Object.assign(GLYPH_TO_UNICODE, {
    fi: 0xfb01, fl: 0xfb02, ff: 0xfb00, ffi: 0xfb03, ffl: 0xfb04,
    fraction: 0x2044, dotlessi: 0x0131, Lslash: 0x0141, lslash: 0x0142,
    hungarumlaut: 0x02dd, ogonek: 0x02db, caron: 0x02c7, breve: 0x02d8, dotaccent: 0x02d9, ring: 0x02da,
    Gbreve: 0x011e, gbreve: 0x011f, Idotaccent: 0x0130, Idot: 0x0130, Scedilla: 0x015e, scedilla: 0x015f,
    Scommaaccent: 0x0218, scommaaccent: 0x0219, Tcommaaccent: 0x021a, tcommaaccent: 0x021b,
    Abreve: 0x0102, abreve: 0x0103, Aogonek: 0x0104, aogonek: 0x0105, Cacute: 0x0106, cacute: 0x0107,
    Ccaron: 0x010c, ccaron: 0x010d, Dcaron: 0x010e, dcaron: 0x010f, Dcroat: 0x0110, dcroat: 0x0111,
    Eogonek: 0x0118, eogonek: 0x0119, Ecaron: 0x011a, ecaron: 0x011b, Nacute: 0x0143, nacute: 0x0144,
    Ncaron: 0x0147, ncaron: 0x0148, Ohungarumlaut: 0x0150, ohungarumlaut: 0x0151, Rcaron: 0x0158, rcaron: 0x0159,
    Sacute: 0x015a, sacute: 0x015b, Tcaron: 0x0164, tcaron: 0x0165, Uring: 0x016e, uring: 0x016f,
    Uhungarumlaut: 0x0170, uhungarumlaut: 0x0171, Zacute: 0x0179, zacute: 0x017a, Zdotaccent: 0x017b, zdotaccent: 0x017c,
    Emacron: 0x0112, emacron: 0x0113, Imacron: 0x012a, imacron: 0x012b, Amacron: 0x0100, amacron: 0x0101,
    minus: 0x2212, nbspace: 0x00a0, sfthyphen: 0x00ad, Euro: 0x20ac, lira: 0x20a4, uni20BA: 0x20ba,
    quotesingle: 0x27, grave: 0x60, space: 0x20, nonbreakingspace: 0xa0,
});

// Adobe StandardEncoding (yalnız ASCII dışı farklar + tüm aralık)
const STANDARD_NAMES = new Array(256).fill(null);
for (let c = 0x20; c < 0x7f; c++) STANDARD_NAMES[c] = WIN_ANSI_NAMES[c];
STANDARD_NAMES[0x27] = 'quoteright';
STANDARD_NAMES[0x60] = 'quoteleft';
const STD_HIGH = {
    0xa1: 'exclamdown', 0xa2: 'cent', 0xa3: 'sterling', 0xa4: 'fraction', 0xa5: 'yen', 0xa6: 'florin', 0xa7: 'section',
    0xa8: 'currency', 0xa9: 'quotesingle', 0xaa: 'quotedblleft', 0xab: 'guillemotleft', 0xac: 'guilsinglleft',
    0xad: 'guilsinglright', 0xae: 'fi', 0xaf: 'fl', 0xb1: 'endash', 0xb2: 'dagger', 0xb3: 'daggerdbl',
    0xb4: 'periodcentered', 0xb6: 'paragraph', 0xb7: 'bullet', 0xb8: 'quotesinglbase', 0xb9: 'quotedblbase',
    0xba: 'quotedblright', 0xbb: 'guillemotright', 0xbc: 'ellipsis', 0xbd: 'perthousand', 0xbf: 'questiondown',
    0xc1: 'grave', 0xc2: 'acute', 0xc3: 'circumflex', 0xc4: 'tilde', 0xc5: 'macron', 0xc6: 'breve', 0xc7: 'dotaccent',
    0xc8: 'dieresis', 0xca: 'ring', 0xcb: 'cedilla', 0xcd: 'hungarumlaut', 0xce: 'ogonek', 0xcf: 'caron', 0xd0: 'emdash',
    0xe1: 'AE', 0xe3: 'ordfeminine', 0xe8: 'Lslash', 0xe9: 'Oslash', 0xea: 'OE', 0xeb: 'ordmasculine', 0xf1: 'ae',
    0xf5: 'dotlessi', 0xf8: 'lslash', 0xf9: 'oslash', 0xfa: 'oe', 0xfb: 'germandbls',
};
for (const [c, n] of Object.entries(STD_HIGH)) STANDARD_NAMES[c] = n;

// MacRoman: tarayıcı/Node TextDecoder ile çözülür, adı Unicode'dan türetilir
function namesFromDecoder(label) {
    const names = new Array(256).fill(null);
    let dec;
    try { dec = new TextDecoder(label); } catch { return names; }
    const uniToName = {};
    for (const [n, cp] of Object.entries(GLYPH_TO_UNICODE)) if (!(cp in uniToName)) uniToName[cp] = n;
    for (let c = 0x20; c < 256; c++) {
        const ch = dec.decode(new Uint8Array([c]));
        const cp = ch.codePointAt(0);
        names[c] = uniToName[cp] || `uni${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    }
    return names;
}

export const BASE_ENCODINGS = {
    WinAnsiEncoding: WIN_ANSI_NAMES,
    StandardEncoding: STANDARD_NAMES,
    MacRomanEncoding: namesFromDecoder('macintosh'),
};

export function glyphNameToUnicode(name) {
    if (!name) return null;
    if (name in GLYPH_TO_UNICODE) return String.fromCodePoint(GLYPH_TO_UNICODE[name]);
    let m = /^uni([0-9A-Fa-f]{4,})$/.exec(name);
    if (m) {
        let s = '';
        for (let k = 0; k + 4 <= m[1].length; k += 4) s += String.fromCharCode(parseInt(m[1].slice(k, k + 4), 16));
        return s;
    }
    m = /^u([0-9A-Fa-f]{4,6})$/.exec(name);
    if (m) return String.fromCodePoint(parseInt(m[1], 16));
    const base = name.split('.')[0].split('_')[0];
    if (base !== name) return glyphNameToUnicode(base);
    if (name.length === 1) return name;
    return null;
}
