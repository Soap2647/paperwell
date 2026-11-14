// Sayfa boyutu hazır ayarları ve saf geometri (Yeni tasarım / Boyutu değiştir).
// Birim: PDF noktası (1 pt = 1/72 inç). Piksel ön ayarlarında 1 px = 0.75 pt (CSS 96 dpi).

export const PX_PT = 0.75;
export const MM_PT = 72 / 25.4;

const UNIT_PT = { px: PX_PT, mm: MM_PT, cm: MM_PT * 10 };

export const toPt = (v, unit) => v * UNIT_PT[unit];
export const fromPt = (pt, unit) => pt / UNIT_PT[unit];

/** Hazır boyutlar. name/hint/title Türkçe; arayüzde t() ile çevrilir */
export const PRESET_GROUPS = [
    {
        title: 'Sosyal medya',
        items: [
            { id: 'ig-square', name: 'Instagram gönderisi (kare)', w: 1080, h: 1080, unit: 'px', hint: 'Akışta en çok kullanılan' },
            { id: 'ig-portrait', name: 'Instagram gönderisi (dikey 4:5)', w: 1080, h: 1350, unit: 'px', hint: 'Akışta daha fazla yer kaplar' },
            { id: 'story', name: 'Hikaye / Reels (9:16)', w: 1080, h: 1920, unit: 'px', hint: 'Tam ekran dikey görsel' },
            { id: 'wide', name: 'Yatay 16:9 (YouTube, sunum)', w: 1920, h: 1080, unit: 'px', hint: 'Sunum ve video kapağı için' },
            { id: 'linkedin', name: 'LinkedIn / X gönderisi', w: 1200, h: 675, unit: 'px', hint: 'Paylaşım görseli' },
        ],
    },
    {
        title: 'Baskı',
        items: [
            { id: 'badge', name: 'Yaka kartı (9 × 13 cm)', w: 90, h: 130, unit: 'mm', hint: 'Etkinlik yaka kartı' },
            { id: 'card', name: 'Kartvizit', w: 90, h: 50, unit: 'mm', hint: 'Standart kartvizit boyutu' },
            { id: 'a4', name: 'A4', w: 210, h: 297, unit: 'mm', hint: 'Standart yazıcı kâğıdı' },
            { id: 'a5', name: 'A5', w: 148, h: 210, unit: 'mm', hint: 'A4\'ün yarısı, el ilanı için' },
            { id: 'a3', name: 'A3 afiş', w: 297, h: 420, unit: 'mm', hint: 'Pano ve küçük afiş' },
            { id: 'poster', name: 'Poster 50×70 cm', w: 500, h: 700, unit: 'mm', hint: 'Duvar posteri' },
        ],
    },
];

export const ALL_PRESETS = PRESET_GROUPS.flatMap((g) => g.items);

/** "1080 × 1080 px" / "90 × 130 mm" */
export const sizeLabel = (s) => `${s.w} × ${s.h} ${s.unit}`;

/** { w, h, unit } → sayfa boyutu (pt) ve piksel ön ayarıysa hedef piksel boyutu */
export function sizeToPage({ w, h, unit }) {
    return {
        width: toPt(w, unit),
        height: toPt(h, unit),
        pixelSize: unit === 'px' ? { w: Math.round(w), h: Math.round(h) } : undefined,
    };
}

/** Geçerli bir özel boyut mu? (en az ~5 mm, en çok PDF sınırı; piksel için 10000) */
export function validSize({ w, h, unit }) {
    if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return false;
    const pw = toPt(w, unit), ph = toPt(h, unit);
    if (Math.min(pw, ph) < 14 || Math.max(pw, ph) > 14400) return false;
    return unit !== 'px' || Math.max(w, h) <= 10000;
}

/**
 * Sayfayı eski boyuttan yeniye taşıyan dönüşüm (görünüm uzayı: sol üst orijin, yukarıdan aşağı).
 * fit: true / 'extend' içerik sığacak kadar tek tip ölçeklenir; 'cover' sayfayı tamamen dolduracak kadar (taşan kısım kırpılır);
 * false ölçek 1. Hepsinde ortalanır. Nokta (x, y) → (x*k + dx, y*k + dy)
 */
export function resizeTransform(oldW, oldH, newW, newH, fit = true) {
    const k = fit === 'cover' ? Math.max(newW / oldW, newH / oldH) : fit ? Math.min(newW / oldW, newH / oldH) : 1;
    return { k, dx: (newW - oldW * k) / 2, dy: (newH - oldH * k) / 2 };
}

const scaleBox = (o, k, dx = 0, dy = 0) => ({ ...o, x: o.x * k + dx, y: o.y * k + dy, w: (o.w || 0) * k, h: (o.h || 0) * k });

/** Tek nesneyi ölçekler ve taşır (bbox/moveBy/resizeObject'in bildiği alanlar) */
export function scaleObject(o, k, dx = 0, dy = 0) {
    let r;
    switch (o.type) {
        case 'path':
            r = { ...o, points: o.points.map(([x, y, p]) => [x * k + dx, y * k + dy, p]), width: (o.width || 2) * k };
            break;
        case 'highlight':
            r = { ...o, rects: o.rects.map((q) => scaleBox(q, k, dx, dy)) };
            break;
        case 'line': case 'arrow':
            r = { ...o, x1: o.x1 * k + dx, y1: o.y1 * k + dy, x2: o.x2 * k + dx, y2: o.y2 * k + dy, width: (o.width || 2) * k };
            break;
        case 'note': {
            // not simgesi sabit boyutta kalır; yalnız merkezi taşınır
            const cx = (o.x + o.w / 2) * k + dx, cy = (o.y + o.h / 2) * k + dy;
            r = { ...o, x: cx - o.w / 2, y: cy - o.h / 2 };
            break;
        }
        case 'text':
            r = { ...scaleBox(o, k, dx, dy), size: o.size * k };
            break;
        default:
            r = scaleBox(o, k, dx, dy);
            if (o.width != null) r.width = o.width * k; // rect / ellipse kontur kalınlığı
    }
    // nesneye göreli saklanan kaynaklar (Sihirli Katmanlar): yalnız ölçeklenir
    for (const key of ['textSource', 'rasterSource']) {
        if (o[key]) r[key] = { ...scaleBox(o[key], k), ...(o[key].size != null ? { size: o[key].size * k } : {}) };
    }
    return r;
}

export const scaleObjects = (list, k, dx, dy) => (list || []).map((o) => scaleObject(o, k, dx, dy));

/** Karartma dikdörtgenleri { x, y, w, h } */
export const scaleRects = (list, k, dx, dy) => (list || []).map((r) => scaleBox(r, k, dx, dy));

/**
 * PNG dışa aktarım boyutu. Sayfa piksel ön ayarıyla uyuşuyorsa tam o piksel;
 * değilse CSS pikselinin 2 katı (pt × 4/3 × 2), en uzun kenar 8000 px'i geçmez.
 * @returns {{ w: number, h: number, scale: number, exact: boolean }}
 */
export function exportSize(pageW, pageH, pixelSize) {
    if (pixelSize && Math.abs(pageW - pixelSize.w * PX_PT) < 0.5 && Math.abs(pageH - pixelSize.h * PX_PT) < 0.5) {
        return { w: pixelSize.w, h: pixelSize.h, scale: pixelSize.w / pageW, exact: true };
    }
    let scale = (4 / 3) * 2;
    const longest = Math.max(pageW, pageH) * scale;
    if (longest > 8000) scale *= 8000 / longest;
    return { w: Math.max(1, Math.round(pageW * scale)), h: Math.max(1, Math.round(pageH * scale)), scale, exact: false };
}
