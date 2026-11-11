// Görseldeki yazıyı bulur ve okur: PaddleOCR (Apache-2.0) algılama (DB, eğik yazı dahil) + Latin tanıma (Türkçe destekli).
// Modeller ilk kullanımda iner (~10 MB), Cache Storage'da saklanır.
import { fetchModel, isModelCached, getOrt, createSession } from './modelStore';

const BASE = 'https://huggingface.co/monkt/paddleocr-onnx/resolve/7b02d0a30a07ba2b92ad1ff5a8941ae2c633de65/';
export const OCR_URLS = [`${BASE}detection/v3/det.onnx`, `${BASE}languages/latin/rec.onnx`, `${BASE}languages/latin/dict.txt`];
export const OCR_BYTES = 10.3e6;

let loading = null;
export const isTextModelCached = () => isModelCached(...OCR_URLS);

export function loadTextModels(onProgress) {
    if (!loading) {
        loading = (async () => {
            const ort = await getOrt();
            const det = await fetchModel(OCR_URLS[0], (p) => onProgress?.(p * 0.23), 2.4e6);
            const rec = await fetchModel(OCR_URLS[1], (p) => onProgress?.(0.23 + p * 0.76), 7.9e6);
            const dict = new TextDecoder().decode(await fetchModel(OCR_URLS[2], null, 3e3)).split(/\r?\n/);
            if (dict[dict.length - 1] === '') dict.pop();
            onProgress?.(1);
            return {
                ort,
                det: await createSession(det, { webgpu: false }),
                rec: await createSession(rec, { webgpu: false }),
                // 0: CTC boşluğu, 1..n sözlük, n+1: boşluk karakteri
                chars: ['', ...dict, ' '],
            };
        })().catch((e) => { loading = null; throw e; });
    }
    return loading;
}

// ─── Geometri ────────────────────────────────────────────────────────────────

function hull(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** En küçük alanlı döndürülmüş dikdörtgen: { cx, cy, w, h, angle } (angle radyan, w uzun kenar yönünde) */
export function minAreaRect(points) {
    const hp = hull(points);
    let best = null;
    for (let i = 0; i < hp.length; i++) {
        const [x0, y0] = hp[i], [x1, y1] = hp[(i + 1) % hp.length];
        const a = Math.atan2(y1 - y0, x1 - x0), c = Math.cos(a), s = Math.sin(a);
        let mnu = Infinity, mxu = -Infinity, mnv = Infinity, mxv = -Infinity;
        for (const [x, y] of hp) {
            const u = x * c + y * s, v = -x * s + y * c;
            if (u < mnu) mnu = u; if (u > mxu) mxu = u; if (v < mnv) mnv = v; if (v > mxv) mxv = v;
        }
        const area = (mxu - mnu) * (mxv - mnv);
        if (!best || area < best.area) {
            const cu = (mnu + mxu) / 2, cv = (mnv + mxv) / 2;
            best = { area, cx: cu * c - cv * s, cy: cu * s + cv * c, w: mxu - mnu, h: mxv - mnv, angle: a };
        }
    }
    if (!best) return null;
    // Yazı yatay okunur: uzun kenarı genişlik yap, açıyı (-90°, 90°] aralığına getir
    if (best.h > best.w) { [best.w, best.h] = [best.h, best.w]; best.angle += Math.PI / 2; }
    while (best.angle > Math.PI / 2) best.angle -= Math.PI;
    while (best.angle <= -Math.PI / 2) best.angle += Math.PI;
    return best;
}

/** Döndürülmüş kutunun köşeleri (sol-üst, sağ-üst, sağ-alt, sol-alt; okuma yönünde) */
export function rectCorners({ cx, cy, w, h, angle }) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([u, v]) => [cx + u * c - v * s, cy + u * s + v * c]);
}

// ─── Algılama ────────────────────────────────────────────────────────────────

/**
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @returns {Promise<{cx,cy,w,h,angle,score}[]>} canvas piksel koordinatlarında satır kutuları
 */
export async function detectText(canvas, { maxSide = 1280 } = {}) {
    const { ort, det } = await loadTextModels();
    const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const W = Math.max(32, Math.round((canvas.width * k) / 32) * 32), H = Math.max(32, Math.round((canvas.height * k) / 32) * 32);
    const c = new OffscreenCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    const plane = W * H, input = new Float32Array(plane * 3);
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    for (let i = 0; i < plane; i++) {
        // PaddleOCR BGR sırasıyla eğitildi
        for (let ch = 0; ch < 3; ch++) input[ch * plane + i] = (px[i * 4 + (2 - ch)] / 255 - mean[ch]) / std[ch];
    }
    const out = await det.run({ x: new ort.Tensor('float32', input, [1, 3, H, W]) });
    const prob = Object.values(out)[0].data;

    // İkili harita → bağlı bileşenler → döndürülmüş kutu (DB son işlemi)
    const bin = new Uint8Array(plane);
    for (let i = 0; i < plane; i++) bin[i] = prob[i] > 0.3 ? 1 : 0;
    const seen = new Uint8Array(plane);
    const boxes = [];
    const sx = canvas.width / W, sy = canvas.height / H;
    for (let i = 0; i < plane; i++) {
        if (!bin[i] || seen[i]) continue;
        const stack = [i], pts = [];
        seen[i] = 1;
        let sum = 0;
        while (stack.length) {
            const p = stack.pop();
            const x = p % W, y = (p / W) | 0;
            pts.push([x, y], [x + 1, y + 1]);
            sum += prob[p];
            for (const q of [p - 1, p + 1, p - W, p + W]) {
                if (q < 0 || q >= plane || seen[q] || !bin[q]) continue;
                if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue;
                seen[q] = 1; stack.push(q);
            }
        }
        const n = pts.length / 2;
        if (n < 12) continue;
        const score = sum / n;
        if (score < 0.55) continue;
        const r = minAreaRect(pts);
        if (!r || Math.min(r.w, r.h) < 3) continue;
        // unclip: kutuyu (alan × 1.5 / çevre) kadar büyüt
        const d = (r.w * r.h * 1.5) / (2 * (r.w + r.h));
        boxes.push({ cx: r.cx * sx, cy: r.cy * sy, w: (r.w + 2 * d) * sx, h: (r.h + 2 * d) * sy, angle: r.angle, score });
    }
    return boxes;
}

// ─── Tanıma ──────────────────────────────────────────────────────────────────

/** Döndürülmüş kutuyu yatay şerit olarak keser */
export function cropRotated(canvas, box, height) {
    const k = height / box.h;
    const W = Math.max(8, Math.round(box.w * k)), H = Math.round(height);
    const c = new OffscreenCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(k, 0, 0, k, W / 2, H / 2);
    ctx.rotate(-box.angle);
    ctx.translate(-box.cx, -box.cy);
    ctx.drawImage(canvas, 0, 0);
    return c;
}

/** @returns {Promise<{text:string, conf:number}>} */
export async function recognize(canvas, box) {
    const { ort, rec, chars } = await loadTextModels();
    const crop = cropRotated(canvas, box, 48);
    const W = Math.min(1600, crop.width), H = 48;
    const px = crop.getContext('2d').getImageData(0, 0, W, H).data;
    const plane = W * H, input = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) {
        for (let ch = 0; ch < 3; ch++) input[ch * plane + i] = (px[i * 4 + (2 - ch)] / 255 - 0.5) / 0.5;
    }
    const out = await rec.run({ x: new ort.Tensor('float32', input, [1, 3, H, W]) });
    const t = Object.values(out)[0];
    const [, T, C] = t.dims;
    let text = '', last = 0, conf = 0, n = 0;
    for (let i = 0; i < T; i++) {
        let best = 0, bv = -Infinity;
        for (let j = 0; j < C; j++) { const v = t.data[i * C + j]; if (v > bv) { bv = v; best = j; } }
        if (best !== 0 && best !== last) { text += chars[best] ?? ''; conf += bv; n++; }
        last = best;
    }
    return { text: text.trim(), conf: n ? conf / n : 0 };
}
