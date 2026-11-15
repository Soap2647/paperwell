// Katmanlar: geçerli sayfadaki nesneler (en üstteki başta); seç, gizle, kilitle, sırala.
import { Eye, EyeOff, Lock, LockOpen, ChevronUp, ChevronDown, Type, Image as ImageIcon, Shapes, PenTool, Highlighter, StickyNote, Link2 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { cx } from '../components/ui';
import { t } from '../i18n';

const ICONS = { text: Type, image: ImageIcon, path: PenTool, highlight: Highlighter, note: StickyNote };

function label(o) {
    if (o.name) return o.name;
    if (o.type === 'text') return o.text?.split('\n')[0] || t('Metin');
    if (o.type === 'image') return o.signature ? t('İmza') : t('Görsel');
    if (o.type === 'note') return t('Not');
    return { rect: t('Dikdörtgen'), ellipse: t('Elips'), line: t('Çizgi'), arrow: t('Ok'), path: t('Çiz'), highlight: t('Vurgu') }[o.type] || o.type;
}

export default function LayersPanel() {
    const { state, dispatch } = useEditor();
    const page = state.doc.pages[state.page];
    const list = state.objects[page?.id] || [];
    if (!list.length) return null;
    const toggle = (o, key) => dispatch({ type: 'UPDATE_OBJECT', id: o.id, changes: { [key]: !o[key] } });
    const btn = 'w-6 h-6 rounded-md inline-flex items-center justify-center text-fg-3 hover:text-fg hover:bg-surface-3';
    return (
        <section className="px-4 py-4 border-b border-line space-y-2" data-layers>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-3">{t('Katmanlar')} <span className="tabular-nums">({list.length})</span></h3>
            <ul className="space-y-0.5 max-h-72 overflow-y-auto scroll-thin -mx-1">
                {[...list].reverse().map((o, i) => {
                    const Icon = ICONS[o.type] || Shapes;
                    const sel = state.selected?.id === o.id || !!state.selected?.ids?.includes(o.id);
                    return (
                        <li key={o.id} className={cx('group flex items-center gap-1 pl-1.5 pr-1 h-8 rounded-lg', sel ? 'bg-accent-soft text-accent-text' : 'hover:bg-surface-2', o.hidden && 'opacity-50')}>
                            <button type="button" className="flex-1 min-w-0 flex items-center gap-2 text-left text-[12.5px] h-full"
                                onClick={(e) => {
                                    // Shift / Ctrl+tık: seçime ekle ya da çıkar
                                    if ((e.shiftKey || e.ctrlKey || e.metaKey) && state.selected?.pageId === page.id) {
                                        const cur = state.selected.ids || [state.selected.id];
                                        const ids = cur.includes(o.id) ? cur.filter((i) => i !== o.id) : [...cur, o.id];
                                        dispatch({ type: 'SET', values: { selected: ids.length ? { pageId: page.id, id: ids[ids.length - 1], ...(ids.length > 1 ? { ids } : {}) } : null, editing: null } });
                                    } else dispatch({ type: 'SET', values: { selected: { pageId: page.id, id: o.id }, editing: null } });
                                }}>
                                {o.type === 'image' && o.src && !o.signature
                                    ? <span className="w-6 h-6 shrink-0 rounded checker overflow-hidden flex items-center justify-center"><img src={o.src} alt="" className="max-w-full max-h-full object-contain" draggable={false} /></span>
                                    : <Icon className="w-3.5 h-3.5 shrink-0 text-fg-3" />}
                                <span className="truncate">{label(o)}</span>
                                {o.groupId && <Link2 className="w-3 h-3 shrink-0 text-fg-3" aria-label={t('Grupta')} />}
                            </button>
                            <span className="hidden group-hover:flex">
                                <button type="button" className={btn} aria-label={t('Öne getir')} disabled={i === 0} onClick={() => dispatch({ type: 'REORDER_OBJECT', id: o.id, delta: 1 })}><ChevronUp className="w-3.5 h-3.5" /></button>
                                <button type="button" className={btn} aria-label={t('Geriye gönder')} disabled={i === list.length - 1} onClick={() => dispatch({ type: 'REORDER_OBJECT', id: o.id, delta: -1 })}><ChevronDown className="w-3.5 h-3.5" /></button>
                            </span>
                            <button type="button" className={btn} aria-label={o.locked ? t('Kilidi aç') : t('Kilitle')} aria-pressed={!!o.locked} onClick={() => toggle(o, 'locked')}>
                                {o.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" />}
                            </button>
                            <button type="button" className={btn} aria-label={o.hidden ? t('Göster') : t('Gizle')} aria-pressed={!!o.hidden} onClick={() => toggle(o, 'hidden')}>
                                {o.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
