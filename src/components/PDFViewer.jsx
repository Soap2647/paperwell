import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ZoomIn,
    ZoomOut,
    ChevronLeft,
    ChevronRight,
    PanelLeft,
    MoveHorizontal,
    Loader2
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import SelectionOverlay from './SelectionOverlay';
import ContentOverlay from './ContentOverlay';
import AnnotationOverlay from './AnnotationOverlay';
import ShapeOverlay from './ShapeOverlay';
import { extractPageContent } from '../utils/pdfContentExtractor';

// PDF.js worker setup - yerel dosya kullan
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

/**
 * detectBackgroundColor - Samples borders of a coordinate region to detect dominant background color
 * coords CSS piksel cinsindendir; canvas HiDPI olabileceği için ölçeklenir.
 */
const detectBackgroundColor = (canvas, coords) => {
    if (!canvas || !coords) return '#ffffff';
    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const ratio = canvas.width / (canvas.clientWidth || canvas.width);
        const x = coords.x * ratio;
        const y = coords.y * ratio;
        const width = coords.width * ratio;
        const height = coords.height * ratio;

        const offset = 2 * ratio; // Offset inward
        const samples = [];

        const addSample = (px, py) => {
            if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
                const imgData = ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data;
                if (imgData[3] !== 0) {
                    samples.push({ r: imgData[0], g: imgData[1], b: imgData[2] });
                }
            }
        };

        const steps = 8;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            addSample(x + offset + t * (width - 2 * offset), y + offset);
            addSample(x + offset + t * (width - 2 * offset), y + height - offset);
            addSample(x + offset, y + offset + t * (height - 2 * offset));
            addSample(x + width - offset, y + offset + t * (height - 2 * offset));
        }

        if (samples.length === 0) return '#ffffff';

        const colorCounts = {};
        let maxCount = 0;
        let dominantColor = { r: 255, g: 255, b: 255 };

        samples.forEach(({ r, g, b }) => {
            const key = `${Math.round(r / 8)},${Math.round(g / 8)},${Math.round(b / 8)}`;
            colorCounts[key] = (colorCounts[key] || 0) + 1;
            if (colorCounts[key] > maxCount) {
                maxCount = colorCounts[key];
                dominantColor = { r, g, b };
            }
        });

        const toHex = (c) => c.toString(16).padStart(2, '0');
        return `#${toHex(dominantColor.r)}${toHex(dominantColor.g)}${toHex(dominantColor.b)}`;
    } catch (e) {
        console.error("Error detecting background color:", e);
        return '#ffffff';
    }
};

/**
 * ThumbnailCard - Displays mini rendered canvas of a page for sidebar navigation
 */
function ThumbnailCard({ pageNum, pdfDoc, isActive, onClick }) {
    const canvasRef = useRef(null);
    const cardRef = useRef(null);

    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return;

        let active = true;
        let renderTask = null;

        const renderThumbnail = async () => {
            try {
                const page = await pdfDoc.getPage(pageNum);
                if (!active || !canvasRef.current) return;

                const canvas = canvasRef.current;
                const viewport = page.getViewport({ scale: 0.25 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
                await renderTask.promise;
            } catch (err) {
                if (err?.name !== 'RenderingCancelledException') {
                    console.error(`Thumbnail rendering error for page ${pageNum}:`, err);
                }
            }
        };

        renderThumbnail();

        return () => {
            active = false;
            renderTask?.cancel();
        };
    }, [pdfDoc, pageNum]);

    // Aktif sayfa küçük resmini görünür alana kaydır
    useEffect(() => {
        if (isActive) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [isActive]);

    return (
        <button
            ref={cardRef}
            onClick={onClick}
            className={`flex flex-col items-center gap-1.5 p-2 rounded-xl cursor-pointer transition-all border shrink-0 w-full ${isActive
                ? 'bg-purple-500/15 border-purple-500/70'
                : 'bg-white/[0.03] border-transparent hover:bg-white/[0.07]'
                }`}
        >
            <div className="relative rounded-md overflow-hidden bg-white shadow-md">
                <canvas ref={canvasRef} className="w-[104px] h-auto block" />
            </div>
            <span className={`text-[11px] font-medium tabular-nums ${isActive ? 'text-purple-200' : 'text-gray-500'}`}>{pageNum}</span>
        </button>
    );
}

/**
 * PDFViewer - PDF görüntüleme bileşeni (seçim desteği ile)
 */
export default function PDFViewer({
    pdfSource,
    currentPage = 1,
    onPageSelect,
    onPdfLoaded,
    showControls = true,
    selectionEnabled = false,
    onSelectionChange,
    selection,
    // İçerik algılama
    contentDetectionMode = null, // 'text' | 'image' | null
    onContentClick,
    selectedContentId,
    // Annotasyon Props
    annotationMode = false,
    tool = 'pen',
    toolColor = '#000000',
    toolWidth = 2,
    annotations = [],
    onAddAnnotation,
    onRemoveAnnotation,
    // Şekil Props
    shapeMode = false,
    shapes = [],
    onUpdateShape,
    onRemoveShape,
    onBeginShapeChange,
}) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const renderTaskRef = useRef(null);
    const [showThumbnails, setShowThumbnails] = useState(true);
    const [pdfDoc, setPdfDoc] = useState(null);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.25);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
    const [pageHeight, setPageHeight] = useState(0);
    const [pageInput, setPageInput] = useState(String(currentPage));

    // İçerik algılama state'leri
    const [textBlocks, setTextBlocks] = useState([]);
    const [images, setImages] = useState([]);
    const [contentLoading, setContentLoading] = useState(false);

    // Callback ref'leri (efekt bağımlılıklarına girmesinler)
    const onPdfLoadedRef = useRef(onPdfLoaded);
    onPdfLoadedRef.current = onPdfLoaded;
    const onPageSelectRef = useRef(onPageSelect);
    onPageSelectRef.current = onPageSelect;
    const currentPageRef = useRef(currentPage);
    currentPageRef.current = currentPage;

    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    // Load PDF
    useEffect(() => {
        if (!pdfSource) return;

        let cancelled = false;
        let loadedPdf = null;

        const loadPdf = async () => {
            setLoading(true);
            setError(null);

            try {
                let source;
                if (pdfSource instanceof File) {
                    source = await pdfSource.arrayBuffer();
                } else if (pdfSource instanceof Uint8Array) {
                    source = pdfSource.slice().buffer;
                } else {
                    source = pdfSource;
                }

                const pdf = await pdfjsLib.getDocument({ data: source }).promise;
                loadedPdf = pdf;

                if (cancelled) {
                    pdf.destroy();
                    return;
                }

                setPdfDoc(pdf);
                setTotalPages(pdf.numPages);

                // Düzenleme sonrası yeniden yüklemede bulunduğumuz sayfada kal
                const keepPage = Math.min(Math.max(1, currentPageRef.current), pdf.numPages);
                if (keepPage !== currentPageRef.current) onPageSelectRef.current?.(keepPage);

                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 1 });
                setPageHeight(viewport.height);

                onPdfLoadedRef.current?.({ numPages: pdf.numPages, pdf, pageHeight: viewport.height, pageWidth: viewport.width });
            } catch (err) {
                if (cancelled) return;
                console.error('PDF yükleme hatası:', err);
                setError(err?.name === 'PasswordException'
                    ? 'Bu PDF şifre korumalı. Şifreli dosyalar henüz desteklenmiyor.'
                    : 'PDF dosyası yüklenirken bir hata oluştu. Dosya bozuk olabilir.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadPdf();

        return () => {
            cancelled = true;
            // Önceki belgeyi bellekten temizle (yeni sürüm yüklendikten sonra)
            setTimeout(() => loadedPdf?.destroy(), 0);
        };
    }, [pdfSource]);

    // Render page
    const renderPage = useCallback(async () => {
        if (!pdfDoc || !canvasRef.current) return;

        try {
            renderTaskRef.current?.cancel();

            const page = await pdfDoc.getPage(Math.min(currentPage, pdfDoc.numPages));
            const canvas = canvasRef.current;
            if (!canvas) return;
            const context = canvas.getContext('2d');

            // HiDPI ekranlarda net görüntü için cihaz piksel oranında çiz
            const dpr = window.devicePixelRatio || 1;
            const viewport = page.getViewport({ scale });
            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;

            setPageHeight(page.getViewport({ scale: 1 }).height);
            setCanvasDimensions({ width: viewport.width, height: viewport.height });

            const renderTask = page.render({
                canvasContext: context,
                viewport,
                transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
            });
            renderTaskRef.current = renderTask;

            await renderTask.promise;
            renderTaskRef.current = null;
        } catch (err) {
            if (err?.name !== 'RenderingCancelledException') {
                console.error('Sayfa render hatası:', err);
            }
        }
    }, [pdfDoc, currentPage, scale]);

    useEffect(() => {
        renderPage();
    }, [renderPage]);

    // Sayfa değişince görüntüyü başa kaydır
    useEffect(() => {
        containerRef.current?.scrollTo({ top: 0 });
    }, [currentPage]);

    // İçerik çıkarma - sayfa değiştiğinde veya contentDetectionMode aktifken
    useEffect(() => {
        if (!pdfSource || !contentDetectionMode || loading) return;

        let cancelled = false;

        const extractContent = async () => {
            setContentLoading(true);
            try {
                const content = await extractPageContent(pdfSource, currentPage, scale);
                if (cancelled) return;
                setTextBlocks(content.textBlocks);
                setImages(content.images);
            } catch (err) {
                console.error('İçerik çıkarma hatası:', err);
            } finally {
                if (!cancelled) setContentLoading(false);
            }
        };

        extractContent();

        return () => { cancelled = true; };
    }, [pdfSource, currentPage, scale, contentDetectionMode, loading]);

    // İçerik tıklama handler'ları
    const handleTextClick = useCallback((block) => {
        const detectedBgColor = detectBackgroundColor(canvasRef.current, block);
        onContentClick?.({ type: 'text', ...block, pageNum: currentPage, scale, pageHeight, detectedBgColor });
    }, [onContentClick, currentPage, scale, pageHeight]);

    const handleImageClick = useCallback((image) => {
        const detectedBgColor = detectBackgroundColor(canvasRef.current, image);
        onContentClick?.({ type: 'image', ...image, pageNum: currentPage, scale, pageHeight, detectedBgColor });
    }, [onContentClick, currentPage, scale, pageHeight]);

    const goToPage = useCallback((pageNum) => {
        if (pageNum >= 1 && pageNum <= totalPages) {
            onPageSelect?.(pageNum);
            onSelectionChange?.(null); // Sayfa değişince seçimi temizle
        }
    }, [totalPages, onPageSelect, onSelectionChange]);

    const zoomIn = () => setScale(s => Math.min(Math.round((s + 0.25) * 100) / 100, MAX_SCALE));
    const zoomOut = () => setScale(s => Math.max(Math.round((s - 0.25) * 100) / 100, MIN_SCALE));

    const fitWidth = async () => {
        if (!pdfDoc || !containerRef.current) return;
        const page = await pdfDoc.getPage(currentPage);
        const available = containerRef.current.clientWidth - 48;
        const next = available / page.getViewport({ scale: 1 }).width;
        setScale(Math.min(Math.max(next, MIN_SCALE), MAX_SCALE));
    };

    // Ctrl + tekerlek ile yakınlaştırma
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setScale(s => {
                const next = s * (e.deltaY < 0 ? 1.1 : 1 / 1.1);
                return Math.min(Math.max(Math.round(next * 100) / 100, MIN_SCALE), MAX_SCALE);
            });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [pdfDoc]);

    // Klavye ile sayfa gezintisi
    useEffect(() => {
        const onKey = (e) => {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey) return;
            if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !e.shiftKey)) {
                e.preventDefault();
                goToPage(currentPage + 1);
            } else if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !e.shiftKey)) {
                e.preventDefault();
                goToPage(currentPage - 1);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [currentPage, goToPage]);

    const commitPageInput = () => {
        const n = parseInt(pageInput, 10);
        if (n >= 1 && n <= totalPages) goToPage(n);
        else setPageInput(String(currentPage));
    };

    const handleSelectionComplete = (sel) => {
        if (sel) {
            const detectedBgColor = detectBackgroundColor(canvasRef.current, sel.canvasCoords);
            onSelectionChange?.({ ...sel, pageNum: currentPage, scale, pageHeight, detectedBgColor });
        } else {
            onSelectionChange?.(null);
        }
    };

    if (error) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="glass-card p-8 text-center max-w-md">
                    <p className="text-red-400 font-medium">{error}</p>
                </div>
            </div>
        );
    }

    // Çizimler (path/highlight) — şekiller ayrı SVG katmanında gösterilir
    const drawnAnnotations = annotations.filter(a => a.type !== 'shape');

    return (
        <div className="flex flex-col h-full">
            {/* Controls */}
            {showControls && pdfDoc && (
                <div className="h-12 shrink-0 px-2 flex items-center justify-between border-b border-white/5 bg-gray-950/30">
                    <div className="flex items-center gap-1">
                        <ControlButton
                            onClick={() => setShowThumbnails(prev => !prev)}
                            active={showThumbnails}
                            title="Sayfa küçük resimleri"
                        >
                            <PanelLeft className="w-4 h-4" />
                        </ControlButton>

                        <div className="w-px h-5 bg-white/10 mx-1" />

                        <ControlButton onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} title="Önceki sayfa (←)">
                            <ChevronLeft className="w-4 h-4" />
                        </ControlButton>

                        <div className="flex items-center gap-1.5 px-1">
                            <input
                                type="text"
                                inputMode="numeric"
                                value={pageInput}
                                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
                                onBlur={commitPageInput}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                className="w-10 bg-white/5 border border-white/10 focus:border-purple-500/60 outline-none rounded-md px-1 py-1 text-center text-sm text-gray-100 tabular-nums"
                                aria-label="Sayfa numarası"
                            />
                            <span className="text-gray-500 text-sm tabular-nums">/ {totalPages}</span>
                        </div>

                        <ControlButton onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} title="Sonraki sayfa (→)">
                            <ChevronRight className="w-4 h-4" />
                        </ControlButton>
                    </div>

                    <div className="flex items-center gap-1">
                        <ControlButton onClick={zoomOut} disabled={scale <= MIN_SCALE} title="Uzaklaştır">
                            <ZoomOut className="w-4 h-4" />
                        </ControlButton>
                        <button
                            onClick={() => setScale(1)}
                            className="text-sm text-gray-400 hover:text-gray-200 w-14 text-center tabular-nums"
                            title="%100'e sıfırla (Ctrl + tekerlek ile yakınlaştırabilirsiniz)"
                        >
                            {Math.round(scale * 100)}%
                        </button>
                        <ControlButton onClick={zoomIn} disabled={scale >= MAX_SCALE} title="Yakınlaştır">
                            <ZoomIn className="w-4 h-4" />
                        </ControlButton>
                        <ControlButton onClick={fitWidth} title="Genişliğe sığdır">
                            <MoveHorizontal className="w-4 h-4" />
                        </ControlButton>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Collapsible Left Thumbnail Panel */}
                <AnimatePresence initial={false}>
                    {showThumbnails && pdfDoc && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 136, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-r border-white/5 bg-gray-950/20 min-h-0 overflow-y-auto overflow-x-hidden shrink-0 custom-scrollbar"
                        >
                            <div className="flex flex-col gap-2 p-2 pb-28">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                                    <ThumbnailCard
                                        key={pageNum}
                                        pageNum={pageNum}
                                        pdfDoc={pdfDoc}
                                        isActive={currentPage === pageNum}
                                        onClick={() => goToPage(pageNum)}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Canvas Container — sayfa büyükse kaydırılabilir, küçükse ortalanır */}
                <div className="flex-1 relative min-w-0">
                <div ref={containerRef} className="absolute inset-0 overflow-auto custom-scrollbar">
                    {loading && !pdfDoc && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                            <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
                            <p className="text-gray-400">PDF yükleniyor...</p>
                        </div>
                    )}

                    <div className="min-h-full min-w-full w-max flex p-6 pb-32">
                        <div
                            className="relative m-auto shadow-2xl shadow-black/50 rounded-sm bg-white"
                            style={{ display: pdfDoc ? 'block' : 'none', width: canvasDimensions.width || undefined }}
                        >
                            <canvas ref={canvasRef} className="block rounded-sm" />

                            {/* Çizimler: her zaman görünür, sadece İşaretle modunda düzenlenebilir */}
                            {pdfDoc && (annotationMode || drawnAnnotations.length > 0) && (
                                <AnnotationOverlay
                                    width={canvasDimensions.width}
                                    height={canvasDimensions.height}
                                    scale={scale}
                                    tool={tool}
                                    color={toolColor}
                                    lineWidth={toolWidth}
                                    annotations={drawnAnnotations}
                                    onAddAnnotation={onAddAnnotation}
                                    onRemoveAnnotation={onRemoveAnnotation}
                                    interactive={annotationMode}
                                />
                            )}

                            {/* Şekiller / imzalar: her zaman görünür, sadece Şekiller modunda düzenlenebilir */}
                            {pdfDoc && (shapeMode || shapes.length > 0) && (
                                <ShapeOverlay
                                    width={canvasDimensions.width}
                                    height={canvasDimensions.height}
                                    scale={scale}
                                    shapes={shapes}
                                    interactive={shapeMode}
                                    onUpdateShape={onUpdateShape}
                                    onRemoveShape={onRemoveShape}
                                    onBeginChange={onBeginShapeChange}
                                />
                            )}

                            {/* Serbest bölge seçimi (sürükleyerek) */}
                            {pdfDoc && selectionEnabled && (
                                <SelectionOverlay
                                    enabled
                                    canvasWidth={canvasDimensions.width}
                                    canvasHeight={canvasDimensions.height}
                                    scale={scale}
                                    onSelectionComplete={handleSelectionComplete}
                                    selection={selectedContentId || !selection?.canvasCoords ? null : scaleRect(selection.canvasCoords, scale / (selection.scale || scale))}
                                />
                            )}

                            {/* Algılanan metin/görsel blokları (tıklayarak seçim) */}
                            {pdfDoc && contentDetectionMode && !contentLoading && (
                                <ContentOverlay
                                    textBlocks={textBlocks}
                                    images={images}
                                    showTextOverlay={contentDetectionMode === 'text'}
                                    showImageOverlay={contentDetectionMode === 'image'}
                                    onTextClick={handleTextClick}
                                    onImageClick={handleImageClick}
                                    selectedId={selectedContentId}
                                    canvasWidth={canvasDimensions.width}
                                    canvasHeight={canvasDimensions.height}
                                />
                            )}
                        </div>
                    </div>

                </div>

                    {/* Durum göstergeleri */}
                    <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none z-30">
                        <AnimatePresence>
                            {pdfDoc && (contentLoading || loading) && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className="flex items-center gap-2 bg-gray-900/90 border border-white/10 px-3 py-1.5 rounded-full text-xs text-gray-300 shadow-lg"
                                >
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                                    {loading ? 'Güncelleniyor...' : 'İçerik analiz ediliyor...'}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Seçim farklı bir yakınlaştırmada yapıldıysa güncel ölçeğe çevir
function scaleRect(rect, factor) {
    return { x: rect.x * factor, y: rect.y * factor, width: rect.width * factor, height: rect.height * factor };
}

function ControlButton({ children, onClick, disabled, active, title }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-label={title}
            className={`p-2 rounded-lg transition-colors ${disabled
                ? 'text-gray-600 cursor-not-allowed'
                : active
                    ? 'text-purple-300 bg-purple-500/15'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
        >
            {children}
        </button>
    );
}
