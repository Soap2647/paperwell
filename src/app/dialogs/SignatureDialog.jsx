import { capture } from '../objects';
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react';
import { PenLine, Type, Upload, Eraser } from 'lucide-react';
import { Button, ColorPicker, Dialog, Segmented } from '../../components/ui';
import { readImageFile } from '../imageFiles';
import { t } from '../../i18n';

const KEY = 'paperwell.signatures';

export function loadSignatures() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function saveSignatures(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8))); } catch { /* kota */ }
    window.dispatchEvent(new Event('paperwell:signatures'));
}

const FONTS = ['"Segoe Script", "Brush Script MT", cursive', '"Lucida Handwriting", "Apple Chancery", cursive', 'Georgia, serif'];

/** Kenarlardaki boşluğu kırpıp şeffaf PNG döndürür */
function trimCanvas(c) {
    const ctx = c.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const pad = 6;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return { src: out.toDataURL('image/png'), w: out.width, h: out.height };
}

export default function SignatureDialog({ open, onClose, onCreated }) {
    const [mode, setMode] = useState('draw');
    const [color, setColor] = useState('#1e293b');
    const [name, setName] = useState('');
    const [font, setFont] = useState(0);
    const [upload, setUpload] = useState(null);
    const canvasRef = useRef(null);
    const last = useRef(null);
    const [hasInk, setHasInk] = useState(false);

    useEffect(() => {
        if (!open || mode !== 'draw') return;
        const c = canvasRef.current;
        if (!c) return;
        const dpr = window.devicePixelRatio || 1;
        c.width = 520 * dpr; c.height = 200 * dpr;
        c.getContext('2d').scale(dpr, dpr);
        setHasInk(false);
    }, [open, mode]);

    const pos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, e.pressure || 0.5]; };
    const stroke = (a, b) => {
        const ctx = canvasRef.current.getContext('2d');
        ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = 1.6 + (b[2] || 0.5) * 2.4;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0] + 0.01, b[1]); ctx.stroke();
    };

    const build = () => {
        if (mode === 'draw') return trimCanvas(canvasRef.current);
        if (mode === 'type') {
            if (!name.trim()) return null;
            const c = document.createElement('canvas');
            c.width = 1200; c.height = 300;
            const ctx = c.getContext('2d');
            ctx.font = `110px ${FONTS[font]}`;
            ctx.fillStyle = color;
            ctx.textBaseline = 'middle';
            ctx.fillText(name, 30, 150);
            return trimCanvas(c);
        }
        return upload;
    };

    const save = () => {
        const sig = build();
        if (!sig) return;
        saveSignatures([sig, ...loadSignatures()]);
        onCreated?.(sig);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} title={t('Yeni imza')} width={580}
            footer={<><Button onClick={onClose}>{t('İptal')}</Button><Button variant="primary" onClick={save} disabled={mode === 'draw' ? !hasInk : mode === 'type' ? !name.trim() : !upload}>{t('İmzayı kaydet')}</Button></>}>
            <div className="space-y-4">
                <Segmented value={mode} onChange={setMode} options={[{ value: 'draw', icon: PenLine, label: t('Çiz') }, { value: 'type', icon: Type, label: t('Yaz') }, { value: 'upload', icon: Upload, label: t('Yükle') }]} />
                {mode !== 'upload' && <ColorPicker value={color} onChange={setColor} swatches={['#1e293b', '#1d4ed8', '#0f766e', '#7c2d12']} />}
                {mode === 'draw' && (
                    <div className="relative">
                        <canvas
                            ref={canvasRef}
                            className="w-full h-[200px] rounded-xl border border-line bg-white touch-none cursor-crosshair"
                            style={{ width: '100%', maxWidth: 520 }}
                            onPointerDown={(e) => { capture(e); last.current = pos(e); stroke(last.current, last.current); setHasInk(true); }}
                            onPointerMove={(e) => { if (!last.current) return; const p = pos(e); stroke(last.current, p); last.current = p; }}
                            onPointerUp={() => { last.current = null; }}
                        />
                        <div className="absolute left-6 right-6 bottom-12 border-b border-dashed border-gray-300 pointer-events-none" />
                        <Button size="sm" variant="ghost" icon={Eraser} className="absolute top-2 right-2" onClick={() => {
                            const c = canvasRef.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setHasInk(false);
                        }}>{t('Temizle')}</Button>
                    </div>
                )}
                {mode === 'type' && (
                    <>
                        <input className="field text-base" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Adınızı yazın')} />
                        <div className="grid grid-cols-3 gap-2">
                            {FONTS.map((f, i) => (
                                <button key={i} type="button" onClick={() => setFont(i)} className={`h-16 rounded-xl border bg-white text-2xl truncate px-2 ${font === i ? 'border-accent ring-2 ring-accent/30' : 'border-line'}`} style={{ fontFamily: f, color }}>
                                    {name || 'İmza'}
                                </button>
                            ))}
                        </div>
                    </>
                )}
                {mode === 'upload' && (
                    <label className="flex flex-col items-center justify-center gap-2 h-40 rounded-xl border-2 border-dashed border-line-strong hover:border-accent cursor-pointer bg-surface-2">
                        {upload ? <img src={upload.src} alt="" className="max-h-28" /> : <><Upload className="w-6 h-6 text-fg-3" /><span className="text-[13px] text-fg-2">{t('Görsel seçmek için tıklayın')}</span></>}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setUpload(await readImageFile(f, 1200)); }} />
                    </label>
                )}
            </div>
        </Dialog>
    );
}
