import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PenTool, Type, Upload, Check, Trash2 } from 'lucide-react';
import GlassCard from './GlassCard';
import NeonButton from './NeonButton';

export default function SignatureTool({ onAddSignature }) {
    const [mode, setMode] = useState('draw'); // 'draw' | 'type' | 'upload'
    const [signatureImage, setSignatureImage] = useState(null); // base64 data url
    
    // Draw mode
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    
    // Type mode
    const [textSign, setTextSign] = useState('');
    const [font, setFont] = useState('Brush Script MT');

    // Init drawing canvas
    useEffect(() => {
        if (mode === 'draw' && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000000'; // Siyah imza
        }
    }, [mode]);

    const startDrawing = (e) => {
        setIsDrawing(true);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        ctx.beginPath();
        ctx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        ctx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        saveCanvasAsSignature();
    };

    const startDrawingTouch = (e) => {
        if (e.touches.length !== 1) return;
        e.preventDefault(); // Prevent scrolling
        setIsDrawing(true);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        ctx.beginPath();
        ctx.moveTo((touch.clientX - rect.left) * scaleX, (touch.clientY - rect.top) * scaleY);
    };

    const drawTouch = (e) => {
        if (!isDrawing || e.touches.length !== 1) return;
        e.preventDefault(); // Prevent scrolling
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        ctx.lineTo((touch.clientX - rect.left) * scaleX, (touch.clientY - rect.top) * scaleY);
        ctx.stroke();
    };

    const stopDrawingTouch = (e) => {
        e.preventDefault();
        stopDrawing();
    };

    const saveCanvasAsSignature = () => {
        const canvas = canvasRef.current;
        setSignatureImage(canvas.toDataURL('image/png'));
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setSignatureImage(null);
    };

    // Type mode helper
    useEffect(() => {
        if (mode === 'type' && textSign.trim()) {
            const canvas = document.createElement('canvas');
            canvas.width = 450;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            ctx.font = `italic 56px "${font}", cursive`;
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(textSign, 225, 90);
            setSignatureImage(canvas.toDataURL('image/png'));
        } else if (mode === 'type') {
            setSignatureImage(null);
        }
    }, [mode, textSign, font]);

    // Upload Mode
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => setSignatureImage(ev.target.result);
            reader.readAsDataURL(file);
        }
    };

    const handleAdd = () => {
        if (signatureImage && onAddSignature) {
            onAddSignature(signatureImage);
        }
    };

    return (
        <div className="space-y-4 p-2">
            <GlassCard className="p-1 flex gap-1">
                <button
                    onClick={() => { setMode('draw'); setSignatureImage(null); }}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                        mode === 'draw' ? 'bg-purple-500/25 text-purple-200 border border-purple-500/30' : 'text-gray-400 hover:bg-white/5 border border-transparent'
                    }`}
                >
                    <PenTool className="w-3.5 h-3.5" /> Çiz
                </button>
                <button
                    onClick={() => { setMode('type'); setSignatureImage(null); }}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                        mode === 'type' ? 'bg-purple-500/25 text-purple-200 border border-purple-500/30' : 'text-gray-400 hover:bg-white/5 border border-transparent'
                    }`}
                >
                    <Type className="w-3.5 h-3.5" /> Yaz
                </button>
                <button
                    onClick={() => { setMode('upload'); setSignatureImage(null); }}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                        mode === 'upload' ? 'bg-purple-500/25 text-purple-200 border border-purple-500/30' : 'text-gray-400 hover:bg-white/5 border border-transparent'
                    }`}
                >
                    <Upload className="w-3.5 h-3.5" /> Yükle
                </button>
            </GlassCard>

            <GlassCard className="p-4 border border-white/5">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 font-bold">İmza Alanı</p>
                
                {mode === 'draw' && (
                    <div className="space-y-3">
                        <div className="bg-white rounded-xl overflow-hidden border border-purple-500/25 shadow-inner">
                            <canvas
                                ref={canvasRef}
                                width={450}
                                height={180}
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                                onTouchStart={startDrawingTouch}
                                onTouchMove={drawTouch}
                                onTouchEnd={stopDrawingTouch}
                                className="cursor-crosshair w-full block bg-white"
                            />
                        </div>
                        <button onClick={clearCanvas} className="text-xs text-red-400 flex items-center gap-1 hover:text-red-300 transition-colors font-medium">
                            <Trash2 className="w-3.5 h-3.5"/> Çizimi Temizle
                        </button>
                    </div>
                )}

                {mode === 'type' && (
                    <div className="space-y-4">
                        <input
                            type="text"
                            value={textSign}
                            onChange={(e) => setTextSign(e.target.value)}
                            placeholder="İsminizi buraya yazın..."
                            className="w-full bg-white/5 border border-purple-500/30 rounded-xl p-3 text-sm text-gray-100 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder-gray-500"
                        />
                        <div className="flex gap-2">
                            {['Brush Script MT', 'Palatino', 'Garamond', 'Georgia'].map((fontFamily) => (
                                <button
                                    key={fontFamily}
                                    onClick={() => setFont(fontFamily)}
                                    style={{ fontFamily }}
                                    className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                                        font === fontFamily ? 'bg-purple-500/20 border-purple-500 text-purple-300' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                                >
                                    {fontFamily === 'Brush Script MT' ? 'Handwritten' : fontFamily}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {mode === 'upload' && (
                    <div className="border-2 border-dashed border-white/10 hover:border-purple-500/50 rounded-xl p-6 transition-all text-center relative bg-white/5 cursor-pointer">
                        <input
                            type="file"
                            accept="image/png, image/jpeg"
                            onChange={handleFileUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <Upload className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-200 font-medium">Görsel seçmek için tıklayın veya sürükleyin</p>
                        <p className="text-xs text-gray-500 mt-1">Sadece PNG veya JPG dosyaları desteklenir</p>
                    </div>
                )}
            </GlassCard>

            {/* Preview & Add */}
            <AnimatePresence>
                {signatureImage && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="mt-2"
                    >
                        <GlassCard className="p-4 space-y-4 border border-purple-500/20">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">İmza Önizleme</p>
                            <div className="bg-white rounded-xl p-3 flex justify-center items-center h-24 border border-purple-500/10">
                                <img src={signatureImage} alt="Signature Preview" className="max-h-full max-w-full object-contain" />
                            </div>
                            <NeonButton
                                onClick={handleAdd}
                                icon={<Check className="w-4 h-4" />}
                                className="w-full justify-center"
                            >
                                PDF'e İmza Ekle
                            </NeonButton>
                            <p className="text-[11px] text-center text-gray-400">
                                İmza sayfanın ortasına yerleştirilecektir. Sonrasında sürükleyip boyutlandırarak istediğiniz konuma taşıyabilirsiniz.
                            </p>
                        </GlassCard>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
