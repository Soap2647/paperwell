// Açık belgenin renk paleti (afişten çıkarılır): her renk seçicide marka renklerinin ardından gösterilir
import { useSyncExternalStore } from 'react';

let palette = [];
const subs = new Set();
export const setPalette = (p) => { palette = p; subs.forEach((f) => f()); };
export const usePalette = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => palette);
