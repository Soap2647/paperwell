// Sayfa içerik akışını yorumlayarak düzenlenebilir bir model çıkarır:
// metin parçaları (her glifin konumu, fontu, rengi), satırlar ve görsel yerleşimleri.
import { PDFName, PDFArray, PDFDict, PDFRef, PDFRawStream, PDFNumber } from 'pdf-lib';
import { parseContentStream } from './contentStream';
import { FontInfo, streamBytes } from './fonts';
import { IDENTITY, mul, apply, transformRect, pageGeometry, invert } from './geometry';

const N = (s) => PDFName.of(s);
const num = (o) => (o?.type === 'num' ? o.v : 0);

/** Sayfanın (miras dahil) kaynak sözlüğü */
export function pageResources(page) {
    let node = page.node;
    while (node) {
        const r = node.lookup(N('Resources'));
        if (r instanceof PDFDict) return r;
        node = node.lookup(N('Parent'));
    }
    return null;
}

export function pageBox(page) {
    let node = page.node;
    const get = (key) => {
        let n = node;
        while (n) {
            const v = n.lookup(N(key));
            if (v instanceof PDFArray) return v.asArray().map((x) => (x instanceof PDFNumber ? x.asNumber() : page.doc.context.lookup(x)?.asNumber?.() ?? 0));
            n = n.lookup(N('Parent'));
        }
        return null;
    };
    return get('CropBox') || get('MediaBox') || [0, 0, 612, 792];
}

export function pageRotation(page) {
    return page.getRotation().angle || 0;
}

/** Sayfanın içerik akışlarını tek bayt dizisinde birleştirir */
export function pageContentBytes(page) {
    const contents = page.node.Contents();
    const ctx = page.doc.context;
    const streams = [];
    if (contents instanceof PDFArray) {
        for (let k = 0; k < contents.size(); k++) streams.push(ctx.lookup(contents.get(k)));
    } else if (contents) {
        streams.push(contents);
    }
    const parts = streams.filter(Boolean).map((s) => streamBytes(s));
    const total = parts.reduce((s, p) => s + p.length + 1, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
        out[off++] = 0x0a;
    }
    return out;
}

function colorFromOperands(op, args) {
    const v = args.filter((a) => a.type === 'num').map((a) => a.v);
    if (op === 'g') return { space: 'gray', v };
    if (op === 'rg') return { space: 'rgb', v };
    if (op === 'k') return { space: 'cmyk', v };
    if (v.length === 1) return { space: 'gray', v };
    if (v.length === 3) return { space: 'rgb', v };
    if (v.length === 4) return { space: 'cmyk', v };
    return null;
}

export function colorToRgb(c) {
    if (!c) return [0, 0, 0];
    const v = c.v;
    if (c.space === 'gray') return [v[0], v[0], v[0]];
    if (c.space === 'cmyk') return [(1 - v[0]) * (1 - v[3]), (1 - v[1]) * (1 - v[3]), (1 - v[2]) * (1 - v[3])];
    return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
}

/**
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {number} pageIndex
 */
export function buildPageModel(doc, pageIndex) {
    const page = doc.getPage(pageIndex);
    const ctx = doc.context;
    const geom = pageGeometry(pageBox(page), pageRotation(page));
    const fontCache = new Map(); // PDFRef/dict → FontInfo

    const streams = []; // { id, bytes, ref? (form xobject), ops }
    const segments = [];
    const images = [];

    const getFont = (resources, name) => {
        const fonts = resources?.lookup(N('Font'));
        if (!(fonts instanceof PDFDict)) return null;
        const raw = fonts.get(N(name));
        const dict = raw instanceof PDFRef ? ctx.lookup(raw) : raw;
        if (!(dict instanceof PDFDict)) return null;
        const key = raw instanceof PDFRef ? raw.toString() : dict;
        if (!fontCache.has(key)) {
            try { fontCache.set(key, new FontInfo(dict, ctx)); } catch { fontCache.set(key, null); }
        }
        return fontCache.get(key);
    };

    const run = (bytes, resources, baseCtm, streamRef, depth) => {
        const streamId = streams.length;
        const ops = parseContentStream(bytes);
        streams.push({ id: streamId, bytes, ref: streamRef, ops });

        let gs = { ctm: baseCtm, fill: { space: 'gray', v: [0] }, font: null, fontName: null, fontSize: 0, Tc: 0, Tw: 0, Th: 1, TL: 0, Ts: 0, Tr: 0 };
        const stack = [];
        let Tm = [...IDENTITY];
        let Tlm = [...IDENTITY];
        let inText = false;

        const nextLine = (tx, ty) => {
            Tlm = mul([1, 0, 0, 1, tx, ty], Tlm);
            Tm = [...Tlm];
        };

        const show = (opIndex, items) => {
            const font = gs.font;
            if (!font) return;
            const seg = {
                id: `${pageIndex}:${streamId}:${opIndex}`,
                streamId,
                opIndex,
                font,
                fontName: gs.fontName,
                fontSize: gs.fontSize,
                Tc: gs.Tc,
                Tw: gs.Tw,
                Th: gs.Th,
                Ts: gs.Ts,
                renderMode: gs.Tr,
                color: gs.fill,
                ctm: gs.ctm,
                startTm: [...Tm],
                glyphs: [],
            };
            let pendingAdj = 0;
            for (const it of items) {
                if (typeof it === 'number') {
                    const tx = (-it / 1000) * gs.fontSize * gs.Th;
                    Tm = mul([1, 0, 0, 1, tx, 0], Tm);
                    pendingAdj += it;
                    continue;
                }
                for (const code of font.codes(it)) {
                    const w0 = font.width(code);
                    const isSpace = font.bytesPerCode === 1 && code === 32;
                    const adv = (w0 * gs.fontSize + gs.Tc + (isSpace ? gs.Tw : 0)) * gs.Th;
                    const Trm = mul(mul([gs.fontSize * gs.Th, 0, 0, gs.fontSize, 0, gs.Ts], Tm), gs.ctm);
                    const box = transformRect(Trm, 0, font.descent, w0 || 0.3, font.ascent);
                    seg.glyphs.push({
                        code,
                        unicode: font.unicode(code),
                        adjBefore: pendingAdj, // önceki TJ kaydırması
                        advance: adv, // metin uzayında (Tm'e uygulanacak)
                        width: w0,
                        Trm,
                        box, // PDF kullanıcı uzayında
                    });
                    pendingAdj = 0;
                    Tm = mul([1, 0, 0, 1, adv, 0], Tm);
                }
            }
            seg.trailingAdj = pendingAdj;
            seg.endTm = [...Tm];
            if (seg.glyphs.length) segments.push(seg);
        };

        for (let k = 0; k < ops.length; k++) {
            const { op, args } = ops[k];
            switch (op) {
                case 'q': stack.push({ ...gs }); break;
                case 'Q': if (stack.length) gs = stack.pop(); break;
                case 'cm': gs.ctm = mul(args.map(num), gs.ctm); break;
                case 'BT': inText = true; Tm = [...IDENTITY]; Tlm = [...IDENTITY]; break;
                case 'ET': inText = false; break;
                case 'Tf': {
                    gs.fontName = args[0]?.v;
                    gs.fontSize = num(args[1]);
                    gs.font = getFont(resources, gs.fontName);
                    break;
                }
                case 'Tc': gs.Tc = num(args[0]); break;
                case 'Tw': gs.Tw = num(args[0]); break;
                case 'Tz': gs.Th = num(args[0]) / 100; break;
                case 'TL': gs.TL = num(args[0]); break;
                case 'Ts': gs.Ts = num(args[0]); break;
                case 'Tr': gs.Tr = num(args[0]); break;
                case 'Td': nextLine(num(args[0]), num(args[1])); break;
                case 'TD': gs.TL = -num(args[1]); nextLine(num(args[0]), num(args[1])); break;
                case 'Tm': Tlm = args.map(num); Tm = [...Tlm]; break;
                case 'T*': nextLine(0, -gs.TL); break;
                case 'Tj': if (inText && args[0]?.type === 'str') show(k, [args[0].bytes]); break;
                case "'": nextLine(0, -gs.TL); if (args[0]?.type === 'str') show(k, [args[0].bytes]); break;
                case '"':
                    gs.Tw = num(args[0]);
                    gs.Tc = num(args[1]);
                    nextLine(0, -gs.TL);
                    if (args[2]?.type === 'str') show(k, [args[2].bytes]);
                    break;
                case 'TJ': {
                    const arr = args[0]?.type === 'arr' ? args[0].items : [];
                    show(k, arr.map((a) => (a.type === 'num' ? a.v : a.type === 'str' ? a.bytes : 0)));
                    break;
                }
                case 'g': case 'rg': case 'k': case 'sc': case 'scn': {
                    const c = colorFromOperands(op, args);
                    if (c) gs.fill = c;
                    break;
                }
                case 'cs': gs.fill = { space: args[0]?.v === 'DeviceCMYK' ? 'cmyk' : args[0]?.v === 'DeviceGray' ? 'gray' : 'rgb', v: args[0]?.v === 'DeviceCMYK' ? [0, 0, 0, 1] : [0, 0, 0] }; break;
                case 'Do': {
                    const name = args[0]?.v;
                    const xobjs = resources?.lookup(N('XObject'));
                    if (!(xobjs instanceof PDFDict) || !name) break;
                    const raw = xobjs.get(N(name));
                    const xo = raw instanceof PDFRef ? ctx.lookup(raw) : raw;
                    if (!(xo instanceof PDFRawStream)) break;
                    const subtype = xo.dict.lookup(N('Subtype'))?.decodeText?.();
                    if (subtype === 'Image') {
                        const box = transformRect(gs.ctm, 0, 0, 1, 1);
                        images.push({ id: `${pageIndex}:${streamId}:${k}`, streamId, opIndex: k, name, ctm: gs.ctm, box, ref: raw instanceof PDFRef ? raw : null });
                    } else if (subtype === 'Form' && depth < 8) {
                        const m = xo.dict.lookup(N('Matrix'));
                        const fm = m instanceof PDFArray ? m.asArray().map((x) => x.asNumber?.() ?? 0) : IDENTITY;
                        const fres = xo.dict.lookup(N('Resources'));
                        try {
                            run(streamBytes(xo), fres instanceof PDFDict ? fres : resources, mul(fm, gs.ctm), raw instanceof PDFRef ? raw : null, depth + 1);
                        } catch { /* bozuk form */ }
                    }
                    break;
                }
                case 'BI': {
                    images.push({ id: `${pageIndex}:${streamId}:${k}`, streamId, opIndex: k, inline: true, ctm: gs.ctm, box: transformRect(gs.ctm, 0, 0, 1, 1) });
                    break;
                }
                default: break;
            }
        }
    };

    run(pageContentBytes(page), pageResources(page), IDENTITY, null, 0);

    const lines = groupLines(segments);

    return { pageIndex, geom, streams, segments, lines, images };
}

// ─── Satır gruplama ─────────────────────────────────────────────────────────

function segText(seg) {
    return seg.glyphs.map((g) => g.unicode).join('');
}

function direction(seg) {
    const T = seg.glyphs[0].Trm;
    return Math.atan2(T[1], T[0]);
}

function baselinePoint(g) {
    return [g.Trm[4], g.Trm[5]];
}

/**
 * Akış sırasındaki parçaları satırlara ayırır: aynı taban çizgisi, yakın konum, aynı yön.
 */
function groupLines(segments) {
    const lines = [];
    let cur = null;

    for (const seg of segments) {
        if (seg.renderMode === 3 && !seg.glyphs.some((g) => g.unicode.trim())) continue;
        const first = seg.glyphs[0];
        const size = Math.hypot(first.Trm[2], first.Trm[3]) || seg.fontSize;
        const dir = direction(seg);

        if (cur) {
            const lastSeg = cur.segments[cur.segments.length - 1];
            const lastG = lastSeg.glyphs[lastSeg.glyphs.length - 1];
            // son glifin sonunu ve yeni glifin başlangıcını satır yönüne göre karşılaştır
            const inv = invert(lastG.Trm);
            const [ex] = apply(inv, ...apply(lastG.Trm, lastG.width || 0.3, 0));
            const [nx, ny] = apply(inv, ...baselinePoint(first));
            const gap = (nx - ex) * cur.size; // em → nokta (yaklaşık)
            const sameLine = Math.abs(dir - cur.dir) < 0.02
                && Math.abs(ny) * cur.size < cur.size * 0.35
                && gap > -cur.size * 0.6 && gap < cur.size * 2.5
                && Math.abs(size - cur.size) < cur.size * 0.4;
            if (sameLine) {
                cur.segments.push(seg);
                continue;
            }
            lines.push(finishLine(cur));
        }
        cur = { segments: [seg], size, dir };
    }
    if (cur) lines.push(finishLine(cur));
    return lines.filter((l) => l.text.trim().length > 0);
}

function finishLine(cur) {
    const glyphs = cur.segments.flatMap((s) => s.glyphs);
    const box = {
        x0: Math.min(...glyphs.map((g) => g.box.x0)),
        y0: Math.min(...glyphs.map((g) => g.box.y0)),
        x1: Math.max(...glyphs.map((g) => g.box.x1)),
        y1: Math.max(...glyphs.map((g) => g.box.y1)),
    };
    // Parçalar arası büyük boşluklara boşluk karakteri ekle (bazı üreticiler boşluk glifi koymaz)
    let text = '';
    const chars = []; // her karakter için kaynak glif (eklenen boşluklarda null)
    let prev = null;
    for (const seg of cur.segments) {
        for (const g of seg.glyphs) {
            if (prev) {
                const inv = invert(prev.Trm);
                const [nx] = apply(inv, g.Trm[4], g.Trm[5]);
                const gapEm = nx - (prev.width || 0);
                if (gapEm > 0.18 && !text.endsWith(' ') && g.unicode !== ' ') {
                    text += ' ';
                    chars.push({ ch: ' ', glyph: null });
                }
            }
            text += g.unicode;
            for (const ch of g.unicode) chars.push({ ch, glyph: g });
            prev = g;
        }
    }
    const first = cur.segments[0];
    const fg = first.glyphs[0];
    return {
        id: first.id,
        segments: cur.segments,
        text,
        chars,
        rawText: cur.segments.map(segText).join(''),
        box,
        fontSize: cur.size,
        dir: cur.dir,
        font: first.font,
        color: colorToRgb(first.color),
        origin: [fg.Trm[4], fg.Trm[5]],
        invisible: cur.segments.every((s) => s.renderMode === 3),
    };
}
