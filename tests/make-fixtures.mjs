// Test PDF'leri üretir: node tests/make-fixtures.mjs (proje kökünden)
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';

{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const p = doc.addPage([595, 842]);
  p.drawText('Quarterly Report - Draft', { x: 50, y: 780, size: 24, font: bold, color: rgb(0.1, 0.2, 0.6) });
  p.drawText('Revenue grew by 12 percent compared to last year.', { x: 50, y: 740, size: 12, font });
  p.drawText('Confidential: account 4421-9930-12', { x: 50, y: 720, size: 12, font, color: rgb(0.8, 0, 0) });
  p.drawRectangle({ x: 300, y: 450, width: 200, height: 150, color: rgb(0.2, 0.6, 0.9) });
  const p2 = doc.addPage([842, 595]);
  p2.setRotation({ type: 'degrees', angle: 90 });
  p2.drawText('Rotated page text', { x: 60, y: 500, size: 18, font });
  fs.writeFileSync('tests/fixtures/stdfonts.pdf', await doc.save());
}
{
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fs.readFileSync('public/fonts/LiberationSans-Regular.ttf'), { subset: true });
  const p = doc.addPage([595, 842]);
  p.drawText('Türkçe alt küme font: Ağaç, şeker, ılık, İzmir', { x: 50, y: 760, size: 14, font });
  p.drawText('Second line uses same font', { x: 50, y: 730, size: 14, font });
  fs.writeFileSync('tests/fixtures/cidfont.pdf', await doc.save());
}
console.log('fixtures ok');
