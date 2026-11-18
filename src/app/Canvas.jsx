import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useEditor } from '../store/editor';
import PageView from './PageView';
import Rulers from './Rulers';

const GAP = 24;
const PAD = 32;

export default function Canvas() {
    const { state, dispatch, get } = useEditor();
    const scrollRef = useRef(null);
    const pageRefs = useRef([]);
    const prevZoom = useRef(state.zoom);
    const anchor = useRef(null); // { x, y } kaydırma alanına göre yakınlaştırma odağı
    const { doc, zoom } = state;

    const fit = useCallback((mode = 'width') => {
        const el = scrollRef.current;
        const s = get();
        if (!el || !s.doc || el.clientWidth < 80) return;
        const maxW = Math.max(...s.doc.pages.map((p) => p.width));
        const p0 = s.doc.pages[s.page] || s.doc.pages[0];
        const zw = (el.clientWidth - PAD * 2) / maxW;
        const zh = (el.clientHeight - PAD * 2) / p0.height;
        let z = mode === 'page' ? Math.min(zw, zh) : zw;
        if (mode === 'width') z = Math.min(z, s.doc.kind === 'image' ? Math.min(zw, zh) : 1.6);
        anchor.current = null;
        dispatch({ type: 'SET', values: { zoom: Math.max(0.2, Math.min(5, z)) } });
    }, [dispatch, get]);

    // Yeni belge açılınca genişliğe sığdır
    useLayoutEffect(() => {
        fit(doc?.kind === 'image' ? 'page' : 'width');
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.loadId]);

    useEffect(() => {
        const onFit = (e) => fit(e.detail);
        const onGoto = (e) => {
            const { index, y } = typeof e.detail === 'number' ? { index: e.detail } : e.detail;
            const el = pageRefs.current[index];
            const sc = scrollRef.current;
            if (!el || !sc) return;
            const top = y === undefined ? el.offsetTop - PAD / 2 : el.offsetTop + y * get().zoom - sc.clientHeight / 3;
            sc.scrollTo({ top, behavior: 'smooth' });
        };
        window.addEventListener('paperwell:fit', onFit);
        window.addEventListener('paperwell:goto', onGoto);
        return () => {
            window.removeEventListener('paperwell:fit', onFit);
            window.removeEventListener('paperwell:goto', onGoto);
        };
    }, [fit]);

    // Yakınlaştırmada odak noktasını sabit tut
    useLayoutEffect(() => {
        const el = scrollRef.current;
        const k = zoom / prevZoom.current;
        prevZoom.current = zoom;
        if (!el || k === 1) return;
        const ax = anchor.current?.x ?? el.clientWidth / 2;
        const ay = anchor.current?.y ?? el.clientHeight / 2;
        el.scrollLeft = (el.scrollLeft + ax) * k - ax;
        el.scrollTop = (el.scrollTop + ay - PAD) * k + PAD - ay;
        anchor.current = null;
    }, [zoom]);

    // Ctrl + tekerlek / dokunmatik yüzey kıstırma ile yakınlaştırma
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const r = el.getBoundingClientRect();
            anchor.current = { x: e.clientX - r.left, y: e.clientY - r.top };
            const factor = Math.exp(-e.deltaY * (Math.abs(e.deltaY) < 20 ? 0.01 : 0.0025));
            const z = Math.max(0.2, Math.min(5, get().zoom * factor));
            dispatch({ type: 'SET', values: { zoom: z } });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [dispatch, get]);

    // Görünür sayfayı takip et
    const onScroll = () => {
        const el = scrollRef.current;
        const mid = el.scrollTop + el.clientHeight * 0.35;
        let current = 0;
        pageRefs.current.forEach((p, i) => { if (p && p.offsetTop <= mid) current = i; });
        if (current !== get().page) dispatch({ type: 'SET', values: { page: current } });
    };

    if (!doc) return null;

    return (
        <div className="flex-1 min-w-0 min-h-0 relative flex">
            <div
                ref={scrollRef}
                onScroll={onScroll}
                className="flex-1 min-w-0 overflow-auto scroll-thin bg-canvas relative"
                style={{ overscrollBehavior: 'contain' }}
            >
                <div className="min-w-full w-max flex flex-col items-center" style={{ padding: PAD, gap: GAP }}>
                    {doc.pages.map((page, i) => (
                        <div key={page.id} ref={(el) => (pageRefs.current[i] = el)} className="relative">
                            <PageView page={page} index={i} zoom={zoom} scrollRoot={scrollRef} />
                            <div className="absolute -bottom-5 left-0 right-0 text-center text-[11px] text-fg-3 tabular-nums select-none">{i + 1}</div>
                        </div>
                    ))}
                </div>
            </div>
            {state.rulers && <Rulers scrollRef={scrollRef} pageRefs={pageRefs} zoom={zoom} page={doc.pages[Math.min(state.page, doc.pages.length - 1)]} pageIndex={Math.min(state.page, doc.pages.length - 1)} />}
        </div>
    );
}
