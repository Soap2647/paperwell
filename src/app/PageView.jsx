import { useEffect, useRef, useState, memo } from 'react';
import { useEditor } from '../store/editor';
import { getPdfjsDoc } from '../core/render';
import { pageCanvases } from './pageRegistry';
import ObjectLayer from './layers/ObjectLayer';
import EditLayer from './layers/EditLayer';
import DrawLayer from './layers/DrawLayer';
import HighlightLayer from './layers/HighlightLayer';
import ShapeLayer from './layers/ShapeLayer';
import PlaceLayer from './layers/PlaceLayer';
import EraseLayer from './layers/EraseLayer';
import GrabLayer from './layers/GrabLayer';
import FixLayer from './layers/FixLayer';
import RedactLayer from './layers/RedactLayer';
import SearchLayer from './layers/SearchLayer';
import FormLayer from './layers/FormLayer';
import GuideLayer from './layers/GuideLayer';

function PageView({ page, index, zoom, scrollRoot }) {
    const { state } = useEditor();
    const { tool, doc } = state;
    // önce/sonra: basılı tutulurken sayfanın açılıştaki hali gösterilir (nesneler gizlenir)
    const origIndex = state.compare && state.original ? state.original.pages.findIndex((p) => p.id === page.id) : -1;
    const orig = origIndex >= 0 ? state.original.pages[origIndex] : null;
    const bytes = orig ? state.original.bytes : doc.bytes;
    const pageNo = orig ? origIndex + 1 : index + 1;
    const holderRef = useRef(null);
    const canvasRef = useRef(null);
    const [visible, setVisible] = useState(index < 3);
    const [rendered, setRendered] = useState(false);
    const renderedKey = useRef('');

    // Görünür alana yakın mı?
    useEffect(() => {
        const el = holderRef.current;
        if (!el) return;
        const io = new IntersectionObserver(([en]) => setVisible(en.isIntersecting), { root: scrollRoot.current, rootMargin: '900px 0px' });
        io.observe(el);
        return () => io.disconnect();
    }, [scrollRoot]);

    // Sayfayı çiz: hızlı yakınlaştırmada eski bitmap CSS ile ölçeklenir, kısa gecikmeyle net hali çizilir
    useEffect(() => {
        if (!visible) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const scale = zoom * dpr;
        const key = `${zoom}|${dpr}`;
        let cancelled = false;
        let task = null;
        const timer = setTimeout(async () => {
            try {
                const pdf = await getPdfjsDoc(bytes);
                if (cancelled) return;
                const p = await pdf.getPage(pageNo);
                // eski hal başka boyuttaysa (ör. boyut değişti) bugünkü sayfanın içine sığdırılıp ortalanır
                const vp0 = p.getViewport({ scale: 1 });
                const fit = orig ? Math.min(page.width / vp0.width, page.height / vp0.height) : 1;
                const viewport = p.getViewport({ scale: scale * fit });
                const off = document.createElement('canvas');
                off.width = Math.round(orig ? page.width * scale : viewport.width);
                off.height = Math.round(orig ? page.height * scale : viewport.height);
                const ctx = off.getContext('2d');
                ctx.fillStyle = orig ? '#e5e7eb' : '#fff';
                ctx.fillRect(0, 0, off.width, off.height);
                if (orig) ctx.translate((off.width - viewport.width) / 2, (off.height - viewport.height) / 2);
                // ENABLE_FORMS: form alanlarının görünümü çizilmez, yerlerine FormLayer girişleri gelir
                task = p.render({ canvasContext: ctx, viewport, annotationMode: 2 });
                await task.promise;
                if (cancelled || !canvasRef.current) return;
                const c = canvasRef.current;
                c.width = off.width;
                c.height = off.height;
                c.getContext('2d').drawImage(off, 0, 0);
                renderedKey.current = key;
                if (!orig) pageCanvases.set(index, { canvas: c, scale });
                setRendered(true);
            } catch (e) {
                if (e?.name !== 'RenderingCancelledException') console.error('Render hatası', e);
            }
        }, renderedKey.current ? 90 : 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            task?.cancel();
        };
    }, [bytes, pageNo, index, zoom, visible, orig, page.width, page.height]);

    useEffect(() => () => pageCanvases.delete(index), [index]);

    const w = page.width * zoom;
    const h = page.height * zoom;
    const layerProps = { page, index, zoom };

    return (
        <div
            ref={holderRef}
            className="relative bg-white"
            style={{ width: w, height: h, boxShadow: 'var(--page-shadow)' }}
            data-page-index={index}
        >
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: rendered ? 1 : 0 }} />
            {!rendered && <div className="absolute inset-0 skeleton opacity-60" />}

            {/* Katmanlar: sayfa birimlerinde, zoom ile ölçeklenir */}
            <div className="absolute top-0 left-0" style={{ width: page.width, height: page.height, transform: `scale(${zoom})`, transformOrigin: '0 0', visibility: state.compare ? 'hidden' : undefined }}>
                {state.search?.results?.length > 0 && <SearchLayer {...layerProps} />}
                {(tool === 'redact' || state.redactions[page.id]?.length > 0) && <RedactLayer {...layerProps} interactive={tool === 'redact'} />}
                <ObjectLayer {...layerProps} interactive={tool === 'select'} />
                <FormLayer {...layerProps} interactive={tool === 'select'} />
                <GuideLayer {...layerProps} interactive={state.rulers && tool === 'select'} />
                {tool === 'edit' && visible && <EditLayer {...layerProps} />}
                {tool === 'draw' && <DrawLayer {...layerProps} />}
                {tool === 'highlight' && <HighlightLayer {...layerProps} />}
                {tool === 'shape' && <ShapeLayer {...layerProps} />}
                {['text', 'image', 'sign', 'note'].includes(tool) && <PlaceLayer {...layerProps} />}
                {tool === 'erase' && <EraseLayer {...layerProps} />}
                {tool === 'grab' && <GrabLayer {...layerProps} />}
                {tool === 'fix' && <FixLayer {...layerProps} />}
            </div>
        </div>
    );
}

export default memo(PageView);
