import { useEffect, useState } from 'react';
import { useEditor, findObject } from '../store/editor';
import { download } from '../store/actions';
import { newId } from '../core/pageOps';
import { TOOL_BY_KEY } from './tools';
import { moveBy } from './objects';
import TopBar from './TopBar';
import ToolRail from './ToolRail';
import PagesPanel from './PagesPanel';
import Canvas from './Canvas';
import Inspector from './Inspector';
import BusyOverlay from './BusyOverlay';
import Dialogs from './dialogs/Dialogs';

let clipboard = null;

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

            if (mod && key === 's') { e.preventDefault(); download(ed); return; }
            if (mod && key === 'f') { e.preventDefault(); dispatch({ type: 'SET', values: { search: s.search || { query: '', results: [], index: 0 } } }); return; }
            if (typing) return;

            if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }); return; }
            if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); dispatch({ type: 'REDO' }); return; }
            if (mod && (key === '=' || key === '+')) { e.preventDefault(); dispatch({ type: 'SET', values: { zoom: Math.min(5, s.zoom * 1.2) } }); return; }
            if (mod && key === '-') { e.preventDefault(); dispatch({ type: 'SET', values: { zoom: Math.max(0.2, s.zoom / 1.2) } }); return; }
            if (mod && key === '0') { e.preventDefault(); window.dispatchEvent(new CustomEvent('paperwell:fit', { detail: 'width' })); return; }

            const sel = s.selected && findObject(s.objects, s.selected.id);
            if (sel) {
                if (key === 'delete' || key === 'backspace') { e.preventDefault(); dispatch({ type: 'REMOVE_OBJECT', id: sel.obj.id }); return; }
                if (mod && key === 'd') {
                    e.preventDefault();
                    dispatch({ type: 'ADD_OBJECT', pageId: sel.pageId, obj: offsetCopy(sel.obj, 12) });
                    return;
                }
                if (mod && key === 'c') { clipboard = { ...sel.obj }; return; }
                if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
                    e.preventDefault();
                    const d = e.shiftKey ? 10 : 1;
                    const dx = key === 'arrowleft' ? -d : key === 'arrowright' ? d : 0;
                    const dy = key === 'arrowup' ? -d : key === 'arrowdown' ? d : 0;
                    dispatch({ type: 'UPDATE_OBJECT', id: sel.obj.id, changes: moveBy(sel.obj, dx, dy) });
                    return;
                }
            }
            if (mod && key === 'v' && clipboard) {
                const page = s.doc.pages[s.page];
                dispatch({ type: 'ADD_OBJECT', pageId: page.id, obj: offsetCopy(clipboard, 16) });
                clipboard = offsetCopy(clipboard, 16);
                return;
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
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [ed, dispatch]);

    return (
        <div className="h-full flex flex-col bg-bg">
            <TopBar pagesOpen={pagesOpen} onTogglePages={() => setPagesOpen((o) => !o)} />
            <div className="flex-1 min-h-0 flex">
                <ToolRail />
                {pagesOpen && <PagesPanel />}
                <Canvas />
                <Inspector />
            </div>
            {state.busy && <BusyOverlay busy={state.busy} />}
            <Dialogs />
        </div>
    );
}

function offsetCopy(o, d) {
    return { ...o, ...moveBy(o, d, d), id: newId('ob') };
}
