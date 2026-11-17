// Bağlama duyarlı özellikler paneli
import { useEffect, useRef, useState } from 'react';
import {
    Bold, Italic, AlignLeft, AlignCenter, AlignRight, Trash2, Copy, ArrowUp, ArrowDown, Square, Circle, Minus, MoveRight,
    Pen, Highlighter, Underline, Strikethrough, ImageUp, Plus, Check, X, Download, Sparkles, Zap, Search, ImageMinus, ScanLine, Layers,
    Group, Ungroup, Rows3, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Paintbrush, Eraser, Crop, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
} from 'lucide-react';
import { bbox, moveBy } from './objects';
import { useEditor, findObject } from '../store/editor';
import { commitBytes, withBusy, upscaleImageDoc } from '../store/actions';
import { newId } from '../core/pageOps';
import { getPageModel, searchDocument } from '../core/modelCache';
import { redactRects, replaceImageContent, deleteImage } from '../core/pdf/editOps';
import { isMiganCached, loadMigan } from '../core/inpaint/migan';
import { isSamCached, loadSam } from '../core/segment';
import { getBackend } from '../core/inference';
import { applyGrab, clearGrab } from './grabActions';
import { FONT_FAMILIES, effectiveWeight } from '../core/fonts';
import FontPicker from './FontPicker';
import { documentHasForm } from '../core/forms';
import { Button, ColorPicker, Field, Segmented, Slider, Toggle, cx } from '../components/ui';
import { toast } from '../components/Toaster';
import { t } from '../i18n';
import { TOOLS } from './tools';
import LayersPanel from './LayersPanel';
import BrandPanel from './BrandPanel';
import InsertPanel from './InsertPanel';
import FixAllPanel from './FixAllPanel';
import { fixFindTexts } from './fixActions';
import { runMagicLayers, runMagicLayersOnObject } from './magicLayersAction';
import { readImageFile } from './imageFiles';
import { logoEdit } from '../core/logoTools';
import { effectCss } from '../core/textEffects';
import { contrast, hexRgb } from '../core/placement';
import { useBackdrop, sampleBackdrop } from './backdrop';
import { useBrandKit } from '../core/brandKit';
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

const FamilySelect = FontPicker;

const WEIGHT_STEPS = [{ value: 400, label: 'Normal' }, { value: 500, label: 'Orta' }, { value: 600, label: 'Yarı kalın' }, { value: 700, label: 'Kalın' }];
/** Ailenin 2'den çok ağırlığı varsa 4 kademeli kalınlık seçici */
function WeightControl({ o, update }) {
    const f = FONT_FAMILIES[o.family];
    if (!f?.weights || f.weights.length <= 2) return null;
    const w = effectiveWeight(o);
    return (
        <Field label={t('Kalınlık')}>
            <Segmented value={WEIGHT_STEPS.reduce((b, s) => (Math.abs(s.value - w) < Math.abs(b - w) ? s.value : b), 400)}
                onChange={(weight) => update({ weight, bold: weight >= 600 })}
                options={WEIGHT_STEPS.map((s) => ({ ...s, label: <span className="truncate">{t(s.label)}</span> }))} />
        </Field>
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

/** Gruptaki nesne: birlikte taşındığını söyler, tek tıkla çözer */
function GroupInfo({ o, pageId }) {
    const { state, dispatch } = useEditor();
    const members = (state.objects[pageId] || []).filter((q) => q.groupId === o.groupId);
    return (
        <div className="rounded-xl border border-line bg-surface-2 p-2.5 text-xs text-fg-2 space-y-2">
            <p className="leading-relaxed">{t('Bu parça bir grubun içinde')} ({members.length}): {t('birlikte taşınırlar.')}</p>
            <Button size="sm" onClick={() => dispatch({ type: 'UPDATE_OBJECTS', updates: members.map((q) => ({ id: q.id, changes: { groupId: undefined } })) })}>{t('Grubu çöz')}</Button>
        </div>
    );
}

/** Birden fazla nesne seçili: grupla, hizala, sil */
function MultiPanel({ pageId, ids }) {
    const { state, dispatch } = useEditor();
    const objs = (state.objects[pageId] || []).filter((o) => ids.includes(o.id));
    const free = objs.filter((o) => !o.locked);
    const grouped = objs.length > 1 && objs.every((o) => o.groupId && o.groupId === objs[0].groupId);
    const bs = free.map(bbox);
    const box = bs.length && { x0: Math.min(...bs.map((b) => b.x)), y0: Math.min(...bs.map((b) => b.y)), x1: Math.max(...bs.map((b) => b.x + b.w)), y1: Math.max(...bs.map((b) => b.y + b.h)) };
    // seçimin toplam kutusuna göre hizalar
    const align = (mode) => dispatch({
        type: 'UPDATE_OBJECTS',
        updates: free.map((o, i) => {
            const b = bs[i];
            const dx = mode === 'left' ? box.x0 - b.x : mode === 'right' ? box.x1 - (b.x + b.w) : mode === 'hcenter' ? (box.x0 + box.x1) / 2 - (b.x + b.w / 2) : 0;
            const dy = mode === 'top' ? box.y0 - b.y : mode === 'bottom' ? box.y1 - (b.y + b.h) : mode === 'vcenter' ? (box.y0 + box.y1) / 2 - (b.y + b.h / 2) : 0;
            return { id: o.id, changes: moveBy(o, dx, dy) };
        }),
    });
    const group = () => {
        const gid = newId('gp');
        dispatch({ type: 'UPDATE_OBJECTS', updates: objs.map((o) => ({ id: o.id, changes: { groupId: gid } })) });
        toast(t('Gruplandı: artık birlikte taşınırlar'), 'success', 3000);
    };
    const ungroup = () => dispatch({ type: 'UPDATE_OBJECTS', updates: objs.map((o) => ({ id: o.id, changes: { groupId: undefined } })) });
    // ilk ve son nesne yerinde kalır, aradakiler aralar eşit olacak şekilde yerleşir
    const distribute = (axis) => {
        const W = axis === 'x' ? 'w' : 'h';
        const order = free.map((o, i) => ({ o, b: bs[i] })).sort((p, q) => (p.b[axis] + p.b[W] / 2) - (q.b[axis] + q.b[W] / 2));
        const first = order[0].b, last = order[order.length - 1].b;
        const gap = (last[axis] + last[W] - first[axis] - order.reduce((n, p) => n + p.b[W], 0)) / (order.length - 1);
        let at = first[axis];
        dispatch({
            type: 'UPDATE_OBJECTS',
            updates: order.map(({ o, b }) => {
                const d = at - b[axis];
                at += b[W] + gap;
                return { id: o.id, changes: axis === 'x' ? moveBy(o, d, 0) : moveBy(o, 0, d) };
            }),
        });
    };
    // Logo şeridi: döndürülmemiş görseller ortanca yüksekliğe ölçeklenir, ortak yatay eksene oturur, soldan sağa eşit aralıkla dizilir
    const logoStrip = () => {
        const sizable = (o) => o.type === 'image' && !o.rotation;
        const imgs = free.filter(sizable).map((o) => o.h).sort((a, b) => a - b);
        const page = state.doc.pages.find((p) => p.id === pageId);
        const n = free.length;
        const measure = (H) => {
            const items = free.map((o, i) => {
                const b = bs[i], k = sizable(o) ? H / o.h : 1;
                return { o, b, k, w: b.w * k, h: b.h * k, cx: b.x + b.w / 2 };
            }).sort((p, q) => p.cx - q.cx);
            return { items, total: items.reduce((s, p) => s + p.w, 0) };
        };
        let H = imgs[imgs.length >> 1];
        let { items, total } = measure(H);
        let gap = (box.x1 - box.x0 - total) / (n - 1);
        if (gap < H * 0.3) gap = H * 0.5;
        // şerit sayfaya sığmıyorsa (sayfa genişliğinin %90'ı) logolar orantılı küçülür
        const maxW = page.width * 0.9;
        if (total + gap * (n - 1) > maxW) {
            const f = maxW / (total + gap * (n - 1));
            H *= f; gap *= f;
            ({ items, total } = measure(H));
        }
        const width = total + gap * (n - 1);
        let at = gap === (box.x1 - box.x0 - total) / (n - 1) ? box.x0 : (box.x0 + box.x1) / 2 - width / 2;
        at = Math.max(page.width * 0.05, Math.min(at, page.width * 0.95 - width));
        const cy = items.reduce((s, p) => s + p.b.y + p.b.h / 2, 0) / n;
        dispatch({
            type: 'UPDATE_OBJECTS',
            updates: items.map((p) => {
                const x = at;
                at += p.w + gap;
                if (p.k !== 1) return { id: p.o.id, changes: { x, y: cy - p.h / 2, w: p.w, h: p.h } };
                return { id: p.o.id, changes: moveBy(p.o, x - p.b.x, cy - p.h / 2 - p.b.y) };
            }),
        });
    };
    const ALIGN = [
        ['left', AlignStartVertical, 'Sola hizala'], ['hcenter', AlignCenterVertical, 'Yatayda ortala'], ['right', AlignEndVertical, 'Sağa hizala'],
        ['top', AlignStartHorizontal, 'Üste hizala'], ['vcenter', AlignCenterHorizontal, 'Dikeyde ortala'], ['bottom', AlignEndHorizontal, 'Alta hizala'],
    ];
    return (
        <Section title={`${objs.length} ${t('nesne seçili')}`}>
            <p className="text-xs text-fg-3 leading-relaxed">{t('Sürükleyince hepsi birlikte taşınır. Shift ile tıklayarak seçime ekleyip çıkarabilirsiniz.')}</p>
            {grouped
                ? <Button icon={Ungroup} className="w-full" onClick={ungroup}>{t('Grubu çöz')}</Button>
                : <Button variant="primary" icon={Group} className="w-full" onClick={group}>{t('Grupla (hep birlikte kalsın)')}</Button>}
            {free.length > 1 && (
                <Field label={t('Hizala')}>
                    <div className="grid grid-cols-6 gap-1">
                        {ALIGN.map(([m, Icon, label]) => (
                            <button key={m} type="button" title={t(label)} aria-label={t(label)} onClick={() => align(m)}
                                className="h-8 rounded-lg border border-line flex items-center justify-center text-fg-2 hover:bg-surface-2 hover:text-fg">
                                <Icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>
                </Field>
            )}
            {free.length > 2 && (
                <Field label={t('Eşit aralıkla dağıt')}>
                    <div className="grid grid-cols-2 gap-1.5">
                        <Button size="sm" icon={AlignHorizontalSpaceAround} onClick={() => distribute('x')}>{t('Yatay')}</Button>
                        <Button size="sm" icon={AlignVerticalSpaceAround} onClick={() => distribute('y')}>{t('Dikey')}</Button>
                    </div>
                </Field>
            )}
            {free.length > 1 && free.some((o) => o.type === 'image') && (
                <>
                    <Button icon={Rows3} className="w-full" onClick={logoStrip}>{t('Logo şeridi yap')}</Button>
                    <p className="text-xs text-fg-3 leading-relaxed -mt-1">{t('Logolar aynı yüksekliğe gelir, aynı hizaya oturur ve eşit aralıkla dizilir.')}</p>
                </>
            )}
            <Button variant="danger" icon={Trash2} className="w-full" onClick={() => dispatch({ type: 'REMOVE_OBJECTS', ids })}>{t('Hepsini sil')}</Button>
        </Section>
    );
}

function ObjectPanel({ o, pageId }) {
    const ed = useEditor();
    const { dispatch } = ed;
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
                {(o.type === 'text' || o.type === 'image') && <Readability o={o} update={update} />}
                {o.type === 'text' && (
                    <>
                        <Field label={t('Font')}><FamilySelect value={o.family} onChange={(family) => update({ family })} /></Field>
                        <div className="flex items-end gap-3">
                            <Field label={t('Boyut')}><NumberInput value={o.size} onChange={(size) => update({ size })} suffix="pt" /></Field>
                            <StyleToggles bold={o.bold} italic={o.italic} onChange={(c) => update('bold' in c ? { ...c, weight: undefined } : c)} />
                        </div>
                        <WeightControl o={o} update={update} />
                        <TextEffects o={o} update={update} live={live} checkpoint={checkpoint} />
                        <Field label={t('Hizalama')}>
                            <Segmented value={o.align || 'left'} onChange={(align) => update({ align })} options={[{ value: 'left', icon: AlignLeft }, { value: 'center', icon: AlignCenter }, { value: 'right', icon: AlignRight }]} />
                        </Field>
                        <Field label={t('Renk')}><ColorPicker value={o.color} onChange={(color) => update({ color })} /></Field>
                        {opacity}
                        {rotation}
                        <p className="text-xs text-fg-3">Çift tıklayarak metni düzenleyin.</p>
                        {o.rasterSource && (
                            <Button icon={ImageUp} onClick={() => {
                                const r = o.rasterSource;
                                const textSource = { type: 'text', text: o.text, family: o.family, bold: o.bold, weight: o.weight, italic: o.italic, size: o.size, color: o.color, align: o.align, lineHeight: o.lineHeight, opacity: o.opacity, rotation: o.rotation, w: o.w, h: o.h, x: -r.x, y: -r.y };
                                update({ type: 'image', src: r.src, x: o.x + r.x, y: o.y + r.y, w: r.w, h: r.h, rotation: 0, textSource, rasterSource: undefined });
                            }}>{t('Afişteki haline dön')}</Button>
                        )}
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
                {o.groupId && <GroupInfo o={o} pageId={pageId} />}
                {o.type === 'image' && (
                    <>
                        {opacity}
                        {rotation}
                        {o.textSource ? (
                            <>
                                <Button icon={Pen} onClick={() => {
                                    const x = o.x + o.textSource.x, y = o.y + o.textSource.y;
                                    update({ ...o.textSource, x, y, src: undefined, textSource: undefined, rasterSource: { src: o.src, x: o.x - x, y: o.y - y, w: o.w, h: o.h } });
                                }}>{t('Metni düzenle')}</Button>
                                <p className="text-xs text-fg-3 leading-relaxed">
                                    {t('Yazı şu an afişteki haliyle duruyor. Düzenlerseniz şu fontla yeniden yazılır:')} {FONT_FAMILIES[o.textSource.family]?.label}{o.textSource.weight && o.textSource.weight !== 400 && o.textSource.weight !== 700 ? ` ${o.textSource.weight}` : o.textSource.bold ? `, ${t('Kalın').toLowerCase()}` : ''}{o.textSource.italic ? `, ${t('İtalik').toLowerCase()}` : ''}
                                </p>
                            </>
                        ) : (
                            <>
                                {!o.signature && <Button variant="primary" icon={Layers} onClick={() => runMagicLayersOnObject(ed, o.id)}>{t('Sihirli Katmanlar')}</Button>}
                                <Button icon={ImageMinus} onClick={() => dispatch({ type: 'SET', values: { dialog: 'bgremove', bgTarget: o.id } })}>{t('Arka planı kaldır')}</Button>
                                {!o.signature && <LogoTools o={o} update={update} />}
                            </>
                        )}
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

// Hazır yazı stilleri: tek tıkla efekt seti (renk de değişebilir); "Sade" hepsini kaldırır
const TEXT_PRESETS = [
    { name: 'Sade', fx: { shadow: undefined, outline: undefined, gradient: undefined } },
    { name: 'Gölgeli', fx: { shadow: { color: '#000000', opacity: 0.55, blur: 10, dist: 5 }, outline: undefined, gradient: undefined } },
    { name: 'Çerçeveli', fx: { outline: { color: '#000000', width: 2.5 }, shadow: undefined, gradient: undefined } },
    { name: 'Neon', fx: { color: '#ffffff', shadow: { color: '#22d3ee', opacity: 0.95, blur: 22, dist: 0 }, outline: undefined, gradient: undefined } },
    { name: 'Altın', fx: { gradient: { from: '#fde68a', to: '#b45309', angle: 180 }, shadow: { color: '#000000', opacity: 0.45, blur: 6, dist: 3 }, outline: undefined } },
    { name: 'Gökkuşağı', fx: { gradient: { from: '#60a5fa', to: '#c084fc', angle: 90 }, shadow: undefined, outline: undefined } },
];

/** Yazı efektleri: hazır stiller + gölge, dış çizgi, degrade ayarları */
function TextEffects({ o, update, live, checkpoint }) {
    const fx = (key, def) => (o[key] ? update({ [key]: undefined }) : update({ [key]: def }));
    const sub = (key, changes) => live({ [key]: { ...o[key], ...changes } });
    const chip = (key, label, def) => (
        <button type="button" onClick={() => fx(key, def)} aria-pressed={!!o[key]}
            className={cx('h-7 px-2.5 rounded-full border text-xs font-medium', o[key] ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-surface-2')}>{label}</button>
    );
    return (
        <Field label={t('Efektler')}>
            <div className="grid grid-cols-3 gap-1.5">
                {TEXT_PRESETS.map((p) => (
                    <button key={p.name} type="button" onClick={() => update(p.fx)}
                        className="h-11 rounded-lg border border-line bg-[#1e1b4b] hover:border-accent flex items-center justify-center overflow-hidden">
                        <span style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: 14, ...effectCss({ ...p.fx, color: p.fx.color || '#ffffff' }), color: p.fx.gradient ? 'transparent' : (p.fx.color || '#ffffff') }}>{t(p.name)}</span>
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
                {chip('shadow', t('Gölge'), { color: '#000000', opacity: 0.55, blur: 10, dist: 5 })}
                {chip('outline', t('Dış çizgi'), { color: '#000000', width: 2 })}
                {chip('gradient', t('Degrade'), { from: o.color || '#ffffff', to: '#7c3aed', angle: 180 })}
            </div>
            {o.shadow && (
                <div className="space-y-2 rounded-lg border border-line p-2">
                    <span className="text-xs font-medium text-fg-2">{t('Gölge')}</span>
                    <ColorPicker value={o.shadow.color} onChange={(color) => update({ shadow: { ...o.shadow, color } })} />
                    <Slider label={t('Yumuşaklık')} value={o.shadow.blur} min={0} max={40} onStart={checkpoint} onChange={(blur) => sub('shadow', { blur })} />
                    <Slider label={t('Uzaklık')} value={o.shadow.dist} min={0} max={30} onStart={checkpoint} onChange={(dist) => sub('shadow', { dist })} />
                    <Slider label={t('Koyuluk')} value={Math.round((o.shadow.opacity ?? 0.6) * 100)} min={10} max={100} unit="%" onStart={checkpoint} onChange={(v) => sub('shadow', { opacity: v / 100 })} />
                </div>
            )}
            {o.outline && (
                <div className="space-y-2 rounded-lg border border-line p-2">
                    <span className="text-xs font-medium text-fg-2">{t('Dış çizgi')}</span>
                    <ColorPicker value={o.outline.color} onChange={(color) => update({ outline: { ...o.outline, color } })} />
                    <Slider label={t('Kalınlık')} value={o.outline.width} min={0.5} max={12} step={0.5} unit=" pt" onStart={checkpoint} onChange={(width) => sub('outline', { width })} />
                </div>
            )}
            {o.gradient && (
                <div className="space-y-2 rounded-lg border border-line p-2">
                    <span className="text-xs font-medium text-fg-2">{t('Degrade')}</span>
                    <ColorPicker value={o.gradient.from} onChange={(from) => update({ gradient: { ...o.gradient, from } })} />
                    <ColorPicker value={o.gradient.to} onChange={(to) => update({ gradient: { ...o.gradient, to } })} />
                    <Segmented value={o.gradient.angle ?? 180} onChange={(angle) => update({ gradient: { ...o.gradient, angle } })}
                        options={[{ value: 180, label: '↓' }, { value: 90, label: '→' }, { value: 135, label: '↘' }, { value: 45, label: '↗' }]} />
                </div>
            )}
        </Field>
    );
}

// Logonun görünür piksellerinin ortalama rengi (okunabilirlik için; src başına bir kez hesaplanır)
const logoColorCache = new Map();
function logoColor(src) {
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

/**
 * Okunabilirlik: yazı ya da logo zemininde kayboluyorsa uyarır ve tek tıkla düzeltme önerir.
 * Eşikler: yazı için kontrast < 2.5, logo için < 1.6 (logolarda renk çeşitliliği ortalamayı yumuşatır).
 */
function Readability({ o, update }) {
    const { state } = useEditor();
    const bd = useBackdrop(state);
    const [logoFg, setLogoFg] = useState(null);
    const isLogo = o.type === 'image' && !o.qr && !o.signature && o.w * o.h < state.doc.pages[state.page].width * state.doc.pages[state.page].height * 0.6;
    useEffect(() => { let live = true; if (isLogo) logoColor(o.src).then((c) => live && setLogoFg(c)); return () => { live = false; }; }, [isLogo, o.src]);
    if (!bd) return null;
    const bg = sampleBackdrop(bd, bbox(o));
    let fg = null, limit = 2.5;
    if (o.type === 'text') {
        if (o.outline && contrast(hexRgb(o.outline.color), bg) >= 3) return null;
        fg = o.gradient ? hexRgb(o.gradient.from).map((v, i) => (v + hexRgb(o.gradient.to)[i]) / 2) : hexRgb(o.color);
    } else if (isLogo && logoFg) { fg = logoFg; limit = 1.6; }
    if (!fg || contrast(fg, bg) >= limit) return null;
    const light = contrast([255, 255, 255], bg) >= contrast([17, 24, 39], bg);
    const best = light ? '#ffffff' : '#111827';
    const fixText = (changes) => update({ ...changes, gradient: undefined });
    const tint = async (hex) => { const ch = await logoEdit(o, 'tint', hex).catch(() => null); if (ch) update(o.origSrc ? ch : { ...ch, origSrc: o.src }); };
    return (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-2.5 space-y-2">
            <p className="text-xs leading-relaxed"><b>{o.type === 'text' ? t('Bu yazı zeminde zor okunuyor.') : t('Bu logo zeminde kayboluyor.')}</b> {t('Tek tıkla düzeltin:')}</p>
            <div className="flex flex-wrap gap-1.5">
                {o.type === 'text' ? (
                    <>
                        <Button size="sm" onClick={() => fixText({ color: best })}>{light ? t('Beyaz yap') : t('Koyu yap')}</Button>
                        <Button size="sm" onClick={() => update({ outline: { color: light ? '#111827' : '#ffffff', width: Math.max(1, o.size * 0.04) } })}>{t('Dış çizgi ekle')}</Button>
                        <Button size="sm" onClick={() => update({ shadow: { color: light ? '#000000' : '#ffffff', opacity: 0.8, blur: o.size * 0.25, dist: 0 } })}>{t('Gölge ekle')}</Button>
                    </>
                ) : (
                    <Button size="sm" onClick={() => tint(best)}>{light ? t('Beyaz yap') : t('Koyu yap')}</Button>
                )}
            </div>
        </div>
    );
}

/** Logo araçları: tek tıkla düz zemini silme, boş kenarları kırpma ve tek renge boyama (anında, model yok) */
function LogoTools({ o, update }) {
    const kit = useBrandKit();
    const [busy, setBusy] = useState(false);
    const run = async (op, hex) => {
        setBusy(true);
        try {
            const changes = await logoEdit(o, op, hex);
            if (!changes) toast(t('Kırpılacak boş kenar yok'), 'info', 2500);
            else update(op === 'tint' ? (o.origSrc ? changes : { ...changes, origSrc: o.src }) : { ...changes, origSrc: undefined });
        } catch (e) { toast(t(e.message), 'info', 4500); }
        setBusy(false);
    };
    const colors = [...new Set(['#ffffff', '#000000', ...kit.colors.map((c) => c.hex.toLowerCase())])].slice(0, 9);
    return (
        <Field label={t('Logo')} hint={t('Beyaz zeminli logoyu koyu afişe koyarken zemini silin; koyu afişte okunmayan logoyu beyaz yapın.')}>
            <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" icon={Eraser} disabled={busy} onClick={() => run('bg')}>{t('Düz zemini sil')}</Button>
                <Button size="sm" icon={Crop} disabled={busy} onClick={() => run('trim')}>{t('Boşlukları kırp')}</Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-fg-3 inline-flex items-center gap-1 mr-0.5"><Paintbrush className="w-3.5 h-3.5" />{t('Tek renk')}</span>
                {colors.map((hex) => (
                    <button key={hex} type="button" disabled={busy} title={hex} aria-label={hex} onClick={() => run('tint', hex)}
                        className="w-6 h-6 rounded-full border border-line-strong transition-transform hover:scale-110" style={{ background: hex }} />
                ))}
                {o.origSrc && <Button size="sm" variant="ghost" onClick={() => update({ src: o.origSrc, origSrc: undefined })}>{t('Orijinal renk')}</Button>}
            </div>
        </Field>
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
            {tool === 'brand' && <BrandPanel />}
            {tool === 'insert' && <InsertPanel />}
            {tool === 'fix' && state.fix?.step === 'all' && <FixAllPanel key={state.fix.items.length + ':' + state.fix.pageIndex} fix={state.fix} />}
            {tool === 'fix' && state.fix?.step !== 'all' && (
                <div className="space-y-3 text-[13px] text-fg-2 leading-relaxed">
                    <Button icon={Search} className="w-full" onClick={() => fixFindTexts(ed)}>{t('Tüm yazıları bul ve düzelt')}</Button>
                    <Segmented value={opts.mode} onChange={(mode) => set({ mode })} options={[{ value: 'box', label: t('Kutu') }, { value: 'brush', label: t('Fırça') }]} />
                    {opts.mode === 'brush' && <Slider label={t('Fırça boyutu')} value={opts.size} min={4} max={120} step={1} unit=" pt" onChange={(size) => set({ size })} />}
                    <p>{opts.mode === 'brush'
                        ? t('Bozuk yerin üstünü fırçayla boyayın (Shift: boyamaya ekle). Çapraz ya da kıvrık detaylarda kutudan daha az yer silinir. Bırakınca menü çıkar:')
                        : t('Yapay zekâ görselindeki bozuk yeri (logo, yazı, fazlalık) fareyle kutu içine alın. Altında çıkan menüden seçin:')}</p>
                    <ul className="space-y-1.5 text-xs">
                        <li><b className="text-fg">{t('Sil')}</b> — {t('bozuk detay silinir, arkası doğal şekilde tamamlanır.')}</li>
                        <li><b className="text-fg">{t('Yazıyı düzelt')}</b> — {t('yazı okunur, doğrusunu yazarsınız; marka fontuyla yerine gelir.')}</li>
                        <li><b className="text-fg">{t('Logo koy')}</b> — {t('bozuk logo silinir, marka kitinizdeki logo aynı yere oturur.')}</li>
                    </ul>
                    <p className="text-xs text-fg-3">{t('Kutuyu nesnenin biraz dışından çizin; kenarlar zemin olarak kullanılır. Her işlem Ctrl+Z ile geri alınır.')}</p>
                </div>
            )}
            {tool === 'erase' && <EraseToolPanel opts={opts} set={set} />}
            {tool === 'grab' && <GrabToolPanel opts={opts} set={set} />}
            {tool === 'redact' && <RedactToolPanel opts={opts} set={set} />}
        </Section>
    );
}

/** Yapay zekâ modellerinin nerede çalıştığı: GPU (adaptör) / CPU / Tarayıcı */
function AccelInfo() {
    const [b, setB] = useState(null);
    useEffect(() => { getBackend().then(setB); }, []);
    if (!b) return null;
    const label = b.kind === 'gpu' ? `GPU (${b.adapter})` : b.kind === 'cpu' ? 'CPU' : t('Tarayıcı');
    return (
        <>
            <dt className="text-fg-3">{t('Hızlandırma')}</dt>
            <dd className="truncate" title={b.reason || label}>{label}{b.reason ? ' ⚠' : ''}</dd>
        </>
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
            <AccelInfo />
            <dt className="col-span-2 text-xs text-fg-3 pt-2 leading-relaxed">{t('Bir nesne seçin ya da soldan bir araç seçin.')} <kbd className="font-mono">?</kbd> kısayollar.</dt>
        </dl>
    );
}

function ImageDocActions() {
    const ed = useEditor();
    const { state, dispatch } = ed;
    const px = state.doc.imageSize ? Math.max(state.doc.imageSize.w, state.doc.imageSize.h) : 0;
    return (
        <div className="flex flex-col gap-2">
            {px > 0 && px < 2000 && (
                <div className="rounded-xl border border-accent/30 bg-accent-soft/50 p-2.5 space-y-2">
                    <p className="text-xs text-fg-2 leading-relaxed">{t('Bu görsel')} {state.doc.imageSize.w} × {state.doc.imageSize.h} px. {t('Yapay zekâyla iki kat büyütüp netleştirirseniz kaydettiğiniz dosya keskin olur.')}</p>
                    <Button variant="primary" icon={Sparkles} className="w-full" onClick={() => upscaleImageDoc(ed, 2)}>{t('Netleştir (2×)')}</Button>
                </div>
            )}
            <Button variant={px > 0 && px < 2000 ? 'default' : 'primary'} icon={Layers} onClick={() => runMagicLayers(ed)}>{t('Sihirli Katmanlar')}</Button>
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
    else if (state.selected?.ids?.length > 1) content = <MultiPanel pageId={state.selected.pageId} ids={state.selected.ids} />;
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
