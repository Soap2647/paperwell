// Markalı QR: marka rengi ve ortada logo. Modüller elle çizilir;
// logo varsa hata düzeltme H (%30 kayıp tolere edilir), logo alanı kenarın en çok %22'si (alanın ~%5'i).
// (Yuvarlak nokta stili denendi: büyük boyutta çözücüler güvenilir okumadı, eklenmedi.)
import QRCode from 'qrcode';

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/**
 * @param {string} text
 * @param {{color?: string, transparent?: boolean, logo?: string|null, px?: number}} o
 * @returns {Promise<string>} PNG data URL
 */
export async function renderQr(text, { color = '#000000', transparent = false, logo = null, px = 1024 } = {}) {
    const qr = QRCode.create(text, { errorCorrectionLevel: logo ? 'H' : 'M' });
    const n = qr.modules.size, quiet = transparent ? 0 : 2;
    // hücre tam piksel: kesirli hücrede kenarlar yumuşayıp bazı boyutlarda okunmuyordu
    const cell = Math.max(1, Math.floor(px / (n + quiet * 2))), size = cell * (n + quiet * 2);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (!transparent) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size); }
    const at = (k) => (k + quiet) * cell;

    // logo alanı (modül cinsinden): n tek, hole tek → h0 tam sayı, alan tam ortada
    let hole = 0;
    if (logo) { hole = Math.floor(n * 0.22); if (hole % 2 === 0) hole++; }
    const h0 = (n - hole) / 2;
    const inHole = (r, k) => hole && r >= h0 && r < h0 + hole && k >= h0 && k < h0 + hole;

    g.fillStyle = color;
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
        if (qr.modules.get(r, k) && !inHole(r, k)) g.fillRect(at(k), at(r), cell, cell);
    }

    if (logo) {
        const img = await loadImg(logo);
        const s = hole * cell, x = at(h0);
        // logo altına beyaz plaka (saydam QR'da da: logo zeminden ayrışsın)
        g.fillStyle = '#ffffff';
        g.beginPath(); g.roundRect(x, x, s, s, s * 0.18); g.fill();
        const box = s * 0.76, k = Math.min(box / img.width, box / img.height);
        const w = img.width * k, h = img.height * k;
        g.drawImage(img, x + (s - w) / 2, x + (s - h) / 2, w, h);
    }
    return c.toDataURL('image/png');
}

/** QR rengi beyaz zeminde okunur mu (koyu modül / açık zemin kontrastı en az 4.5) */
export function qrColorOk(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return false;
    const v = parseInt(m[1], 16);
    const lin = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const L = 0.2126 * lin(v >> 16) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
    return 1.05 / (L + 0.05) >= 4.5;
}
