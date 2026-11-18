// Logo görseli için anlık araçlar (model yok): düz zemini silmek, boş kenarları kırpmak, tek renge boyamak.
// Saf kısımlar (removeFlatBg, trimBox, tintPixels) typed array üzerinde çalışır, test edilebilir.

const colorDist = (d, i, c) => Math.sqrt((d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2);

/**
 * Kenardan başlayıp zemine (düz renk ya da resme gömülü damalı desen) yakın pikselleri saydamlaştırır; yalnız kenara
 * bağlı olanları: logonun içindeki beyaz alanlar korunur. Zemin kenar piksellerinden bulunur; düz değilse false döner.
 * Kenar geçişindeki pikseller yarı saydam yapılıp zemin rengi çıkarılarak temizlenir (beyaz hale kalmaz).
 * @returns {boolean} zemin bulunup silindiyse true
 */
export function removeFlatBg(d, W, H, { t0 = 20, t1 = 70 } = {}) {
    const border = [];
    for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
    for (let y = 1; y < H - 1; y++) border.push(y * W, y * W + W - 1);
    const opaque = border.filter((p) => d[p * 4 + 3] > 200);
    if (opaque.length < border.length * 0.5) return false; // kenar zaten saydam
    const bgs = bgColors(d, opaque, t0);
    if (!bgs) return false; // zemin düz değil
    // iki renkli desende iki kare arasındaki karışım pikselleri de zemindir: iki renk arasındaki doğru parçasına uzaklık
    const dist = bgs.length > 1 ? (i) => segDist(d[i], d[i + 1], d[i + 2], bgs) : (i) => colorDist(d, i, bgs[0]);
    const nearest = (i) => bgs.reduce((b, c) => (colorDist(d, i, c) < colorDist(d, i, b) ? c : b));
    const state = new Uint8Array(W * H); // 1: zemin (silinecek)
    // damalı desen hiçbir logonun parçası olamaz: harf içleri gibi kapalı alanlardakiler de silinir; düz renkte yalnız kenara bağlı olanlar
    const stack = [];
    if (bgs.length > 1) { for (let p = 0; p < W * H; p++) if (d[p * 4 + 3] > 0 && dist(p * 4) < t0) stack.push(p); }
    else stack.push(...opaque.filter((p) => dist(p * 4) < t0));
    for (const p of stack) state[p] = 1;
    while (stack.length) {
        const p = stack.pop(), x = p % W, y = (p / W) | 0;
        for (const q of [x > 0 && p - 1, x < W - 1 && p + 1, y > 0 && p - W, y < H - 1 && p + W]) {
            if (q !== false && !state[q] && d[q * 4 + 3] > 0 && dist(q * 4) < t0) { state[q] = 1; stack.push(q); }
        }
    }
    // zeminin ortasında kalmış tek tük gürültü pikselleri (8 komşusundan en az 6'sı zemin) de zemindir
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (state[p]) continue;
        const n = state[p - W - 1] + state[p - W] + state[p - W + 1] + state[p - 1] + state[p + 1] + state[p + W - 1] + state[p + W] + state[p + W + 1];
        if (n >= 6) state[p] = 2;
    }
    for (let p = 0; p < W * H; p++) {
        if (state[p]) { d[p * 4 + 3] = 0; continue; }
        // zemine bitişik geçiş pikseli: kısmi saydamlık + zemin renginden arındırma
        const x = p % W, y = (p / W) | 0;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
            const qx = x + dx, qy = y + dy;
            if (qx >= 0 && qy >= 0 && qx < W && qy < H && state[qy * W + qx]) { near = true; break; }
        }
        if (!near) continue;
        // kapsama oranı: zemine uzaklığın, yakındaki en belirgin (logo) renginin zemine uzaklığına oranı
        const dd = dist(p * 4), med = nearest(p * 4);
        let far = t1;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const qx = x + dx, qy = y + dy;
            if (qx >= 0 && qy >= 0 && qx < W && qy < H && !state[qy * W + qx]) far = Math.max(far, colorDist(d, (qy * W + qx) * 4, med));
        }
        const a = Math.min(1, dd / far);
        if (a > 0.97) continue;
        for (let c = 0; c < 3; c++) d[p * 4 + c] = Math.max(0, Math.min(255, (d[p * 4 + c] - med[c] * (1 - a)) / a));
        d[p * 4 + 3] = Math.round(d[p * 4 + 3] * a);
    }
    dropSpecks(d, W, H, bgs.length > 1);
    return true;
}

/** Rengin iki renk arasındaki doğru parçasına uzaklığı (iki rengin karışımları sıfıra yakın çıkar) */
function segDist(r, g, b, [a, c]) {
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const t = Math.max(0, Math.min(1, ((r - a[0]) * v[0] + (g - a[1]) * v[1] + (b - a[2]) * v[2]) / (v[0] ** 2 + v[1] ** 2 + v[2] ** 2 || 1)));
    return Math.hypot(r - a[0] - v[0] * t, g - a[1] - v[1] * t, b - a[2] - v[2] * t);
}

/**
 * Zemin renkleri: kenarın %60'ı tek renge yakınsa o renk; değilse iki renkli damalı desen (internetten inen
 * "saydam" görsellerde resme gömülmüş gri-beyaz kareler) aranır: iki gri küme kenarın %85'ini kaplamalı.
 */
function bgColors(d, idx, t0) {
    const px = idx.map((p) => [d[p * 4], d[p * 4 + 1], d[p * 4 + 2]]);
    const med = [0, 1, 2].map((c) => px.map((q) => q[c]).sort((a, b) => a - b)[px.length >> 1]);
    const near = (c) => px.filter((q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) < t0).length;
    if (near(med) >= px.length * 0.6) return [med];
    // iki küme: en açık ve en koyu pikselden başlayan k-ortalama
    const lum = (q) => q[0] + q[1] + q[2];
    let C = [px.reduce((a, b) => (lum(b) > lum(a) ? b : a)), px.reduce((a, b) => (lum(b) < lum(a) ? b : a))];
    for (let it = 0; it < 6; it++) {
        const sum = [[0, 0, 0, 0], [0, 0, 0, 0]];
        for (const q of px) {
            const j = Math.hypot(q[0] - C[0][0], q[1] - C[0][1], q[2] - C[0][2]) <= Math.hypot(q[0] - C[1][0], q[1] - C[1][1], q[2] - C[1][2]) ? 0 : 1;
            sum[j][0] += q[0]; sum[j][1] += q[1]; sum[j][2] += q[2]; sum[j][3]++;
        }
        C = C.map((c, j) => (sum[j][3] ? sum[j].slice(0, 3).map((v) => v / sum[j][3]) : c));
    }
    const grey = (c) => Math.max(...c) - Math.min(...c) < 16;
    const n = px.filter((q) => segDist(q[0], q[1], q[2], C) < t0).length;
    return C.every(grey) && n >= px.length * 0.85 ? C : null;
}

/**
 * Zeminden geriye kalan kırıntılar: çok küçük ya da tamamı soluk (alfa < 128) parçalar silinir; i noktası gibi gerçek
 * küçük parçalar kalır. Damalı desende sıkıştırma gürültüsü daha iri gri lekeler bırakır: küçük, renksiz parçalar da silinir.
 */
function dropSpecks(d, W, H, checker) {
    const lab = new Int32Array(W * H).fill(-1), min = Math.max(12, W * H * 0.00002);
    for (let s0 = 0; s0 < W * H; s0++) {
        if (lab[s0] >= 0 || d[s0 * 4 + 3] === 0) continue;
        const list = [s0];
        lab[s0] = s0;
        let strong = false, colorful = false;
        for (let k = 0; k < list.length; k++) {
            const p = list[k], x = p % W;
            if (d[p * 4 + 3] >= 128) strong = true;
            if (Math.max(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]) - Math.min(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]) > 30) colorful = true;
            for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
                if (q >= 0 && q < W * H && lab[q] < 0 && d[q * 4 + 3] > 0) { lab[q] = s0; list.push(q); }
            }
        }
        if (!strong || list.length < min || (checker && !colorful && list.length < W * H * 0.0001)) for (const p of list) d[p * 4 + 3] = 0;
    }
}

/** Görünür piksellerin (alfa > 8) sınır kutusu; hepsi saydamsa null */
export function trimBox(d, W, H) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 + 1 - x0, h: y1 + 1 - y0 };
}

/** Bütün pikselleri tek renge boyar; şekil (alfa) aynen kalır */
export function tintPixels(d, rgb) {
    for (let i = 0; i < d.length; i += 4) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; }
}

async function toCanvas(src) {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return { c, ctx, data: ctx.getImageData(0, 0, c.width, c.height) };
}

/**
 * Görsel nesneye uygulanacak değişiklikler (src ve kırpıldıysa yeni konum/boyut). Görsel sayfada yerinden oynamaz.
 * @param {'bg'|'trim'|'tint'} op
 * @returns {Promise<object|null>} null: yapılacak bir şey yok (kırpılacak boşluk yok); zemin silinemezse hata fırlatır
 */
export async function logoEdit(o, op, hex) {
    const { c, ctx, data } = await toCanvas(o.src);
    const W = c.width, H = c.height, d = data.data;
    let opaque = true;
    for (let i = 3; i < d.length && opaque; i += 4) if (d[i] < 250) opaque = false;
    // zemini olan logo tek renge boyanırsa dikdörtgen olur: önce düz zemin silinir
    if ((op === 'bg' || (op === 'tint' && opaque)) && !removeFlatBg(d, W, H)) {
        throw new Error(op === 'bg' ? 'Zemin düz bir renk değil; bunun için Arka planı kaldır düğmesini kullanın' : 'Logonun zemini düz değil; önce Arka planı kaldır ile zemini silin');
    }
    if (op === 'tint') {
        const n = parseInt(hex.slice(1), 16);
        tintPixels(d, [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    }
    ctx.putImageData(data, 0, 0);
    if (op !== 'tint' || opaque) {
        const b = trimBox(d, W, H);
        if (!b) return null;
        if ((b.w < W || b.h < H) && !o.rotation) {
            const out = document.createElement('canvas');
            out.width = b.w; out.height = b.h;
            out.getContext('2d').drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
            const kx = o.w / W, ky = o.h / H;
            return { x: o.x + b.x * kx, y: o.y + b.y * ky, w: b.w * kx, h: b.h * ky, src: out.toDataURL('image/png') };
        }
        if (op === 'trim') return null;
    }
    return { src: c.toDataURL('image/png') };
}
