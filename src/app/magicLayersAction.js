// "Sihirli Katmanlar" eylemi: geçerli sayfayı katmanlara ayırır (tek geri alma adımı).
import { PDFDocument } from 'pdf-lib';
import { withBusy } from '../store/actions';
import { newId, readPages, rebuildPages } from '../core/pageOps';
import { renderPageToCanvas } from '../core/render';
import { isTextModelCached, loadTextModels, OCR_BYTES } from '../core/textDetect';
import { isSam2Cached, loadSam2, SAM2_BYTES, SAM2_LARGE_BYTES } from '../core/segment2';
import { isLamaCached, loadLama, LAMA_BYTES } from '../core/inpaint/lama';
import { isMiganCached, loadMigan } from '../core/inpaint/migan';
import { magicLayers, textToObject, layerdAvailable } from '../core/magicLayers';
import { BG_MODELS, isBgModelCached, loadBgModel } from '../core/bgremove';
import { toast } from '../components/Toaster';
import { findObject } from '../store/editor';
import { t } from '../i18n';

const STAGES = { segment: 'Nesneler bulunuyor...', text: 'Yazılar okunuyor...', fill: 'Arka plan dolduruluyor...' };

// LayerD indirilemediyse (adres erişilemez) bir daha denenmez: SAM 2 yolu kullanılır
const LAYERD_OFF = 'paperwell.layerdOff';
const layerdOff = () => { try { return localStorage.getItem(LAYERD_OFF) === BG_MODELS.layerd.url; } catch { return false; } };

/** Eksik modelleri listeler, kullanıcı onayıyla indirir. false: vazgeçildi ya da indirilemedi */
async function ensureModels(ed, fill) {
    // masaüstü GPU'da nesneleri LayerD ayırır (SAM 2 gerekmez)
    const layerdCached = await isBgModelCached('layerd');
    const layerd = (await layerdAvailable()) && (layerdCached || !layerdOff());
    let failed = false;
    // LayerD inmezse SAM 2 tiny iner; LayerD'ye bağlı diğer modeller atlanır
    const getLayerd = async (p) => {
        try { await loadBgModel('layerd', p); } catch (e) {
            console.warn('LayerD indirilemedi, SAM 2 kullanılacak', e);
            failed = true;
            try { localStorage.setItem(LAYERD_OFF, BG_MODELS.layerd.url); } catch { /* yok */ }
            if (!(await isSam2Cached())) await loadSam2(p);
        }
    };
    const unlessFailed = (fn) => (p) => (failed ? undefined : fn(p));
    const needs = [
        [await isTextModelCached(), OCR_BYTES, loadTextModels],
        ...(layerd
            ? [[layerdCached, BG_MODELS.layerd.bytes, getLayerd], [await isBgModelCached('birefnetLite'), BG_MODELS.birefnetLite.bytes, unlessFailed((p) => loadBgModel('birefnetLite', p))],
                // illüstrasyon türü afişlerde nesneleri SAM 2 base-plus ayırır
                [await isSam2Cached('basePlus'), SAM2_LARGE_BYTES, unlessFailed((p) => loadSam2(p, 'basePlus'))]]
            : [[await isSam2Cached(), SAM2_BYTES, loadSam2]]),
        [await isMiganCached(), 28e6, loadMigan],
        [fill !== 'best' || (await isLamaCached()), LAMA_BYTES, loadLama],
    ].filter(([cached]) => !cached);
    if (needs.length) {
        const mb = Math.round(needs.reduce((s, [, b]) => s + b, 0) / 1e6);
        if (!window.confirm(`${t('Sihirli Katmanlar için yapay zekâ modelleri indirilecek. Bir kez iner, sonra çevrimdışı çalışır.')} (~${mb} MB)`)) return false;
        const ok = await withBusy(ed, t('Model indiriliyor'), async (progress) => {
            for (let i = 0; i < needs.length; i++) {
                await needs[i][2]((p) => progress((i + (p || 0)) / needs.length, `${t('Model indiriliyor')} ${Math.round(((i + (p || 0)) / needs.length) * 100)}%`));
            }
            return true;
        });
        if (!ok) return false;
    }
    return true;
}

const toDataUrl = (canvas) => new Promise((r) => { canvas.convertToBlob({ type: 'image/png' }).then((b) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); });

/** Öğenin ne olduğunu kabaca söyler: katman listesinde tanınsın ("Nesne" x 34 yerine) */
function elementKind(e, area, hasText) {
    const aspect = e.w / e.h, frac = (e.w * e.h) / area;
    if (hasText) return aspect >= 2 ? 'Buton' : 'Kutu';
    if (frac > 0.12) return 'Büyük şekil';
    if (aspect > 6 || aspect < 1 / 6) return 'Çizgi';
    if (frac < 0.012 && aspect > 0.6 && aspect < 1.7) return 'Simge';
    return 'Şekil';
}

/**
 * Sihirli Katmanlar sonucunu katman nesnelerine çevirir.
 * k: canvas pikseli → sayfa birimi; (ox, oy): canvas başlangıcının sayfadaki konumu (görsel nesnesinde nesnenin sol üstü)
 * Her yazı, onu tamamen içeren en küçük öğeyle (buton, kutu) bir grup olur: birlikte taşınırlar.
 * @returns {Promise<{layers: object[], stats: {elements: number, texts: number, live: number, raster: number, groups: number}}>}
 */
async function buildLayers(res, k, ox = 0, oy = 0) {
    const layers = [];
    const area = res.background.width * res.background.height;
    const image = async (c, name, extra) => ({ id: newId('ob'), type: 'image', x: ox + c.x * k, y: oy + c.y * k, w: c.w * k, h: c.h * k, src: await toDataUrl(c.canvas), opacity: 1, name, ...extra });
    // derindeki (LayerD'nin sonraki turlarında çıkan) ve büyük nesneler altta, küçükler üstte; yazılar en üstte
    const els = [...res.elements].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0) || b.area - a.area);
    // yazı → onu içeren en küçük öğe (alanın %25'inden küçük: büyük paneller grup yapılmaz)
    const owner = res.texts.map((tx) => {
        const b = tx.layer;
        let best = -1, bestA = Infinity;
        els.forEach((e, j) => {
            const ea = e.w * e.h;
            if (ea / area > 0.25 || ea >= bestA) return;
            const ix = Math.max(0, Math.min(b.x + b.w, e.x + e.w) - Math.max(b.x, e.x)), iy = Math.max(0, Math.min(b.y + b.h, e.y + e.h) - Math.max(b.y, e.y));
            if (ix * iy >= 0.8 * b.w * b.h) { best = j; bestA = ea; }
        });
        return best;
    });
    const groupOf = new Map(), firstText = new Map();
    owner.forEach((j, i) => { if (j >= 0) { if (!groupOf.has(j)) { groupOf.set(j, newId('gp')); firstText.set(j, res.texts[i].text); } } });
    const counts = {};
    for (let j = 0; j < els.length; j++) {
        const e = els[j], gid = groupOf.get(j);
        const kind = elementKind(e, area, !!gid);
        counts[kind] = (counts[kind] || 0) + 1;
        const name = gid ? `${t(kind)}: ${firstText.get(j)}` : `${t(kind)} ${counts[kind]}`;
        layers.push(await image(e, name, gid ? { groupId: gid } : {}));
    }
    // Font eşleşmesi güçlüyse yazı canlı metin olur (afişteki pikselleri rasterSource'ta: "Afişteki haline dön").
    // Süslü / konturlu yazılar afişin kendi pikselleriyle kalır; "Metni düzenle" tahmini fontla canlı metne çevirir.
    // (iki yönde de saklanan konum diğerine göreli: katman taşınsa da karşılığı yerinde açılır)
    let live = 0;
    for (let i = 0; i < res.texts.length; i++) {
        const tx = res.texts[i];
        const o = textToObject(tx, k);
        o.x += ox; o.y += oy;
        const img = await image(tx.layer, tx.text, {});
        const gid = owner[i] >= 0 ? groupOf.get(owner[i]) : undefined;
        if (tx.live) { live++; layers.push({ id: newId('ob'), ...o, name: tx.text, ...(gid ? { groupId: gid } : {}), rasterSource: { src: img.src, x: img.x - o.x, y: img.y - o.y, w: img.w, h: img.h } }); }
        else layers.push({ ...img, ...(gid ? { groupId: gid } : {}), textSource: { ...o, x: o.x - img.x, y: o.y - img.y } });
    }
    return { layers, stats: { elements: els.length, texts: res.texts.length, live, raster: res.texts.length - live, groups: groupOf.size } };
}

/** Bitince ne yapıldığını düz Türkçe ile söyler */
function summaryToast(stats) {
    const parts = [`${stats.elements} ${t('parça')}`, `${stats.texts} ${t('yazı')}`];
    let msg = `${parts.join(' · ')} ${t('ayrıldı')}`;
    if (stats.groups) msg += ` · ${stats.groups} ${t('grup (buton + yazısı birlikte taşınır)')}`;
    if (stats.live) msg += ` · ${stats.live} ${t('yazı doğrudan düzenlenebilir')}`;
    if (stats.raster) msg += ` · ${stats.raster} ${t('yazı süslü olduğu için resim kaldı: seçip "Metni düzenle"ye basın')}`;
    toast(msg, 'success', 9000);
}

/** Seçili görsel nesnesini katmanlara ayırır: nesne temizlenmiş arka plan olur, öğeler ve yazılar üstüne gelir (tek geri alma adımı) */
export async function runMagicLayersOnObject(ed, objectId, { fill = 'best' } = {}) {
    const found = findObject(ed.get().objects, objectId);
    if (!found || found.obj.type !== 'image') return;
    if (found.obj.rotation) { toast(t('Önce görselin açısını sıfırlayın'), 'error'); return; }
    if (!(await ensureModels(ed, fill))) return;
    await withBusy(ed, t('Katmanlara ayrılıyor...'), async (progress) => {
        const o = found.obj;
        // Nesnenin kendi görseli, en çok 2000 px
        const bmp = await createImageBitmap(await (await fetch(o.src)).blob());
        const sc = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
        const canvas = new OffscreenCanvas(Math.round(bmp.width * sc), Math.round(bmp.height * sc));
        canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
        const res = await magicLayers(canvas, { fill, onProgress: (p, stage) => progress(p, t(STAGES[stage] || 'Katmanlara ayrılıyor...')) });
        const s = ed.get();
        const list = s.objects[found.pageId] || [];
        const i = list.findIndex((q) => q.id === objectId);
        if (i < 0) return;
        const bg = { ...o, src: await toDataUrl(res.background), name: t('Arka plan') };
        const { layers, stats } = await buildLayers(res, o.w / canvas.width, o.x, o.y);
        const objects = { ...s.objects, [found.pageId]: [...list.slice(0, i), bg, ...layers, ...list.slice(i + 1)] };
        ed.dispatch({ type: 'COMMIT', bytes: s.doc.bytes, objects });
        summaryToast(stats);
    });
}

export async function runMagicLayers(ed, { fill = 'best' } = {}) {
    if (!(await ensureModels(ed, fill))) return;

    await withBusy(ed, t('Katmanlara ayrılıyor...'), async (progress) => {
        const s = ed.get();
        const pageIndex = s.page;
        const page = s.doc.pages[pageIndex];
        // Görsel belgede orijinal çözünürlük; PDF'te ~1600 px
        const scale = s.doc.kind === 'image' ? (s.doc.imageSize?.w || page.width) / s.doc.pages[0].width : Math.min(3, 1600 / Math.max(page.width, page.height));
        const canvas = await renderPageToCanvas(s.doc.bytes, pageIndex, scale);
        const res = await magicLayers(canvas, { fill, onProgress: (p, stage) => progress(p, t(STAGES[stage] || 'Katmanlara ayrılıyor...')) });

        // Arka plan: sayfa yeni (temizlenmiş) görselle değiştirilir
        const blob = await res.background.convertToBlob(s.doc.mime === 'image/png' ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.95 });
        const bytesImg = new Uint8Array(await blob.arrayBuffer());
        const one = await PDFDocument.create();
        const emb = s.doc.mime === 'image/png' ? await one.embedPng(bytesImg) : await one.embedJpg(bytesImg);
        one.addPage([page.width, page.height]).drawImage(emb, { x: 0, y: 0, width: page.width, height: page.height });
        const fromDoc = await PDFDocument.load(await one.save());
        const plan = s.doc.pages.map((p, i) => (i === pageIndex ? { fromDoc, srcIndex: 0, id: p.id } : { srcIndex: i, id: p.id }));
        const bytes = await rebuildPages(s.doc.bytes, plan);
        const pages = await readPages(bytes, plan.map((p) => p.id));

        const { layers, stats } = await buildLayers(res, page.width / canvas.width);

        ed.dispatch({ type: 'SET_TOOL', tool: 'select' });
        ed.dispatch({ type: 'COMMIT', bytes, pages, objects: { ...s.objects, [page.id]: [...(s.objects[page.id] || []), ...layers] } });
        summaryToast(stats);
    });
}
