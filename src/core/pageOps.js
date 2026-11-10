// Sayfa düzeyi işlemler. Katman nesneleri sayfa kimliğiyle (pageId) tutulur,
// böylece sıralama değişse de nesneler doğru sayfada kalır.
import { PDFDocument, degrees } from 'pdf-lib';
import { pageGeometry } from './pdf/geometry';
import { pageBox, pageRotation } from './pdf/pageModel';

let idSeq = 0;
export const newId = (p = 'id') => `${p}_${Date.now().toString(36)}_${(idSeq++).toString(36)}`;

/** Belgedeki sayfaların görünüm boyutlarını okur */
export async function readPages(bytes, ids) {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
    return doc.getPages().map((p, i) => {
        const g = pageGeometry(pageBox(p), pageRotation(p));
        return { id: ids?.[i] || newId('pg'), width: g.width, height: g.height, rotate: g.rotate };
    });
}

/**
 * Yeni sayfa düzeni: her öğe { srcIndex, rotate (ek döndürme), id } ya da { blank: [w,h], id }
 * ya da { fromDoc: PDFDocument, srcIndex, id }
 */
export async function rebuildPages(bytes, plan) {
    const src = await PDFDocument.load(bytes, { updateMetadata: false });
    const out = await PDFDocument.create();
    // Belge bilgilerini koru
    const meta = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'];
    for (const k of meta) {
        const v = src[`get${k}`]?.();
        if (v) out[`set${k}`]?.(k === 'Keywords' ? [v] : v);
    }
    for (const item of plan) {
        if (item.blank) {
            out.addPage(item.blank);
            continue;
        }
        const from = item.fromDoc || src;
        const [p] = await out.copyPages(from, [item.srcIndex]);
        if (item.rotate) p.setRotation(degrees((((p.getRotation().angle + item.rotate) % 360) + 360) % 360));
        out.addPage(p);
    }
    return out.save();
}

/** Sayfa 90° döndürülünce nesneleri yeni görünüm uzayına taşır */
export function rotateObjects(objs, delta, oldW, oldH) {
    const d = ((delta % 360) + 360) % 360;
    if (!d || !objs?.length) return objs;
    const rotPoint = (x, y) => {
        if (d === 90) return [oldH - y, x];
        if (d === 180) return [oldW - x, oldH - y];
        return [y, oldW - x]; // 270
    };
    const rotBox = (x, y, w, h) => {
        const pts = [rotPoint(x, y), rotPoint(x + w, y + h)];
        const nx = Math.min(pts[0][0], pts[1][0]);
        const ny = Math.min(pts[0][1], pts[1][1]);
        return { x: nx, y: ny, w: Math.abs(pts[0][0] - pts[1][0]), h: Math.abs(pts[0][1] - pts[1][1]) };
    };
    return objs.map((o) => {
        switch (o.type) {
            case 'path':
                return { ...o, points: o.points.map(([x, y, p]) => [...rotPoint(x, y), p]) };
            case 'line': case 'arrow': {
                const [x1, y1] = rotPoint(o.x1, o.y1);
                const [x2, y2] = rotPoint(o.x2, o.y2);
                return { ...o, x1, y1, x2, y2 };
            }
            case 'highlight':
                return { ...o, rects: o.rects.map((r) => rotBox(r.x, r.y, r.w, r.h)) };
            case 'text': case 'image': case 'note': {
                // içerik dik kalır; yalnız merkez noktası taşınır
                const [cx, cy] = rotPoint(o.x + o.w / 2, o.y + (o.h || 0) / 2);
                return { ...o, x: cx - o.w / 2, y: cy - (o.h || 0) / 2 };
            }
            default: {
                const b = rotBox(o.x, o.y, o.w, o.h);
                return { ...o, ...b };
            }
        }
    });
}

export function cloneObjects(objs) {
    return (objs || []).map((o) => ({ ...o, id: newId('ob') }));
}
