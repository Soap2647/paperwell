// Hareketli story: afişin zemini sabit (isteğe bağlı hafif yakınlaşma), eklenen öğeler (logo, yazı, QR) yukarıdan aşağı
// sırayla belirir. Tuval MediaRecorder ile kaydedilir: önce MP4 (Instagram doğrudan kabul eder), olmazsa WebM.
import { PDFDocument } from 'pdf-lib';
import { renderPageToCanvas, renderPageSharp } from '../core/render';
import { exportPdf } from '../core/export';
import { exportSize } from '../core/pageSize';
import { bbox } from './objects';

const FPS = 30;
const ease = (x) => 1 - (1 - x) ** 3;

/** Video boyutu: sayfanın dışa aktarma boyutu, uzun kenar en çok 1920 (çift sayıya yuvarlanır; kodlayıcı ister) */
function videoSize(s) {
    const page = s.doc.pages[s.page];
    const ex = exportSize(page.width, page.height, s.doc.pixelSize);
    const k = Math.min(1, 1920 / Math.max(ex.w, ex.h));
    const w = Math.round((ex.w * k) / 2) * 2, h = Math.round((ex.h * k) / 2) * 2;
    return { w, h, scale: w / page.width };
}

/** Her öğe kendi saydam katmanında (efektleri dahil), sayfa koordinatındaki kutusuyla */
async function objectLayers(s, scale) {
    const page = s.doc.pages[s.page];
    const objs = (s.objects[page.id] || []).filter((o) => !o.hidden && o.type !== 'note');
    const blank = await PDFDocument.create();
    blank.addPage([page.width, page.height]);
    const blankBytes = await blank.save();
    const out = [];
    for (const o of objs) {
        const pdf = await exportPdf(blankBytes, [page], { [page.id]: [o] });
        const full = await renderPageSharp(pdf, 0, scale, 'transparent');
        const b = bbox(o), pad = 40;
        const x = Math.max(0, Math.floor((b.x - pad) * scale)), y = Math.max(0, Math.floor((b.y - pad) * scale));
        const w = Math.min(full.width - x, Math.ceil((b.w + pad * 2) * scale)), h = Math.min(full.height - y, Math.ceil((b.h + pad * 2) * scale));
        if (w <= 0 || h <= 0) continue;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(full, x, y, w, h, 0, 0, w, h);
        out.push({ canvas: c, x, y, w, h, top: b.y, group: o.groupId });
    }
    // yukarıdan aşağı; aynı gruptakiler birlikte belirir
    out.sort((a, b) => a.top - b.top);
    let slot = -1, lastGroup = null;
    for (const l of out) { if (!l.group || l.group !== lastGroup) slot++; l.slot = slot; lastGroup = l.group; }
    return out;
}

export function pickMime() {
    const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    return types.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || null;
}

/**
 * @param {object} s - editör durumu
 * @param {{style: 'up'|'zoom'|'fade', duration: number, kenBurns: boolean, onProgress?: (p:number)=>void}} opts
 * @returns {Promise<{blob: Blob, ext: string}>}
 */
export async function renderStoryVideo(s, { style = 'up', duration = 6, kenBurns = true, onProgress }) {
    const mime = pickMime();
    if (!mime) throw new Error('Bu sistem video kaydını desteklemiyor');
    const { w, h, scale } = videoSize(s);
    const page = s.doc.pages[s.page];
    const bg = await renderPageToCanvas(s.doc.bytes, s.page, scale, '#fff');
    const layers = await objectLayers(s, scale);
    const slots = layers.reduce((m, l) => Math.max(m, l.slot + 1), 0);
    // girişler sürenin ilk %55'ine yayılır, kalan sürede afiş durur (okunsun)
    const inEnd = duration * 0.55, each = 0.7, gap = slots > 1 ? Math.max(0.12, (inEnd - each) / (slots - 1)) : 0;

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const draw = (tm) => {
        const z = kenBurns ? 1 + 0.06 * (tm / duration) : 1;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bg, (w - w * z) / 2, (h - h * z) / 2, w * z, h * z);
        for (const l of layers) {
            const p = Math.max(0, Math.min(1, (tm - 0.3 - l.slot * gap) / each));
            if (p <= 0) continue;
            const e = ease(p);
            ctx.save();
            ctx.globalAlpha = e;
            const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
            if (style === 'up') ctx.translate(0, (1 - e) * page.height * 0.04 * scale);
            if (style === 'zoom') { const k = 0.82 + 0.18 * e; ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy); }
            ctx.drawImage(l.canvas, l.x, l.y);
            ctx.restore();
        }
    };
    draw(0);
    const stream = c.captureStream(FPS);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => { rec.onstop = res; });
    rec.start(250);
    const t0 = performance.now();
    await new Promise((res) => {
        const tick = () => {
            const tm = (performance.now() - t0) / 1000;
            draw(Math.min(tm, duration));
            onProgress?.(Math.min(1, tm / duration));
            // zamanlayıcıyla: pencere arka plandayken requestAnimationFrame durur, kayıt bitmezdi
            if (tm >= duration) res(); else setTimeout(tick, 1000 / FPS);
        };
        tick();
    });
    rec.stop();
    await done;
    stream.getTracks().forEach((tr) => tr.stop());
    const type = mime.split(';')[0];
    return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
}
