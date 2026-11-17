import { useEffect, useState } from 'react';
import { useEditor, findObject } from '../store/editor';
import { download, saveProject } from '../store/actions';
import { newId } from '../core/pageOps';
import { TOOL_BY_KEY } from './tools';
import { moveBy } from './objects';
import { readImageFile } from './imageFiles';
import { smartSpot } from './backdrop';
import { toast } from '../components/Toaster';
import { t } from '../i18n';
import TopBar from './TopBar';
import ToolRail from './ToolRail';
import PagesPanel from './PagesPanel';
import Canvas from './Canvas';
import Inspector from './Inspector';
import BusyOverlay from './BusyOverlay';
import Dialogs from './dialogs/Dialogs';
import { GeneralTour } from './Tour';

let clipboard = null; // kopyalanan nesneler (dizi)

export default function Editor() {
    const ed = useEditor();
    const { state, dispatch } = ed;
    const [pagesOpen, setPagesOpen] = useState(() => window.innerWidth > 900);

    // Klavye kısayolları
    useEffect(() => {
        const onKey = (e) => {
            const s = ed.get();
            const el = document.activeElement;
            const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
            const mod = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();
            if (s.dialog || s.busy) return;

            if (mod && key === 's') {
                e.preventDefault();
                // proje olarak açılan / kaydedilen belge: Ctrl+S projeyi günceller
                if (s.doc.projectPath && !e.shiftKey) saveProject(ed);
                else download(ed, { saveAs: e.shiftKey });
                return;
            }
            if (mod && key === 'p') { e.preventDefault(); dispatch({ type: 'SET', values: { dialog: 'print' } }); return; }
            if (mod && key === 'f') { e.preventDefault(); dispatch({ type: 'SET', values: { search: s.search || { query: '', results: [], index: 0 } } }); return; }
            if (typing) return;

            if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }); return; }
            if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); dispatch({ type: 'REDO' }); return; }
            if (mod && (key === '=' || key === '+')) { e.preventDefault(); dispatch({ type: 'SET', values: { zoom: Math.min(5, s.zoom * 1.2) } }); return; }
            if (mod && key === '-') { e.preventDefault(); dispatch({ type: 'SET', values: { zoom: Math.max(0.2, s.zoom / 1.2) } }); return; }
            if (mod && key === '0') { e.preventDefault(); window.dispatchEvent(new CustomEvent('paperwell:fit', { detail: 'width' })); return; }

            if (mod && key === 'r') { e.preventDefault(); dispatch({ type: 'SET', values: { rulers: !s.rulers } }); return; }

            // çoklu seçim: sil ve ok tuşlarıyla kaydır
            const multi = s.selected?.ids?.length > 1 ? s.selected.ids : null;
            if (multi) {
                if (key === 'delete' || key === 'backspace') { e.preventDefault(); dispatch({ type: 'REMOVE_OBJECTS', ids: multi }); return; }
                if (mod && (key === 'c' || key === 'd')) {
                    const list = (s.objects[s.selected.pageId] || []).filter((o) => multi.includes(o.id));
                    if (key === 'c') { copyObjects(list); return; }
                    e.preventDefault();
                    pasteObjects(ed, list, 12);
                    return;
                }
                if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
                    e.preventDefault();
                    const d = e.shiftKey ? 10 : 1;
                    const dx = key === 'arrowleft' ? -d : key === 'arrowright' ? d : 0;
                    const dy = key === 'arrowup' ? -d : key === 'arrowdown' ? d : 0;
                    const list = s.objects[s.selected.pageId] || [];
                    dispatch({ type: 'UPDATE_OBJECTS', updates: list.filter((o) => multi.includes(o.id) && !o.locked).map((o) => ({ id: o.id, changes: moveBy(o, dx, dy) })) });
                    return;
                }
            }
            const sel = !multi && s.selected && findObject(s.objects, s.selected.id);
            if (sel) {
                if (key === 'delete' || key === 'backspace') { e.preventDefault(); dispatch({ type: 'REMOVE_OBJECT', id: sel.obj.id }); return; }
                if (mod && key === 'd') {
                    e.preventDefault();
                    dispatch({ type: 'ADD_OBJECT', pageId: sel.pageId, obj: offsetCopy(sel.obj, 12) });
                    return;
                }
                if (mod && key === 'c') { copyObjects([sel.obj]); return; }
                if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
                    e.preventDefault();
                    const d = e.shiftKey ? 10 : 1;
                    const dx = key === 'arrowleft' ? -d : key === 'arrowright' ? d : 0;
                    const dy = key === 'arrowup' ? -d : key === 'arrowdown' ? d : 0;
                    dispatch({ type: 'UPDATE_OBJECT', id: sel.obj.id, changes: moveBy(sel.obj, dx, dy) });
                    return;
                }
            }
            if (key === 'escape') {
                if (s.selected || s.editing) dispatch({ type: 'SET', values: { selected: null, editing: null } });
                else if (s.tool !== 'select') dispatch({ type: 'SET_TOOL', tool: 'select' });
                return;
            }
            if (!mod && !e.altKey && TOOL_BY_KEY[key]) {
                dispatch({ type: 'SET_TOOL', tool: TOOL_BY_KEY[key] });
                return;
            }
            if (key === '?') dispatch({ type: 'SET', values: { dialog: 'shortcuts' } });
        };
        // Yapıştır: panoda görsel varsa (tarayıcıdan/klasörden kopyalanan logo) sayfaya eklenir, yoksa kopyalanan nesneler
        const onPaste = (e) => {
            const s = ed.get();
            const el = document.activeElement;
            if (s.dialog || s.busy || (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))) return;
            const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
            if (files.length) { e.preventDefault(); addImages(ed, files); return; }
            if (clipboard) { e.preventDefault(); pasteObjects(ed, clipboard, 16); clipboard = clipboard.map((o) => ({ ...o, ...moveBy(o, 16, 16) })); }
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('paste', onPaste);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); };
    }, [ed, dispatch]);

    // Görsel dosyasını pencereye sürükleyip bırakmak: sayfaya eklenir
    const [drop, setDrop] = useState(false);
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

    return (
        <div className="h-full flex flex-col bg-bg relative"
            onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setDrop(true); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrop(false); }}
            onDrop={(e) => {
                if (!hasFiles(e)) return;
                e.preventDefault(); setDrop(false);
                const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
                if (files.length) addImages(ed, files);
                else toast(t('Sayfaya yalnızca görsel (PNG, JPG, SVG) bırakılabilir'), 'info', 3500);
            }}>
            {drop && (
                <div className="absolute inset-0 z-50 pointer-events-none bg-accent/10 border-4 border-dashed border-accent rounded-xl flex items-center justify-center">
                    <span className="px-4 py-2 rounded-xl bg-surface shadow-lg text-sm font-semibold">{t('Bırakın, sayfaya eklensin')}</span>
                </div>
            )}
            <TopBar pagesOpen={pagesOpen} onTogglePages={() => setPagesOpen((o) => !o)} />
            <div className="flex-1 min-h-0 flex">
                <ToolRail />
                {pagesOpen && <PagesPanel />}
                <Canvas />
                <Inspector />
            </div>
            {state.busy && <BusyOverlay busy={state.busy} />}
            <GeneralTour />
            <Dialogs />
        </div>
    );
}

function offsetCopy(o, d) {
    return { ...o, ...moveBy(o, d, d), id: newId('ob') };
}

function copyObjects(list) {
    clipboard = list.map((o) => ({ ...o }));
    // sistem panosunda eski bir görsel kalmışsa yapıştırınca o gelmesin
    navigator.clipboard?.writeText?.(' ').catch(() => {});
}

/** Nesneleri kaydırarak kopyalar; gruplar kopyada da grup kalır (yeni grup kimliğiyle), kopyalar seçili olur */
function pasteObjects(ed, list, d) {
    const s = ed.get();
    const pageId = s.doc.pages[s.page].id;
    const gids = new Map();
    const objs = list.map((o) => {
        const q = offsetCopy(o, d);
        if (o.groupId) { if (!gids.has(o.groupId)) gids.set(o.groupId, newId('gp')); q.groupId = gids.get(o.groupId); }
        return q;
    });
    ed.dispatch({ type: 'COMMIT', bytes: s.doc.bytes, objects: { ...s.objects, [pageId]: [...(s.objects[pageId] || []), ...objs] } });
    ed.dispatch({ type: 'SET_TOOL', tool: 'select' });
    ed.dispatch({ type: 'SET', values: { selected: { pageId, id: objs[objs.length - 1].id, ids: objs.length > 1 ? objs.map((o) => o.id) : undefined } } });
}

/** Görsel dosyalarını sayfaya ekler: her biri afişin boş, sakin bir yerine; en uzun kenarı sayfanın ~%30'u */
async function addImages(ed, files) {
    const s = ed.get();
    const page = s.doc.pages[s.page];
    const objs = [];
    for (const f of files) {
        try {
            const img = await readImageFile(f);
            const k = Math.min(1, (Math.min(page.width, page.height) * 0.3) / Math.max(img.w, img.h));
            const w = img.w * k, h = img.h * k;
            // afişin en sakin yerine (detayı az, başka öğeyle çakışmayan) yerleşir
            const at = await smartSpot(s, w, h, objs);
            objs.push({ id: newId('ob'), type: 'image', x: at.x, y: at.y, w, h, src: img.src, opacity: 1, name: f.name ? f.name.replace(/\.[^.]+$/, '') : t('Görsel') });
        } catch { toast(`${f.name || t('Görsel')}: ${t('açılamadı')}`, 'error'); }
    }
    if (!objs.length) return;
    const cur = ed.get();
    ed.dispatch({ type: 'COMMIT', bytes: cur.doc.bytes, objects: { ...cur.objects, [page.id]: [...(cur.objects[page.id] || []), ...objs] } });
    ed.dispatch({ type: 'SET_TOOL', tool: 'select' });
    ed.dispatch({ type: 'SET', values: { selected: { pageId: page.id, id: objs[objs.length - 1].id, ids: objs.length > 1 ? objs.map((o) => o.id) : undefined } } });
    toast(objs.length > 1 ? `${objs.length} ${t('görsel eklendi')}` : t('Görsel eklendi'), 'success', 2500);
}
