// Yazım denetimi Worker'ı: Türkçe hunspell sözlüğünü (dictionary-tr, MIT) bir kez yükler, satırları denetler
import nspell from 'nspell';
import { checkLine } from './spell';

let sp = null;
const load = async () => {
    if (!sp) {
        const [aff, dic] = await Promise.all([fetch(`${import.meta.env.BASE_URL}dict/tr.aff`).then((r) => r.text()), fetch(`${import.meta.env.BASE_URL}dict/tr.dic`).then((r) => r.text())]);
        sp = nspell(aff, dic);
    }
    return sp;
};

self.onmessage = async (e) => {
    try {
        const s = await load();
        self.postMessage({ id: e.data.id, result: e.data.lines.map((l) => checkLine(l, s)) });
    } catch (err) {
        self.postMessage({ id: e.data.id, error: String(err?.message || err) });
    }
};
