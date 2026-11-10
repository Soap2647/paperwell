import { useState } from 'react';
import { toast } from './Toaster';
import { Download, AlertCircle, Minimize2, Settings, Zap } from 'lucide-react';
import GlassCard from './GlassCard';
import NeonButton from './NeonButton';
import { compressPdf } from '../utils/pdfAnnotationExporter';

export default function CompressTool({ pdfData, fileName = 'belge.pdf' }) {
    const [quality, setQuality] = useState('medium'); // 'low' | 'medium' | 'high'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleCompress = async () => {
        if (!pdfData) return;
        setLoading(true);
        setError(null);

        try {
            const compressedData = await compressPdf(pdfData, quality);

            const blob = new Blob([compressedData], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName.replace(/\.pdf$/i, '') + '_sikistirilmis.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            const before = pdfData.byteLength / 1024 / 1024;
            const after = compressedData.byteLength / 1024 / 1024;
            if (after < before) {
                toast(`${before.toFixed(2)} MB → ${after.toFixed(2)} MB (%${Math.round((1 - after / before) * 100)} küçüldü)`, 'success', 6000);
            } else {
                toast(`Dosya küçülmedi (${after.toFixed(2)} MB). Bu PDF zaten optimize olabilir; daha düşük kalite deneyin.`, 'info', 6000);
            }
        } catch (err) {
            console.error(err);
            setError(err.message || "Sıkıştırma sırasında hata oluştu.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center mb-6">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Minimize2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-100">PDF Sıkıştır</h3>
                <p className="text-sm text-gray-400 mt-2">Dosya boyutunu düşürmek için sayfaları yeniden oluşturun.</p>
            </div>

            {error && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-3 rounded-lg flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <p>{error}</p>
                </div>
            )}

            <GlassCard className="p-4 space-y-4">
                <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-3 block">
                        Sıkıştırma Seviyesi
                    </label>
                    <div className="space-y-2">
                        <button
                            onClick={() => setQuality('low')}
                            className={`w-full p-4 rounded-xl border text-left transition-all ${
                                quality === 'low' ? 'bg-emerald-500/20 border-emerald-500' : 'bg-white/5 border-white/5 hover:bg-white/10'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <Zap className={`w-5 h-5 ${quality === 'low' ? 'text-emerald-400' : 'text-gray-400'}`} />
                                <div>
                                    <p className={`font-semibold ${quality === 'low' ? 'text-emerald-300' : 'text-gray-200'}`}>Maksimum Sıkıştırma</p>
                                    <p className="text-xs text-gray-500 mt-1">Düşük kalite, en küçük dosya boyutu</p>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => setQuality('medium')}
                            className={`w-full p-4 rounded-xl border text-left transition-all ${
                                quality === 'medium' ? 'bg-emerald-500/20 border-emerald-500' : 'bg-white/5 border-white/5 hover:bg-white/10'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <Settings className={`w-5 h-5 ${quality === 'medium' ? 'text-emerald-400' : 'text-gray-400'}`} />
                                <div>
                                    <p className={`font-semibold ${quality === 'medium' ? 'text-emerald-300' : 'text-gray-200'}`}>Önerilen Sıkıştırma</p>
                                    <p className="text-xs text-gray-500 mt-1">İyi kalite ve optimize edilmiş boyut</p>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => setQuality('high')}
                            className={`w-full p-4 rounded-xl border text-left transition-all ${
                                quality === 'high' ? 'bg-emerald-500/20 border-emerald-500' : 'bg-white/5 border-white/5 hover:bg-white/10'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <FileImage className={`w-5 h-5 ${quality === 'high' ? 'text-emerald-400' : 'text-gray-400'}`} />
                                <div>
                                    <p className={`font-semibold ${quality === 'high' ? 'text-emerald-300' : 'text-gray-200'}`}>Düşük Sıkıştırma</p>
                                    <p className="text-xs text-gray-500 mt-1">Yüksek kalite, daha büyük dosya boyutu</p>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>

                <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 mt-4">
                    <p className="text-xs text-emerald-300">
                        <span className="font-semibold text-emerald-200">Not:</span> Sıkıştırma işlemi sayfaları görsele çevirerek yapılır. Orijinal metinler kopyalanmaz hale gelebilir. Uzun belgelerde işlem süresi artabilir.
                    </p>
                </div>
            </GlassCard>

            <NeonButton
                onClick={handleCompress}
                disabled={loading || !pdfData}
                loading={loading}
                icon={<Download className="w-5 h-5" />}
                className="w-full py-4 text-lg !bg-emerald-500 hover:!bg-emerald-600 shadow-emerald-500/20"
            >
                Sıkıştır ve İndir
            </NeonButton>
        </div>
    );
}

// Inline fallback for icon
const FileImage = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <circle cx="10" cy="13" r="2"/>
      <path d="m20 17-1.09-1.09a2 2 0 0 0-2.82 0L10 22"/>
    </svg>
);
