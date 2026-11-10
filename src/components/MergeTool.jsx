import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, ArrowUp, ArrowDown, AlertCircle, FilePlus, Merge, FileText } from 'lucide-react';
import GlassCard from './GlassCard';
import NeonButton from './NeonButton';
import { mergePdfs } from '../utils/pdfAnnotationExporter'; // assuming mergePdfs is exported from there or similar utility

export default function MergeTool({ currentPdf, currentName }) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleFileChange = async (e) => {
        const addedFiles = Array.from(e.target.files);
        const newItems = await Promise.all(addedFiles.map(async (f) => {
            const buf = await f.arrayBuffer();
            return {
                id: Math.random().toString(36).slice(2, 11),
                file: f,
                data: new Uint8Array(buf),
                name: f.name,
                size: (f.size / 1024 / 1024).toFixed(2) + ' MB'
            };
        }));

        setFiles(prev => [...prev, ...newItems]);
        e.target.value = null; // reset input
    };

    const addCurrent = () => {
        if (!currentPdf || files.some(f => f.id === 'current')) return;
        setFiles(prev => [{
            id: 'current',
            data: currentPdf,
            name: `${currentName || 'Açık belge'} (açık belge)`,
            size: (currentPdf.byteLength / 1024 / 1024).toFixed(2) + ' MB',
        }, ...prev]);
    };

    const removeFile = (id) => {
        setFiles(prev => prev.filter(f => f.id !== id));
    };

    const moveFile = (index, dir) => {
        const newFiles = [...files];
        if (dir === 'up' && index > 0) {
            [newFiles[index - 1], newFiles[index]] = [newFiles[index], newFiles[index - 1]];
        } else if (dir === 'down' && index < newFiles.length - 1) {
            [newFiles[index + 1], newFiles[index]] = [newFiles[index], newFiles[index + 1]];
        }
        setFiles(newFiles);
    };

    const handleMerge = async () => {
        if (files.length < 2) {
            setError('Birleştirmek için en az 2 dosya seçmelisiniz.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const pdfDataArray = files.map(f => f.data);
            const mergedPdfData = await mergePdfs(pdfDataArray);
            
            // Download
            const blob = new Blob([mergedPdfData], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'nebula_merged.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            // Clear
            setFiles([]);
        } catch (err) {
            console.error(err);
            setError('Dosyalar birleştirilirken bir hata oluştu. Dosyalardan biri şifreli veya bozuk olabilir.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-3xl space-y-6">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Merge className="w-8 h-8 text-purple-400" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-100 mb-2">PDF Birleştir</h2>
                    <p className="text-gray-400">Birden fazla PDF dosyasını istediğiniz sırayla ve güvenle tek bir dosyada birleştirin.</p>
                </div>

                {error && (
                    <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-4 rounded-xl flex items-center gap-3">
                        <AlertCircle className="w-5 h-5" />
                        <p>{error}</p>
                    </div>
                )}

                <GlassCard className="p-8">
                    {files.length === 0 ? (
                        <div className="border-2 border-dashed border-purple-500/30 hover:border-purple-500/60 rounded-2xl p-12 transition-colors text-center relative">
                            <input
                                type="file"
                                multiple
                                accept=".pdf"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <FilePlus className="w-12 h-12 text-purple-400 opacity-50 mx-auto mb-4" />
                            <p className="text-lg font-medium text-gray-200 mb-2">PDF Dosyalarını Seçin veya Sürükleyin</p>
                            <p className="text-sm text-gray-500">Birden fazla dosya seçebilirsiniz</p>
                            <NeonButton className="mt-6 pointer-events-none px-8">Dosya Seç</NeonButton>
                        </div>
                    ) : null}
                    {files.length === 0 && currentPdf && (
                        <button onClick={addCurrent} className="mt-4 w-full text-sm text-purple-300 hover:text-purple-200 flex items-center justify-center gap-2 py-2 rounded-lg hover:bg-purple-500/10 transition-colors">
                            <FileText className="w-4 h-4" /> Açık belgeyle başla
                        </button>
                    )}
                    {files.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-semibold text-gray-200">Seçili Dosyalar ({files.length})</h3>
                                <div className="flex items-center gap-2">
                                {currentPdf && !files.some(f => f.id === 'current') && (
                                    <button onClick={addCurrent} className="text-sm text-gray-300 hover:text-white flex items-center gap-1 font-medium bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 transition-colors">
                                        <FileText className="w-4 h-4" /> Açık belgeyi ekle
                                    </button>
                                )}
                                <div className="relative">
                                    <input
                                        type="file"
                                        multiple
                                        accept=".pdf"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <button className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20 transition-colors">
                                        <FilePlus className="w-4 h-4" /> Daha Fazla Ekle
                                    </button>
                                </div>
                                </div>
                            </div>
                            
                            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                                <AnimatePresence>
                                    {files.map((file, idx) => (
                                        <motion.div
                                            key={file.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            className="bg-gray-800/80 border border-white/5 rounded-xl p-3 flex items-center gap-4"
                                        >
                                            <div className="flex flex-col gap-1">
                                                <button onClick={() => moveFile(idx, 'up')} disabled={idx === 0} className="p-1 hover:bg-white/10 rounded text-gray-400 disabled:opacity-30 disabled:hover:bg-transparent">
                                                    <ArrowUp className="w-3 h-3" />
                                                </button>
                                                <button onClick={() => moveFile(idx, 'down')} disabled={idx === files.length - 1} className="p-1 hover:bg-white/10 rounded text-gray-400 disabled:opacity-30 disabled:hover:bg-transparent">
                                                    <ArrowDown className="w-3 h-3" />
                                                </button>
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-200 truncate">{file.name}</p>
                                                <p className="text-xs text-gray-500">{file.size}</p>
                                            </div>

                                            <button onClick={() => removeFile(file.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>

                            <div className="pt-6 mt-6 border-t border-white/10">
                                <NeonButton
                                    onClick={handleMerge}
                                    disabled={files.length < 2 || loading}
                                    loading={loading}
                                    icon={<Merge className="w-5 h-5" />}
                                    className="w-full py-4 text-lg"
                                >
                                    PDF'leri Birleştir
                                </NeonButton>
                            </div>
                        </div>
                    )}
                </GlassCard>
            </div>
        </div>
    );
}
