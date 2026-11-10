import { useState, useEffect } from 'react';
import { Trash2, RotateCw, RotateCcw, Check, Undo2, Loader2, GripVertical } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const makeInitialPages = (count) => Array.from({ length: count }, (_, i) => ({
    id: `page-${i + 1}`,
    pageIndex: i + 1, // 1-based (görsel için)
    originalIndex: i, // 0-based (işlem için)
    rotation: 0,
}));

/**
 * PageOrganizer - Sayfaları sürükleyerek sırala, döndür, sil
 */
export default function PageOrganizer({ pdfSource, onPagesUpdate }) {
    const [pages, setPages] = useState([]);
    const [initialCount, setInitialCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [thumbnails, setThumbnails] = useState({});
    const [processing, setProcessing] = useState(false);
    const [dragId, setDragId] = useState(null);

    useEffect(() => {
        if (!pdfSource) return;
        let cancelled = false;
        let pdf = null;

        const loadPdf = async () => {
            try {
                setLoading(true);
                // Kopya veriyoruz: pdf.js buffer'ı worker'a aktarıp orijinali boşaltıyor
                pdf = await pdfjsLib.getDocument({ data: pdfSource.slice() }).promise;
                if (cancelled) return;

                setPages(makeInitialPages(pdf.numPages));
                setInitialCount(pdf.numPages);
                setThumbnails({});
                setLoading(false);

                // Küçük resimleri tek tek üret, hazır oldukça göster
                for (let i = 1; i <= pdf.numPages; i++) {
                    if (cancelled) return;
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 0.35 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                    if (cancelled) return;
                    const url = canvas.toDataURL('image/jpeg', 0.8);
                    setThumbnails(prev => ({ ...prev, [`page-${i}`]: url }));
                }
            } catch (err) {
                if (cancelled) return; // bileşenden çıkıldı, render iptal edildi
                console.error("Thumbnail oluşturma hatası:", err);
                setLoading(false);
            }
        };

        loadPdf();
        return () => {
            cancelled = true;
            pdf?.destroy();
        };
    }, [pdfSource]);

    const handleDelete = (id) => setPages(prev => prev.filter(p => p.id !== id));

    const handleRotate = (id, delta) => {
        setPages(prev => prev.map(p => p.id === id ? { ...p, rotation: (p.rotation + delta + 360) % 360 } : p));
    };

    const movePage = (fromId, toId) => {
        if (!fromId || fromId === toId) return;
        setPages(prev => {
            const from = prev.findIndex(p => p.id === fromId);
            const to = prev.findIndex(p => p.id === toId);
            if (from < 0 || to < 0) return prev;
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

    const isDirty = pages.length !== initialCount
        || pages.some((p, i) => p.originalIndex !== i || p.rotation !== 0);

    const handleSave = async () => {
        if (pages.length === 0) return;
        setProcessing(true);
        try {
            await onPagesUpdate(pages);
        } finally {
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-purple-300 gap-3">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Sayfalar yükleniyor...</span>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="px-5 py-3 border-b border-white/10 flex justify-between items-center bg-gray-900/50 backdrop-blur-sm">
                <div>
                    <h3 className="text-base font-semibold text-gray-100">Sayfa Düzeni</h3>
                    <p className="text-xs text-gray-400">
                        {pages.length} sayfa · Sıralamak için sürükleyin
                        {pages.length !== initialCount && <span className="text-red-300"> · {initialCount - pages.length} sayfa silinecek</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPages(makeInitialPages(initialCount))}
                        disabled={!isDirty || processing}
                        className="px-3 py-2 text-gray-300 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <Undo2 className="w-4 h-4" /> Sıfırla
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={processing || !isDirty || pages.length === 0}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-white/10 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        title={pages.length === 0 ? 'En az bir sayfa kalmalı' : undefined}
                    >
                        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Uygula
                    </button>
                </div>
            </div>

            {/* Grid Area */}
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                {pages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                        <p>Tüm sayfalar silindi. Belgede en az bir sayfa kalmalı.</p>
                        <button onClick={() => setPages(makeInitialPages(initialCount))} className="text-purple-300 hover:text-purple-200 text-sm">Sayfaları geri getir</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                        {pages.map((page, idx) => (
                            <div
                                key={page.id}
                                draggable
                                onDragStart={(e) => {
                                    setDragId(page.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    movePage(dragId, page.id);
                                }}
                                onDragEnd={() => setDragId(null)}
                                onDrop={(e) => e.preventDefault()}
                                className={`group relative rounded-xl border bg-gray-800/60 p-2 transition-all cursor-grab active:cursor-grabbing select-none ${dragId === page.id
                                    ? 'opacity-40 border-purple-500/60 scale-[0.97]'
                                    : 'border-white/5 hover:border-purple-500/40 hover:bg-gray-800'}`}
                            >
                                <div className="aspect-[3/4] flex items-center justify-center overflow-hidden rounded-lg bg-gray-900/50">
                                    {thumbnails[page.id] ? (
                                        <img
                                            src={thumbnails[page.id]}
                                            alt={`Sayfa ${page.pageIndex}`}
                                            draggable={false}
                                            className="max-w-full max-h-full object-contain shadow-md bg-white transition-transform duration-300"
                                            style={{ transform: `rotate(${page.rotation}deg)${page.rotation % 180 ? ' scale(0.75)' : ''}` }}
                                        />
                                    ) : (
                                        <div className="animate-pulse w-3/4 h-5/6 bg-gray-700/50 rounded" />
                                    )}
                                </div>

                                <div className="flex items-center justify-between mt-2 px-0.5">
                                    <span className="flex items-center gap-1 text-xs text-gray-300">
                                        <GripVertical className="w-3.5 h-3.5 text-gray-600" />
                                        <span className="font-semibold tabular-nums">{idx + 1}</span>
                                        {page.originalIndex !== idx && <span className="text-gray-500">(eski {page.pageIndex})</span>}
                                        {page.rotation > 0 && <span className="text-[10px] text-blue-300 bg-blue-500/15 px-1.5 py-0.5 rounded">{page.rotation}°</span>}
                                    </span>
                                    <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleRotate(page.id, -90)} className="p-1.5 text-gray-300 hover:text-blue-300 hover:bg-white/10 rounded-md" title="Sola döndür">
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleRotate(page.id, 90)} className="p-1.5 text-gray-300 hover:text-blue-300 hover:bg-white/10 rounded-md" title="Sağa döndür">
                                            <RotateCw className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDelete(page.id)} className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-500/10 rounded-md" title="Sayfayı sil">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
