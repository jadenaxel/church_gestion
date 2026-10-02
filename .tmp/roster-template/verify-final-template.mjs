import fs from 'node:fs/promises';
import { SpreadsheetFile } from '@oai/artifact-tool';

const path = 'X:/CODE/GestionChurch/outputs/church-roster-template/plantilla-padron-iglesia.xlsx';
const bytes = await fs.readFile(path);
const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const workbook = await SpreadsheetFile.importXlsx(input);
const roster = await workbook.inspect({ kind: 'table', range: 'Padrón!A2:P8', include: 'values,formulas', tableMaxRows: 8, tableMaxCols: 16, maxChars: 8000 });
const guide = await workbook.inspect({ kind: 'table', range: 'Guía!A2:P26', include: 'values,formulas', tableMaxRows: 26, tableMaxCols: 16, maxChars: 12000 });
const errors = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 100 }, summary: 'final formula error scan' });
console.log(roster.ndjson);
console.log(guide.ndjson);
console.log(errors.ndjson);
for (const sheetName of ['Padrón', 'Guía']) {
  const preview = await workbook.render({ sheetName, autoCrop: 'all', scale: 1, format: 'png' });
  await fs.writeFile(`X:/CODE/GestionChurch/outputs/church-roster-template/${sheetName === 'Padrón' ? 'padron-preview' : 'guia-preview'}.png`, new Uint8Array(await preview.arrayBuffer()));
}
