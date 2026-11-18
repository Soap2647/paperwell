// Hazır afiş yerleşimleri: marka kiti olmayan biri de tek tıkla düzgün bir düzen kursun.
// Her yerleşim sayfaya göre ölçeklenir, marka fontunu ve logolarını kullanır, yazı rengi zemine göre seçilir.
import { newId } from '../core/pageOps';
import { contrast, hexRgb } from '../core/placement';
import { getBackdrop, sampleBackdrop } from './backdrop';
import { t } from '../i18n';

const readableOn = (bg) => (contrast([255, 255, 255], bg) >= contrast([17, 24, 39], bg) ? '#ffffff' : '#111827');

/** Logonun en-boy oranı (dataURL'den) */
const aspect = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth / i.naturalHeight || 1); i.onerror = () => res(1); i.src = src; });

export const LAYOUTS = [
    { id: 'logo-strip', name: 'Alt logo şeridi', hint: 'Afişin altına koyu bir şerit ve marka logolarınız, eşit aralıkla' },
    { id: 'info-bottom', name: 'Tarih ve yer altta', hint: 'Sol altta büyük tarih, altında saat ve yer' },
    { id: 'title-top', name: 'Başlık üstte', hint: 'Üst ortada büyük başlık ve kısa alt başlık' },
    { id: 'qr-corner', name: 'Köşede kayıt QR', hint: 'Sağ alt köşede QR kod ve "Kayıt için okutun" yazısı (QR linki yukarıdan)' },
];

/**
 * @param {string} id - LAYOUTS kimliği
 * @param {{state: object, assets: {src:string,name:string}[], palette: string[], qr?: string}} ctx - qr: QR görseli (dataURL)
 * @returns {Promise<object[]>} sayfaya eklenecek (gruplu) nesneler
 */
export async function buildLayout(id, { state, assets, palette, qr }) {
    const page = state.doc.pages[state.page], W = page.width, H = page.height, m = Math.min(W, H);
    const font = state.opts.text.family, gid = newId('gp');
    const bd = await getBackdrop(state.doc.bytes, state.page, page).catch(() => null);
    const colorAt = (box) => (bd ? readableOn(sampleBackdrop(bd, box)) : '#ffffff');
    const text = (o) => ({ id: newId('ob'), type: 'text', w: 0, h: 0, family: font, lineHeight: 1.2, groupId: gid, ...o });
    const pad = m * 0.05;

    if (id === 'logo-strip') {
        const bandH = H * 0.11;
        // şerit afişin en koyu renginden (yoksa lacivert), logolar beyaz zeminde değilse doğrudan üstüne
        const dark = [...palette].sort((a, b) => hexRgb(a).reduce((s, v) => s + v, 0) - hexRgb(b).reduce((s, v) => s + v, 0))[0] || '#0f172a';
        const out = [{ id: newId('ob'), type: 'rect', x: 0, y: H - bandH, w: W, h: bandH, fill: dark, stroke: '', width: 0, opacity: 0.88, groupId: gid, name: t('Logo şeridi') }];
        const logos = assets.slice(0, 6);
        const lh = bandH * 0.56;
        if (!logos.length) {
            out.push(text({ x: pad, y: H - bandH / 2 - m * 0.018, text: t('Logolarınızı Marka panelinden ekleyin'), size: Math.round(m * 0.026), color: '#ffffff', opacity: 0.8 }));
            return out;
        }
        const ws = await Promise.all(logos.map(async (a) => lh * (await aspect(a.src))));
        const total = ws.reduce((s, w) => s + w, 0);
        const gap = Math.max(m * 0.03, (W - pad * 2 - total) / Math.max(1, logos.length - 1));
        const k = total + gap * (logos.length - 1) > W - pad * 2 ? (W - pad * 2) / (total + gap * (logos.length - 1)) : 1;
        let x = (W - (total + gap * (logos.length - 1)) * k) / 2;
        logos.forEach((a, i) => {
            const w = ws[i] * k, h = lh * k;
            out.push({ id: newId('ob'), type: 'image', x, y: H - bandH / 2 - h / 2, w, h, src: a.src, opacity: 1, name: a.name, groupId: gid });
            x += w + gap * k;
        });
        return out;
    }
    if (id === 'info-bottom') {
        const s1 = Math.round(m * 0.06), s2 = Math.round(m * 0.032);
        const y = H - pad - s1 * 1.2 - s2 * 1.2 * 2;
        const c = colorAt({ x: pad, y, w: W * 0.5, h: H - y - pad });
        return [
            text({ x: pad, y, text: t('24 KASIM'), size: s1, bold: true, color: c, shadow: { color: '#000000', opacity: 0.35, blur: 8, dist: 2 } }),
            text({ x: pad, y: y + s1 * 1.2, text: t('14.00 · Konferans Salonu'), size: s2, color: c }),
            text({ x: pad, y: y + s1 * 1.2 + s2 * 1.2, text: t('Ücretsiz · Herkes davetli'), size: s2, color: c, opacity: 0.8 }),
        ];
    }
    if (id === 'title-top') {
        const s1 = Math.round(m * 0.085), s2 = Math.round(m * 0.035);
        const c = colorAt({ x: W * 0.1, y: pad, w: W * 0.8, h: s1 * 1.3 + s2 * 1.3 });
        // ortalı başlık: genişlik ölçülene kadar yaklaşık; metin kutusu ortaya hizalanır
        const tw = W * 0.8;
        return [
            text({ x: (W - tw) / 2, y: pad, w: tw, text: t('ETKİNLİK BAŞLIĞI'), size: s1, bold: true, align: 'center', color: c, shadow: { color: '#000000', opacity: 0.4, blur: 12, dist: 3 } }),
            text({ x: (W - tw) / 2, y: pad + s1 * 1.25, w: tw, text: t('Kısa bir alt başlık yazın'), size: s2, align: 'center', color: c, opacity: 0.9 }),
        ];
    }
    if (id === 'qr-corner') {
        const q = m * 0.15, s = Math.round(m * 0.026);
        const x = W - pad - q, y = H - pad - q - s * 1.4;
        const c = colorAt({ x, y: y + q, w: q, h: s * 1.4 });
        const out = [text({ x: x - q * 0.2, y: y + q + s * 0.3, w: q * 1.4, text: t('Kayıt için okutun'), size: s, align: 'center', bold: true, color: c })];
        if (qr) out.unshift({ id: newId('ob'), type: 'image', x, y, w: q, h: q, src: qr, opacity: 1, name: 'QR', groupId: gid });
        else out.unshift({ id: newId('ob'), type: 'rect', x, y, w: q, h: q, fill: '#ffffff', stroke: '#111827', width: 1.5, opacity: 0.9, name: t('QR yeri'), groupId: gid });
        return out;
    }
    return [];
}
