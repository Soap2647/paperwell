// Marka kiti paneli: logolar, marka renkleri ve varsayılan yazı tipi. Bir kez eklenir, her açılışta hazır durur.
import { useRef, useState } from 'react';
import { Plus, Trash2, Download, Upload, LayoutTemplate } from 'lucide-react';
import { useEditor, findObject } from '../store/editor';
import { newId } from '../core/pageOps';
import { addBrandAsset, removeBrandAsset, addBrandColor, removeBrandColor, exportBrandKit, importBrandKit, isBrandPersistent, useBrandKit, saveTemplate, removeTemplate } from '../core/brandKit';
import { resizeTransform, scaleObjects } from '../core/pageSize';
import { saveFile } from '../platform';
import { Button, Field, EyeDropperButton, cx } from '../components/ui';
import { toast } from '../components/Toaster';
import { t } from '../i18n';
import FontPicker from './FontPicker';
import { smartSpot } from './backdrop';

/** Şablona girecek nesneler: sayfayı kaplayan büyük görseller (ana görsel) ve notlar/vurgular hariç */
const templateObjects = (list, page) => (list || []).filter((o) => !['note', 'highlight'].includes(o.type)
    && !(o.type === 'image' && o.w * o.h > page.width * page.height * 0.6));

const colorKey = (o) => (['text', 'path', 'highlight', 'note'].includes(o.type) ? 'color' : o.type === 'rect' || o.type === 'ellipse' ? 'fill' : o.type === 'line' || o.type === 'arrow' ? 'stroke' : null);

export default function BrandPanel() {
    const { state, dispatch } = useEditor();
    const kit = useBrandKit();
    const fileRef = useRef(null), kitRef = useRef(null);
    const page = state.doc.pages[state.page];

    const addFiles = async (files) => {
        for (const f of files) {
            try { await addBrandAsset(f); toast(`${f.name.replace(/\.[^.]+$/, '')} ${t('marka kitine eklendi')}`, 'success', 3500); }
            catch (e) { toast(t(e.message), 'error'); }
        }
    };
    // Logoya tıklayınca afişin boş, sakin bir yerine, sayfa genişliğinin ~%30'u kadar yerleşir
    const place = async (a) => {
        const w = Math.min(page.width * 0.3, a.w * 0.75), h = (w * a.h) / a.w;
        const at = await smartSpot(state, w, h);
        dispatch({ type: 'ADD_OBJECT', pageId: page.id, obj: { id: newId('ob'), type: 'image', x: at.x, y: at.y, w, h, src: a.src, opacity: 1, name: a.name } });
        dispatch({ type: 'SET_TOOL', tool: 'select' });
    };
    // Renge tıklayınca seçili nesneye uygulanır (metin: yazı rengi, şekil: dolgu, çizgi: çizgi rengi)
    const applyColor = (hex) => {
        const sel = state.selected && findObject(state.objects, state.selected.id)?.obj;
        const key = sel && colorKey(sel);
        if (!key) { toast(t('Önce sayfada bir yazı ya da şekil seçin; rengi ona uygularız'), 'info', 4000); return; }
        dispatch({ type: 'UPDATE_OBJECT', id: sel.id, changes: { [key]: hex } });
    };
    // Şablon: bu sayfadaki yerleşimi kaydet / başka sayfaya uygula (sayfa boyutu farklıysa orantılı sığdırılır)
    const [tplName, setTplName] = useState('');
    const pageObjs = templateObjects(state.objects[page.id], page);
    const saveTpl = async () => {
        const name = tplName.trim() || `${t('Şablon')} ${kit.templates.length + 1}`;
        await saveTemplate({ name, width: page.width, height: page.height, objects: pageObjs });
        setTplName('');
        toast(`${name} ${t('kaydedildi')}`, 'success', 3000);
    };
    const applyTpl = (tpl) => {
        const { k, dx, dy } = resizeTransform(tpl.width, tpl.height, page.width, page.height, true);
        const gids = new Map();
        const objs = scaleObjects(tpl.objects, k, dx, dy).map((o) => {
            const q = { ...o, id: newId('ob') };
            if (o.groupId) { if (!gids.has(o.groupId)) gids.set(o.groupId, newId('gp')); q.groupId = gids.get(o.groupId); }
            return q;
        });
        dispatch({ type: 'COMMIT', bytes: state.doc.bytes, objects: { ...state.objects, [page.id]: [...(state.objects[page.id] || []), ...objs] } });
        dispatch({ type: 'SET_TOOL', tool: 'select' });
        toast(`${tpl.name} ${t('uygulandı')} (${objs.length})`, 'success', 3000);
    };

    const exportKit = async () => { await saveFile(new Blob([exportBrandKit()], { type: 'application/json' }), 'marka-kiti.paperwell-brand.json'); };
    const importKit = async (file) => {
        try {
            const r = await importBrandKit(await file.text());
            toast(`${r.assets} ${t('logo')}, ${r.colors} ${t('renk eklendi')}`, 'success', 4000);
        } catch (e) { toast(t(e.message), 'error'); }
    };

    return (
        <div className="space-y-5">
            <p className="text-[13px] text-fg-2 leading-relaxed -mt-1">{t('Logolarınızı ve renklerinizi bir kez ekleyin; her açılışta burada hazır bekler.')}</p>

            <Field label={t('Logolarım')}>
                {kit.assets.length === 0 && (
                    <div className="rounded-xl border border-dashed border-line-strong p-3 text-xs text-fg-3 leading-relaxed">
                        {t('Henüz logo yok. Aşağıdaki düğmeyle logonuzu (PNG ya da SVG) ekleyin; sonra tek tıkla sayfaya koyabilirsiniz.')}
                    </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                    {kit.assets.map((a) => (
                        <div key={a.id} className="relative group">
                            <button type="button" onClick={() => place(a)} title={`${a.name} — ${t('sayfaya ekle')}`}
                                className="w-full aspect-square rounded-xl border border-line checker overflow-hidden flex items-center justify-center hover:border-accent hover:ring-2 hover:ring-accent-soft">
                                <img src={a.src} alt={a.name} className="max-w-[85%] max-h-[85%] object-contain" draggable={false} />
                            </button>
                            <button type="button" aria-label={t('Sil')} onClick={() => { if (window.confirm(`${a.name} ${t('marka kitinden silinsin mi?')}`)) removeBrandAsset(a.id); }}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface border border-line hidden group-hover:flex items-center justify-center text-fg-2 hover:text-danger">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
                <Button icon={Plus} onClick={() => fileRef.current?.click()}>{t('Logo / görsel ekle')}</Button>
                <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden"
                    onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
            </Field>

            <Field label={t('Marka renkleri')} hint={t('Renge tıklayınca seçili yazıya ya da şekle uygulanır. Bu renkler her renk seçicinin başında da görünür.')}>
                <div className="flex flex-wrap gap-1.5 items-center">
                    {kit.colors.map((c) => (
                        <span key={c.hex} className="relative group">
                            <button type="button" onClick={() => applyColor(c.hex)} title={`${t(c.name)} ${c.hex}`} aria-label={c.hex}
                                className="w-7 h-7 rounded-full border border-black/10 transition-transform hover:scale-110 block" style={{ background: c.hex }} />
                            <button type="button" aria-label={t('Sil')} onClick={() => removeBrandColor(c.hex)}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface border border-line hidden group-hover:flex items-center justify-center text-fg-2 hover:text-danger text-[10px] leading-none">×</button>
                        </span>
                    ))}
                    <label className="w-7 h-7 rounded-full border border-dashed border-line-strong overflow-hidden cursor-pointer relative flex items-center justify-center text-fg-3 hover:text-fg" title={t('Renk ekle')}>
                        <Plus className="w-3.5 h-3.5" />
                        <input type="color" defaultValue="#4285f4" onChange={(e) => addBrandColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                    <EyeDropperButton onPick={(hex) => { addBrandColor(hex); toast(`${hex} ${t('marka renklerine eklendi')}`, 'success', 2500); }} className="!w-7 !h-7" />
                </div>
            </Field>

            <Field label={t('Yeni yazılar için yazı tipi')} hint={t('Metin aracıyla yazdığınız her yeni yazı bu fontla başlar.')}>
                <FontPicker value={state.opts.text.family} onChange={(family) => dispatch({ type: 'SET_OPTS', tool: 'text', changes: { family } })} />
            </Field>

            <Field label={t('Şablonlarım')} hint={t('Logo ve yazıları bir kez yerleştirin, şablon yapın; yeni görsele tek tıkla aynı yerlere gelir.')}>
                <div className="space-y-1.5">
                    {kit.templates.map((tpl) => (
                        <div key={tpl.id} className="group flex items-center gap-2 rounded-lg border border-line p-1.5 hover:border-accent">
                            <button type="button" className="flex-1 min-w-0 flex items-center gap-2 text-left" onClick={() => applyTpl(tpl)} title={t('Bu sayfaya uygula')}>
                                <LayoutTemplate className="w-4 h-4 text-accent shrink-0" />
                                <span className="truncate text-[13px] font-medium">{tpl.name}</span>
                                <span className="text-[11px] text-fg-3 shrink-0">{tpl.objects.length} {t('öğe')}</span>
                            </button>
                            <button type="button" aria-label={t('Sil')} onClick={() => { if (window.confirm(`${tpl.name} ${t('silinsin mi?')}`)) removeTemplate(tpl.id); }}
                                className="w-6 h-6 rounded-md hidden group-hover:flex items-center justify-center text-fg-3 hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-1.5">
                    <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder={`${t('Şablon')} ${kit.templates.length + 1}`}
                        className="flex-1 min-w-0 h-8 rounded-lg border border-line bg-surface-2 px-2.5 text-[13px] focus:outline-none focus:border-accent" />
                    <Button size="sm" icon={Plus} disabled={!pageObjs.length} onClick={saveTpl} title={pageObjs.length ? '' : t('Önce sayfaya logo ya da yazı ekleyin')}>{t('Bu sayfadan')}</Button>
                </div>
            </Field>

            <Field label={t('Kiti paylaş')} hint={t('Ekibinizle aynı logo ve renkleri kullanmak için kiti dosyaya aktarın, diğer bilgisayarda içe aktarın.')}>
                <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" icon={Download} onClick={exportKit} disabled={!kit.assets.length && kit.colors.length === 0}>{t('Dışa aktar')}</Button>
                    <Button size="sm" icon={Upload} onClick={() => kitRef.current?.click()}>{t('İçe aktar')}</Button>
                </div>
                <input ref={kitRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { if (e.target.files[0]) importKit(e.target.files[0]); e.target.value = ''; }} />
            </Field>

            {!isBrandPersistent() && <p className={cx('text-xs rounded-lg bg-surface-2 p-2 leading-relaxed text-fg-2')}>{t('Bu tarayıcı kalıcı depolamayı engelliyor; marka kiti yalnızca bu oturumda geçerli. Kiti dışa aktararak saklayın.')}</p>}
        </div>
    );
}
