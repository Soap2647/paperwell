import { useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, Loader2, Replace } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { replaceText } from '../utils/pdfTextEditor';
import { toast } from './Toaster';

/**
 * Searches across all pages using PDF.js; replaces found text via pdf-lib.
 * (Eşleşen metin parçasının tamamı değiştirilir.)
 */
export default function FindReplaceTool({ pdfData, onPdfUpdate, onPageSelect }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [replaceTerm, setReplaceTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isReplacing, setIsReplacing] = useState(false);
    const [results, setResults] = useState([]); // { pageNum, text, pdfCoords, fontSize }
    const [activeIndex, setActiveIndex] = useState(-1);

    const handleSearch = useCallback(async () => {
        if (!searchTerm.trim() || !pdfData) return;

        setIsSearching(true);
        setResults([]);
        setActiveIndex(-1);

        try {
            const pdfDoc = await pdfjsLib.getDocument({ data: pdfData.slice() }).promise;
            const newResults = [];
            const needle = searchTerm.toLocaleLowerCase('tr');

            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);
                const textContent = await page.getTextContent();

                textContent.items.forEach((item) => {
                    if (!item.str || !item.str.toLocaleLowerCase('tr').includes(needle)) return;
                    const fontSize = Math.hypot(item.transform[0], item.transform[1]) || 12;
                    newResults.push({
                        pageNum,
                        text: item.str,
                        fontSize,
                        pdfCoords: {
                            x: item.transform[4],
                            y: item.transform[5] - fontSize * 0.2,
                            width: item.width,
                            height: fontSize * 1.2,
                            baselineY: item.transform[5],
                        },
                    });
                });
            }
            pdfDoc.destroy();

            setResults(newResults);
            if (newResults.length > 0) {
                setActiveIndex(0);
                onPageSelect?.(newResults[0].pageNum);
                // Bulunan satırı yeni metin alanına öner
                setReplaceTerm(newResults[0].text);
            } else {
                toast('Sonuç bulunamadı', 'info');
            }
        } catch (error) {
            console.error(error);
            toast('Arama sırasında hata oluştu', 'error');
        } finally {
            setIsSearching(false);
        }
    }, [searchTerm, pdfData, onPageSelect]);

    const focusResult = (index) => {
        setActiveIndex(index);
        onPageSelect?.(results[index].pageNum);
        setReplaceTerm(results[index].text);
    };

    const handleReplaceCurrent = async () => {
        if (activeIndex < 0 || activeIndex >= results.length || !pdfData) return;

        const current = results[activeIndex];
        setIsReplacing(true);

        try {
            const newPdfData = await replaceText(pdfData, current.pageNum, current.pdfCoords, replaceTerm, {
                fontSize: current.fontSize,
            });

            onPdfUpdate?.(newPdfData);
            toast('Metin değiştirildi', 'success');

            const remaining = results.filter((_, i) => i !== activeIndex);
            setResults(remaining);
            if (remaining.length > 0) {
                const nextIndex = Math.min(activeIndex, remaining.length - 1);
                setActiveIndex(nextIndex);
                onPageSelect?.(remaining[nextIndex].pageNum);
                setReplaceTerm(remaining[nextIndex].text);
            } else {
                setActiveIndex(-1);
            }
        } catch (error) {
            console.error(error);
            toast('Değiştirme sırasında hata oluştu', 'error');
        } finally {
            setIsReplacing(false);
        }
    };

    const step = (dir) => {
        if (results.length === 0) return;
        focusResult((activeIndex + dir + results.length) % results.length);
    };

    const current = results[activeIndex];

    return (
        <div className="flex items-center gap-2 w-full flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
                <Search className="w-4 h-4 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Tüm sayfalarda ara..."
                    autoFocus
                    className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:border-purple-500/70 focus:outline-none"
                />
            </div>
            <button
                onClick={handleSearch}
                disabled={isSearching || !searchTerm.trim()}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm text-gray-100 disabled:opacity-40 flex items-center gap-1.5"
            >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Ara
            </button>

            {current && (
                <>
                    <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                        <button onClick={() => step(-1)} className="p-1 rounded hover:bg-white/10" title="Önceki"><ChevronLeft className="w-4 h-4" /></button>
                        <span className="tabular-nums" title={`Sayfa ${current.pageNum}`}>{activeIndex + 1}/{results.length} · s.{current.pageNum}</span>
                        <button onClick={() => step(1)} className="p-1 rounded hover:bg-white/10" title="Sonraki"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                    <input
                        type="text"
                        value={replaceTerm}
                        onChange={(e) => setReplaceTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleReplaceCurrent()}
                        placeholder="Yeni metin"
                        className="flex-1 min-w-[160px] px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-100 focus:border-purple-500/70 focus:outline-none"
                        title="Eşleşen satırın yerine yazılacak metin"
                    />
                    <button
                        onClick={handleReplaceCurrent}
                        disabled={isReplacing}
                        className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-sm font-medium text-white disabled:opacity-50 flex items-center gap-1.5"
                    >
                        {isReplacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Replace className="w-4 h-4" />}
                        Değiştir
                    </button>
                </>
            )}
        </div>
    );
}
