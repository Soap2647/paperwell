// Render edilmiş sayfa tuvallerine erişim (renk örnekleme vb. için)
export const pageCanvases = new Map(); // pageIndex → { canvas, scale }

/** Görünüm uzayındaki bir kutunun çevresinden baskın arka plan rengini örnekler */
export function sampleBackground(pageIndex, box) {
    const entry = pageCanvases.get(pageIndex);
    if (!entry) return '#ffffff';
    const { canvas, scale } = entry;
    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const pts = [];
        const pad = 2;
        for (let k = 0; k <= 10; k++) {
            const x = box.x + (box.w * k) / 10;
            pts.push([x, box.y - pad], [x, box.y + box.h + pad]);
        }
        pts.push([box.x - pad, box.y + box.h / 2], [box.x + box.w + pad, box.y + box.h / 2]);
        const counts = new Map();
        let best = null, bestN = 0;
        for (const [x, y] of pts) {
            const px = Math.round(x * scale), py = Math.round(y * scale);
            if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
            const d = ctx.getImageData(px, py, 1, 1).data;
            const key = `${d[0] >> 3},${d[1] >> 3},${d[2] >> 3}`;
            const n = (counts.get(key) || 0) + 1;
            counts.set(key, n);
            if (n > bestN) { bestN = n; best = d; }
        }
        if (!best) return '#ffffff';
        return '#' + [best[0], best[1], best[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    } catch {
        return '#ffffff';
    }
}
