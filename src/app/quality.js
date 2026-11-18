// Kalite denetimleri: okunabilirlik (panel uyarısı) ve "Yayına hazır mı?" kontrol listesi aynı ölçütleri kullanır.
import { contrast, hexRgb } from '../core/placement';
import { getBackdrop, sampleBackdrop } from './backdrop';
import { bbox } from './objects';
import { t } from '../i18n';

// Logonun görünür piksellerinin ortalama rengi (src başına bir kez)
const logoColorCache = new Map();
export function logoColor(src) {
    if (!logoColorCache.has(src)) {
        logoColorCache.set(src, (async () => {
            const img = new Image(); img.src = src; await img.decode();
            const k = 64 / Math.max(img.naturalWidth, img.naturalHeight);
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
            const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
            const d = g.getImageData(0, 0, c.width, c.height).data, sum = [0, 0, 0];
            let n = 0;
            for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; n++; }
            // saydamlığı olmayan (zeminli) görsel kendi zeminiyle okunur: denetlenmez
            return n && n < (d.length / 4) * 0.97 ? sum.map((v) => v / n) : null;
        })().catch(() => null));
    }
    return logoColorCache.get(src);
}

/** Sayfayı kaplamayan, imza/QR olmayan görsel: logo sayılır */
export const isLogo = (o, page) => o.type === 'image' && !o.qr && !o.signature && o.w * o.h < page.width * page.height * 0.6;

/**
 * Yazı ya da logo zemininde kayboluyor mu? Eşikler: yazı kontrastı < 2.5, logo < 1.6.
 * @returns {Promise<{light: boolean, best: string}|null>} sorun yoksa null; light: zemine beyaz daha iyi uyar
 */
export async function readabilityIssue(o, bd, page) {
    if (o.hidden) return null;
    const bg = sampleBackdrop(bd, bbox(o));
    let fg = null, limit = 2.5;
    if (o.type === 'text') {
        if (o.outline && contrast(hexRgb(o.outline.color), bg) >= 3) return null;
        fg = o.gradient ? hexRgb(o.gradient.from).map((v, i) => (v + hexRgb(o.gradient.to)[i]) / 2) : hexRgb(o.color);
    } else if (isLogo(o, page)) { fg = await logoColor(o.src); limit = 1.6; }
    if (!fg || contrast(fg, bg) >= limit) return null;
    const light = contrast([255, 255, 255], bg) >= contrast([17, 24, 39], bg);
    return { light, best: light ? '#ffffff' : '#111827' };
}

/** 9:16 sayfa mı (hikaye / reels) */
export const isStory = (page) => Math.abs(page.width / page.height - 9 / 16) < 0.01;

/**
 * "Yayına hazır mı?" denetimleri. Her sorun: { kind, level: 'error'|'warn'|'info', text, id?, data? }
 * Düzeltme düğmeleri arayüzde kind'a göre bağlanır.
 */
export async function runChecks(state, { brandAssets = [], checkSpelling } = {}) {
    const page = state.doc.pages[state.page];
    const objs = (state.objects[page.id] || []).filter((o) => !o.hidden);
    const issues = [];
    const bd = await getBackdrop(state.doc.bytes, state.page, page).catch(() => null);
    if (bd) {
        for (const o of objs) {
            const r = await readabilityIssue(o, bd, page);
            if (r) issues.push({ kind: 'readability', level: 'error', id: o.id, data: r, text: o.type === 'text' ? `"${o.text.slice(0, 30)}" ${t('zeminde zor okunuyor')}` : `${o.name || t('Logo')} ${t('zeminde kayboluyor')}` });
        }
    }
    // telefonda okunamayacak kadar küçük yazı (sayfa yüksekliğinin %1,8'i altı)
    for (const o of objs) {
        if (o.type === 'text' && o.size < Math.min(page.width, page.height) * 0.018) issues.push({ kind: 'small', level: 'warn', id: o.id, text: `"${o.text.slice(0, 30)}" ${t('telefonda okunmayacak kadar küçük')}` });
    }
    // sayfadan taşan öğe
    for (const o of objs) {
        const b = bbox(o);
        const out = b.x < -1 || b.y < -1 || b.x + b.w > page.width + 1 || b.y + b.h > page.height + 1;
        if (out && !(o.type === 'image' && o.w * o.h > page.width * page.height * 0.6)) issues.push({ kind: 'offpage', level: 'warn', id: o.id, text: `${o.type === 'text' ? `"${o.text.slice(0, 30)}"` : o.name || t('Bir öğe')} ${t('sayfanın dışına taşıyor')}` });
    }
    // hikayede arayüzün kapattığı bantlar
    if (isStory(page)) {
        for (const o of objs) {
            const b = bbox(o);
            if (b.y < page.height * 0.14 || b.y + b.h > page.height * 0.8) issues.push({ kind: 'safearea', level: 'warn', id: o.id, text: `${o.type === 'text' ? `"${o.text.slice(0, 30)}"` : o.name || t('Bir öğe')} ${t('hikayede uygulamanın kapattığı bantta')}` });
        }
    }
    // çözünürlük: küçük görsel kaydedilince bulanık görünür
    const px = state.doc.kind === 'image' && state.doc.imageSize ? Math.max(state.doc.imageSize.w, state.doc.imageSize.h) : 0;
    if (px && px < 1600) issues.push({ kind: 'resolution', level: 'warn', text: `${t('Görsel')} ${px} px: ${t('paylaşımda keskin görünmesi için netleştirin')}` });
    // marka logosu
    if (brandAssets.length && !objs.some((o) => o.type === 'image' && brandAssets.some((a) => a.src === o.src || a.src === o.origSrc))) {
        issues.push({ kind: 'nologo', level: 'info', text: t('Marka kitinizdeki logolardan hiçbiri sayfada yok') });
    }
    // yazım (eklenen yazılar)
    if (checkSpelling) {
        const texts = objs.filter((o) => o.type === 'text' && o.text.trim());
        if (texts.length) {
            const res = await checkSpelling(texts.map((o) => o.text)).catch(() => null);
            res?.forEach((row, i) => {
                const fixable = row.filter((q) => q.suggestion);
                if (fixable.length) issues.push({ kind: 'spelling', level: 'error', id: texts[i].id, data: fixable, text: `${t('Yazım')}: ${fixable.map((q) => `${q.word} → ${q.suggestion}`).join(', ')}` });
            });
        }
    }
    return issues;
}
