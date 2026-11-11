// Belge düzeyi eylemler (async). Her biri { dispatch, get } alır.
import { PDFDocument } from 'pdf-lib';
import { readPages, rebuildPages, rotateObjects, cloneObjects, newId } from '../core/pageOps';
import { exportPdf } from '../core/export';
import { renderPageToCanvas, releasePdfjsDoc } from '../core/render';
import { toast } from '../components/Toaster';
import { t } from '../i18n';

export function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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
        ed.dispatch({ type: 'LOAD', doc: { name: file.name, kind, bytes, pages, ...extra } });
    });
}

export async function createBlank(ed) {
    const doc = await PDFDocument.create();
    doc.addPage([595.28, 841.89]);
    const bytes = await doc.save();
    ed.dispatch({ type: 'LOAD', doc: { name: 'Yeni belge.pdf', kind: 'pdf', bytes, pages: await readPages(bytes) } });
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
    return exportPdf(s.doc.bytes, s.doc.pages, s.objects);
}

export async function download(ed) {
    const s = ed.get();
    if (!s.doc) return;
    await withBusy(ed, t('İşleniyor...'), async () => {
        const out = await buildOutputPdf(ed);
        if (s.doc.kind === 'image') {
            const k = (s.doc.imageSize?.w || s.doc.pages[0].width) / s.doc.pages[0].width;
            const canvas = await renderPageToCanvas(out, 0, k, s.doc.mime === 'image/jpeg' ? '#fff' : null);
            const jpeg = s.doc.mime === 'image/jpeg';
            const blob = await new Promise((r) => canvas.toBlob(r, jpeg ? 'image/jpeg' : 'image/png', 0.95));
            downloadBlob(blob, `${baseName(s.doc.name)}-paperwell.${jpeg ? 'jpg' : 'png'}`);
        } else {
            downloadBlob(new Blob([out], { type: 'application/pdf' }), `${baseName(s.doc.name)}.pdf`);
        }
        ed.dispatch({ type: 'SAVED' });
        toast(t('İndirildi'), 'success');
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
