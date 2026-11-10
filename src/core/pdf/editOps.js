// İçerik akışı üzerinde gerçek düzenleme işlemleri:
// satır metni değiştirme, glif silme (gerçek redaksiyon), görsel taşıma/silme/değiştirme.
import { PDFDocument, PDFName, PDFDict, rgb, degrees } from 'pdf-lib';
import { applyPatches, hexString, fmtNum, serializeOperand } from './contentStream';
import { buildPageModel, pageResources } from './pageModel';
import { mul, invert } from './geometry';
import { embedFallbackFont } from '../fonts';

// ─── Parça yeniden yazımı ───────────────────────────────────────────────────

/** Operatörün çizgi hareketi önekini korur (' ve " operatörleri) */
function opPrefix(op) {
    if (op.op === "'") return 'T* ';
    if (op.op === '"') return `${serializeOperand(op.args[0])} Tw ${serializeOperand(op.args[1])} Tc T* `;
    return '';
}

function tjText(items) {
    const parts = items.map((it) => (typeof it === 'number' ? fmtNum(it) : hexString(it)));
    return `[${parts.join(' ')}] TJ`;
}

/**
 * Parçayı glif filtresiyle yeniden yazar; silinen glifin yeri TJ kaydırmasıyla korunur,
 * böylece satırın geri kalanı kıpırdamaz.
 */
function filteredSegmentText(seg, op, keep) {
    const scale = seg.fontSize * seg.Th;
    const items = [];
    let buf = [];
    const flush = () => { if (buf.length) items.push(Uint8Array.from(buf)); buf = []; };
    const pushNum = (n) => {
        if (!n) return;
        flush();
        if (typeof items[items.length - 1] === 'number') items[items.length - 1] += n;
        else items.push(n);
    };
    const two = seg.font.bytesPerCode === 2;
    seg.glyphs.forEach((g, i) => {
        pushNum(g.adjBefore);
        if (keep(g, i)) {
            if (two) buf.push(g.code >> 8, g.code & 0xff);
            else buf.push(g.code);
        } else if (scale) {
            pushNum((-g.advance / scale) * 1000);
        }
    });
    pushNum(seg.trailingAdj);
    flush();
    return opPrefix(op) + tjText(items);
}

// ─── Akışları belgeye geri yaz ──────────────────────────────────────────────

function writeStreams(doc, page, model, patchesByStream) {
    const ctx = doc.context;
    for (const [streamId, patches] of patchesByStream) {
        if (!patches.length) continue;
        const stream = model.streams[streamId];
        const newBytes = applyPatches(stream.bytes, patches);
        if (!stream.ref) {
            // Sayfa içeriği: tek akışa indir ve q/Q ile sar (sonradan çizilenler etkilenmesin)
            const wrapped = new Uint8Array(newBytes.length + 4);
            wrapped.set([0x71, 0x0a]);
            wrapped.set(newBytes, 2);
            wrapped.set([0x0a, 0x51], newBytes.length + 2);
            const ref = ctx.register(ctx.flateStream(wrapped));
            page.node.set(PDFName.of('Contents'), ref);
        } else {
            const old = ctx.lookup(stream.ref);
            const entries = {};
            for (const [k, v] of old.dict.entries()) {
                const key = k.decodeText();
                if (key !== 'Length' && key !== 'Filter' && key !== 'DecodeParms') entries[key] = v;
            }
            ctx.assign(stream.ref, ctx.flateStream(newBytes, entries));
        }
    }
}

function addPatch(map, streamId, patch) {
    if (!map.has(streamId)) map.set(streamId, []);
    map.get(streamId).push(patch);
}

async function loadDoc(bytes) {
    return PDFDocument.load(bytes, { updateMetadata: false });
}

// ─── Satır metni değiştir ───────────────────────────────────────────────────

/**
 * @param {Uint8Array} bytes
 * @param {number} pageIndex
 * @param {string} lineId
 * @param {string} newText
 * @param {{forceFallback?:boolean, family?:'sans'|'serif'|'mono', bold?:boolean, italic?:boolean, size?:number, color?:number[]}} style
 * @returns {Promise<{bytes:Uint8Array, usedOriginalFont:boolean}>}
 */
export async function replaceLineText(bytes, pageIndex, lineId, newText, style = {}) {
    const doc = await loadDoc(bytes);
    const page = doc.getPage(pageIndex);
    const model = buildPageModel(doc, pageIndex);
    const line = model.lines.find((l) => l.id === lineId);
    if (!line) throw new Error('Satır bulunamadı (belge değişmiş olabilir)');

    const patches = new Map();
    const firstSeg = line.segments[0];
    const sizeChanged = style.size && Math.abs(style.size - line.fontSize) > 0.05;
    const colorChanged = style.color && style.color.some((c, i) => Math.abs(c - line.color[i]) > 0.01);
    const encoded = !style.forceFallback && !sizeChanged && !colorChanged ? firstSeg.font.encode(newText) : null;

    line.segments.forEach((seg, idx) => {
        const stream = model.streams[seg.streamId];
        const op = stream.ops[seg.opIndex];
        let text;
        if (idx === 0 && encoded) {
            const lead = seg.glyphs[0]?.adjBefore || 0;
            text = opPrefix(op) + tjText(lead ? [lead, ...encoded] : encoded);
        } else {
            text = filteredSegmentText(seg, op, () => false);
        }
        addPatch(patches, seg.streamId, { start: op.start, end: op.end, text });
    });

    writeStreams(doc, page, model, patches);

    if (!encoded && newText) {
        const family = style.family || (line.font.mono ? 'mono' : line.font.serif ? 'serif' : 'sans');
        const font = await embedFallbackFont(doc, family, style.bold ?? line.font.bold, style.italic ?? line.font.italic);
        const T = firstSeg.glyphs[0].Trm;
        const size = style.size || Math.hypot(T[2], T[3]);
        const angle = (Math.atan2(T[1], T[0]) * 180) / Math.PI;
        const [r, g, b] = style.color || line.color;
        page.drawText(newText, {
            x: T[4],
            y: T[5],
            size,
            font,
            color: rgb(r, g, b),
            rotate: degrees(angle),
        });
    }

    return { bytes: await doc.save(), usedOriginalFont: !!encoded };
}

// ─── Glif silme (gerçek redaksiyon / akıllı silgi) ──────────────────────────

/**
 * Seçilen gliflerin metnini içerik akışından tamamen siler.
 * @param {(glyph, seg) => boolean} shouldRemove
 * @param {(img) => boolean} [shouldRemoveImage]
 */
export function removeContent(doc, pageIndex, shouldRemove, shouldRemoveImage) {
    const page = doc.getPage(pageIndex);
    const model = buildPageModel(doc, pageIndex);
    const patches = new Map();
    let removedGlyphs = 0;
    let removedImages = 0;

    for (const seg of model.segments) {
        const hits = seg.glyphs.map((g) => shouldRemove(g, seg));
        const count = hits.filter(Boolean).length;
        if (!count) continue;
        removedGlyphs += count;
        const op = model.streams[seg.streamId].ops[seg.opIndex];
        addPatch(patches, seg.streamId, { start: op.start, end: op.end, text: filteredSegmentText(seg, op, (g, i) => !hits[i]) });
    }

    if (shouldRemoveImage) {
        for (const img of model.images) {
            if (!shouldRemoveImage(img)) continue;
            const op = model.streams[img.streamId].ops[img.opIndex];
            addPatch(patches, img.streamId, { start: op.start, end: op.end, text: '' });
            removedImages++;
        }
    }

    writeStreams(doc, page, model, patches);
    return { removedGlyphs, removedImages };
}

/**
 * Dikdörtgenlerin altındaki metni ve tamamen içerde kalan görselleri gerçekten siler,
 * üstüne dolgu kutusu çizer.
 * @param {{x0,y0,x1,y1}[]} rects - PDF kullanıcı uzayında
 */
export async function redactRects(bytes, pageIndex, rects, { fill = [0, 0, 0] } = {}) {
    const doc = await loadDoc(bytes);
    const inside = (b) => rects.some((r) => {
        const cx = (b.x0 + b.x1) / 2;
        const cy = (b.y0 + b.y1) / 2;
        return cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1;
    });
    const overlaps = (b) => rects.some((r) => b.x0 < r.x1 && b.x1 > r.x0 && b.y0 < r.y1 && b.y1 > r.y0);
    const contained = (b) => rects.some((r) => b.x0 >= r.x0 - 1 && b.x1 <= r.x1 + 1 && b.y0 >= r.y0 - 1 && b.y1 <= r.y1 + 1);

    const result = removeContent(doc, pageIndex, (g) => inside(g.box) || (overlaps(g.box) && g.unicode.trim()), (img) => contained(img.box));

    const page = doc.getPage(pageIndex);
    if (fill) {
        for (const r of rects) {
            page.drawRectangle({ x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0, color: rgb(fill[0], fill[1], fill[2]) });
        }
    }
    return { bytes: await doc.save(), ...result };
}

// ─── Görsel işlemleri ───────────────────────────────────────────────────────

const fmtMatrix = (M) => M.map(fmtNum).join(' ');

/**
 * Görseli yeni bir yere/boyuta taşır.
 * @param {number[]} newCtm - birim kareyi sayfa uzayında yeni konuma eşleyen matris
 */
export async function transformImage(bytes, pageIndex, imageId, newCtm) {
    const doc = await loadDoc(bytes);
    const page = doc.getPage(pageIndex);
    const model = buildPageModel(doc, pageIndex);
    const img = model.images.find((i) => i.id === imageId);
    if (!img) throw new Error('Görsel bulunamadı');
    const stream = model.streams[img.streamId];
    const op = stream.ops[img.opIndex];
    const M = mul(newCtm, invert(img.ctm));
    const original = new TextDecoder('latin1').decode(stream.bytes.subarray(op.start, op.end));
    const patches = new Map([[img.streamId, [{ start: op.start, end: op.end, text: `q ${fmtMatrix(M)} cm ${original} Q` }]]]);
    writeStreams(doc, page, model, patches);
    return await doc.save();
}

export async function deleteImage(bytes, pageIndex, imageId) {
    const doc = await loadDoc(bytes);
    removeContent(doc, pageIndex, () => false, (img) => img.id === imageId);
    return await doc.save();
}

/** Görseli yeni bir görselle değiştirir (aynı yer ve boyut) */
export async function replaceImageContent(bytes, pageIndex, imageId, imageBytes, mime) {
    const doc = await loadDoc(bytes);
    const page = doc.getPage(pageIndex);
    const model = buildPageModel(doc, pageIndex);
    const img = model.images.find((i) => i.id === imageId);
    if (!img) throw new Error('Görsel bulunamadı');

    const embedded = mime === 'image/png' ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
    // Yeni görseli sayfa kaynaklarına ekle; form içindeki görsellerde de sayfa kaynağı kullanılır
    const name = `NbImg${Date.now().toString(36)}`;
    const resources = pageResources(page) || page.node.normalizedEntries().Resources;
    let xobjs = resources.lookup(PDFName.of('XObject'));
    if (!(xobjs instanceof PDFDict)) {
        xobjs = doc.context.obj({});
        resources.set(PDFName.of('XObject'), xobjs);
    }
    xobjs.set(PDFName.of(name), embedded.ref);

    const stream = model.streams[img.streamId];
    const op = stream.ops[img.opIndex];
    const patches = new Map();
    if (img.streamId === 0) {
        addPatch(patches, 0, { start: op.start, end: op.end, text: `/${name} Do` });
        writeStreams(doc, page, model, patches);
    } else {
        // Form içindeki görsel: orijinali sil, sayfa düzeyinde aynı konuma çiz
        addPatch(patches, img.streamId, { start: op.start, end: op.end, text: '' });
        writeStreams(doc, page, model, patches);
        const C = img.ctm;
        const contentRef = doc.context.register(doc.context.flateStream(`q ${fmtMatrix(C)} cm /${name} Do Q`));
        page.node.addContentStream(contentRef);
    }
    return await doc.save();
}

