import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

// Basit global bildirim sistemi: toast('Kaydedildi', 'success')
const listeners = new Set();
let nextId = 0;

// eslint-disable-next-line react-refresh/only-export-components
export function toast(text, type = 'info', duration = 3500) {
    const item = { id: ++nextId, text, type, duration };
    listeners.forEach((fn) => fn(item));
}

const STYLES = {
    success: { icon: CheckCircle2, cls: 'border-emerald-500/30 text-emerald-200', iconCls: 'text-emerald-400' },
    error: { icon: AlertCircle, cls: 'border-red-500/30 text-red-200', iconCls: 'text-red-400' },
    info: { icon: Info, cls: 'border-white/10 text-gray-200', iconCls: 'text-purple-300' },
};

export default function Toaster() {
    const [items, setItems] = useState([]);

    useEffect(() => {
        const add = (item) => {
            setItems((prev) => [...prev.slice(-3), item]);
            setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== item.id)), item.duration);
        };
        listeners.add(add);
        return () => listeners.delete(add);
    }, []);

    const dismiss = (id) => setItems((prev) => prev.filter((i) => i.id !== id));

    return (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none" role="status" aria-live="polite">
            <AnimatePresence>
                {items.map((item) => {
                    const { icon: Icon, cls, iconCls } = STYLES[item.type] || STYLES.info;
                    return (
                        <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: -12, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -12, scale: 0.96 }}
                            transition={{ duration: 0.18 }}
                            className={`pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-xl bg-gray-900/95 backdrop-blur-xl border shadow-2xl shadow-black/40 text-sm max-w-md ${cls}`}
                        >
                            <Icon className={`w-4 h-4 shrink-0 ${iconCls}`} />
                            <span>{item.text}</span>
                            <button onClick={() => dismiss(item.id)} className="p-1 rounded-md text-gray-500 hover:text-gray-200 hover:bg-white/10" aria-label="Kapat">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
