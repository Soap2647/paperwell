// "Ekle" paneli: QR kod (kayıt linki) ve etkinlik bilgi bloğu (tarih, saat, yer). Afişin boş bir yerine,
// zemine göre okunaklı renkte yerleşir.
import { useState } from 'react';
import { QrCode, CalendarDays, LayoutTemplate } from 'lucide-react';
import QRCode from 'qrcode';
import { useEditor } from '../store/editor';
import { newId } from '../core/pageOps';
import { contrast } from '../core/placement';
import { Button, Field, Segmented } from '../components/ui';
import { toast } from '../components/Toaster';
import { t } from '../i18n';
import { smartSpot, getBackdrop, sampleBackdrop } from './backdrop';
import { LAYOUTS, buildLayout } from './layouts';
import { useBrandKit } from '../core/brandKit';
import { usePalette } from '../core/paletteStore';

const inputCls = 'w-full h-9 rounded-lg border border-line bg-surface-2 px-2.5 text-[13px] focus:outline-none focus:border-accent';

async function qrSrc(text, transparent) {
    return QRCode.toDataURL(text, { width: 1024, margin: transparent ? 0 : 2, errorCorrectionLevel: 'M', color: { dark: '#000000ff', light: transparent ? '#00000000' : '#ffffffff' } });
}

/** Zemin rengine göre okunaklı yazı rengi: beyaz ya da koyu */
const readableOn = (bg) => (contrast([255, 255, 255], bg) >= contrast([17, 24, 39], bg) ? '#ffffff' : '#111827');

export default function InsertPanel() {
    const ed = useEditor();
    const { state, dispatch } = ed;
    const page = state.doc.pages[state.page];
    const [link, setLink] = useState('');
    const [qrBg, setQrBg] = useState('white');
    const [ev, setEv] = useState({ date: '', time: '', place: '', link: '' });
    const kit = useBrandKit();
    const palette = usePalette();
    const addLayout = async (id) => {
        const qr = id === 'qr-corner' && link.trim() ? await qrSrc(link.trim(), false) : undefined;
        const objs = await buildLayout(id, { state: ed.get(), assets: kit.assets, palette, qr });
        if (objs.length) commit(objs);
        // ortalı yazıların genişliği çizilince ölçülür: ölçüden sonra sayfanın ortasına çekilir
        const centered = objs.filter((o) => o.type === 'text' && o.align === 'center').map((o) => o.id);
        if (centered.length) setTimeout(() => {
            const s = ed.get(), pg = s.doc.pages[s.page];
            const list = (s.objects[pg.id] || []).filter((o) => centered.includes(o.id));
            dispatch({ type: 'UPDATE_OBJECTS', updates: list.map((o) => ({ id: o.id, changes: { x: (pg.width - o.w) / 2 } })), transient: true });
        }, 200);
        if (id === 'qr-corner' && !qr) toast(t('QR yerine boş kutu kondu; yukarıya linki yazıp tekrar deneyin'), 'info', 4500);
        else toast(t('Yerleşim eklendi; yazılara çift tıklayıp değiştirin'), 'success', 3500);
    };

    const commit = (objs) => {
        const s = ed.get();
        dispatch({ type: 'COMMIT', bytes: s.doc.bytes, objects: { ...s.objects, [page.id]: [...(s.objects[page.id] || []), ...objs] } });
        dispatch({ type: 'SET_TOOL', tool: 'select' });
        dispatch({ type: 'SET', values: { selected: { pageId: page.id, id: objs[0].id, ids: objs.length > 1 ? objs.map((o) => o.id) : undefined } } });
    };

    const addQr = async () => {
        const text = link.trim();
        if (!text) { toast(t('Önce QR koda girecek linki yazın'), 'info', 3000); return; }
        const size = Math.min(page.width, page.height) * 0.16;
        const at = await smartSpot(state, size, size);
        commit([{ id: newId('ob'), type: 'image', x: at.x, y: at.y, w: size, h: size, src: await qrSrc(text, qrBg === 'none'), opacity: 1, name: `QR · ${text.slice(0, 40)}`, qr: text }]);
    };

    const addEvent = async () => {
        const line1 = [ev.date.trim(), ev.time.trim()].filter(Boolean).join(' · ');
        const line2 = ev.place.trim();
        if (!line1 && !line2) { toast(t('Tarih, saat ya da yer yazın'), 'info', 3000); return; }
        const S = Math.round(Math.min(page.width, page.height) * 0.034);
        const qrS = ev.link.trim() ? S * 3 : 0, gap = qrS ? S * 0.7 : 0;
        const textW = Math.max(line1.length * S * 0.58, line2.length * S * 0.82 * 0.55);
        const textH = (line1 ? S * 1.25 : 0) + (line2 ? S * 0.82 * 1.25 : 0);
        const W = qrS + gap + textW, H = Math.max(qrS, textH);
        const at = await smartSpot(state, W, H);
        let color = '#ffffff';
        try { color = readableOn(sampleBackdrop(await getBackdrop(state.doc.bytes, state.page, page), { x: at.x + qrS + gap, y: at.y, w: textW, h: textH })); } catch { /* beyaz */ }
        const gid = newId('gp'), base = state.opts.text, objs = [];
        let y = at.y + (H - textH) / 2;
        const tx = at.x + qrS + gap;
        if (line1) { objs.push({ id: newId('ob'), type: 'text', x: tx, y, w: 0, h: 0, text: line1, family: base.family, size: S, bold: true, color, lineHeight: 1.25, groupId: gid }); y += S * 1.25; }
        if (line2) objs.push({ id: newId('ob'), type: 'text', x: tx, y, w: 0, h: 0, text: line2, family: base.family, size: Math.round(S * 0.82), color, opacity: 0.9, lineHeight: 1.25, groupId: gid });
        if (qrS) objs.unshift({ id: newId('ob'), type: 'image', x: at.x, y: at.y + (H - qrS) / 2, w: qrS, h: qrS, src: await qrSrc(ev.link.trim(), false), opacity: 1, name: 'QR', qr: ev.link.trim(), groupId: gid });
        commit(objs);
        toast(t('Bilgi bloğu eklendi; sürükleyince birlikte taşınır'), 'success', 3000);
    };

    return (
        <div className="space-y-5">
            <Field label={t('QR kod')} hint={t('Kayıt formu, web sitesi ya da Instagram linki. Telefonla okutunca açılır.')}>
                <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={inputCls} />
                <Segmented value={qrBg} onChange={setQrBg} options={[{ value: 'white', label: t('Beyaz zeminli') }, { value: 'none', label: t('Saydam') }]} />
                <Button variant="primary" icon={QrCode} className="w-full" onClick={addQr}>{t('QR kodu ekle')}</Button>
            </Field>

            <Field label={t('Hazır yerleşimler')} hint={t('Tek tıkla düzgün bir düzen. Yazılar örnektir; çift tıklayıp kendi metninizi yazın.')}>
                <div className="grid grid-cols-2 gap-1.5">
                    {LAYOUTS.map((l) => (
                        <button key={l.id} type="button" onClick={() => addLayout(l.id)} title={t(l.hint)}
                            className="rounded-lg border border-line p-2 text-left hover:border-accent hover:bg-surface-2">
                            <LayoutPreview id={l.id} />
                            <span className="block text-[12px] font-medium mt-1.5 leading-tight">{t(l.name)}</span>
                        </button>
                    ))}
                </div>
            </Field>

            <Field label={t('Etkinlik bilgisi')} hint={t('Tarih, saat ve yer marka fontunuzla, afişin boş bir yerine ve zemine göre okunaklı renkte eklenir.')}>
                <div className="grid grid-cols-2 gap-1.5">
                    <input value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} placeholder={t('Tarih (ör. 24 Kasım)')} className={inputCls} />
                    <input value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })} placeholder={t('Saat (ör. 14.00)')} className={inputCls} />
                </div>
                <input value={ev.place} onChange={(e) => setEv({ ...ev, place: e.target.value })} placeholder={t('Yer (ör. Konferans Salonu)')} className={inputCls} />
                <input value={ev.link} onChange={(e) => setEv({ ...ev, link: e.target.value })} placeholder={t('Kayıt linki (isteğe bağlı, QR olur)')} className={inputCls} />
                <Button variant="primary" icon={CalendarDays} className="w-full" onClick={addEvent}>{t('Bilgi bloğunu ekle')}</Button>
            </Field>
        </div>
    );
}

/** Yerleşimin küçük şeması */
function LayoutPreview({ id }) {
    const bar = 'absolute bg-fg-3/60 rounded-[1px]';
    return (
        <span className="relative block w-full aspect-square rounded bg-gradient-to-b from-indigo-900 to-indigo-600 overflow-hidden">
            {id === 'logo-strip' && <><span className="absolute inset-x-0 bottom-0 h-[16%] bg-black/60" />{[0, 1, 2].map((i) => <span key={i} className="absolute bottom-[4%] h-[8%] w-[18%] bg-white/80 rounded-[1px]" style={{ left: `${12 + i * 28}%` }} />)}</>}
            {id === 'info-bottom' && <><span className={bar} style={{ left: '8%', bottom: '26%', width: '45%', height: '10%', background: 'white' }} /><span className={bar} style={{ left: '8%', bottom: '17%', width: '55%', height: '5%', background: 'white' }} /><span className={bar} style={{ left: '8%', bottom: '9%', width: '40%', height: '5%', background: 'white' }} /></>}
            {id === 'title-top' && <><span className={bar} style={{ left: '12%', top: '8%', width: '76%', height: '13%', background: 'white' }} /><span className={bar} style={{ left: '25%', top: '25%', width: '50%', height: '5%', background: 'white' }} /></>}
            {id === 'qr-corner' && <><span className="absolute right-[8%] bottom-[18%] w-[24%] aspect-square bg-white rounded-[1px]" /><span className={bar} style={{ right: '6%', bottom: '8%', width: '28%', height: '5%', background: 'white' }} /></>}
        </span>
    );
}
