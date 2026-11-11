// Katman nesnelerini PDF'e vektör olarak gömer (raster değil): çizimler, şekiller,
// metin kutuları gerçek PDF yolları/metinleri olur; seçilebilir ve net kalır.
import {
    PDFDocument, PDFHexString, rgb, BlendMode, LineCapStyle, LineJoinStyle,
    pushGraphicsState, popGraphicsState, setLineJoin, degrees,
} from 'pdf-lib';
import { pageGeometry } from './pdf/geometry';
import { pageBox, pageRotation } from './pdf/pageModel';
import { viewBoxToPdf } from './pdf/placement';
import { embedFallbackFont } from './fonts';

export function hexToRgb01(hex = '#000000') {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
    return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255];
}
const color = (hex) => rgb(...hexToRgb01(hex));

function dataUrlBytes(url) {
    const [head, b64] = url.split(',');
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { bytes: out, mime: /image\/png/.test(head) ? 'image/png' : /image\/jpe?g/.test(head) ? 'image/jpeg' : 'other' };
}

async function embedImage(doc, src) {
    let { bytes, mime } = dataUrlBytes(src);
    if (mime === 'other' && typeof document !== 'undefined') {
        // WebP vb.: PNG'ye çevir
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        ({ bytes } = dataUrlBytes(c.toDataURL('image/png')));
        mime = 'image/png';
    }
    return mime === 'image/jpeg' ? doc.embedJpg(bytes) : doc.embedPng(bytes);
}

/** Görünüm koordinatlarındaki noktaları SVG yoluna çevirir (PDF uzayı, y ters) */
function svgFromPoints(geom, pts, smooth) {
    const p = pts.map(([x, y]) => geom.pdfPoint(x, y));
    if (!p.length) return '';
    let d = `M ${p[0][0]} ${-p[0][1]}`;
    if (p.length === 1) return d + ` L ${p[0][0] + 0.01} ${-p[0][1]}`;
    if (!smooth) {
        for (let i = 1; i < p.length; i++) d += ` L ${p[i][0]} ${-p[i][1]}`;
        return d;
    }
    for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
        d += ` Q ${p[i][0]} ${-p[i][1]} ${mx} ${-my}`;
    }
    const last = p[p.length - 1];
    return d + ` L ${last[0]} ${-last[1]}`;
}

function ellipsePath(geom, x, y, w, h) {
    const k = 0.5522847498;
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
    const P = (vx, vy) => { const [a, b] = geom.pdfPoint(vx, vy); return `${a} ${-b}`; };
    return `M ${P(cx + rx, cy)} C ${P(cx + rx, cy + ry * k)} ${P(cx + rx * k, cy + ry)} ${P(cx, cy + ry)}`
        + ` C ${P(cx - rx * k, cy + ry)} ${P(cx - rx, cy + ry * k)} ${P(cx - rx, cy)}`
        + ` C ${P(cx - rx, cy - ry * k)} ${P(cx - rx * k, cy - ry)} ${P(cx, cy - ry)}`
        + ` C ${P(cx + rx * k, cy - ry)} ${P(cx + rx, cy - ry * k)} ${P(cx + rx, cy)} Z`;
}

const rectPath = (geom, x, y, w, h) => svgFromPoints(geom, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], false) + ' Z';

export function arrowHead(x1, y1, x2, y2, width) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.max(10, width * 4);
    return [
        [x2 - len * Math.cos(ang - Math.PI / 7), y2 - len * Math.sin(ang - Math.PI / 7)],
        [x2, y2],
        [x2 - len * Math.cos(ang + Math.PI / 7), y2 - len * Math.sin(ang + Math.PI / 7)],
    ];
}

/** Metin kutusu satırlarının taban çizgisi konumları (UI ile aynı yerleşim) */
export function layoutTextLines(text, size, lineHeight = 1.25) {
    return (text || '').split('\n').map((line, i) => ({ line, top: i * size * lineHeight }));
}

/** Nesne kutusunun merkezi etrafında o.rotation (derece, görünümde saat yönü) kadar döndüren fonksiyon */
function rotator(o) {
    const a = ((o.rotation || 0) * Math.PI) / 180;
    if (!a) return (x, y) => [x, y];
    const cx = o.x + (o.w || 0) / 2, cy = o.y + (o.h || 0) / 2, c = Math.cos(a), s = Math.sin(a);
    return (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

async function drawObject(doc, page, geom, o) {
    const opacity = o.opacity ?? 1;
    if (o.hidden) return;
    switch (o.type) {
        case 'path': {
            const path = svgFromPoints(geom, o.points, true);
            page.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
            page.drawSvgPath(path, {
                x: 0, y: 0,
                borderColor: color(o.color),
                borderWidth: o.width,
                borderOpacity: opacity,
                borderLineCap: LineCapStyle.Round,
                blendMode: o.blend === 'multiply' ? BlendMode.Multiply : undefined,
            });
            page.pushOperators(popGraphicsState());
            break;
        }
        case 'highlight': {
            for (const r of o.rects) {
                let box = r;
                if (o.kind === 'underline') box = { x: r.x, y: r.y + r.h - Math.max(1, r.h * 0.08), w: r.w, h: Math.max(1, r.h * 0.08) };
                if (o.kind === 'strike') box = { x: r.x, y: r.y + r.h * 0.52, w: r.w, h: Math.max(1, r.h * 0.07) };
                page.drawSvgPath(rectPath(geom, box.x, box.y, box.w, box.h), {
                    x: 0, y: 0,
                    color: color(o.color),
                    opacity: o.kind === 'highlight' ? opacity : 1,
                    blendMode: o.kind === 'highlight' ? BlendMode.Multiply : undefined,
                });
            }
            break;
        }
        case 'rect':
        case 'ellipse': {
            const path = o.type === 'rect' ? rectPath(geom, o.x, o.y, o.w, o.h) : ellipsePath(geom, o.x, o.y, o.w, o.h);
            page.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
            page.drawSvgPath(path, {
                x: 0, y: 0,
                color: o.fill ? color(o.fill) : undefined,
                opacity,
                borderColor: o.stroke ? color(o.stroke) : undefined,
                borderWidth: o.stroke ? o.width : 0,
                borderOpacity: opacity,
            });
            page.pushOperators(popGraphicsState());
            break;
        }
        case 'line':
        case 'arrow': {
            const opts = { x: 0, y: 0, borderColor: color(o.stroke), borderWidth: o.width, borderOpacity: opacity, borderLineCap: LineCapStyle.Round };
            page.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
            page.drawSvgPath(svgFromPoints(geom, [[o.x1, o.y1], [o.x2, o.y2]], false), opts);
            if (o.type === 'arrow') page.drawSvgPath(svgFromPoints(geom, arrowHead(o.x1, o.y1, o.x2, o.y2, o.width), false), opts);
            page.pushOperators(popGraphicsState());
            break;
        }
        case 'text': {
            const font = await embedFallbackFont(doc, o.family, o.bold, o.italic);
            const rot = rotator(o);
            const lh = o.lineHeight || 1.25;
            const asc = font.heightAtSize(o.size, { descender: false });
            const full = font.heightAtSize(o.size);
            const halfLeading = (o.size * lh - full) / 2;
            for (const { line, top } of layoutTextLines(o.text, o.size, lh)) {
                if (!line) continue;
                const w = font.widthOfTextAtSize(line, o.size);
                const dx = o.align === 'center' ? (o.w - w) / 2 : o.align === 'right' ? o.w - w : 0;
                const [px, py] = geom.pdfPoint(...rot(o.x + dx, o.y + top + halfLeading + asc));
                page.drawText(line, { x: px, y: py, size: o.size, font, color: color(o.color), opacity, rotate: degrees(geom.rotate - (o.rotation || 0)) });
            }
            break;
        }
        case 'image': {
            const img = await embedImage(doc, o.src);
            if (o.rotation) {
                // döndürülmüş kutu: sol-alt köşe merkez etrafında döner, açı görünümde saat yönünde
                const [px, py] = geom.pdfPoint(...rotator(o)(o.x, o.y + o.h));
                page.drawImage(img, { x: px, y: py, width: o.w, height: o.h, rotate: degrees(geom.rotate - o.rotation), opacity });
            } else {
                page.drawImage(img, { ...viewBoxToPdf(geom, o), opacity });
            }
            break;
        }
        case 'note': {
            const ctx = doc.context;
            const [ax, ay] = geom.pdfPoint(o.x, o.y + 24);
            const [bx, by] = geom.pdfPoint(o.x + 24, o.y);
            const annot = ctx.obj({
                Type: 'Annot',
                Subtype: 'Text',
                Rect: [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)],
                Contents: PDFHexString.fromText(o.text || ''),
                T: PDFHexString.fromText(o.author || 'Paperwell'),
                Name: 'Comment',
                C: hexToRgb01(o.color || '#facc15'),
                F: 4,
                Open: false,
            });
            page.node.addAnnot(ctx.register(annot));
            break;
        }
        default: break;
    }
}

/**
 * @param {Uint8Array} bytes
 * @param {{id:string}[]} pages
 * @param {Record<string, Object[]>} objects
 */
export async function exportPdf(bytes, pages, objects, meta, forms) {
    const hasObjects = pages.some((p) => objects[p.id]?.length);
    const hasForm = forms && (Object.keys(forms.values || {}).length || forms.flatten);
    if (!hasObjects && !meta && !hasForm) return bytes;
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    if (hasForm) {
        // forms.js pdf.js'e bağlı; yalnız form varsa yükle (Node testleri pdf.js'siz çalışsın)
        const { fillForm } = await import('./forms');
        await fillForm(doc, forms.values, { flatten: forms.flatten });
    }
    for (let i = 0; i < pages.length; i++) {
        const objs = objects[pages[i].id];
        if (!objs?.length) continue;
        const page = doc.getPage(i);
        const geom = pageGeometry(pageBox(page), pageRotation(page));
        for (const o of objs) await drawObject(doc, page, geom, o);
    }
    if (meta) {
        if (meta.title !== undefined) doc.setTitle(meta.title);
        if (meta.author !== undefined) doc.setAuthor(meta.author);
        if (meta.subject !== undefined) doc.setSubject(meta.subject);
        if (meta.keywords !== undefined) doc.setKeywords(meta.keywords ? [meta.keywords] : []);
    }
    doc.setProducer('Paperwell');
    doc.setModificationDate(new Date());
    return doc.save();
}

