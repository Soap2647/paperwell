import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, AlertCircle, FileOutput, Scissors } from 'lucide-react';
import GlassCard from './GlassCard';
import NeonButton from './NeonButton';
import JSZip from 'jszip';
import { splitPdf } from '../utils/pdfAnnotationExporter';

export default function SplitTool({ pdfData, pdfInfo }) {
    const [rangesInput, setRangesInput] = useState('1'); // e.g. "1-3, 5, 7-10"
    const [mode, setMode] = useState('ranges'); // 'ranges' | 'extract_all'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const parseRanges = (input, maxPages) => {
        const ranges = [];
        const parts = input.split(',').map(p => p.trim()).filter(Boolean);
        
        for (const part of parts) {
            if (part.includes('-')) {
                const [startStr, endStr] = part.split('-');
                const start = parseInt(startStr);
                const end = parseInt(endStr);
                if (isNaN(start) || isNaN(end) || start < 1 || end > maxPages || start > end) {
                    throw new Error(`Geçersiz aralık: ${part}`);
                }
                ranges.push({ start, end });
            } else {
                const page = parseInt(part);
                if (isNaN(page) || page < 1 || page > maxPages) {
                    throw new Error(`Geçersiz sayfa: ${part}`);
                }
                ranges.push({ start: page, end: page });
            }
        }
        
        if (ranges.length === 0) throw new Error("Lütfen en az bir aralık girin.");
        return ranges;
    };

    const handleSplit = async () => {
        if (!pdfData || !pdfInfo) return;
        setLoading(true);
        setError(null);

        try {
            let ranges = [];
            if (mode === 'extract_all') {
                for (let i = 1; i <= pdfInfo.numPages; i++) {
                    ranges.push({ start: i, end: i });
                }
            } else {
                ranges = parseRanges(rangesInput, pdfInfo.numPages);
            }

            const splitPdfs = await splitPdf(pdfData, ranges);

            if (splitPdfs.length === 1) {
                // Tek dosya indir
                const blob = new Blob([splitPdfs[0]], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                let nameSuffix = mode === 'extract_all' ? '_sayfa_1' : `_bolum_1`;
                link.href = url;
                link.download = `split${nameSuffix}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } else {
                // ZIP olarak indir
                const zip = new JSZip();
                splitPdfs.forEach((pdfBytes, index) => {
                    let r = ranges[index];
                    let filename = `sayfa_${r.start}`;
                    if (r.start !== r.end) filename += `_ila_${r.end}`;
                    filename += '.pdf';
                    zip.file(filename, pdfBytes);
                });

                const content = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(content);
                const link = document.createElement('a');
                link.href = url;
                link.download = `bolunmus_dosyalar.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }

        } catch (err) {
            console.error(err);
            setError(err.message || "Bölme işlemi sırasında hata oluştu.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Scissors className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-100">PDF Böl</h3>
                <p className="text-sm text-gray-400 mt-2">Sayfaları ayırın veya belirli aralıkları çıkarın.</p>
            </div>

            {error && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-3 rounded-lg flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <p>{error}</p>
                </div>
            )}

            <GlassCard className="p-1 flex gap-1 bg-gray-900/50">
                <button
                    onClick={() => setMode('ranges')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        mode === 'ranges' ? 'bg-blue-500/30 text-blue-300' : 'text-gray-400 hover:bg-white/5'
                    }`}
                >
                    <FileOutput className="w-4 h-4" /> Özel Aralık
                </button>
                <button
                    onClick={() => setMode('extract_all')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        mode === 'extract_all' ? 'bg-blue-500/30 text-blue-300' : 'text-gray-400 hover:bg-white/5'
                    }`}
                >
                    <Scissors className="w-4 h-4" /> Tüm Sayfaları Çıkar
                </button>
            </GlassCard>

            {mode === 'ranges' && (
                <GlassCard className="p-4 space-y-4">
                    <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">
                            Sayfa Aralıkları
                        </label>
                        <input
                            type="text"
                            value={rangesInput}
                            onChange={(e) => setRangesInput(e.target.value)}
                            placeholder="Örn: 1-3, 5, 8-10"
                            className="w-full bg-white/5 border border-blue-500/30 rounded-lg p-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            Aralıkları virgül ile ayırın. Toplam <strong>{pdfInfo?.numPages || 0}</strong> sayfa mevcut.
                        </p>
                    </div>
                </GlassCard>
            )}

            {mode === 'extract_all' && (
                <GlassCard className="p-4 text-center">
                    <p className="text-sm text-gray-300">
                        PDF dosyanızdaki tüm sayfalar (toplam {pdfInfo?.numPages || 0}) ayrı ayrı PDF dosyalarına dönüştürülecek ve ZIP olarak indirilecektir.
                    </p>
                </GlassCard>
            )}

            <NeonButton
                onClick={handleSplit}
                disabled={loading || !pdfData}
                loading={loading}
                icon={<Download className="w-5 h-5" />}
                className="w-full py-4 text-lg !bg-blue-500 hover:!bg-blue-600 shadow-blue-500/20"
            >
                {mode === 'extract_all' ? 'Tüm Sayfaları Böl' : 'Aralıkları Çıkar'}
            </NeonButton>
        </div>
    );
}
