// Açık / koyu / sistem teması
import { useEffect, useSyncExternalStore } from 'react';

let theme = (() => {
    try { return localStorage.getItem('nebula.theme') || 'system'; } catch { return 'system'; }
})();
const listeners = new Set();

export function setTheme(t) {
    theme = t;
    try { localStorage.setItem('nebula.theme', t); } catch { /* yoksay */ }
    listeners.forEach((fn) => fn());
}

export function useTheme() {
    const value = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => theme);
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = () => {
            const dark = value === 'dark' || (value === 'system' && mq.matches);
            document.documentElement.classList.toggle('dark', dark);
        };
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, [value]);
    return value;
}
