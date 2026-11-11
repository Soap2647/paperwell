// npx esbuild tests/imposition.test.mjs --bundle --platform=node --format=esm --outfile=tests/out/imp.mjs && node tests/out/imp.mjs
import fs from 'fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { nUp, booklet, splitForManualDuplex, fitToPaper } from '../src/core/imposition';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.HelveticaBold);
for (let i = 1; i <= 6; i++) {
  const p = doc.addPage([595, 842]);
  if (i === 3) p.setRotation({ type: 'degrees', angle: 90 });
  p.drawRectangle({ x: 20, y: 20, width: 555, height: 802, borderColor: rgb(0.3, 0.3, 0.8), borderWidth: 4 });
  p.drawText(String(i), { x: 230, y: 380, size: 160, font, color: rgb(0.8, 0.1, 0.2) });
  p.drawText('TOP', { x: 260, y: 780, size: 30, font });
}
const bytes = await doc.save();
const idx = [0, 1, 2, 3, 4, 5];
fs.writeFileSync('tests/out/imp-2up.pdf', await nUp(bytes, idx, { n: 2 }));
fs.writeFileSync('tests/out/imp-4up.pdf', await nUp(bytes, idx, { n: 4 }));
fs.writeFileSync('tests/out/imp-booklet.pdf', await booklet(bytes, idx));
fs.writeFileSync('tests/out/imp-fit.pdf', await fitToPaper(bytes, idx, { paper: 'letter' }));
const d = await splitForManualDuplex(bytes);
console.log('duplex front', (await PDFDocument.load(d.front)).getPageCount(), 'back', (await PDFDocument.load(d.back)).getPageCount());
