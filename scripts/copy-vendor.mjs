// OCR motoru ve dil verilerini public/ altına kopyalar (CDN yerine yerelden sunulsun diye).
// "npm run dev" ve "npm run build" öncesinde otomatik çalışır.
import fs from 'fs';
import path from 'path';

const out = 'public/tesseract';
const copy = (src, dst) => {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) fs.copyFileSync(src, dst);
};

copy('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
    copy(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`);
}
for (const lang of ['tur', 'eng']) {
    copy(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `${out}/lang/${lang}.traineddata.gz`);
}
console.log('vendor: tesseract kopyalandı');
