// npx esbuild tests/export.test.mjs --bundle --platform=node --format=esm --outfile=tests/out/export.mjs && node tests/out/export.mjs
import fs from 'fs';
import { exportPdf } from '../src/core/export';
import { readPages } from '../src/core/pageOps';
import { setFontLoader } from '../src/core/fonts';
setFontLoader(async (url) => fs.readFileSync('public' + url));

const bytes = fs.readFileSync('tests/fixtures/stdfonts.pdf');
const pages = await readPages(bytes);
const objs = (pg) => [
  { id: 'a', type: 'path', points: [[60, 200], [120, 230], [180, 210], [240, 260]], color: '#e11d48', width: 4, opacity: 1 },
  { id: 'b', type: 'path', points: [[50, 95], [330, 95]], color: '#facc15', width: 16, opacity: 0.5, blend: 'multiply' },
  { id: 'c', type: 'rect', x: 300, y: 300, w: 160, h: 90, stroke: '#2563eb', fill: '#dbeafe', width: 3 },
  { id: 'd', type: 'ellipse', x: 80, y: 320, w: 140, h: 80, stroke: '#16a34a', fill: null, width: 2 },
  { id: 'e', type: 'arrow', x1: 100, y1: 480, x2: 300, y2: 560, stroke: '#111', width: 3 },
  { id: 'f', type: 'text', x: 60, y: 600, w: 300, h: 60, text: 'Merhaba dünya — ğüşıöç İ\nİkinci satır', family: 'serif', size: 18, color: '#7c3aed', bold: true, italic: false, align: 'left' },
  { id: 'g', type: 'highlight', rects: [{ x: 50, y: 116, w: 250, h: 16 }], color: '#86efac', kind: 'highlight', opacity: 0.45 },
  { id: 'h', type: 'note', x: 500, y: 60, w: 24, h: 24, text: 'Bu bir not', color: '#facc15' },
];
const objects = { [pages[0].id]: objs(), [pages[1].id]: [{ id: 'r', type: 'text', x: 40, y: 40, w: 300, h: 30, text: 'Döndürülmüş sayfa üstünde dik metin', family: 'sans', size: 16, color: '#dc2626', align: 'left' }, { id: 'r2', type: 'rect', x: 40, y: 80, w: 100, h: 50, stroke: '#000', width: 2 }] };
const out = await exportPdf(bytes, pages, objects);
fs.writeFileSync('tests/out/export.pdf', out);
console.log('export ok', out.length, pages.map(p => `${p.width}x${p.height} r${p.rotate}`));
