// Katman nesneleri için geometri yardımcıları
import { FONT_FAMILIES } from '../core/fonts';

export function bbox(o) {
    switch (o.type) {
        case 'path': {
            const xs = o.points.map((p) => p[0]), ys = o.points.map((p) => p[1]);
            const r = (o.width || 2) / 2;
            const x = Math.min(...xs) - r, y = Math.min(...ys) - r;
            return { x, y, w: Math.max(...xs) + r - x, h: Math.max(...ys) + r - y };
        }
        case 'highlight': {
            const x = Math.min(...o.rects.map((r) => r.x)), y = Math.min(...o.rects.map((r) => r.y));
            const x1 = Math.max(...o.rects.map((r) => r.x + r.w)), y1 = Math.max(...o.rects.map((r) => r.y + r.h));
            return { x, y, w: x1 - x, h: y1 - y };
        }
        case 'line': case 'arrow': {
            const x = Math.min(o.x1, o.x2), y = Math.min(o.y1, o.y2);
            return { x, y, w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
        }
        default:
            return { x: o.x, y: o.y, w: o.w || 0, h: o.h || 0 };
    }
}

/** Tutamaçla yeniden boyutlandırma: orijinal nesne + sürükleme farkı (sayfa birimi) */
export function resizeObject(orig, handle, dx, dy, keepAspect) {
    if (orig.type === 'line' || orig.type === 'arrow') {
        return handle === 'p1' ? { x1: orig.x1 + dx, y1: orig.y1 + dy } : { x2: orig.x2 + dx, y2: orig.y2 + dy };
    }
    let { x, y, w, h } = orig;
    const min = 6;
    if (handle.includes('w')) { const nw = Math.max(min, w - dx); x += w - nw; w = nw; }
    if (handle.includes('e')) w = Math.max(min, w + dx);
    if (handle.includes('n')) { const nh = Math.max(min, h - dy); y += h - nh; h = nh; }
    if (handle.includes('s')) h = Math.max(min, h + dy);

    if (keepAspect && orig.w && orig.h && handle.length === 2) {
        const ratio = orig.w / orig.h;
        if (w / h > ratio) {
            const nw = h * ratio;
            if (handle.includes('w')) x += w - nw;
            w = nw;
        } else {
            const nh = w / ratio;
            if (handle.includes('n')) y += h - nh;
            h = nh;
        }
    }
    if (orig.type === 'text') {
        // metin kutusu: köşeden çekince yazı boyutu ölçeklenir
        const k = h / orig.h;
        return { x, y, size: Math.max(4, Math.round(orig.size * k * 10) / 10) };
    }
    return { x, y, w, h };
}

export function textStyle(o) {
    return {
        fontFamily: (FONT_FAMILIES[o.family] || FONT_FAMILIES.sans).css,
        fontSize: o.size,
        lineHeight: o.lineHeight || 1.25,
        fontWeight: o.bold ? 700 : 400,
        fontStyle: o.italic ? 'italic' : 'normal',
        color: o.color,
        textAlign: o.align || 'left',
        whiteSpace: 'pre',
        opacity: o.opacity ?? 1,
    };
}

/** Noktaları yumuşak SVG yoluna çevirir */
export function pointsToPath(points) {
    if (!points.length) return '';
    if (points.length < 3) return `M ${points[0][0]} ${points[0][1]} ` + points.slice(1).map((p) => `L ${p[0]} ${p[1]}`).join(' ') + (points.length === 1 ? ` l 0.01 0` : '');
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length - 1; i++) {
        const mx = (points[i][0] + points[i + 1][0]) / 2, my = (points[i][1] + points[i + 1][1]) / 2;
        d += ` Q ${points[i][0]} ${points[i][1]} ${mx} ${my}`;
    }
    const l = points[points.length - 1];
    return d + ` L ${l[0]} ${l[1]}`;
}

/** Ramer–Douglas–Peucker ile çizgi noktalarını sadeleştirir */
export function simplify(points, eps = 0.6) {
    if (points.length < 3) return points;
    const d2 = (p, a, b) => {
        const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
        const dx = x2 - x1, dy = y2 - y1;
        const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0;
        const px = x1 + t * dx, py = y1 + t * dy;
        return (x - px) ** 2 + (y - py) ** 2;
    };
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        let max = 0, idx = -1;
        for (let i = a + 1; i < b; i++) {
            const d = d2(points[i], points[a], points[b]);
            if (d > max) { max = d; idx = i; }
        }
        if (max > eps * eps && idx > 0) {
            keep[idx] = 1;
            stack.push([a, idx], [idx, b]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

/** İşaretçi olayını sayfa birimlerine çevirir (katman kapsayıcısı ölçeklidir) */
export function eventToPage(e, el, zoom) {
    const r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
}

export function moveBy(o, dx, dy) {
    if (o.type === 'path') return { points: o.points.map(([x, y, p]) => [x + dx, y + dy, p]) };
    if (o.type === 'line' || o.type === 'arrow') return { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
    if (o.type === 'highlight') return { rects: o.rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })) };
    return { x: o.x + dx, y: o.y + dy };
}

/** İşaretçiyi yakala (bazı ortamlarda/olaylarda hata verebilir) */
export function capture(e) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yoksay */ }
}
