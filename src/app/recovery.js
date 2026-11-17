// Otomatik kurtarma: kaydedilmemiş çalışma birkaç saniyede bir proje olarak tarayıcı deposuna yazılır.
// Uygulama çökerse ya da kaydetmeden kapanırsa başlangıç ekranı "Kaldığınız yerden devam edin" der.
import { useEffect } from 'react';
import { serializeProject } from '../core/project';

const DB = 'paperwell-recover', STORE = 'kv', KEY = 'last';

function db() {
    return new Promise((res, rej) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
async function run(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => res(req?.result);
        tx.onerror = () => rej(tx.error);
    });
}

/** @returns {Promise<{bytes: Uint8Array, name: string, at: number, thumb?: string}|undefined>} */
export const loadRecovery = () => run('readonly', (s) => s.get(KEY)).catch(() => undefined);
export const clearRecovery = () => run('readwrite', (s) => s.delete(KEY)).catch(() => {});

/** Belge kirliyken değişiklikten 3 sn sonra kurtarma kaydı yazar; kaydedilince ya da belge kapanınca siler */
export function useAutoRecovery(state) {
    const { doc, objects, redactions, dirty } = state;
    useEffect(() => {
        if (!doc) return undefined;
        if (!dirty) { clearRecovery(); return undefined; }
        const id = setTimeout(async () => {
            try {
                const bytes = await serializeProject(state);
                await run('readwrite', (s) => s.put({ bytes, name: doc.projectName || doc.name, at: Date.now() }, KEY));
            } catch { /* depo doluysa kurtarma olmadan devam */ }
        }, 3000);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc, objects, redactions, dirty]);
}
