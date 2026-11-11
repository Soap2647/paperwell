// Belge tarayıcı çekirdeği: sentetik "telefon fotoğrafı" üzerinde köşe algılama, perspektif ve filtre.
import { detectQuad, refineQuad, homography, applyHomography, warp, outputSize, scanFilter, aspectRatio } from '../src/core/scanner';

let failed = 0;
const check = (name, ok, info = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`);
    if (!ok) failed++;
};

// Yarı-rastgele ama tekrarlanabilir gürültü
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function inside(p, q) {
    // dışbükey dörtgen içinde mi (saat yönü)
    for (let i = 0; i < 4; i++) {
        const a = q[i], b = q[(i + 1) % 4];
        if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0) return false;
    }
    return true;
}

function makePhoto(w, h, quad) {
    const data = new Uint8ClampedArray(w * h * 4);
    // dokulu ahşap masa + kâğıtta soldan sağa gölge + yazı satırları
    const m = homography(quad, 1000, 1414);
    const inv = (x, y) => {
        // kaba ters eşleme: kâğıt koordinatı (0..1000, 0..1414) için ızgara araması yerine doğrusal yaklaşık
        let best = null, bd = Infinity;
        for (let v = 0; v <= 1414; v += 101) for (let u = 0; u <= 1000; u += 100) {
            const [px, py] = applyHomography(m, u, v);
            const d = (px - x) ** 2 + (py - y) ** 2;
            if (d < bd) { bd = d; best = [u, v]; }
        }
        return best;
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            let r, g, b;
            if (inside([x + 0.5, y + 0.5], quad)) {
                const shade = 0.7 + 0.3 * (x / w); // gölge
                r = 245 * shade; g = 242 * shade; b = 235 * shade;
                // yazı: belirli satırlarda koyu çizgiler (ters eşlemeyle kâğıt uzayında)
                if (y % 4 === 0 && x % 3 === 0) {
                    const [, v] = inv(x, y);
                    if (v > 150 && v < 1250 && Math.floor(v / 60) % 2 === 0 && rnd() < 0.6) { r = 40; g = 40; b = 45; }
                }
            } else {
                const grain = 20 * Math.sin(x * 0.05 + Math.sin(y * 0.02) * 3);
                r = 120 + grain + rnd() * 25; g = 80 + grain * 0.7 + rnd() * 20; b = 50 + rnd() * 15;
            }
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
        }
    }
    return { data, width: w, height: h };
}

// Fiziksel kamera: 3B uzayda döndürülmüş A4 kâğıt, merkezli pinhole projeksiyon
export function project(W, H, f, rx, ry, rz, dist, paper = [210, 297]) {
    const [pw, ph] = paper;
    const pts = [[-pw / 2, -ph / 2], [pw / 2, -ph / 2], [pw / 2, ph / 2], [-pw / 2, ph / 2]];
    const c = Math.cos, s = Math.sin;
    return pts.map(([x, y]) => {
        let X = x, Y = y, Z = 0;
        [Y, Z] = [Y * c(rx) - Z * s(rx), Y * s(rx) + Z * c(rx)];
        [X, Z] = [X * c(ry) + Z * s(ry), -X * s(ry) + Z * c(ry)];
        [X, Y] = [X * c(rz) - Y * s(rz), X * s(rz) + Y * c(rz)];
        Z += dist;
        return [W / 2 + (f * X) / Z, H / 2 + (f * Y) / Z];
    });
}

// 1) Köşe algılama
const W = 480, H = 360;
const truth = project(W, H, 420, -0.45, 0.25, 0.08, 420);
const photo = makePhoto(W, H, truth);
const { quad, found } = detectQuad(photo);
const err = Math.max(...quad.map((p, i) => Math.hypot(p[0] - truth[i][0], p[1] - truth[i][1])));
check('köşe bulundu', found);
check('köşe hatası < 6 px', err < 6, `en büyük hata ${err.toFixed(1)} px, ${JSON.stringify(quad.map((p) => p.map(Math.round)))}`);

// 2 kat çözünürlükte inceltme hatayı düşürmeli
const photo2 = makePhoto(W * 2, H * 2, truth.map(([x, y]) => [x * 2, y * 2]));
const refined = refineQuad(photo2, quad.map(([x, y]) => [x * 2, y * 2]));
const rerr = Math.max(...refined.map((p, i) => Math.hypot(p[0] / 2 - truth[i][0], p[1] / 2 - truth[i][1])));
check('inceltme hatası < 3 px', rerr < 3, `${rerr.toFixed(1)} px (önce ${err.toFixed(1)})`);

// Kâğıt yoksa (düz doku) varsayılan köşeler, found=false
const flat = makePhoto(200, 150, [[-10, -10], [-9, -10], [-9, -9], [-10, -9]]);
check('belge yoksa found=false', !detectQuad(flat).found);

// 2) Homografi köşeleri doğru eşler
const hm = homography(truth, 500, 700);
const back = [[0, 0], [500, 0], [500, 700], [0, 700]].map(([x, y]) => applyHomography(hm, x, y));
const herr = Math.max(...back.map((p, i) => Math.hypot(p[0] - truth[i][0], p[1] - truth[i][1])));
check('homografi köşeleri eşler', herr < 1e-6, herr.toExponential(2));

// 2b) En/boy oranı: A4 (0.707); güçlü perspektifte kenar oranı yanıltır, kamera modeli yanıltmamalı
const ar = aspectRatio(truth, W, H);
const edgeRatio = Math.max(Math.hypot(truth[0][0] - truth[1][0], truth[0][1] - truth[1][1]), Math.hypot(truth[3][0] - truth[2][0], truth[3][1] - truth[2][1]))
    / Math.max(Math.hypot(truth[0][0] - truth[3][0], truth[0][1] - truth[3][1]), Math.hypot(truth[1][0] - truth[2][0], truth[1][1] - truth[2][1]));
check('en/boy oranı (kamera modeli)', ar && Math.abs(ar - 210 / 297) < 0.02, `tahmin ${ar?.toFixed(3)} · gerçek 0.707 · kenar oranı ${edgeRatio.toFixed(3)}`);
const strong = project(1600, 1200, 1300, -0.75, 0.3, 0.05, 520);
const sz = outputSize(strong, 3000, 1600, 1200);
check('outputSize oranı kullanır', Math.abs(sz.width / sz.height - 210 / 297) < 0.02, `${sz.width}x${sz.height}`);

// 3) Perspektif düzeltme: çıktıda masa dokusu kalmamalı (tümü kâğıt rengi ya da yazı)
const size = outputSize(truth);
const flatDoc = warp(photo, truth, size.width, size.height);
let wood = 0;
for (let i = 0; i < flatDoc.width * flatDoc.height; i++) {
    const r = flatDoc.data[i * 4], b = flatDoc.data[i * 4 + 2];
    if (r - b > 45) wood++; // ahşap: kırmızı >> mavi
}
const woodFrac = wood / (flatDoc.width * flatDoc.height);
check('düzeltilmiş görüntüde masa yok', woodFrac < 0.01, `${(woodFrac * 100).toFixed(2)}% · ${size.width}x${size.height}`);

// 4) Filtre: gölge giderilmeli; kâğıt sol ve sağ kenarda da neredeyse beyaz
const scanned = scanFilter(flatDoc, 'gray', 40);
const col = (fx) => {
    const x = Math.round(fx * (scanned.width - 1));
    const vals = [];
    for (let y = 0; y < scanned.height; y++) vals.push(scanned.data[(y * scanned.width + x) * 4]);
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length * 0.9)];
};
const before = (fx) => {
    const x = Math.round(fx * (flatDoc.width - 1));
    const vals = [];
    for (let y = 0; y < flatDoc.height; y++) vals.push(flatDoc.data[(y * flatDoc.width + x) * 4]);
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length * 0.9)];
};
check('gölge giderildi', col(0.05) > 235 && col(0.95) > 235, `önce ${before(0.05)}→${before(0.95)}, sonra ${col(0.05)}→${col(0.95)}`);
const bw = scanFilter(flatDoc, 'bw', 40);
let ink = 0, other = 0;
for (let i = 0; i < bw.width * bw.height; i++) { const v = bw.data[i * 4]; if (v === 0) ink++; else if (v !== 255) other++; }
check('siyah-beyaz yalnız 0/255', other === 0 && ink > 0, `mürekkep ${(100 * ink / (bw.width * bw.height)).toFixed(2)}%`);

if (failed) { console.error(`${failed} test başarısız`); process.exit(1); }
console.log('scanner ok');
