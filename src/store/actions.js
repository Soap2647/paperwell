// Belge düzeyi eylemler (async). Her biri { dispatch, get } alır.
import { PDFDocument, rgb } from 'pdf-lib';
import { readPages, rebuildPages, rotateObjects, cloneObjects, newId, resizePdfPage } from '../core/pageOps';
import { resizeTransform, scaleObjects, scaleRects, exportSize } from '../core/pageSize';
import { exportPdf } from '../core/export';
import { renderPageToCanvas, renderPageSharp, releasePdfjsDoc } from '../core/render';
import { toast } from '../components/Toaster';
import { t } from '../i18n';
import { saveFile, isDesktop } from '../platform';

/** Web'de indirir, masaüstünde "Farklı kaydet" diyaloğu açar */
export function downloadBlob(blob, name) {
    return saveFile(blob, name);
}

export const baseName = (name = 'belge') => name.replace(/\.(pdf|png|jpe?g|webp|gif|bmp)$/i, '');

/** Uzun işlemi meşgul göstergesiyle çalıştırır */
export async function withBusy(ed, label, fn) {
    ed.dispatch({ type: 'SET', values: { busy: { label } } });
    try {
        return await fn((progress, newLabel) => ed.dispatch({ type: 'SET', values: { busy: { label: newLabel || label, progress } } }));
    } catch (e) {
        console.error(e);
        toast(e?.message || String(e), 'error');
        return undefined;
    } finally {
        ed.dispatch({ type: 'SET', values: { busy: null } });
    }
}

async function imageToPdf(file) {
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const w = img.naturalWidth, h = img.naturalHeight;
        // PNG'ye çevir (WebP/GIF vb. için); JPEG'i olduğu gibi göm
        const doc = await PDFDocument.create();
        let embedded;
        if (file.type === 'image/jpeg') {
            embedded = await doc.embedJpg(new Uint8Array(await file.arrayBuffer()));
        } else if (file.type === 'image/png') {
            embedded = await doc.embedPng(new Uint8Array(await file.arrayBuffer()));
        } else {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0);
            const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
            embedded = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
        }
        const k = Math.min(1, 14000 / Math.max(w, h));
        const page = doc.addPage([w * k, h * k]);
        page.drawImage(embedded, { x: 0, y: 0, width: w * k, height: h * k });
        doc.setTitle(file.name);
        return { bytes: await doc.save(), imageSize: { w, h }, mime: file.type };
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function openFile(ed, file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImage = /^image\//.test(file.type);
    if (!isPdf && !isImage) {
        toast(t('Desteklenmeyen dosya türü'), 'error');
        return;
    }
    await withBusy(ed, t('Yükleniyor...'), async () => {
        let bytes, kind = 'pdf', extra = {};
        if (isPdf) {
            bytes = new Uint8Array(await file.arrayBuffer());
            try {
                const probe = await PDFDocument.load(bytes, { updateMetadata: false });
                if (probe.isEncrypted) throw new Error(t('Bu PDF şifre korumalı'));
            } catch (e) {
                if (/encrypt/i.test(e.message)) throw new Error(t('Bu PDF şifre korumalı'));
                throw new Error(`${t('Dosya açılamadı')}: ${e.message}`);
            }
        } else {
            const r = await imageToPdf(file);
            bytes = r.bytes;
            kind = 'image';
            extra = { imageSize: r.imageSize, mime: r.mime };
        }
        const pages = await readPages(bytes);
        ed.dispatch({ type: 'LOAD', doc: { name: file.name, path: file.path || null, kind, bytes, pages, ...extra } });
    });
}

const hexToRgb = (hex) => {
    const n = parseInt((/^#?([0-9a-f]{6})$/i.exec(hex || '') || [])[1] || 'ffffff', 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * Boş belge. Boyut PDF noktasıyla (varsayılan A4). pixelSize ({ w, h }): piksel ön ayarlarında
 * PNG'nin tam piksel boyutu için belgeye yazılır. Argümansız çağrı eskisi gibi beyaz A4 açar.
 */
export async function createBlank(ed, { width = 595.28, height = 841.89, background = '#ffffff', label, pixelSize } = {}) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([width, height]);
    // arka planı her zaman çiz: içeriksiz sayfa sonradan gömülemez / boyutu değiştirilemez
    page.drawRectangle({ x: 0, y: 0, width, height, color: hexToRgb(background) });
    const bytes = await doc.save();
    const name = label ? `${label.replace(/[\\/:*?"<>|]/g, '-')}.pdf` : 'Yeni belge.pdf';
    ed.dispatch({ type: 'LOAD', doc: { name, kind: 'pdf', bytes, pages: await readPages(bytes), background, pixelSize } });
}

/**
 * Geçerli sayfanın boyutunu değiştirir (tek geri alma adımı).
 * fit: içerik ve nesneler sığacak kadar tek tip ölçeklenir; değilse boyutu aynı kalır. İkisi de ortalanır.
 */
export async function resizeCurrentPage(ed, { width, height, pixelSize, fit = true, background = '#ffffff' }) {
    await withBusy(ed, t('Boyut değiştiriliyor...'), async () => {
        const s = ed.get();
        const idx = s.page;
        const old = s.doc.pages[idx];
        const { k, dx, dy } = resizeTransform(old.width, old.height, width, height, fit);
        const docChanges = { pixelSize };
        let bytes;
        if (s.doc.kind === 'image') {
            // raster sayfa: görsel yeni tuvale ölçeklenip ortalanır, tek sayfalık PDF yeniden kurulur (Sihirli Katmanlar'daki gibi)
            const base = (s.doc.imageSize?.w || old.width) / old.width; // piksel / pt
            const longest = Math.max(width, height) * base;
            const np = longest > 8000 ? (base * 8000) / longest : base;
            const cw = pixelSize ? pixelSize.w : Math.round(width * np), ch = pixelSize ? pixelSize.h : Math.round(height * np);
            const src = await renderPageToCanvas(s.doc.bytes, idx, base, 'transparent');
            const c = document.createElement('canvas');
            c.width = cw; c.height = ch;
            const ctx = c.getContext('2d');
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, cw, ch);
            ctx.imageSmoothingQuality = 'high';
            const ix = (dx / width) * cw, iy = (dy / height) * ch, iw = ((old.width * k) / width) * cw, ih = ((old.height * k) / height) * ch;
            ctx.drawImage(src, ix, iy, iw, ih);
            if (fit === 'extend') await extendEdges(c, ix, iy, iw, ih);
            const png = s.doc.mime === 'image/png';
            const blob = await new Promise((r) => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.95));
            const img = new Uint8Array(await blob.arrayBuffer());
            const one = await PDFDocument.create();
            const emb = png ? await one.embedPng(img) : await one.embedJpg(img);
            one.addPage([width, height]).drawImage(emb, { x: 0, y: 0, width, height });
            const fromDoc = await PDFDocument.load(await one.save());
            const plan = s.doc.pages.map((p, i) => (i === idx ? { fromDoc, srcIndex: 0, id: p.id } : { srcIndex: i, id: p.id }));
            bytes = await rebuildPages(s.doc.bytes, plan);
            docChanges.imageSize = { w: cw, h: ch };
        } else {
            bytes = await resizePdfPage(s.doc.bytes, idx, { width, height, k, dx, dy, background });
        }
        docChanges.background = background;
        const pages = await readPages(bytes, s.doc.pages.map((p) => p.id));
        const objects = { ...s.objects, [old.id]: scaleObjects(s.objects[old.id], k, dx, dy) };
        const redactions = s.redactions?.[old.id]?.length ? { ...s.redactions, [old.id]: scaleRects(s.redactions[old.id], k, dx, dy) } : undefined;
        ed.dispatch({ type: 'COMMIT', bytes, pages, objects, redactions, docChanges });
        toast(t('Boyut değişti'), 'success');
    });
}

/** Görselin dışında kalan boşluğu (yeni oranın kenarları) görselin devamıyla doldurur: düz/degrade zemin analitik, kalanı yapay zekâ */
async function extendEdges(c, ix, iy, iw, ih) {
    const W = c.width, H = c.height, ctx = c.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, W, H);
    // görselin kenarındaki 2 px'lik yumuşak geçiş de doldurulsun (dikiş görünmesin)
    const x0 = Math.ceil(ix) + 2, y0 = Math.ceil(iy) + 2, x1 = Math.floor(ix + iw) - 2, y1 = Math.floor(iy + ih) - 2;
    const mask = new Uint8Array(W * H);
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < x0 || x >= x1 || y < y0 || y >= y1) { mask[y * W + x] = 1; n++; }
    if (!n) return;
    const { fillHoles } = await import('../core/magicLayers');
    const { isLamaCached } = await import('../core/inpaint/lama');
    await fillHoles(img.data, W, H, mask, { best: await isLamaCached() });
    ctx.putImageData(img, 0, 0);
}

/** Geçerli sayfayı PNG olarak indirir: piksel ön ayarlarında tam piksel boyutunda, diğerlerinde 2 kat (CSS px) */
export async function exportPng(ed) {
    const s = ed.get();
    if (!s.doc) return;
    await withBusy(ed, t('İşleniyor...'), async () => {
        const out = await buildOutputPdf(ed);
        const page = s.doc.pages[s.page];
        const target = exportSize(page.width, page.height, s.doc.pixelSize);
        let canvas = await renderPageSharp(out, s.page, target.scale, '#fff');
        if (canvas.width !== target.w || canvas.height !== target.h) {
            // yuvarlama farkı: tam piksel boyutuna getir
            const c = document.createElement('canvas');
            c.width = target.w; c.height = target.h;
            c.getContext('2d').drawImage(canvas, 0, 0, target.w, target.h);
            canvas = c;
        }
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        const saved = await saveFile(blob, `${baseName(s.doc.name)}.png`);
        if (saved) toast(isDesktop ? t('Kaydedildi') : t('İndirildi'), 'success');
    });
}

/** İçerik değişikliği (sayfa sayısı aynı): sayfa kimlikleri korunur */
export async function commitBytes(ed, bytes, extra = {}) {
    const s = ed.get();
    const pages = extra.pages || (await readPages(bytes, s.doc.pages.map((p) => p.id)));
    releasePdfjsDocLater(s.doc.bytes, s);
    ed.dispatch({ type: 'COMMIT', bytes, pages, objects: extra.objects, keepSelection: extra.keepSelection });
}

// Geri alma geçmişinde olmayan eski pdf.js belgelerini bellekten at
function releasePdfjsDocLater(oldBytes, s) {
    const inHistory = s.past.some((p) => p.doc?.bytes === oldBytes) || s.future.some((p) => p.doc?.bytes === oldBytes);
    if (!inHistory && s.past.length > 40) setTimeout(() => releasePdfjsDoc(s.past[0]?.doc?.bytes), 3000);
}

export async function buildOutputPdf(ed) {
    const s = ed.get();
    return exportPdf(s.doc.bytes, s.doc.pages, s.objects, undefined, s.forms);
}

/**
 * Görsel belgeyi piksel olarak çizer: görselin kendisi birebir (yeniden örneklenmeden) çizilir, eklenen
 * logo ve yazılar ayrı bir katmanda süper örneklenip üstüne konur; böylece hem görsel bozulmaz hem logolar net kalır.
 */
async function renderImageDoc(s, k) {
    const page = s.doc.pages[0], bg = s.doc.mime === 'image/jpeg' ? '#fff' : 'transparent';
    if (page.rotate) return renderPageSharp(await exportPdf(s.doc.bytes, s.doc.pages, s.objects), 0, k, bg);
    const canvas = await renderPageToCanvas(s.doc.bytes, 0, k, bg);
    if (!s.objects[page.id]?.length) return canvas;
    const blank = await PDFDocument.create();
    blank.addPage([page.width, page.height]);
    const layer = await exportPdf(await blank.save(), s.doc.pages, s.objects);
    canvas.getContext('2d').drawImage(await renderPageSharp(layer, 0, k, 'transparent'), 0, 0, canvas.width, canvas.height);
    return canvas;
}

/**
 * Kaydet / indir. Masaüstünde açılan PDF'in üzerine kaydeder (saveAs ile farklı kaydet);
 * web'de indirir. Görseller her zaman yeni dosyaya kaydedilir.
 */
export async function download(ed, { saveAs = false, scale = 1 } = {}) {
    const s = ed.get();
    if (!s.doc) return;
    await withBusy(ed, t('İşleniyor...'), async () => {
        let saved;
        if (s.doc.kind === 'image') {
            // scale > 1: görsel büyütülür, eklenen logo/yazılar kendi çözünürlüklerinden net çizilir
            const k = ((s.doc.imageSize?.w || s.doc.pages[0].width) / s.doc.pages[0].width) * scale;
            const canvas = await renderImageDoc(s, k);
            const jpeg = s.doc.mime === 'image/jpeg';
            const blob = await new Promise((r) => canvas.toBlob(r, jpeg ? 'image/jpeg' : 'image/png', 0.95));
            saved = await saveFile(blob, `${baseName(s.doc.name)}-paperwell${scale > 1 ? `-${scale}x` : ''}.${jpeg ? 'jpg' : 'png'}`);
        } else {
            const out = await buildOutputPdf(ed);
            const usePath = isDesktop && !saveAs && s.doc.path ? s.doc.path : undefined;
            saved = await saveFile(out, `${baseName(s.doc.name)}.pdf`, { path: usePath });
            if (saved && typeof saved === 'string') {
                const name = saved.split(/[\\/]/).pop();
                ed.dispatch({ type: 'SET', values: { doc: { ...ed.get().doc, path: saved, name } } });
            }
        }
        if (!saved) return;
        ed.dispatch({ type: 'SAVED' });
        toast(isDesktop ? t('Kaydedildi') : t('İndirildi'), 'success');
    });
}

// ─── Sayfa işlemleri ────────────────────────────────────────────────────────

async function applyPlan(ed, plan, objects, label) {
    const s = ed.get();
    await withBusy(ed, label || t('İşleniyor...'), async () => {
        const bytes = await rebuildPages(s.doc.bytes, plan);
        const pages = await readPages(bytes, plan.map((p) => p.id));
        ed.dispatch({ type: 'COMMIT', bytes, pages, objects });
    });
}

const planFromPages = (pages) => pages.map((p, i) => ({ srcIndex: i, id: p.id }));

export function reorderPages(ed, newOrderIds) {
    const s = ed.get();
    const idx = new Map(s.doc.pages.map((p, i) => [p.id, i]));
    return applyPlan(ed, newOrderIds.map((id) => ({ srcIndex: idx.get(id), id })), s.objects);
}

export function rotatePages(ed, ids, delta) {
    const s = ed.get();
    const set = new Set(ids);
    const objects = { ...s.objects };
    const plan = s.doc.pages.map((p, i) => {
        if (!set.has(p.id)) return { srcIndex: i, id: p.id };
        objects[p.id] = rotateObjects(objects[p.id], delta, p.width, p.height);
        return { srcIndex: i, id: p.id, rotate: delta };
    });
    return applyPlan(ed, plan, objects);
}

export function deletePages(ed, ids) {
    const s = ed.get();
    const set = new Set(ids);
    if (s.doc.pages.length - set.size < 1) {
        toast(t('Belgede en az bir sayfa kalmalı'), 'error');
        return;
    }
    const plan = planFromPages(s.doc.pages).filter((p) => !set.has(p.id));
    const objects = { ...s.objects };
    ids.forEach((id) => delete objects[id]);
    return applyPlan(ed, plan, objects);
}

export function duplicatePage(ed, id) {
    const s = ed.get();
    const plan = [];
    const objects = { ...s.objects };
    s.doc.pages.forEach((p, i) => {
        plan.push({ srcIndex: i, id: p.id });
        if (p.id === id) {
            const nid = newId('pg');
            plan.push({ srcIndex: i, id: nid });
            objects[nid] = cloneObjects(s.objects[p.id]);
        }
    });
    return applyPlan(ed, plan, objects);
}

export function insertBlankPage(ed, afterIndex) {
    const s = ed.get();
    const ref = s.doc.pages[Math.max(0, afterIndex)] || { width: 595.28, height: 841.89 };
    const plan = planFromPages(s.doc.pages);
    plan.splice(afterIndex + 1, 0, { blank: [ref.width, ref.height], id: newId('pg') });
    return applyPlan(ed, plan, s.objects);
}

export async function insertPdfFiles(ed, files, afterIndex) {
    const s = ed.get();
    const plan = planFromPages(s.doc.pages);
    const extra = [];
    for (const f of files) {
        const fromDoc = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()), { updateMetadata: false });
        for (let i = 0; i < fromDoc.getPageCount(); i++) extra.push({ fromDoc, srcIndex: i, id: newId('pg') });
    }
    plan.splice(afterIndex + 1, 0, ...extra);
    return applyPlan(ed, plan, s.objects);
}

/** Seçili sayfaları yeni bir PDF olarak indirir */
export async function extractPages(ed, ids) {
    const s = ed.get();
    await withBusy(ed, t('İşleniyor...'), async () => {
        const full = await buildOutputPdf(ed);
        const set = new Set(ids);
        const plan = s.doc.pages.map((p, i) => ({ srcIndex: i, id: p.id })).filter((p) => set.has(p.id));
        const bytes = await rebuildPages(full, plan);
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${baseName(s.doc.name)}-sayfalar.pdf`);
    });
}
