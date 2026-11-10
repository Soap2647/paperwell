import { useEffect, useState } from 'react';
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
    success: { icon: CheckCircle2, cls: 'text-success' },
    error: { icon: AlertCircle, cls: 'text-danger' },
    info: { icon: Info, cls: 'text-accent' },
};

export default function Toaster() {
    const [items, setItems] = useState([]);

    useEffect(() => {
        const add = (item) => {
            setItems((prev) => [...prev.slice(-3), item]);
            setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== item.id)), item.type === 'error' ? Math.max(item.duration, 6000) : item.duration);
        };
        listeners.add(add);
        return () => listeners.delete(add);
    }, []);

    return (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[300] flex flex-col items-center gap-2 pointer-events-none" role="status" aria-live="polite">
            {items.map((item) => {
                const { icon: Icon, cls } = STYLES[item.type] || STYLES.info;
                return (
                    <div key={item.id} className="pointer-events-auto flex items-center gap-2.5 pl-3 pr-1.5 py-2 rounded-xl bg-surface border border-line shadow-float text-[13px] max-w-md animate-[toastIn_.18s_ease-out]">
                        <Icon className={`w-4 h-4 shrink-0 ${cls}`} />
                        <span className="text-fg">{item.text}</span>
                        <button onClick={() => setItems((p) => p.filter((i) => i.id !== item.id))} className="p-1 rounded-md text-fg-3 hover:text-fg hover:bg-surface-3" aria-label="Kapat">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
