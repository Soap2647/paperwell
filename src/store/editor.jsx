// Uygulama durumu: belge (PDF baytları + sayfa bilgisi), katman nesneleri, tek birleşik geri alma geçmişi.
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useReducer, useRef } from 'react';

const MAX_HISTORY = 60;

const load = (key, fallback) => {
    try {
        const v = localStorage.getItem(key);
        return v ? { ...fallback, ...JSON.parse(v) } : fallback;
    } catch { return fallback; }
};

export const DEFAULT_OPTS = {
    draw: { mode: 'pen', color: '#1d4ed8', width: 3, opacity: 1 },
    highlight: { kind: 'highlight', color: '#fde047' },
    shape: { kind: 'rect', stroke: '#e11d48', fill: '', width: 2, opacity: 1 },
    text: { family: 'sans', size: 14, color: '#111827', bold: false, italic: false, align: 'left' },
    erase: { size: 28, mode: 'fast' },
    grab: { fill: 'ai' },
    redact: { fill: 'black' },
    note: { color: '#facc15' },
};

const initialState = {
    doc: null, // { name, kind: 'pdf'|'image', bytes, pages: [{id,width,height,rotate}], imageSize? }
    objects: {}, // pageId → nesneler
    past: [],
    future: [],
    dirty: false,
    tool: 'select',
    opts: load('paperwell.opts', DEFAULT_OPTS),
    selected: null, // { pageId, id }
    editing: null, // { kind:'text', pageId, id } | { kind:'line', pageIndex, lineId } | { kind:'image', pageIndex, imageId }
    zoom: 1,
    page: 0,
    busy: null, // { label, progress? }
    dialog: null,
    bgTarget: null, // arka plan kaldırma hedefi: görsel nesne kimliği (yoksa görsel belgenin sayfası)
    redactions: {}, // pageId → [{x,y,w,h}]
    forms: { values: {}, flatten: false }, // form alanı değerleri (ad → değer)
    search: null, // { query, results: [], index }
    pendingImage: null, // yerleştirilecek görsel/imza dataURL
    grab: null, // Nesne aracı: { pageIndex, points: [{x,y,positive}], mask }
    loadId: 0,
};

const snapshot = (s) => ({ doc: s.doc, objects: s.objects });

function pushPast(s) {
    return [...s.past, snapshot(s)].slice(-MAX_HISTORY);
}

function findObject(objects, id) {
    for (const [pageId, list] of Object.entries(objects)) {
        const o = list.find((x) => x.id === id);
        if (o) return { pageId, obj: o };
    }
    return null;
}

function reducer(s, a) {
    switch (a.type) {
        case 'LOAD':
            return { ...initialState, opts: s.opts, doc: a.doc, objects: a.objects || {}, zoom: s.zoom, tool: 'select', loadId: Date.now() };
        case 'CLOSE':
            return { ...initialState, opts: s.opts };
        case 'COMMIT': {
            // Belge baytları (ve gerekirse sayfa listesi / nesneler) değişti
            const doc = { ...s.doc, ...a.docChanges, bytes: a.bytes, pages: a.pages || s.doc.pages };
            return {
                ...s,
                past: pushPast(s),
                future: [],
                doc,
                objects: a.objects || s.objects,
                dirty: true,
                editing: null,
                selected: a.keepSelection ? s.selected : null,
                redactions: a.redactions || s.redactions,
                grab: null,
                page: Math.min(s.page, doc.pages.length - 1),
            };
        }
        case 'ADD_OBJECT': {
            const list = s.objects[a.pageId] || [];
            return {
                ...s,
                past: pushPast(s),
                future: [],
                objects: { ...s.objects, [a.pageId]: [...list, a.obj] },
                selected: a.select === false ? s.selected : { pageId: a.pageId, id: a.obj.id },
                dirty: true,
            };
        }
        case 'UPDATE_OBJECT': {
            const f = findObject(s.objects, a.id);
            if (!f) return s;
            const list = s.objects[f.pageId].map((o) => (o.id === a.id ? { ...o, ...a.changes } : o));
            const objects = { ...s.objects, [f.pageId]: list };
            if (a.transient) return { ...s, objects };
            return { ...s, objects, past: pushPast(s), future: [], dirty: true };
        }
        case 'REMOVE_OBJECT': {
            const f = findObject(s.objects, a.id);
            if (!f) return s;
            return {
                ...s,
                past: pushPast(s),
                future: [],
                objects: { ...s.objects, [f.pageId]: s.objects[f.pageId].filter((o) => o.id !== a.id) },
                selected: s.selected?.id === a.id ? null : s.selected,
                editing: s.editing?.id === a.id ? null : s.editing,
                dirty: true,
            };
        }
        case 'REORDER_OBJECT': {
            const f = findObject(s.objects, a.id);
            if (!f) return s;
            const list = [...s.objects[f.pageId]];
            const i = list.findIndex((o) => o.id === a.id);
            const j = Math.max(0, Math.min(list.length - 1, i + a.delta));
            const [o] = list.splice(i, 1);
            list.splice(j, 0, o);
            return { ...s, past: pushPast(s), future: [], objects: { ...s.objects, [f.pageId]: list }, dirty: true };
        }
        case 'CHECKPOINT':
            return { ...s, past: pushPast(s), future: [], dirty: true };
        case 'UNDO': {
            if (!s.past.length) return s;
            const prev = s.past[s.past.length - 1];
            return {
                ...s,
                ...prev,
                past: s.past.slice(0, -1),
                future: [snapshot(s), ...s.future].slice(0, MAX_HISTORY),
                selected: null,
                editing: null,
                grab: null,
                dirty: true,
                page: Math.min(s.page, prev.doc.pages.length - 1),
            };
        }
        case 'REDO': {
            if (!s.future.length) return s;
            const next = s.future[0];
            return {
                ...s,
                ...next,
                past: pushPast(s),
                future: s.future.slice(1),
                selected: null,
                editing: null,
                grab: null,
                dirty: true,
                page: Math.min(s.page, next.doc.pages.length - 1),
            };
        }
        case 'SET':
            return { ...s, ...a.values };
        case 'SET_TOOL':
            return { ...s, tool: a.tool, selected: null, editing: null, grab: null, pendingImage: a.pendingImage ?? null };
        case 'SET_OPTS': {
            const opts = { ...s.opts, [a.tool]: { ...s.opts[a.tool], ...a.changes } };
            try { localStorage.setItem('paperwell.opts', JSON.stringify(opts)); } catch { /* yoksay */ }
            return { ...s, opts };
        }
        case 'SET_FORM':
            return { ...s, forms: { ...s.forms, values: { ...s.forms.values, [a.name]: a.value } }, dirty: true };
        case 'SET_FORM_FLATTEN':
            return { ...s, forms: { ...s.forms, flatten: a.flatten } };
        case 'SET_REDACTIONS':
            return { ...s, redactions: { ...s.redactions, [a.pageId]: a.rects } };
        case 'SAVED':
            return { ...s, dirty: false };
        default:
            return s;
    }
}

const Ctx = createContext(null);

export function EditorProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const ref = useRef(state);
    ref.current = state;
    const api = useMemo(() => ({ dispatch, get: () => ref.current }), []);
    return <Ctx.Provider value={{ state, ...api }}>{children}</Ctx.Provider>;
}

/** @returns {{state: typeof initialState, dispatch: Function, get: () => typeof initialState}} */
export function useEditor() {
    return useContext(Ctx);
}

export { findObject };
