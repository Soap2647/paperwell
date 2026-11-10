// Motor testi: npx esbuild tests/engine.test.mjs --bundle --platform=node --format=esm --outfile=tests/out/engine.mjs && node tests/out/engine.mjs
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { buildPageModel } from '../src/core/pdf/pageModel';
import { replaceLineText, redactRects, transformImage, deleteImage } from '../src/core/pdf/editOps';
import { setFontLoader } from '../src/core/fonts';

setFontLoader(async (url) => fs.readFileSync('public' + url));
const show = (l) => `${JSON.stringify(l.text)}  [${l.font.displayName}${l.font.isType0 ? ' T0' : ''}${l.font.isSubset ? ' sub' : ''}] size=${l.fontSize.toFixed(1)} box=${[l.box.x0, l.box.y0, l.box.x1, l.box.y1].map((n) => n.toFixed(0)).join(',')}`;

for (const f of ['stdfonts', 'cidfont', 'chrome-invoice']) {
  const bytes = fs.readFileSync(`tests/fixtures/${f}.pdf`);
  const doc = await PDFDocument.load(bytes);
  console.log(`\n=== ${f} (${doc.getPageCount()} sayfa)`);
  for (let i = 0; i < doc.getPageCount(); i++) {
    const m = buildPageModel(doc, i);
    console.log(`-- sayfa ${i + 1}: ${m.lines.length} satır, ${m.images.length} görsel, geom ${m.geom.width}x${m.geom.height} r${m.geom.rotate}`);
    m.lines.slice(0, 14).forEach((l) => console.log('  ', show(l)));
    m.images.forEach((im) => console.log('   IMG', im.name, Object.values(im.box).map((n) => n.toFixed(0)).join(',')));
  }
}

const tryEdit = async (file, pageIndex, match, newText, style) => {
  const bytes = fs.readFileSync(`tests/fixtures/${file}.pdf`);
  const doc = await PDFDocument.load(bytes);
  const m = buildPageModel(doc, pageIndex);
  const line = m.lines.find((l) => l.text.includes(match));
  if (!line) { console.log('BULUNAMADI', match); return null; }
  const r = await replaceLineText(bytes, pageIndex, line.id, newText, style);
  const doc2 = await PDFDocument.load(r.bytes);
  const m2 = buildPageModel(doc2, pageIndex);
  const found = m2.lines.find((l) => l.text.includes(newText.slice(0, 12)));
  console.log(`EDIT ${file}: "${line.text}" → "${newText}" orijinalFont=${r.usedOriginalFont} sonra=${found ? JSON.stringify(found.text) : 'YOK'} eskiKaldı=${m2.lines.some((l) => l.text === line.text)}`);
  return r.bytes;
};

console.log('\n=== DÜZENLEME');
let out = await tryEdit('stdfonts', 0, 'Revenue grew', 'Revenue grew by 15 percent this year.');
fs.writeFileSync('tests/out/std-edit.pdf', out);
out = await tryEdit('cidfont', 0, 'Second line', 'Second line şeker İzmir');
fs.writeFileSync('tests/out/cid-edit.pdf', out);
out = await tryEdit('cidfont', 0, 'Second line', 'Yepyeni çğ metin XYZ');
fs.writeFileSync('tests/out/cid-fallback.pdf', out);
let inv = await tryEdit('chrome-invoice', 0, 'Ahmet', 'Sayın Mehmet Yılmaz, aşağıdaki hizmetlerin ödemesini bekliyoruz.');
inv = await (async () => { fs.writeFileSync('tests/out/tmp.pdf', inv); const r = await tryEdit('../out/tmp', 0, '16.700', '18.900 TL'); return r; })();
fs.writeFileSync('tests/out/invoice-edit.pdf', inv);

// redaksiyon: IBAN satırı
{
  const bytes = fs.readFileSync('tests/fixtures/chrome-invoice.pdf');
  const doc = await PDFDocument.load(bytes);
  const m = buildPageModel(doc, 0);
  const line = m.lines.find((l) => l.text.includes('IBAN'));
  const r = await redactRects(bytes, 0, [{ x0: line.box.x0 + 100, y0: line.box.y0 - 1, x1: line.box.x1 + 2, y1: line.box.y1 + 1 }]);
  const m2 = buildPageModel(await PDFDocument.load(r.bytes), 0);
  console.log('REDACT silinen glif', r.removedGlyphs, '→', JSON.stringify(m2.lines.find((l) => l.text.includes('Ödemeler'))?.text));
  fs.writeFileSync('tests/out/invoice-redact.pdf', r.bytes);
  // görseli taşı
  if (m.images.length) {
    const img = m.images[m.images.length - 1];
    const C = img.ctm;
    const moved = await transformImage(bytes, 0, img.id, [C[0], C[1], C[2], C[3], C[4] + 250, C[5] + 40]);
    const m3 = buildPageModel(await PDFDocument.load(moved), 0);
    console.log('IMG taşındı', Object.values(img.box).map(Math.round), '→', Object.values(m3.images[m3.images.length - 1].box).map(Math.round));
    fs.writeFileSync('tests/out/invoice-imgmove.pdf', moved);
    const del = await deleteImage(bytes, 0, m.images[0].id);
    console.log('IMG silindi, kalan', buildPageModel(await PDFDocument.load(del), 0).images.length);
  }
}
