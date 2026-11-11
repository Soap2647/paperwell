// Sihirli Katmanlar: düz bir afişi düzenlenebilir katmanlara ayırır.
//  1) Yazılar → PaddleOCR (eğik yazı dahil) + Tesseract ile Türkçe harf doğrulama → stil (renk, boyut, açı, font).
//     Katman, afişin piksellerinden birebir kesilir (font değişmez); OCR metni ve tahmini stil, "metni düzenle" için saklanır.
//  2) Nesneler/grafikler → SAM 2 ızgara ("her şeyi segmente et") + kararlılık / grafik-mi / belirginlik süzgeci → şeffaf PNG katmanı
//  3) Arka plan → yazı ve nesnelerin yeri doldurulur (büyük alanlar LaMa, küçükler MI-GAN)
import { detectText, recognize, cropRotated, rectCorners } from './textDetect';
import { recognizeLine } from './ocr';
import { encodeImage2, decode2 } from './segment2';
import { inpaintMigan } from './inpaint/migan';
import { inpaintLama } from './inpaint/lama';
import { FONT_FAMILIES } from './fonts';

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// ─── Yazılar ─────────────────────────────────────────────────────────────────

const FOLD = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', I: 'i' };
const fold = (s) => s.replace(/[ıİşŞğĞüÜöÖçÇI]/g, (c) => FOLD[c]).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Paddle metnini, aynı harflere sahipse (aksansız karşılaştırma) Tesseract'ın Türkçe harfli kelimeleriyle düzeltir */
export function mergeDiacritics(paddle, tess) {
    const a = paddle.split(/\s+/), b = tess.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    tess = b.join(' ');
    if (a.length !== b.length) return fold(paddle) === fold(tess) ? tess : paddle;
    const clean = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.,:!?-]+$/gu, '');
    // Türkçe/Latin dışı harf (ör. Yunanca ς) içeren kelimede, uzunluğu tutan Tesseract kelimesi daha güvenilir
    const foreign = (w) => /[^\p{Script=Latin}\p{N}\p{P}\p{S}]/u.test(w);
    return a.map((w, i) => {
        const t = clean(b[i]);
        if (fold(w) && fold(w) === fold(t)) return t || w;
        if (foreign(w) && t.length === w.length && !foreign(t)) return t;
        return w;
    }).join(' ');
}

function kmeans2(px) {
    // px: [r,g,b][]; başlangıç: kenar ortalaması (zemin) ve ona en uzak piksel (yazı)
    let bg = px.border, fg = px.reduce((best, p) => (dist(p, bg) > dist(best, bg) ? p : best), px[0]);
    for (let it = 0; it < 8; it++) {
        const sb = [0, 0, 0], sf = [0, 0, 0];
        let nb = 0, nf = 0;
        for (const p of px) {
            if (dist(p, fg) < dist(p, bg)) { sf[0] += p[0]; sf[1] += p[1]; sf[2] += p[2]; nf++; } else { sb[0] += p[0]; sb[1] += p[1]; sb[2] += p[2]; nb++; }
        }
        if (nf) fg = sf.map((v) => v / nf);
        if (nb) bg = sb.map((v) => v / nb);
    }
    return { fg, bg };
}
const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Kesitteki yazı piksellerini ve renklerini bulur */
function textPixels(crop) {
    const W = crop.width, H = crop.height;
    const d = crop.getContext('2d').getImageData(0, 0, W, H).data;
    const px = [];
    for (let i = 0; i < W * H; i++) px.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    const border = [0, 0, 0];
    let n = 0;
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const p = px[y * W + x]; border[0] += p[0]; border[1] += p[1]; border[2] += p[2]; n++; }
    px.border = border.map((v) => v / n);
    const { fg, bg } = kmeans2(px);
    const ink = new Uint8Array(W * H);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < W * H; i++) {
        if (dist(px[i], fg) < dist(px[i], bg)) {
            ink[i] = 1;
            const x = i % W, y = (i / W) | 0;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    }
    // yazı rengi: kenar pikselleri (yumuşatma) dışındaki çekirdek piksellerin ortancası
    const core = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (ink[i] && ink[i - 1] && ink[i + 1] && ink[i - W] && ink[i + W]) core.push(px[i]);
    }
    const med = (k) => { const v = core.map((p) => p[k]).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : fg[k]; };
    return { ink, fg: core.length ? [med(0), med(1), med(2)] : fg, bg, contrast: Math.sqrt(dist(fg, bg)), box: x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 } };
}

const CANDIDATES = [];
for (const family of ['sans', 'serif']) for (const bold of [false, true]) for (const italic of [false, true]) CANDIDATES.push({ family, bold, italic });

const fontCss = ({ family, bold, italic }, size) => `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${FONT_FAMILIES[family].css}`;

/** Yazının mürekkep izine en çok benzeyen font + boyut */
function matchFont(text, ink, W, H, box) {
    const iw = box.x1 - box.x0, ih = box.y1 - box.y0;
    const mc = new OffscreenCanvas(8, 8).getContext('2d');
    let best = null;
    for (const cand of CANDIDATES) {
        mc.font = fontCss(cand, 100);
        const m = mc.measureText(text);
        const inkW100 = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
        const inkH100 = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
        if (!inkW100 || !inkH100) continue;
        const size = (iw / inkW100) * 100;
        // Mürekkep izini çizip örtüşmeyi ölç (ölçeği eni tutturur; boy uyumu da puanlanır)
        const c = new OffscreenCanvas(iw, ih);
        const ctx = c.getContext('2d');
        ctx.font = fontCss(cand, size);
        ctx.fillStyle = '#000';
        const mm = ctx.measureText(text);
        ctx.setTransform(1, 0, 0, ih / (mm.actualBoundingBoxAscent + mm.actualBoundingBoxDescent || 1), 0, 0);
        ctx.fillText(text, mm.actualBoundingBoxLeft, mm.actualBoundingBoxAscent);
        const r = ctx.getImageData(0, 0, iw, ih).data;
        let inter = 0, uni = 0;
        for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
            const a = r[(y * iw + x) * 4 + 3] > 110, b = ink[(y + box.y0) * W + (x + box.x0)] === 1;
            if (a && b) inter++;
            if (a || b) uni++;
        }
        const heightFit = Math.min(ih, mm.actualBoundingBoxAscent + mm.actualBoundingBoxDescent) / Math.max(ih, mm.actualBoundingBoxAscent + mm.actualBoundingBoxDescent);
        // Afişlerde sans ve dik yazı çok daha yaygın: küçük farklarda onları seç
        const score = (uni ? inter / uni : 0) * (0.6 + 0.4 * heightFit) - (cand.family === 'serif' ? 0.06 : 0) - (cand.italic ? 0.04 : 0);
        if (!best || score > best.score) best = { ...cand, size, score, sy: ih / (mm.actualBoundingBoxAscent + mm.actualBoundingBoxDescent || ih) };
    }
    return best;
}

/**
 * Metin katmanları. Kutu ve koordinatlar canvas pikseli; size piksel.
 */
async function extractTexts(canvas, { onProgress, exclude }) {
    const boxes = await detectText(canvas);
    const out = [];
    for (let i = 0; i < boxes.length; i++) {
        onProgress?.(i / boxes.length);
        const b = boxes[i];
        if (exclude?.(b)) continue;
        const r = await recognize(canvas, b);
        if (r.conf < 0.85 || !/[\p{L}\p{N}]{2,}|\p{N}/u.test(r.text)) continue;
        const crop = cropRotated(canvas, b, Math.round(b.h));
        const tp = textPixels(crop);
        // Düşük kontrastlı yazılar çoğunlukla fotoğrafın parçasıdır (forma, tabela): dokunma
        // Düşük kontrastlı kısa yazılar çoğunlukla fotoğrafın parçasıdır (forma no, tabela); uzun ve kesin okunan satırlar tutulur
        const letters = (r.text.match(/\p{L}/gu) || []).length;
        if (!tp.box || (tp.contrast < 110 && !(tp.contrast >= 50 && r.conf >= 0.95 && letters >= 4))) continue;
        // Türkçe harfler: büyütülmüş kesiti Tesseract ile oku, aynı kelimelerse onun yazımını al
        let text = r.text;
        try {
            const big = cropRotated(canvas, { ...b, w: b.w + b.h * 0.4, h: b.h * 1.2 }, 72);
            const tr = await recognizeLine(big);
            if (tr.text) text = mergeDiacritics(text, tr.text);
        } catch { /* Tesseract yoksa Paddle sonucu kalır */ }
        const font = matchFont(text, tp.ink, crop.width, crop.height, tp.box);
        if (!font) continue;
        // Mürekkep izinin merkezi (kesit → görsel koordinatı)
        const icx = (tp.box.x0 + tp.box.x1) / 2 - crop.width / 2, icy = (tp.box.y0 + tp.box.y1) / 2 - crop.height / 2;
        const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
        out.push({
            text, conf: r.conf,
            inkCenter: [b.cx + icx * ca - icy * sa, b.cy + icx * sa + icy * ca],
            angle: b.angle, color: hex(tp.fg), bgColor: tp.bg, fgColor: tp.fg, box: b, font,
        });
    }
    return out;
}

/** Metni görsel üzerinde siler: kutu içinde yazı rengine yakın pikseller (+genişletme) */
/** Eşleşen fontla çizilmiş harf şekilleri (görsel uzayında) — silme yalnız bunların yakınında yapılır */
function glyphMask(t, W, H) {
    const o = textToObject(t, 1);
    const c = new OffscreenCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    ctx.rotate(t.angle);
    ctx.font = fontCss(t.font, t.font.size);
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(t.text);
    const baseline = (o.h - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    // dikey ölçek: mürekkep yüksekliğini tutturmak için matchFont'un bulduğu oran (mürekkep merkezi etrafında)
    const inkCy = -o.h / 2 + baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    ctx.translate(0, inkCy);
    ctx.scale(1, t.font.sy || 1);
    ctx.translate(0, -inkCy);
    ctx.fillText(t.text, -o.w / 2, -o.h / 2 + baseline);
    const d = ctx.getImageData(0, 0, W, H).data;
    const g = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 60) g[i] = 1;
    const near = new Uint8Array(W * H);
    dilateInto(g, W, H, Math.max(3, Math.round(t.font.size * 0.12)), near);
    return near;
}

function markTextPixels(img, W, H, t, mask) {
    const { fgColor: fg, bgColor: bg, box } = t;
    const near = glyphMask(t, W, H);
    const pad = Math.max(2, box.h * 0.08);
    const corners = rectCorners({ ...box, w: box.w + pad * 2, h: box.h + pad * 2 });
    const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
    const ca = Math.cos(-box.angle), sa = Math.sin(-box.angle);
    const tmp = new Uint8Array(W * H);
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(H, Math.ceil(Math.max(...ys))); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(W, Math.ceil(Math.max(...xs))); x++) {
            const u = (x - box.cx) * ca - (y - box.cy) * sa, v = (x - box.cx) * sa + (y - box.cy) * ca;
            if (Math.abs(u) > box.w / 2 + pad || Math.abs(v) > box.h / 2 + pad) continue;
            const i = y * W + x, p = [img[i * 4], img[i * 4 + 1], img[i * 4 + 2]];
            // yumuşak kenarlı pikseller de: zemine göre yazıya doğru %25'ten fazla kaymış
            const dB = Math.sqrt(dist(p, bg)), dF = Math.sqrt(dist(p, fg));
            if (near[i] && dB / (dB + dF + 1e-6) > 0.25) tmp[i] = 1;
        }
    }
    dilateInto(tmp, W, H, Math.max(2, Math.round(box.h * 0.06)), mask);
}

function dilateInto(src, W, H, r, dst) {
    const row = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        let last = -1e9;
        for (let x = 0; x < W; x++) { if (src[y * W + x]) last = x; if (x - last <= r) row[y * W + x] = 1; }
        last = 1e9;
        for (let x = W - 1; x >= 0; x--) { if (src[y * W + x]) last = x; if (last - x <= r) row[y * W + x] = 1; }
    }
    for (let x = 0; x < W; x++) {
        let last = -1e9;
        for (let y = 0; y < H; y++) { if (row[y * W + x]) last = y; if (y - last <= r) dst[y * W + x] = 1; }
        last = 1e9;
        for (let y = H - 1; y >= 0; y--) { if (row[y * W + x]) last = y; if (last - y <= r) dst[y * W + x] = 1; }
    }
}

// ─── Nesneler ────────────────────────────────────────────────────────────────

const G = 256; // SAM 2 maske ızgarası

export async function extractElements(canvas, emb, { onProgress, textBoxes, textInk, raw }) {
    const W = canvas.width, H = canvas.height;
    const sc = new OffscreenCanvas(G, G);
    const sctx = sc.getContext('2d');
    sctx.drawImage(canvas, 0, 0, G, G);
    const small = sctx.getImageData(0, 0, G, G).data;
    const inText = new Uint8Array(G * G);
    for (const b of textBoxes) {
        const cs = rectCorners({ ...b, w: b.w * 1.05, h: b.h * 1.15 });
        const ca = Math.cos(-b.angle), sa = Math.sin(-b.angle);
        const xs = cs.map((p) => (p[0] / W) * G), ys = cs.map((p) => (p[1] / H) * G);
        for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(G, Math.ceil(Math.max(...ys))); y++) {
            for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(G, Math.ceil(Math.max(...xs))); x++) {
                const px = ((x + 0.5) / G) * W - b.cx, py = ((y + 0.5) / G) * H - b.cy;
                const u = px * ca - py * sa, v = px * sa + py * ca;
                if (Math.abs(u) <= b.w * 0.525 && Math.abs(v) <= b.h * 0.575) inText[y * G + x] = 1;
            }
        }
    }
    const cands = [];
    cands.small = small;
    const N = 16;
    const pts = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([(i + 0.5) / N, (j + 0.5) / N]);
    for (let k = 0; k < pts.length; k++) {
        onProgress?.(k / pts.length);
        const gx = Math.floor(pts[k][0] * G), gy = Math.floor(pts[k][1] * G);
        // Not: büyük zemin maskeleri nesneleri de kapsayabildiğinden "açıklanmış" noktalar atlanmaz
        if (inText[gy * G + gx]) continue;
        const r = await decode2(emb, { points: [{ x: pts[k][0] * W, y: pts[k][1] * H, positive: true }] });
        for (const m of r.masks) {
            let on = 0, hi = 0, lo = 0, txt = 0, edge = 0;
            for (let i = 0; i < G * G; i++) {
                const v = m.logits[i];
                if (v > 0) { on++; if (textInk ? textInk[i] : inText[i]) txt++; const x = i % G, y = (i / G) | 0; if (x === 0 || y === 0 || x === G - 1 || y === G - 1) edge++; }
                if (v > 1) hi++;
                if (v > -1) lo++;
            }
            const area = on / (G * G), stab = lo ? hi / lo : 0;
            if (area < 0.0006 || area > 0.3 || stab < 0.86 || txt / on > 0.35) continue;
            cands.push({ logits: m.logits, area, stab, score: m.score, edge: edge / on });
        }
    }
    // Izgaranın kaçırdığı küçük renkli vuruşlar (yazı süslemeleri, alt çizgiler): doygun renk bileşenlerine ayrıca sor
    // doygunluk tam çözünürlükte ölçülür: ince çizgiler küçük ızgarada bulanıklaşmasın
    const full = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const satN = new Uint16Array(G * G);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (Math.max(full[i], full[i + 1], full[i + 2]) - Math.min(full[i], full[i + 1], full[i + 2]) >= 130) satN[Math.floor((y / H) * G) * G + Math.floor((x / W) * G)]++;
    }
    const sat = new Uint8Array(G * G);
    const cell = (W / G) * (H / G);
    for (let i = 0; i < G * G; i++) if (satN[i] >= cell * 0.25) sat[i] = 1;
    const covered = (i) => cands.some((c) => c.area < 0.3 && c.logits[i] > 0);
    const seen = new Uint8Array(G * G);
    for (let i = 0; i < G * G; i++) {
        if (!sat[i] || seen[i]) continue;
        const st = [i], comp = [];
        seen[i] = 1;
        while (st.length) {
            const p = st.pop(); comp.push(p);
            const x = p % G;
            for (const q of [p - 1, p + 1, p - G, p + G]) if (q >= 0 && q < G * G && sat[q] && !seen[q] && Math.abs((q % G) - x) <= 1) { seen[q] = 1; st.push(q); }
        }
        if (comp.length < 4) continue;
        // bileşenin içinde kalan, merkeze en yakın piksel
        const cx = comp.reduce((a, p) => a + (p % G), 0) / comp.length, cy = comp.reduce((a, p) => a + ((p / G) | 0), 0) / comp.length;
        const p = comp.reduce((best, q) => (Math.hypot((q % G) - cx, ((q / G) | 0) - cy) < Math.hypot((best % G) - cx, ((best / G) | 0) - cy) ? q : best), comp[0]);
        if (covered(p)) continue;
        const r = await decode2(emb, { points: [{ x: ((p % G) + 0.5) / G * W, y: (((p / G) | 0) + 0.5) / G * H, positive: true }] });
        for (const m of r.masks) {
            let on = 0, hi = 0, lo = 0, txt = 0;
            for (let k = 0; k < G * G; k++) { const v = m.logits[k]; if (v > 0) { on++; if (textInk ? textInk[k] : inText[k]) txt++; } if (v > 1) hi++; if (v > -1) lo++; }
            const area = on / (G * G), stab = lo ? hi / lo : 0;
            if (area < 0.0002 || area > 0.05 || stab < 0.86 || txt / on > 0.35) continue;
            cands.push({ logits: m.logits, area, stab, score: m.score, edge: 0, fromSat: true });
        }
    }
    return raw ? cands : selectElements(cands, small);
}

/** Maske özellikleri: doluluk, en/boy, baskın renk payı ve doygunluğu, sınır kontrastı (256 ızgarada) */
function maskFeatures(c, small) {
    const L = c.logits;
    const on = (x, y) => x >= 0 && y >= 0 && x < G && y < G && L[y * G + x] > 0;
    const col = (i) => [small[i * 4], small[i * 4 + 1], small[i * 4 + 2]];
    let n = 0, x0 = G, y0 = G, x1 = 0, y1 = 0, nb = 0, nc = 0;
    const bins = new Map();
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        const i = y * G + x;
        if (L[i] <= 0) continue;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const k = ((small[i * 4] >> 4) << 8) | ((small[i * 4 + 1] >> 4) << 4) | (small[i * 4 + 2] >> 4);
        const b = bins.get(k) || [0, 0, 0, 0];
        b[0]++; b[1] += small[i * 4]; b[2] += small[i * 4 + 1]; b[3] += small[i * 4 + 2];
        bins.set(k, b);
        // sınır: dışarı bakan komşu; yumuşatma payı için bir piksel içeri / iki piksel dışarı karşılaştır
        if (x === 0 || y === 0 || x === G - 1 || y === G - 1) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (on(x + dx, y + dy)) continue;
            const ox = x + 2 * dx, oy = y + 2 * dy;
            if (ox < 0 || oy < 0 || ox >= G || oy >= G) break;
            const a = on(x - dx, y - dy) ? col((y - dy) * G + x - dx) : col(i), o = col(oy * G + ox);
            nb++;
            if (Math.sqrt(dist(a, o)) > 45) nc++;
            break;
        }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const top = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
    const rgb = [top[1] / top[0], top[2] / top[0], top[3] / top[0]];
    return { solid: n / (bw * bh), aspect: Math.max(bw, bh) / Math.min(bw, bh), top1: top[0] / n, chroma: Math.max(...rgb) - Math.min(...rgb), bc: nb ? nc / nb : 0 };
}

/**
 * Aday maskelerden katman olacakları seçer. Fotoğrafın parçalarını (file, direk, pankart) arka planda bırakmak için temkinli:
 *  - kompakt nesne (top, logo, ikon): dolu, kareye yakın, sınırı her yerde belirgin
 *  - fırça darbesi / kavis: ince ama tek renkli ve doygun
 *  - düz renkli leke (köşe şekilleri): baskın tek renk, doygun
 */
export function selectElements(cands, small) {
    const keep = [];
    for (const c of cands) {
        const f = maskFeatures(c, small);
        c.f = f;
        // SAM 2 int8 skorları ince çizgilerde çok düşük çıkıyor: doygun renk taramasından gelen ince adaylarda skora bakılmaz
        if (c.score < 0.3 && !(f.solid < 0.3 && f.top1 >= 0.5 && f.bc >= 0.9 && f.chroma >= 100)) continue;
        const compact = f.solid >= 0.6 && f.aspect <= 2.2 && f.bc >= 0.6;
        const stroke = f.solid < 0.3 && f.chroma >= 100 && f.top1 >= 0.18 && f.bc >= 0.75;
        const blob = f.solid >= 0.5 && f.top1 >= 0.6 && f.chroma >= 100 && f.bc >= 0.6;
        // küçük süs (fırça vuruşu, yıldız, çizgi): biçimi ne olursa olsun tek, doygun renk
        const accent = c.area < 0.002 && f.top1 >= 0.35 && f.chroma >= 120 && f.bc >= 0.6;
        if (compact || stroke || blob || accent) keep.push(c);
    }
    // Tekrarları ayıkla: aynı bölgeyi kaplayan adaylardan büyük olanı tut (parça yerine bütün)
    keep.sort((a, b) => b.area - a.area);
    // Birbirinden açıkça ayrık iki ya da daha çok kabul edilmiş parçayı birlikte kapsayan maske (alt alta ikonlar gibi) yerine parçalar
    const boxes = new Map(keep.map((c) => [c, maskBox(c.logits)]));
    const inside = (a, b) => { let n = 0, k = 0; for (let i = 0; i < G * G; i++) if (a.logits[i] > 0) { n++; if (b.logits[i] > 0) k++; } return n ? k / n : 0; };
    const apart = (p, q) => {
        const A = boxes.get(p), B = boxes.get(q);
        const gap = Math.max(A.x0 - B.x1, B.x0 - A.x1, A.y0 - B.y1, B.y0 - A.y1);
        return gap > 0.3 * Math.min(A.x1 - A.x0, A.y1 - A.y0, B.x1 - B.x0, B.y1 - B.y0);
    };
    for (let i = keep.length - 1; i >= 0; i--) {
        const big = keep[i];
        const parts = keep.filter((c) => c !== big && c.area < big.area * 0.8 && inside(c, big) > 0.8);
        const covered = parts.reduce((sum, p) => sum + p.area, 0) / big.area;
        const split = covered > 0.6 && parts.some((p) => parts.some((q) => p !== q && apart(p, q)));
        if (split) keep.splice(i, 1);
    }
    const final = [];
    for (const c of keep) {
        let dup = false;
        for (const f of final) {
            let inter = 0, cn = 0;
            for (let i = 0; i < G * G; i++) if (c.logits[i] > 0) { cn++; if (f.logits[i] > 0) inter++; }
            if (inter / cn > 0.6) { dup = true; break; }
        }
        if (!dup) final.push(c);
    }
    return mergeNeighbours(final);
}

function maskBox(L) {
    let x0 = G, y0 = G, x1 = -1, y1 = -1;
    for (let i = 0; i < G * G; i++) if (L[i] > 0) { const x = i % G, y = (i / G) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Yan yana duran, benzer boyutlu küçük kompakt grafikler (ör. iki parçalı logo) tek katman olur */
function mergeNeighbours(list) {
    const items = list.map((c) => ({ c, b: maskBox(c.logits) }));
    for (let changed = true; changed;) {
        changed = false;
        for (let i = 0; i < items.length && !changed; i++) for (let j = i + 1; j < items.length && !changed; j++) {
            const A = items[i], B = items[j];
            if (!A.c.f || !B.c.f || A.c.f.solid < 0.5 || B.c.f.solid < 0.5 || A.c.area > 0.01 || B.c.area > 0.01) continue;
            const hA = A.b.y1 - A.b.y0, hB = B.b.y1 - B.b.y0;
            const vOverlap = Math.min(A.b.y1, B.b.y1) - Math.max(A.b.y0, B.b.y0);
            const gap = Math.max(A.b.x0, B.b.x0) - Math.min(A.b.x1, B.b.x1);
            if (vOverlap < 0.6 * Math.min(hA, hB) || gap > G * 0.025 || Math.max(hA, hB) > 2 * Math.min(hA, hB)) continue;
            const L = new Float32Array(G * G);
            for (let k = 0; k < G * G; k++) L[k] = Math.max(A.c.logits[k], B.c.logits[k]);
            const c = { ...A.c, logits: L, area: A.c.area + B.c.area };
            items.splice(j, 1);
            items[i] = { c, b: maskBox(L) };
            changed = true;
        }
    }
    return items.map((x) => x.c);
}

function sampleLogits(logits, fx, fy) {
    const x = Math.min(G - 1, Math.max(0, fx * G - 0.5)), y = Math.min(G - 1, Math.max(0, fy * G - 0.5));
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(G - 1, x0 + 1), y1 = Math.min(G - 1, y0 + 1), ax = x - x0, ay = y - y0;
    const a = logits[y0 * G + x0] * (1 - ax) + logits[y0 * G + x1] * ax;
    const b = logits[y1 * G + x0] * (1 - ax) + logits[y1 * G + x1] * ax;
    return a * (1 - ay) + b * ay;
}

/** Nesneyi tam çözünürlükte keser; yerini onarım maskesine işler */
function cutElement(img, W, H, c, mask) {
    // Yalnız kesin maskenin (logit > 0) yakını: düşük olasılıklı kuyruk komşu nesnelere uzanıp onların soluk kopyasını taşımasın
    const pos = new Uint8Array(G * G), near = new Uint8Array(G * G);
    for (let i = 0; i < G * G; i++) if (c.logits[i] > 0) pos[i] = 1;
    dilateInto(pos, G, G, 1, near);
    let x0 = G, y0 = G, x1 = -1, y1 = -1;
    for (let i = 0; i < G * G; i++) if (near[i]) { const x = i % G, y = (i / G) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const bx0 = Math.max(0, Math.floor(((x0 - 1) / G) * W)), by0 = Math.max(0, Math.floor(((y0 - 1) / G) * H));
    const bx1 = Math.min(W, Math.ceil(((x1 + 2) / G) * W)), by1 = Math.min(H, Math.ceil(((y1 + 2) / G) * H));
    const w = bx1 - bx0, h = by1 - by0;
    const out = new ImageData(w, h);
    const hole = new Uint8Array(W * H);
    let ax0 = w, ay0 = h, ax1 = -1, ay1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const gx = bx0 + x, gy = by0 + y;
        const nearHere = near[Math.min(G - 1, Math.floor(((gy + 0.5) / H) * G)) * G + Math.min(G - 1, Math.floor(((gx + 0.5) / W) * G))];
        const l = nearHere ? sampleLogits(c.logits, (gx + 0.5) / W, (gy + 0.5) / H) : -10;
        const a = 255 * sigmoid(2 * l);
        const si = (gy * W + gx) * 4, oi = (y * w + x) * 4;
        // şeffaf zeminli görselde özgün alfa da korunur
        out.data[oi] = img[si]; out.data[oi + 1] = img[si + 1]; out.data[oi + 2] = img[si + 2]; out.data[oi + 3] = (a * img[si + 3]) / 255;
        if (a > 8) { if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; if (y < ay0) ay0 = y; if (y > ay1) ay1 = y; }
        if (l > -2.5) hole[gy * W + gx] = 1;
    }
    if (ax1 < 0) return null;
    dilateInto(hole, W, H, Math.max(2, Math.round(Math.max(W, H) / 400)), mask);
    const cw = ax1 - ax0 + 1, ch = ay1 - ay0 + 1;
    const cc = new OffscreenCanvas(cw, ch);
    cc.getContext('2d').putImageData(out, -ax0, -ay0);
    return { canvas: cc, x: bx0 + ax0, y: by0 + ay0, w: cw, h: ch, area: c.area };
}

// ─── Arka plan onarımı ───────────────────────────────────────────────────────

/** Onarım maskesini bağlı bölgelere ayırıp her birini bağlamıyla doldurur */
async function fillHoles(img, W, H, mask, { best, onProgress }) {
    const f = 4, sw = Math.ceil(W / f), sh = Math.ceil(H / f);
    const small = new Uint8Array(sw * sh);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) small[((y / f) | 0) * sw + ((x / f) | 0)] = 1;
    // yakın delikler aynı bölge sayılsın
    const grown = new Uint8Array(sw * sh);
    dilateInto(small, sw, sh, 3, grown);
    const seen = new Uint8Array(sw * sh), regions = [];
    for (let i = 0; i < sw * sh; i++) {
        if (!grown[i] || seen[i]) continue;
        let x0 = sw, y0 = sh, x1 = 0, y1 = 0, n = 0;
        const st = [i]; seen[i] = 1;
        while (st.length) {
            const p = st.pop(), x = p % sw, y = (p / sw) | 0;
            n++;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            for (const q of [p - 1, p + 1, p - sw, p + sw]) if (q >= 0 && q < sw * sh && grown[q] && !seen[q] && Math.abs((q % sw) - x) <= 1) { seen[q] = 1; st.push(q); }
        }
        regions.push({ x0: x0 * f, y0: y0 * f, x1: Math.min(W, (x1 + 1) * f), y1: Math.min(H, (y1 + 1) * f), area: n * f * f });
    }
    // Büyük delikler tek LaMa geçişinde (WASM'da her geçiş ~18 sn): hepsini kapsayan kesit
    const bigs = best ? regions.filter((r) => r.area > W * H * 0.015) : [];
    if (bigs.length) {
        const u = bigs.reduce((a, r) => ({ x0: Math.min(a.x0, r.x0), y0: Math.min(a.y0, r.y0), x1: Math.max(a.x1, r.x1), y1: Math.max(a.y1, r.y1) }), { x0: W, y0: H, x1: 0, y1: 0 });
        bigs.forEach((r) => { r.done = true; });
        regions.unshift({ ...u, area: Infinity, union: bigs });
    }
    for (let k = 0; k < regions.length; k++) {
        const r = regions[k];
        if (r.done) continue;
        const big = r.area > W * H * 0.015 && best;
        const pad = Math.round(Math.max(24, Math.max(r.x1 - r.x0, r.y1 - r.y0) * (big ? 0.5 : 0.35)));
        const x0 = Math.max(0, r.x0 - pad), y0 = Math.max(0, r.y0 - pad), x1 = Math.min(W, r.x1 + pad), y1 = Math.min(H, r.y1 + pad);
        const w = x1 - x0, h = y1 - y0;
        const sub = new Uint8ClampedArray(w * h * 4), m = new Uint8Array(w * h);
        const inRegion = (gx, gy) => !r.union || r.union.some((q) => gx >= q.x0 && gx < q.x1 && gy >= q.y0 && gy < q.y1);
        for (let y = 0; y < h; y++) {
            sub.set(img.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1) * 4), y * w * 4);
            for (let x = 0; x < w; x++) m[y * w + x] = mask[(y0 + y) * W + x0 + x] && inRegion(x0 + x, y0 + y) ? 1 : 0;
        }
        onProgress?.(k / regions.length, big ? 'lama' : 'migan');
        if (big) await inpaintLama(sub, m, w, h);
        else await inpaintMigan(sub, m, w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!m[y * w + x]) continue;
            const si = (y * w + x) * 4, di = ((y0 + y) * W + x0 + x) * 4;
            img[di] = sub[si]; img[di + 1] = sub[si + 1]; img[di + 2] = sub[si + 2];
        }
    }
    return regions.length;
}

// ─── Ana akış ────────────────────────────────────────────────────────────────

/**
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas - sayfa/görsel (tam çözünürlük)
 * @param {{fill?: 'best'|'fast', onProgress?: (p:number, stage:string)=>void}} opts
 * @returns {Promise<{background: OffscreenCanvas, texts: object[], elements: object[]}>} canvas pikseli koordinatları
 */
export async function magicLayers(canvas, { fill = 'best', onProgress } = {}) {
    const W = canvas.width, H = canvas.height;
    const step = (from, to, stage) => (p) => onProgress?.(from + (to - from) * (p ?? 0), stage);

    onProgress?.(0, 'segment');
    const emb = await encodeImage2(canvas);

    onProgress?.(0.15, 'text');
    const texts = await extractTexts(canvas, { onProgress: step(0.15, 0.35, 'text') });
    const ctx = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, W, H);
    const img = imgData.data;
    // Yazı izleri önce: nesne süzgeci kutuya değil gerçek harf izine baksın (yazı yanındaki süsler nesne olabilsin)
    const textMasks = texts.map((t) => { const m = new Uint8Array(W * H); markTextPixels(img, W, H, t, m); return m; });
    const textInk = new Uint8Array(G * G);
    for (const m of textMasks) for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (m[y * W + x]) textInk[Math.floor((y / H) * G) * G + Math.floor((x / W) * G)] = 1;
    const elements = await extractElements(canvas, emb, { onProgress: step(0.35, 0.7, 'segment'), textBoxes: texts.map((t) => t.box), textInk });

    // Nesnenin içinde kalan küçük yazılar (toptaki logo yazısı gibi) nesneye aittir
    const inElement = (t) => elements.some((e) => e.area > 0.01 && sampleLogits(e.logits, t.inkCenter[0] / W, t.inkCenter[1] / H) > 0 && t.box.h < Math.sqrt(e.area * W * H) * 0.25);
    const mask = new Uint8Array(W * H);
    const keptTexts = texts.filter((t, i) => {
        if (inElement(t)) return false;
        const m = textMasks[i];
        for (let k = 0; k < W * H; k++) if (m[k]) mask[k] = 1;
        return true;
    });
    const cut = elements.map((e) => cutElement(img, W, H, e, mask)).filter(Boolean);

    onProgress?.(0.7, 'fill');
    const orig = img.slice();
    await fillHoles(img, W, H, mask, { best: fill === 'best', onProgress: step(0.7, 1, 'fill') });
    fillAlpha(img, W, H, mask);
    ctx.putImageData(imgData, 0, 0);
    keptTexts.forEach((t) => { t.layer = cutText(orig, img, W, H, t, textMasks[texts.indexOf(t)]); });
    return { background: ctx.canvas, texts: keptTexts.filter((t) => t.layer), elements: cut };
}

/**
 * Şeffaf zeminli görselde (logo PNG'si gibi) doldurulan deliklerin alfasını çevredeki alfadan tahmin eder:
 * yazının arkası şeffafsa delik de şeffaf olur (yoksa silinen yazı zeminde hayalet gibi kalır).
 */
function fillAlpha(img, W, H, mask) {
    let opaque = true;
    for (let i = 3; i < img.length; i += 4 * 97) if (img[i] < 250) { opaque = false; break; }
    if (opaque) return;
    // normalleştirilmiş kutu bulanıklığı (integral görüntü): yalnız deliğin dışındaki piksellerin alfası sayılır
    const r = Math.max(8, Math.round(Math.max(W, H) * 0.02));
    const S = new Float64Array((W + 1) * (H + 1)), N = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, v = mask[i] ? 0 : 1, j = (y + 1) * (W + 1) + x + 1;
        S[j] = img[i * 4 + 3] * v + S[j - 1] + S[j - W - 1] - S[j - W - 2];
        N[j] = v + N[j - 1] + N[j - W - 1] - N[j - W - 2];
    }
    const box = (A, x0, y0, x1, y1) => A[y1 * (W + 1) + x1] - A[y0 * (W + 1) + x1] - A[y1 * (W + 1) + x0] + A[y0 * (W + 1) + x0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!mask[i]) continue;
        const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1);
        const n = box(N, x0, y0, x1, y1);
        if (n) img[i * 4 + 3] = box(S, x0, y0, x1, y1) / n;
    }
}

/**
 * Yazıyı özgün piksellerden keser: doldurulmuş zeminin (bg) üstüne konunca özgün görüntüyü (orig) verecek
 * alfa ve renk hesaplanır (alfa: zeminden yazı rengine doğru kayma; renk: karışımdan geri çözülür).
 * Böylece font, kenar yumuşatma, degrade ve kontur aynen korunur.
 */
function cutText(orig, bg, W, H, t, m) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const out = new ImageData(w, h);
    const C = t.fgColor;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y0 + y) * W + x0 + x;
        if (!m[i]) continue;
        const o = (y * w + x) * 4;
        // zemin burada şeffafsa yazı pikseli olduğu gibi alınır
        if (bg[i * 4 + 3] < 128) { for (let c = 0; c < 4; c++) out.data[o + c] = orig[i * 4 + c]; continue; }
        const I = [orig[i * 4], orig[i * 4 + 1], orig[i * 4 + 2]], B = [bg[i * 4], bg[i * 4 + 1], bg[i * 4 + 2]];
        // alfa: zeminden uzaklığın, yazı renginin zeminden uzaklığına oranı (renk zemine çok yakınsa en az 30 birim)
        const span = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]);
        const a = Math.min(1, Math.hypot(I[0] - B[0], I[1] - B[1], I[2] - B[2]) / Math.max(30, span));
        if (a < 0.03) continue;
        for (let c = 0; c < 3; c++) out.data[o + c] = (I[c] - (1 - a) * B[c]) / a;
        out.data[o + 3] = Math.round(a * 255);
    }
    const cv = new OffscreenCanvas(w, h);
    cv.getContext('2d').putImageData(out, 0, 0);
    return { canvas: cv, x: x0, y: y0, w, h };
}

/** Metin bulgusunu, sayfa görünüm birimlerinde metin nesnesine çevirir (k: görünüm birimi / canvas pikseli) */
export function textToObject(t, k) {
    const size = t.font.size;
    const mc = new OffscreenCanvas(8, 8).getContext('2d');
    mc.font = fontCss(t.font, size);
    const m = mc.measureText(t.text);
    const lh = 1.25;
    // DOM metin kutusu: genişlik = ilerleme, yükseklik = size × lh; taban çizgisi yarı satır aralığı + font yükselimi kadar aşağıda
    const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
    const baseline = (size * lh - (asc + desc)) / 2 + asc;
    const w = m.width, h = size * lh;
    const inkCx = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
    const inkCy = baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    const dx = inkCx - w / 2, dy = inkCy - h / 2;
    const ca = Math.cos(t.angle), sa = Math.sin(t.angle);
    const cx = t.inkCenter[0] - (dx * ca - dy * sa), cy = t.inkCenter[1] - (dx * sa + dy * ca);
    return {
        type: 'text', text: t.text, family: t.font.family, bold: t.font.bold, italic: t.font.italic,
        size: size * k, color: t.color, align: 'left', lineHeight: lh, opacity: 1,
        x: (cx - w / 2) * k, y: (cy - h / 2) * k, w: w * k, h: h * k,
        // ölçüm gürültüsü: neredeyse yatay yazıyı tam yatay yap
        rotation: Math.abs(t.angle) < (2 * Math.PI) / 180 ? 0 : (t.angle * 180) / Math.PI,
    };
}

