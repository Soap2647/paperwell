// Sayfa modellerini (metin satırları, görseller) bayt sürümü başına önbelleğe alır.
import { PDFDocument } from 'pdf-lib';
import { buildPageModel } from './pdf/pageModel';

const docs = new WeakMap();
const models = new WeakMap();

function getDoc(bytes) {
    if (!docs.has(bytes)) docs.set(bytes, PDFDocument.load(bytes, { updateMetadata: false }));
    return docs.get(bytes);
}

export async function getPageModel(bytes, pageIndex) {
    if (!models.has(bytes)) models.set(bytes, new Map());
    const m = models.get(bytes);
    if (!m.has(pageIndex)) {
        m.set(pageIndex, getDoc(bytes).then((doc) => {
            try { return buildPageModel(doc, pageIndex); } catch (e) { console.warn('Sayfa modeli çıkarılamadı', e); return null; }
        }));
    }
    return m.get(pageIndex);
}

/** Glif kutularını (PDF uzayı) görünüm uzayında satır başına tek dikdörtgene çevirir */
export function glyphRectsToView(geom, glyphs) {
    if (!glyphs.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of glyphs) {
        for (const [px, py] of [[g.box.x0, g.box.y0], [g.box.x1, g.box.y1], [g.box.x0, g.box.y1], [g.box.x1, g.box.y0]]) {
            const [vx, vy] = geom.viewPoint(px, py);
            x0 = Math.min(x0, vx); y0 = Math.min(y0, vy); x1 = Math.max(x1, vx); y1 = Math.max(y1, vy);
        }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function lineViewRect(geom, line) {
    return glyphRectsToView(geom, line.segments.flatMap((s) => s.glyphs));
}

const norm = (s) => s.toLocaleLowerCase('tr').normalize('NFC');

/** Tüm belgede metin arar */
export async function searchDocument(bytes, pageCount, query) {
    const q = norm(query);
    if (!q) return [];
    const results = [];
    for (let i = 0; i < pageCount; i++) {
        const model = await getPageModel(bytes, i);
        if (!model) continue;
        for (const line of model.lines) {
            const text = norm(line.text);
            let from = 0;
            for (;;) {
                const at = text.indexOf(q, from);
                if (at < 0) break;
                const glyphs = [...new Set(line.chars.slice(at, at + q.length).map((c) => c.glyph).filter(Boolean))];
                const rect = glyphRectsToView(model.geom, glyphs);
                if (rect) results.push({ pageIndex: i, lineId: line.id, origin: line.origin, start: at, end: at + q.length, rect, lineText: line.text });
                from = at + q.length;
            }
        }
    }
    return results;
}

/** Düzenleme sonrası satır kimlikleri değişebilir; satırı başlangıç noktası ve metinle yeniden bulur */
export async function findLineByOrigin(bytes, pageIndex, origin, text) {
    const model = await getPageModel(bytes, pageIndex);
    if (!model) return null;
    let best = null, bd = Infinity;
    for (const l of model.lines) {
        const d = Math.hypot(l.origin[0] - origin[0], l.origin[1] - origin[1]) + (l.text === text ? 0 : 0.5);
        if (d < bd) { bd = d; best = l; }
    }
    return bd < 2 ? best : null;
}
