// Yazı efektleri: gölge, dış çizgi, degrade dolgu. Ekranda CSS ile, kaydederken tuvalde aynı modelle çizilir.
// Nesne alanları: shadow {color, opacity, blur, dist}, outline {color, width}, gradient {from, to, angle}
import { FONT_FAMILIES, effectiveWeight } from './fonts';

export const hasEffects = (o) => !!(o.shadow || o.outline || o.gradient);

/** Gölgenin yönü sabit (sağ-alt, 45°): sade arayüz için tek "uzaklık" ayarı */
const shadowXY = (s) => [s.dist * 0.6, s.dist * 0.8];

/** Gölge rengi + saydamlık (varsayılan %60) → rgba */
export function shadowRgba(s) {
    const n = parseInt((s.color || '#000000').slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${s.opacity ?? 0.6})`;
}

/** Ekrandaki yazı kutusu için CSS (textStyle'a eklenir) */
export function effectCss(o) {
    const css = {};
    if (o.shadow) {
        const [x, y] = shadowXY(o.shadow);
        css.filter = `drop-shadow(${x}px ${y}px ${o.shadow.blur / 2}px ${shadowRgba(o.shadow)})`;
    }
    if (o.outline) {
        css.WebkitTextStroke = `${o.outline.width * 2}px ${o.outline.color}`;
        css.paintOrder = 'stroke fill';
    }
    if (o.gradient) {
        css.backgroundImage = `linear-gradient(${o.gradient.angle ?? 180}deg, ${o.gradient.from}, ${o.gradient.to})`;
        css.WebkitBackgroundClip = 'text';
        css.backgroundClip = 'text';
        css.color = 'transparent';
    }
    return css;
}

/** Efektlerin kutu dışına taşma payı (pt) */
export function effectPad(o) {
    const s = o.shadow ? o.shadow.blur * 1.5 + o.shadow.dist : 0;
    return Math.ceil((o.outline?.width || 0) + s + 2);
}

/**
 * Efektli yazıyı tuvale çizer (kaydetmek için). Ölçek k: 1 pt = k piksel.
 * Satır yerleşimi CSS ile aynı: satır kutusu size·lineHeight, taban çizgisi yarım aralık + font yükselişi.
 * @returns {Promise<{canvas: HTMLCanvasElement, pad: number}>} tuval (w+2pad)×(h+2pad) pt'yi kapsar
 */
export async function renderTextEffects(o, k = 4) {
    const pad = effectPad(o);
    const f = FONT_FAMILIES[o.family] || FONT_FAMILIES.sans;
    const font = `${o.italic ? 'italic ' : ''}${effectiveWeight(o)} ${o.size * k}px ${f.css}`;
    try { await document.fonts.load(font, o.text); } catch { /* yedek fontla çizilir */ }
    const W = (o.w || 10) + pad * 2, H = (o.h || o.size) + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * k); c.height = Math.ceil(H * k);
    const ctx = c.getContext('2d');
    ctx.font = font;
    const lh = o.lineHeight || 1.25;
    const m = ctx.measureText('Hgİ');
    const asc = m.fontBoundingBoxAscent ?? o.size * k * 0.9, desc = m.fontBoundingBoxDescent ?? o.size * k * 0.25;
    const half = (o.size * k * lh - (asc + desc)) / 2;
    const align = o.align || 'left';
    const x0 = (pad + (align === 'center' ? (o.w || 0) / 2 : align === 'right' ? (o.w || 0) : 0)) * k;
    const lines = (o.text || '').split('\n').map((line, i) => ({ line, y: pad * k + i * o.size * k * lh + half + asc }));
    const paintOn = (g) => {
        Object.assign(g, { font, textAlign: align, textBaseline: 'alphabetic', lineJoin: 'round' });
        let fillStyle = o.color;
        if (o.gradient) {
            // CSS açısı: 0° yukarı, 90° sağa, 180° aşağı; degrade yazı kutusunun tamamına yayılır
            const a = ((o.gradient.angle ?? 180) * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
            const bw = (o.w || 0) * k, bh = (o.h || o.size) * k, cx = pad * k + bw / 2, cy = pad * k + bh / 2;
            const len = (Math.abs(bw * dx) + Math.abs(bh * dy)) / 2;
            fillStyle = g.createLinearGradient(cx - dx * len, cy - dy * len, cx + dx * len, cy + dy * len);
            fillStyle.addColorStop(0, o.gradient.from); fillStyle.addColorStop(1, o.gradient.to);
        }
        for (const { line, y } of lines) {
            if (!line) continue;
            if (o.outline) { g.strokeStyle = o.outline.color; g.lineWidth = o.outline.width * 2 * k; g.strokeText(line, x0, y); }
            g.fillStyle = fillStyle; g.fillText(line, x0, y);
        }
    };
    if (!o.shadow) { paintOn(ctx); return { canvas: c, pad }; }
    // gölge yazının (çizgisi dahil) bütününden düşer: yazı ayrı katmanda çizilip önce gölgeyle, sonra kendisi basılır
    const layer = document.createElement('canvas');
    layer.width = c.width; layer.height = c.height;
    paintOn(layer.getContext('2d'));
    const [sx, sy] = shadowXY(o.shadow);
    Object.assign(ctx, { shadowColor: shadowRgba(o.shadow), shadowBlur: o.shadow.blur * k, shadowOffsetX: sx * k, shadowOffsetY: sy * k });
    ctx.drawImage(layer, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.drawImage(layer, 0, 0);
    return { canvas: c, pad };
}
