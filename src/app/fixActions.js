// "Düzelt" aracı: yapay zekâ görselindeki bozuk bölgeyi kutula → Sil / Yazıyı düzelt / Logo koy (her biri tek geri alma adımı).
// Kutunun altındaki en üst görsel nesnesi varsa onun pikselleri, yoksa sayfanın kendisi düzeltilir.
import { commitBytes, withBusy } from '../store/actions';
import { newId } from '../core/pageOps';
import { renderRegion } from '../core/render';
import { patchPage } from '../core/eraser';
import { analyzeRegion, eraseRegion, readRegionText, loadImageCanvas, canvasToDataUrl, toHex } from '../core/regionFix';
import { inkStats } from '../core/smartMask';
import { isMiganCached, loadMigan } from '../core/inpaint/migan';
import { isTextModelCached, loadTextModels, OCR_BYTES } from '../core/textDetect';
import { FONT_FAMILIES } from '../core/fonts';
import { toast } from '../components/Toaster';
import { t } from '../i18n';

const MIGAN_BYTES = 28e6;

/** Gerekli modeller yoksa bir kez onay alıp indirir */
async function ensureModels(ed, text) {
    const need = [];
    if (!(await isMiganCached())) need.push([MIGAN_BYTES, loadMigan]);
    if (text && !(await isTextModelCached())) need.push([OCR_BYTES, loadTextModels]);
    if (!need.length) return true;
    const mb = Math.round(need.reduce((s, [b]) => s + b, 0) / 1e6);
    if (!window.confirm(`${t('Düzeltme için yapay zekâ modeli indirilecek. Bir kez iner, sonra çevrimdışı çalışır.')} (~${mb} MB)`)) return false;
    return !!(await withBusy(ed, t('Model indiriliyor'), async (progress) => {
        for (let i = 0; i < need.length; i++) await need[i][1]((p) => progress((i + (p || 0)) / need.length, `${t('Model indiriliyor')} ${Math.round(((i + (p || 0)) / need.length) * 100)}%`));
        return true;
    }));
}

/** Kutunun altındaki en üst görsel nesnesi (döndürülmemiş, görünür) */
function imageUnder(s, pageIndex, rect) {
    const list = s.objects[s.doc.pages[pageIndex].id] || [];
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        if (o.type === 'image' && !o.rotation && !o.hidden && !o.locked && cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h) return o;
    }
    return null;
}

/** Fırça modunda boyanan alanı raster pikseline taşır: paint(x, y) */
function withPaint(fix, prep) {
    const b = fix.brush;
    if (b) prep.paint = (x, y) => {
        const px = Math.round((prep.ox + x * prep.k) * b.scale), py = Math.round((prep.oy + y * prep.k) * b.scale);
        return px >= 0 && py >= 0 && px < b.w && py < b.h && b.data[py * b.w + px] === 1;
    };
    return prep;
}

/** Düzeltilecek raster: canvas + kutunun piksel karşılığı + piksel → sayfa birimi dönüşümü */
async function prepare(s, fix) {
    const { pageIndex, rect } = fix;
    const obj = imageUnder(s, pageIndex, rect);
    if (obj) {
        const canvas = await loadImageCanvas(obj.src);
        const sx = canvas.width / obj.w, sy = canvas.height / obj.h;
        const box = { x0: Math.max(0, (rect.x - obj.x) * sx), y0: Math.max(0, (rect.y - obj.y) * sy), x1: Math.min(canvas.width, (rect.x + rect.w - obj.x) * sx), y1: Math.min(canvas.height, (rect.y + rect.h - obj.y) * sy) };
        return withPaint(fix, { kind: 'object', obj, canvas, box, k: 1 / sx, ox: obj.x, oy: obj.y });
    }
    const page = s.doc.pages[pageIndex];
    // bağlam payı: onarım çevreye bakar
    const pad = Math.max(16, Math.max(rect.w, rect.h) * 0.5);
    const region = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad) };
    region.w = Math.min(page.width, rect.x + rect.w + pad) - region.x;
    region.h = Math.min(page.height, rect.y + rect.h + pad) - region.y;
    // görsel belgede özgün piksel çözünürlüğü, PDF'te ~1,5 MP
    const scale = s.doc.kind === 'image' ? (s.doc.imageSize?.w || page.width) / page.width : Math.max(1, Math.min(3, Math.sqrt(1.5e6 / (region.w * region.h))));
    const canvas = await renderRegion(s.doc.bytes, pageIndex, region, scale);
    const box = { x0: (rect.x - region.x) * scale, y0: (rect.y - region.y) * scale, x1: (rect.x + rect.w - region.x) * scale, y1: (rect.y + rect.h - region.y) * scale };
    return withPaint(fix, { kind: 'page', region, scale, canvas, box, k: 1 / scale, ox: region.x, oy: region.y });
}

/** Onarılmış raster'ı belgeye yazar; extra: üstüne eklenecek nesneler. Tek geri alma adımı */
async function commit(ed, fix, prep, erased, extra = []) {
    const s = ed.get();
    const page = s.doc.pages[fix.pageIndex];
    let list = s.objects[page.id] || [];
    if (prep.kind === 'object') {
        const src = await canvasToDataUrl(prep.canvas);
        list = list.map((o) => (o.id === prep.obj.id ? { ...o, src } : o));
        ed.dispatch({ type: 'COMMIT', bytes: s.doc.bytes, objects: { ...s.objects, [page.id]: [...list, ...extra] } });
        return;
    }
    // sayfa: maske bölge koordinatından canvas boyutuna
    const W = prep.canvas.width, full = new Uint8Array(W * prep.canvas.height), r = erased.region, rw = r.x1 - r.x0;
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) full[y * W + x] = erased.mask[(y - r.y0) * rw + (x - r.x0)];
    const bytes = await patchPage({ bytes: s.doc.bytes, pageIndex: fix.pageIndex, rect: prep.region, canvas: prep.canvas, scale: prep.scale, mask: full });
    await commitBytes(ed, bytes, { objects: { ...s.objects, [page.id]: [...list, ...extra] } });
}

const select = (ed, pageIndex, obj) => {
    ed.dispatch({ type: 'SET_TOOL', tool: 'select' });
    ed.dispatch({ type: 'SET', values: { selected: { pageId: ed.get().doc.pages[pageIndex].id, id: obj.id } } });
};

/** Sil: bölgedeki bozuk detay silinir, arka plan tamamlanır */
export async function fixErase(ed) {
    const fix = ed.get().fix;
    if (!fix || !(await ensureModels(ed, false))) return;
    await withBusy(ed, t('Siliniyor...'), async () => {
        const prep = await prepare(ed.get(), fix);
        const erased = await eraseRegion(prep.canvas, prep.box, { a: analyzeRegion(prep.canvas, prep.box, prep.paint) });
        await commit(ed, fix, prep, erased);
        toast(t('Silindi. Beğenmezseniz Ctrl+Z.'), 'success', 3000);
    });
}

/** Yazıyı düzelt 1. adım: kutudaki yazıyı okuyup düzenleme kutusuna koyar */
export async function fixStartText(ed) {
    const fix = ed.get().fix;
    if (!fix || !(await ensureModels(ed, true))) return;
    ed.dispatch({ type: 'SET', values: { fix: { ...fix, step: 'text', text: '', reading: true } } });
    try {
        const prep = await prepare(ed.get(), fix);
        const r = await readRegionText(prep.canvas, prep.box);
        if (ed.get().fix?.rect !== fix.rect) return;
        ed.dispatch({ type: 'SET', values: { fix: { ...ed.get().fix, text: r.text, reading: false } } });
    } catch (e) {
        if (ed.get().fix?.rect === fix.rect) ed.dispatch({ type: 'SET', values: { fix: { ...ed.get().fix, reading: false } } });
        toast(`${t('Yazı okunamadı')}: ${e.message}`, 'error');
    }
}

/**
 * Yeni yazının boyutu ve yeri: eski yazının mürekkebiyle aynı yükseklikte ve aynı merkezde (sayfa birimi).
 * Yeni yazı daha uzunsa kutuya sığacak kadar küçülür. ink: eski mürekkebin kutusu (yoksa kullanıcının kutusu).
 */
async function layoutText(text, rect, ink, family, bold) {
    const css = (FONT_FAMILIES[family] || FONT_FAMILIES.sans).css, weight = bold ? 700 : 400;
    try { await document.fonts.load(`${weight} 100px ${css}`); } catch { /* yoksay */ }
    const ctx = new OffscreenCanvas(8, 8).getContext('2d');
    ctx.font = `${weight} 100px ${css}`;
    const lines = text.split('\n'), n = lines.length, ms = lines.map((l) => ctx.measureText(l));
    const inkW = Math.max(...ms.map((m) => m.actualBoundingBoxLeft + m.actualBoundingBoxRight)) / 100;
    const inkH = Math.max(...ms.map((m) => m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)) / 100;
    const area = ink || { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    // n satırın mürekkep yüksekliği ≈ (n-1) satır aralığı + son satırın mürekkebi
    let size = ink ? area.h / ((n - 1) * 1.25 + inkH) : rect.h / (n * 1.25);
    size = Math.max(4, Math.min(size, (Math.max(rect.w, area.w) * 0.98) / Math.max(0.01, inkW)));
    // metin kutusunda mürekkebin dikey merkezi (ilk satır): taban çizgisi yarı satır aralığı + font yükselimi kadar aşağıda
    const m = ms[0], asc = m.fontBoundingBoxAscent / 100, desc = m.fontBoundingBoxDescent / 100;
    const baseline = (1.25 - (asc + desc)) / 2 + asc;
    const firstInkCy = (baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 200) * size;
    const h = n * size * 1.25, w = Math.max(rect.w, inkW * size * 1.04);
    const lastInkCy = firstInkCy + (n - 1) * size * 1.25;
    const y = area.y + area.h / 2 - (firstInkCy + lastInkCy) / 2;
    return { size, x: area.x + area.w / 2 - w / 2, y, w, h };
}

/** Yazıyı düzelt 2. adım: eski yazı silinir, yerine (marka fontuyla, eskisinin boyut ve kalınlığında) düzenlenebilir yazı gelir */
export async function fixApplyText(ed, text) {
    const fix = ed.get().fix;
    text = text.trim();
    if (!fix || !text) return;
    await withBusy(ed, t('Yazı düzeltiliyor...'), async () => {
        const s = ed.get();
        const prep = await prepare(s, fix);
        const a = analyzeRegion(prep.canvas, prep.box, prep.paint);
        const st = a.whole ? null : inkStats(a.core, a.region.x1 - a.region.x0, a.region.y1 - a.region.y0);
        const ink = st && { x: prep.ox + (a.region.x0 + st.box.x0) * prep.k, y: prep.oy + (a.region.y0 + st.box.y0) * prep.k, w: (st.box.x1 - st.box.x0) * prep.k, h: (st.box.y1 - st.box.y0) * prep.k };
        const erased = await eraseRegion(prep.canvas, prep.box, { a });
        const { family, italic } = s.opts.text;
        // harf gövdesi kalınsa (yüksekliğin ~%12'sinden fazla) yeni yazı da kalın
        const bold = st ? st.stroke > 0.12 : s.opts.text.bold;
        const L = await layoutText(text, fix.rect, ink, family, bold);
        const obj = {
            id: newId('ob'), type: 'text', text, family, bold, italic, size: L.size,
            color: a.fg ? toHex(a.fg) : s.opts.text.color, align: 'center', lineHeight: 1.25, opacity: 1,
            x: L.x, y: L.y, w: L.w, h: L.h, rotation: 0, name: text.split('\n')[0],
        };
        await commit(ed, fix, prep, erased, [obj]);
        select(ed, fix.pageIndex, obj);
        toast(t('Yazı düzeltildi. Fontu, rengi ve boyutu sağdaki panelden değiştirebilirsiniz.'), 'success', 5000);
    });
}

/** Logo koy: bölgedeki bozuk logo silinir, marka kitindeki logo aynı yere sığdırılır */
export async function fixApplyLogo(ed, asset) {
    const fix = ed.get().fix;
    if (!fix || !(await ensureModels(ed, false))) return;
    await withBusy(ed, t('Logo yerleştiriliyor...'), async () => {
        const prep = await prepare(ed.get(), fix);
        const erased = await eraseRegion(prep.canvas, prep.box, { a: analyzeRegion(prep.canvas, prep.box, prep.paint) });
        const r = fix.rect, k = Math.min(r.w / asset.w, r.h / asset.h) * 0.92;
        const w = asset.w * k, h = asset.h * k;
        const obj = { id: newId('ob'), type: 'image', x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h, src: asset.src, opacity: 1, name: asset.name };
        await commit(ed, fix, prep, erased, [obj]);
        select(ed, fix.pageIndex, obj);
        toast(t('Logo yerleşti. Köşelerden boyutunu ayarlayabilirsiniz.'), 'success', 4000);
    });
}

export const clearFix = (ed) => ed.dispatch({ type: 'SET', values: { fix: null } });
export const setFixStep = (ed, step) => ed.dispatch({ type: 'SET', values: { fix: { ...ed.get().fix, step } } });
