// Bağlama duyarlı özellikler paneli
import { useEffect, useRef, useState } from 'react';
import {
    Bold, Italic, AlignLeft, AlignCenter, AlignRight, Trash2, Copy, ArrowUp, ArrowDown, Square, Circle, Minus, MoveRight,
    Pen, Highlighter, Underline, Strikethrough, ImageUp, Plus, Check, X, Download, Sparkles, Zap, Search, ImageMinus, ScanLine,
} from 'lucide-react';
import { useEditor, findObject } from '../store/editor';
import { commitBytes, withBusy } from '../store/actions';
import { newId } from '../core/pageOps';
import { getPageModel, searchDocument } from '../core/modelCache';
import { redactRects, replaceImageContent, deleteImage } from '../core/pdf/editOps';
import { isMiganCached, loadMigan } from '../core/inpaint/migan';
import { isSamCached, loadSam } from '../core/segment';
import { applyGrab, clearGrab } from './grabActions';
import { FONT_FAMILIES } from '../core/fonts';
import { documentHasForm } from '../core/forms';
import { Button, ColorPicker, Field, Segmented, Slider, Toggle, cx } from '../components/ui';
import { toast } from '../components/Toaster';
import { t } from '../i18n';
import { TOOLS } from './tools';
import LayersPanel from './LayersPanel';
import { readImageFile } from './imageFiles';
import { loadSignatures, saveSignatures } from './dialogs/SignatureDialog';

const HIGHLIGHT_COLORS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74', '#c4b5fd'];

function Section({ title, children, actions }) {
    return (
        <section className="px-4 py-4 border-b border-line space-y-4">
            {(title || actions) && (
                <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-3">{title}</h3>
                    {actions}
                </div>
            )}
            {children}
        </section>
    );
}

function StyleToggles({ bold, italic, onChange }) {
    return (
        <div className="flex gap-1">
            {[['bold', Bold, bold, t('Kalın')], ['italic', Italic, italic, t('İtalik')]].map(([k, Icon, on, label]) => (
                <button key={k} type="button" aria-pressed={on} title={label} onClick={() => onChange({ [k]: !on })}
                    className={cx('w-8 h-8 rounded-lg border flex items-center justify-center', on ? 'bg-accent-soft border-accent text-accent-text' : 'border-line hover:bg-surface-3 text-fg-2')}>
                    <Icon className="w-4 h-4" />
                </button>
            ))}
        </div>
    );
}

function NumberInput({ value, onChange, min = 1, max = 400, step = 0.5, suffix }) {
    const [v, setV] = useState(String(value));
    useEffect(() => setV(String(value)), [value]);
    const commit = () => {
        const n = parseFloat(v);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        else setV(String(value));
    };
    return (
        <div className="relative w-24">
            <input className="field pr-7 tabular-nums" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} step={step} />
            {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-fg-3">{suffix}</span>}
        </div>
    );
}

function FamilySelect({ value, onChange, originalLabel }) {
    return (
        <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
            {originalLabel && <option value="original">{t('Orijinal')}: {originalLabel}</option>}
            {Object.entries(FONT_FAMILIES).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
        </select>
    );
}

// ─── Düzenlenen satır ───────────────────────────────────────────────────────

function LineEditPanel({ editing }) {
    const { dispatch } = useEditor();
    const style = editing.style;
    const set = (changes) => dispatch({ type: 'SET', values: { editing: { ...editing, style: { ...style, ...changes } } } });
    const cmd = (detail) => window.dispatchEvent(new CustomEvent('paperwell:line-edit', { detail }));
    return (
        <Section title={t('Düzenle')}>
            <Field label={t('Font')} hint={style.family === 'original' ? 'Orijinal fontta olmayan karakterler için benzer font otomatik kullanılır.' : undefined}>
                <FamilySelect value={style.family} onChange={(family) => set({ family })} originalLabel={editing.fontName} />
            </Field>
            <div className="flex items-end gap-3">
                <Field label={t('Boyut')}><NumberInput value={style.size} onChange={(size) => set({ size })} suffix="pt" /></Field>
                <StyleToggles bold={style.bold} italic={style.italic} onChange={set} />
            </div>
            <Field label={t('Renk')}><ColorPicker value={style.color} onChange={(color) => set({ color })} /></Field>
            <p className="text-xs text-fg-3">{t('Enter kaydeder, Esc vazgeçer.')}</p>
            <div className="flex gap-2">
                <Button variant="primary" icon={Check} className="flex-1" onClick={() => cmd('save')}>{t('Kaydet')}</Button>
                <Button icon={X} onClick={() => cmd('cancel')}>{t('İptal')}</Button>
            </div>
        </Section>
    );
}

function ImageEditPanel({ editing }) {
    const ed = useEditor();
    const fileRef = useRef(null);
    const replace = async (file) => {
        await withBusy(ed, t('İşleniyor...'), async () => {
            const img = await readImageFile(file);
            const [, b64] = img.src.split(',');
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const out = await replaceImageContent(ed.get().doc.bytes, editing.pageIndex, editing.imageId, bytes, img.src.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png');
            await commitBytes(ed, out);
            toast(t('Görsel güncellendi'), 'success');
        });
    };
    const remove = () => withBusy(ed, t('İşleniyor...'), async () => {
        await commitBytes(ed, await deleteImage(ed.get().doc.bytes, editing.pageIndex, editing.imageId));
        toast(t('Görsel silindi'), 'success');
    });
    return (
        <Section title={t('Görsel')}>
            <p className="text-[13px] text-fg-2 leading-relaxed">Sürükleyerek taşıyın, köşelerden boyutlandırın (Shift: oranı serbest bırak).</p>
            <div className="flex flex-col gap-2">
                <Button icon={ImageUp} onClick={() => fileRef.current?.click()}>{t('Görseli değiştir')}</Button>
                <Button icon={Trash2} onClick={remove} className="hover:!text-danger">{t('Görseli sil')}</Button>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) replace(f); }} />
        </Section>
    );
}

// ─── Seçili nesne ───────────────────────────────────────────────────────────

function ObjectPanel({ o, pageId }) {
    const { dispatch } = useEditor();
    const update = (changes) => dispatch({ type: 'UPDATE_OBJECT', id: o.id, changes });
    const live = (changes) => dispatch({ type: 'UPDATE_OBJECT', id: o.id, changes, transient: true });
    const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
    const opacity = (
        <Slider label={t('Opaklık')} value={Math.round((o.opacity ?? 1) * 100)} min={5} max={100} unit="%" onStart={checkpoint} onChange={(v) => live({ opacity: v / 100 })} />
    );
    const rotation = (
        <Slider label={t('Açı')} value={Math.round(o.rotation || 0)} min={-180} max={180} unit="°" onStart={checkpoint} onChange={(v) => live({ rotation: v })} />
    );
    const titles = { text: t('Metin'), rect: t('Dikdörtgen'), ellipse: t('Elips'), line: t('Çizgi'), arrow: t('Ok'), path: t('Çiz'), highlight: t('Vurgu'), image: o.signature ? t('İmza') : t('Görsel'), note: t('Not') };

    return (
        <>
            <Section title={titles[o.type]}>
                {o.type === 'text' && (
                    <>
                        <Field label={t('Font')}><FamilySelect value={o.family} onChange={(family) => update({ family })} /></Field>
                        <div className="flex items-end gap-3">
                            <Field label={t('Boyut')}><NumberInput value={o.size} onChange={(size) => update({ size })} suffix="pt" /></Field>
                            <StyleToggles bold={o.bold} italic={o.italic} onChange={update} />
                        </div>
                        <Field label={t('Hizalama')}>
                            <Segmented value={o.align || 'left'} onChange={(align) => update({ align })} options={[{ value: 'left', icon: AlignLeft }, { value: 'center', icon: AlignCenter }, { value: 'right', icon: AlignRight }]} />
                        </Field>
                        <Field label={t('Renk')}><ColorPicker value={o.color} onChange={(color) => update({ color })} /></Field>
                        {opacity}
                        {rotation}
                        <p className="text-xs text-fg-3">Çift tıklayarak metni düzenleyin.</p>
                    </>
                )}
                {(o.type === 'rect' || o.type === 'ellipse') && (
                    <>
                        <Field label={t('Kenarlık')}><ColorPicker value={o.stroke} allowNone onChange={(stroke) => update({ stroke })} /></Field>
                        <Field label={t('Dolgu')}><ColorPicker value={o.fill} allowNone onChange={(fill) => update({ fill })} /></Field>
                        <Slider label={t('Kalınlık')} value={o.width} min={0.5} max={20} step={0.5} unit=" pt" onStart={checkpoint} onChange={(width) => live({ width })} />
                        {opacity}
                    </>
                )}
                {(o.type === 'line' || o.type === 'arrow') && (
                    <>
                        <Field label={t('Renk')}><ColorPicker value={o.stroke} onChange={(stroke) => update({ stroke })} /></Field>
                        <Segmented value={o.type} onChange={(type) => update({ type })} options={[{ value: 'line', icon: Minus, label: t('Çizgi') }, { value: 'arrow', icon: MoveRight, label: t('Ok') }]} />
                        <Slider label={t('Kalınlık')} value={o.width} min={0.5} max={20} step={0.5} unit=" pt" onStart={checkpoint} onChange={(width) => live({ width })} />
                        {opacity}
                    </>
                )}
                {o.type === 'path' && (
                    <>
                        <Field label={t('Renk')}><ColorPicker value={o.color} onChange={(color) => update({ color })} /></Field>
                        <Slider label={t('Kalınlık')} value={o.width} min={0.5} max={60} step={0.5} unit=" pt" onStart={checkpoint} onChange={(width) => live({ width })} />
                        {opacity}
                    </>
                )}
                {o.type === 'highlight' && (
                    <>
                        <Segmented value={o.kind} onChange={(kind) => update({ kind })} options={[{ value: 'highlight', icon: Highlighter }, { value: 'underline', icon: Underline }, { value: 'strike', icon: Strikethrough }]} />
                        <Field label={t('Renk')}><ColorPicker value={o.color} swatches={HIGHLIGHT_COLORS.concat(['#e11d48', '#2563eb'])} onChange={(color) => update({ color })} /></Field>
                    </>
                )}
                {o.type === 'image' && (
                    <>
                        {opacity}
                        {rotation}
                        <Button icon={ImageMinus} onClick={() => dispatch({ type: 'SET', values: { dialog: 'bgremove', bgTarget: o.id } })}>{t('Arka planı kaldır')}</Button>
                    </>
                )}
                {o.type === 'note' && (
                    <>
                        <Field label={t('Renk')}><ColorPicker value={o.color} swatches={['#facc15', '#fb923c', '#4ade80', '#60a5fa', '#f472b6', '#c084fc']} onChange={(color) => update({ color })} /></Field>
                        <textarea className="field min-h-[100px] resize-y" defaultValue={o.text} placeholder={t('Notunuzu yazın...')} onBlur={(e) => e.target.value !== o.text && update({ text: e.target.value })} />
                    </>
                )}
            </Section>
            <Section>
                <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" icon={Copy} onClick={() => dispatch({ type: 'ADD_OBJECT', pageId, obj: { ...o, id: newId('ob'), ...(o.x !== undefined ? { x: o.x + 12, y: o.y + 12 } : {}) } })}>{t('Çoğalt')}</Button>
                    <Button size="sm" icon={Trash2} className="hover:!text-danger" onClick={() => dispatch({ type: 'REMOVE_OBJECT', id: o.id })}>{t('Sil')}</Button>
                    <Button size="sm" icon={ArrowUp} onClick={() => dispatch({ type: 'REORDER_OBJECT', id: o.id, delta: 1 })}>{t('Öne getir')}</Button>
                    <Button size="sm" icon={ArrowDown} onClick={() => dispatch({ type: 'REORDER_OBJECT', id: o.id, delta: -1 })}>{t('Geriye gönder')}</Button>
                </div>
            </Section>
        </>
    );
}

// ─── Araç seçenekleri ───────────────────────────────────────────────────────

function ToolPanel({ tool }) {
    const ed = useEditor();
    const { state, dispatch } = ed;
    const opts = state.opts[tool] || {};
    const set = (changes) => dispatch({ type: 'SET_OPTS', tool, changes });
    const meta = TOOLS.find((x) => x.id === tool);

    return (
        <Section title={t(meta?.label || '')}>
            <p className="text-[13px] text-fg-2 leading-relaxed -mt-1">{t(meta?.hint || '')}</p>
            {tool === 'select' && <DocSummary />}
            {tool === 'select' && <FormInfo />}
            {tool === 'select' && state.doc.kind === 'image' && <ImageDocActions />}
            {tool === 'edit' && (
                <p className="text-[13px] text-fg-2 leading-relaxed">{t('Düzenlemek için bir metin satırına ya da görsele tıklayın.')} Fontta varsa metin orijinal fontla yazılır.</p>
            )}
            {tool === 'text' && (
                <>
                    <p className="text-xs text-fg-3">{t('Sayfada tıklayın, sonra yazın.')}</p>
                    <Field label={t('Font')}><FamilySelect value={opts.family} onChange={(family) => set({ family })} /></Field>
                    <div className="flex items-end gap-3">
                        <Field label={t('Boyut')}><NumberInput value={opts.size} onChange={(size) => set({ size })} suffix="pt" /></Field>
                        <StyleToggles bold={opts.bold} italic={opts.italic} onChange={set} />
                    </div>
                    <Field label={t('Renk')}><ColorPicker value={opts.color} onChange={(color) => set({ color })} /></Field>
                </>
            )}
            {tool === 'draw' && (
                <>
                    <Segmented value={opts.mode} onChange={(mode) => set({ mode })} options={[{ value: 'pen', icon: Pen, label: t('Kalem') }, { value: 'marker', icon: Highlighter, label: t('İşaretleyici') }]} />
                    <Field label={t('Renk')}><ColorPicker value={opts.color} onChange={(color) => set({ color })} /></Field>
                    <Slider label={t('Kalınlık')} value={opts.width} min={0.5} max={20} step={0.5} unit=" pt" onChange={(width) => set({ width })} />
                </>
            )}
            {tool === 'highlight' && (
                <>
                    <p className="text-xs text-fg-3">{t('Sürükleyerek metni seçin; seçim vurgulanır.')}</p>
                    <Segmented value={opts.kind} onChange={(kind) => set({ kind })} options={[{ value: 'highlight', icon: Highlighter, label: t('Vurgu') }, { value: 'underline', icon: Underline }, { value: 'strike', icon: Strikethrough }]} />
                    <Field label={t('Renk')}><ColorPicker value={opts.color} swatches={HIGHLIGHT_COLORS.concat(['#e11d48', '#2563eb'])} onChange={(color) => set({ color })} /></Field>
                </>
            )}
            {tool === 'shape' && (
                <>
                    <Segmented value={opts.kind} onChange={(kind) => set({ kind })} options={[{ value: 'rect', icon: Square, title: t('Dikdörtgen') }, { value: 'ellipse', icon: Circle, title: t('Elips') }, { value: 'line', icon: Minus, title: t('Çizgi') }, { value: 'arrow', icon: MoveRight, title: t('Ok') }]} />
                    <p className="text-xs text-fg-3">Sürükleyerek çizin. Shift: kare / 45°.</p>
                    <Field label={t('Kenarlık')}><ColorPicker value={opts.stroke} allowNone={opts.kind === 'rect' || opts.kind === 'ellipse'} onChange={(stroke) => set({ stroke })} /></Field>
                    {(opts.kind === 'rect' || opts.kind === 'ellipse') && <Field label={t('Dolgu')}><ColorPicker value={opts.fill} allowNone onChange={(fill) => set({ fill })} /></Field>}
                    <Slider label={t('Kalınlık')} value={opts.width} min={0.5} max={20} step={0.5} unit=" pt" onChange={(width) => set({ width })} />
                </>
            )}
            {tool === 'image' && <ImageToolPanel />}
            {tool === 'sign' && <SignToolPanel />}
            {tool === 'note' && <Field label={t('Renk')}><ColorPicker value={opts.color} swatches={['#facc15', '#fb923c', '#4ade80', '#60a5fa', '#f472b6', '#c084fc']} onChange={(color) => set({ color })} /></Field>}
            {tool === 'erase' && <EraseToolPanel opts={opts} set={set} />}
            {tool === 'grab' && <GrabToolPanel opts={opts} set={set} />}
            {tool === 'redact' && <RedactToolPanel opts={opts} set={set} />}
        </Section>
    );
}

function DocSummary() {
    const { state } = useEditor();
    const p = state.doc.pages[state.page];
    const objCount = Object.values(state.objects).reduce((s, l) => s + l.length, 0);
    const mm = (v) => Math.round((v / 72) * 25.4);
    return (
        <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
            <dt className="text-fg-3">{t('Sayfa')}</dt><dd className="tabular-nums">{state.page + 1} / {state.doc.pages.length}</dd>
            <dt className="text-fg-3">{t('Boyut')}</dt><dd className="tabular-nums">{mm(p.width)} × {mm(p.height)} mm</dd>
            <dt className="text-fg-3">Katman</dt><dd className="tabular-nums">{objCount}</dd>
            <dt className="col-span-2 text-xs text-fg-3 pt-2 leading-relaxed">{t('Bir nesne seçin ya da soldan bir araç seçin.')} <kbd className="font-mono">?</kbd> kısayollar.</dt>
        </dl>
    );
}

function ImageDocActions() {
    const { dispatch } = useEditor();
    return (
        <div className="flex flex-col gap-2">
            <Button icon={ImageMinus} onClick={() => dispatch({ type: 'SET', values: { dialog: 'bgremove', bgTarget: null } })}>{t('Arka planı kaldır')}</Button>
            <Button icon={ScanLine} onClick={() => dispatch({ type: 'SET', values: { dialog: 'scan' } })}>{t('Belge olarak tara')}</Button>
        </div>
    );
}

function FormInfo() {
    const { state, dispatch } = useEditor();
    const [has, setHas] = useState(false);
    useEffect(() => {
        let alive = true;
        documentHasForm(state.doc.bytes, state.doc.pages.length).then((v) => alive && setHas(v));
        return () => { alive = false; };
    }, [state.doc.bytes, state.doc.pages.length]);
    if (!has) return null;
    const filled = Object.keys(state.forms.values).length;
    return (
        <div className="rounded-xl bg-accent-soft/60 border border-accent/20 p-3 space-y-3">
            <div className="text-[13px] font-medium text-accent-text">{t('Bu belgede doldurulabilir form var')}</div>
            <p className="text-xs text-fg-2 leading-relaxed">{t('Mavi alanlara tıklayıp yazın.')} {filled ? `${filled} ${t('alan dolduruldu')}.` : ''}</p>
            <Toggle checked={state.forms.flatten} onChange={(flatten) => dispatch({ type: 'SET_FORM_FLATTEN', flatten })} label={t('Kaydederken düzleştir')} />
        </div>
    );
}

function ImageToolPanel() {
    const { state, dispatch } = useEditor();
    const ref = useRef(null);
    return (
        <>
            {state.pendingImage ? (
                <div className="rounded-xl border border-line p-2 checker"><img src={state.pendingImage.src} alt="" className="max-h-32 mx-auto" /></div>
            ) : null}
            <p className="text-xs text-fg-3">Görseli yerleştirmek için sayfaya tıklayın.</p>
            <Button icon={ImageUp} onClick={() => ref.current?.click()}>{t('Görsel seçmek için tıklayın')}</Button>
            <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) dispatch({ type: 'SET', values: { pendingImage: await readImageFile(f) } });
            }} />
        </>
    );
}

function SignToolPanel() {
    const { state, dispatch } = useEditor();
    const [sigs, setSigs] = useState(loadSignatures);
    useEffect(() => {
        const onChange = () => setSigs(loadSignatures());
        window.addEventListener('paperwell:signatures', onChange);
        return () => window.removeEventListener('paperwell:signatures', onChange);
    }, []);
    return (
        <>
            <Field label={t('Kaydedilmiş imzalar')} hint={sigs.length ? t('İmzayı yerleştirmek için sayfaya tıklayın.') : undefined}>
                <div className="grid grid-cols-2 gap-2">
                    {sigs.map((s, i) => (
                        <div key={i} className="relative group">
                            <button type="button" onClick={() => dispatch({ type: 'SET', values: { pendingImage: s } })}
                                className={cx('w-full h-16 rounded-lg border bg-white p-1.5 flex items-center justify-center', state.pendingImage?.src === s.src ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-strong')}>
                                <img src={s.src} alt="" className="max-h-full max-w-full" />
                            </button>
                            <button type="button" aria-label={t('Sil')} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface border border-line hidden group-hover:flex items-center justify-center text-fg-2 hover:text-danger"
                                onClick={() => { const next = sigs.filter((_, k) => k !== i); saveSignatures(next); setSigs(next); }}>
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            </Field>
            <Button icon={Plus} onClick={() => dispatch({ type: 'SET', values: { dialog: 'signature' } })}>{t('Yeni imza')}</Button>
        </>
    );
}

function EraseToolPanel({ opts, set }) {
    const ed = useEditor();
    const [cached, setCached] = useState(null);
    useEffect(() => { isMiganCached().then(setCached); }, []);
    const download = () => withBusy(ed, t('Model indiriliyor'), async (progress) => {
        await loadMigan((p) => progress(p, `${t('Model indiriliyor')} ${Math.round(p * 100)}%`));
        setCached(true);
        toast(t('Model hazır'), 'success');
    });
    return (
        <>
            <p className="text-xs text-fg-3 leading-relaxed">{t('Silmek istediğiniz alanı fırçayla boyayın; bıraktığınızda silinir. Altındaki metin de belgeden kaldırılır.')}</p>
            <Slider label={t('Fırça boyutu')} value={opts.size} min={4} max={120} unit=" pt" onChange={(size) => set({ size })} />
            <Segmented value={opts.mode} onChange={(mode) => set({ mode })} options={[{ value: 'fast', icon: Zap, label: t('Hızlı') }, { value: 'ai', icon: Sparkles, label: t('Yapay zekâ') }]} />
            <p className="text-xs text-fg-3 leading-relaxed">
                {opts.mode === 'fast' ? t('Belgeler ve düz arka planlar için. Anında, çevrimdışı.') : t('Fotoğraflar için. Model bir kez indirilir (~28 MB), sonra çevrimdışı çalışır.')}
            </p>
            {opts.mode === 'ai' && cached === false && <Button icon={Download} onClick={download}>{t('Yapay zekâ modelini indir')}</Button>}
            {opts.mode === 'ai' && cached && <p className="text-xs text-success flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{t('Model hazır')}</p>}
        </>
    );
}

function GrabToolPanel({ opts, set }) {
    const ed = useEditor();
    const grab = ed.state.grab;
    const [cached, setCached] = useState(null);
    useEffect(() => { isSamCached().then(setCached); }, [grab]);
    const download = () => withBusy(ed, t('Model indiriliyor'), async (progress) => {
        await loadSam((p) => progress(p, `${t('Model indiriliyor')} ${Math.round(p * 100)}%`));
        setCached(true);
        toast(t('Model hazır'), 'success');
    });
    return (
        <>
            <p className="text-xs text-fg-3 leading-relaxed">{t('Nesnenin üzerine tıklayın. Shift ile nokta ekleyin, Alt ile istemediğiniz bölgeyi çıkarın. Onaylayınca nesne taşınabilir bir katman olur, arkası doldurulur.')}</p>
            <Field label={t('Arkasını doldur')}>
                <Segmented value={opts.fill} onChange={(fill) => set({ fill })} options={[{ value: 'fast', icon: Zap, label: t('Hızlı') }, { value: 'ai', icon: Sparkles, label: t('Yapay zekâ') }]} />
            </Field>
            {grab?.mask ? (
                <div className="rounded-xl bg-surface-2 border border-line p-3 space-y-3">
                    <div className="text-[13px]"><span className="font-semibold tabular-nums">{grab.points.length}</span> {t('nokta')} · {t('Sayfa')} {grab.pageIndex + 1}</div>
                    <div className="flex gap-2">
                        <Button variant="primary" className="flex-1" icon={Check} onClick={() => applyGrab(ed)}>{t('Katmana çıkar')}</Button>
                        <Button onClick={() => clearGrab(ed)}>{t('Temizle')}</Button>
                    </div>
                    <p className="text-xs text-fg-3">Enter · Esc</p>
                </div>
            ) : null}
            {cached === false && <Button icon={Download} onClick={download}>{t('Yapay zekâ modelini indir')} (~14 MB)</Button>}
            {cached && <p className="text-xs text-success flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{t('Model hazır')}</p>}
        </>
    );
}

function RedactToolPanel({ opts, set }) {
    const ed = useEditor();
    const { state, dispatch } = ed;
    const [q, setQ] = useState('');
    const count = Object.values(state.redactions).reduce((s, l) => s + l.length, 0);

    const apply = () => withBusy(ed, t('İşleniyor...'), async () => {
        let bytes = ed.get().doc.bytes;
        const pages = ed.get().doc.pages;
        const fill = opts.fill === 'white' ? [1, 1, 1] : [0, 0, 0];
        let removed = 0;
        for (let i = 0; i < pages.length; i++) {
            const rects = state.redactions[pages[i].id];
            if (!rects?.length) continue;
            const model = await getPageModel(bytes, i);
            const pdfRects = rects.map((r) => {
                const a = model.geom.pdfPoint(r.x, r.y), b = model.geom.pdfPoint(r.x + r.w, r.y + r.h);
                return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
            });
            const res = await redactRects(bytes, i, pdfRects, { fill });
            bytes = res.bytes;
            removed += res.removedGlyphs;
        }
        await commitBytes(ed, bytes);
        pages.forEach((p) => dispatch({ type: 'SET_REDACTIONS', pageId: p.id, rects: [] }));
        toast(`${t('Karartma uygulandı')} · ${removed} karakter silindi`, 'success');
    });

    const markSearch = async () => {
        if (!q.trim()) return;
        const s = ed.get();
        const results = await searchDocument(s.doc.bytes, s.doc.pages.length, q);
        if (!results.length) { toast(t('Sonuç bulunamadı'), 'info'); return; }
        const byPage = {};
        for (const r of results) {
            const id = s.doc.pages[r.pageIndex].id;
            (byPage[id] ||= [...(s.redactions[id] || [])]).push({ x: r.rect.x - 1, y: r.rect.y - 1, w: r.rect.w + 2, h: r.rect.h + 2 });
        }
        Object.entries(byPage).forEach(([pageId, rects]) => dispatch({ type: 'SET_REDACTIONS', pageId, rects }));
        toast(`${results.length} ${t('sonuç')}`, 'success');
    };

    return (
        <>
            <p className="text-xs text-fg-3 leading-relaxed">{t('Karartılacak alanları sürükleyerek işaretleyin.')}</p>
            <Field label={t('Metin ara ve işaretle')}>
                <div className="flex gap-1.5">
                    <input className="field" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && markSearch()} placeholder="TC no, IBAN, isim..." />
                    <Button size="sm" icon={Search} onClick={markSearch} aria-label={t('Ara')} />
                </div>
            </Field>
            <Field label={t('Dolgu')}>
                <Segmented value={opts.fill} onChange={(fill) => set({ fill })} options={[{ value: 'black', label: t('Siyah') }, { value: 'white', label: t('Beyaz') }]} />
            </Field>
            <div className="rounded-xl bg-surface-2 border border-line p-3 space-y-3">
                <div className="text-[13px]"><span className="font-semibold tabular-nums">{count}</span> {t('alan işaretlendi')}</div>
                <p className="text-xs text-fg-3 leading-relaxed">{t('Altındaki metin belgeden tamamen silinir; geri getirilemez (Geri al hariç).')}</p>
                <div className="flex gap-2">
                    <Button variant="danger" className="flex-1" disabled={!count} onClick={apply}>{t('Kalıcı olarak karart')}</Button>
                    <Button disabled={!count} onClick={() => state.doc.pages.forEach((p) => dispatch({ type: 'SET_REDACTIONS', pageId: p.id, rects: [] }))}>{t('Temizle')}</Button>
                </div>
            </div>
        </>
    );
}

export default function Inspector() {
    const { state } = useEditor();
    const sel = state.selected && findObject(state.objects, state.selected.id);
    const editing = state.editing;

    let content;
    if (editing?.kind === 'line') content = <LineEditPanel editing={editing} />;
    else if (editing?.kind === 'image') content = <ImageEditPanel editing={editing} />;
    else if (sel) content = <ObjectPanel key={sel.obj.id} o={sel.obj} pageId={sel.pageId} />;
    else content = <ToolPanel tool={state.tool} />;

    return (
        <aside data-inspector className="w-[272px] shrink-0 bg-surface border-l border-line overflow-y-auto scroll-thin hidden lg:block">
            <div className="h-10 px-4 flex items-center border-b border-line text-xs font-semibold text-fg-2">{t('Özellikler')}</div>
            {content}
            {state.tool === 'select' && <LayersPanel />}
        </aside>
    );
}
