import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDir = 'X:/CODE/GestionChurch/outputs/church-roster-template';
const workbook = Workbook.create();
const roster = workbook.worksheets.add('Padrón');
const guide = workbook.worksheets.add('Guía');
const font = 'Arial';
const green = '#075E54';
const teal = '#0F766E';
const gold = '#E5B84B';
const line = '#D7E5E0';
const soft = '#EFF8F5';

const headers = [
  'Código de miembro', 'Nombres', 'Segundo nombre', 'Apellidos', 'Sexo', 'Fecha de nacimiento',
  'Correo electrónico', 'Teléfono', 'WhatsApp', 'Estado civil', 'Estado de membresía',
  'Fecha de bautismo', 'Fecha de ingreso', 'Dirección', 'Contacto de emergencia', 'Notas'
];

roster.showGridLines = false;
roster.getRange('A2:P2').format.borders = { bottom: { style: 'medium', color: green } };
roster.getRange('A2').values = [['Plantilla de padrón de iglesia']];
roster.getRange('A2').format.font = { name: font, size: 16, bold: true, color: green };
roster.getRange('A3').values = [['Complete una fila por persona. No cambie los nombres de las columnas. Los campos con * son obligatorios.']];
roster.getRange('A3:P3').format.font = { name: font, size: 10, italic: true, color: '#526C65' };
roster.getRange('A5:P5').values = [headers.map((item, index) => [0, 1, 3, 4, 10].includes(index) ? `${item} *` : item)];
roster.getRange('A5:P5').format = {
  fill: green,
  font: { name: font, size: 10, bold: true, color: '#FFFFFF' },
  verticalAlignment: 'center',
  horizontalAlignment: 'center',
  wrapText: true,
  borders: { preset: 'inside', style: 'thin', color: '#FFFFFF' }
};
roster.getRange('A5:P5').format.rowHeight = 38;
roster.getRange('A6:P505').format = {
  font: { name: font, size: 10, color: '#19352F' },
  verticalAlignment: 'center',
  borders: { bottom: { style: 'thin', color: line } }
};
roster.getRange('A6:P505').format.rowHeight = 22;
roster.getRange('A6:D505').format.fill = '#FFF9E8';
roster.getRange('E6:E505').format.fill = '#FFF9E8';
roster.getRange('K6:K505').format.fill = '#FFF9E8';
roster.getRange('E6:E505').dataValidation = { rule: { type: 'list', values: ['Femenino', 'Masculino', 'No especificado'] } };
roster.getRange('J6:J505').dataValidation = { rule: { type: 'list', values: ['Soltero/a', 'Casado/a', 'Viudo/a', 'Divorciado/a', 'Separado/a', 'No especificado'] } };
roster.getRange('K6:K505').dataValidation = { rule: { type: 'list', values: ['Miembro', 'Visitante', 'Inactivo', 'Trasladado'] } };
roster.getRange('F6:F505').format.numberFormat = 'yyyy-mm-dd';
roster.getRange('L6:M505').format.numberFormat = 'yyyy-mm-dd';
roster.freezePanes.freezeRows(5);
const widths = [18, 20, 18, 24, 18, 20, 30, 18, 18, 20, 22, 18, 18, 34, 29, 36];
for (let column = 0; column < widths.length; column++) roster.getRangeByIndexes(0, column, 505, 1).format.columnWidth = widths[column];
roster.tabColor = green;

guide.showGridLines = false;
guide.getRange('A2:H2').format.borders = { bottom: { style: 'medium', color: green } };
guide.getRange('A2').values = [['Guía para importar el padrón']];
guide.getRange('A2').format.font = { name: font, size: 16, bold: true, color: green };
guide.getRange('A4:B9').values = [
  ['Paso', 'Qué hacer'],
  ['1', 'Use la hoja Padrón y conserve los encabezados.'],
  ['2', 'Complete Código, Nombres, Apellidos, Sexo y Estado de membresía.'],
  ['3', 'Use fechas con formato AAAA-MM-DD. Ejemplo: 1985-07-24.'],
  ['4', 'Revise la previsualización en GestionChurch antes de confirmar.'],
  ['5', 'Las filas con errores no se importan; corrija el archivo y vuelva a cargarlo.']
];
guide.getRange('A4:B4').format = { fill: green, font: { name: font, size: 10, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center' };
guide.getRange('A5:B9').format = { font: { name: font, size: 10, color: '#19352F' }, verticalAlignment: 'center', borders: { bottom: { style: 'thin', color: line } } };
guide.getRange('A11:P11').values = [headers];
guide.getRange('A11:P11').format = { fill: teal, font: { name: font, size: 10, bold: true, color: '#FFFFFF' }, wrapText: true, horizontalAlignment: 'center', verticalAlignment: 'center' };
guide.getRange('A12:P13').values = [
  ['OZ-0001', 'Ana', 'María', 'Pérez', 'Femenino', new Date('1986-04-17T00:00:00Z'), 'ana.perez@example.org', '+18095550101', '+18095550101', 'Casado/a', 'Miembro', new Date('2001-06-10T00:00:00Z'), new Date('1998-01-15T00:00:00Z'), 'Dirección de ejemplo', 'Luis Pérez +18095550102', 'Ejemplo: elimine esta fila; no se importa desde la hoja Guía.'],
  ['OZ-0002', 'Samuel', '', 'Rodríguez', 'Masculino', new Date('1994-11-03T00:00:00Z'), '', '+18095550103', '', 'Soltero/a', 'Visitante', null, new Date('2026-02-01T00:00:00Z'), '', '', 'Ejemplo de campos opcionales vacíos.']
];
guide.getRange('A12:P13').format = { font: { name: font, size: 10, color: '#19352F' }, verticalAlignment: 'top', wrapText: true, borders: { bottom: { style: 'thin', color: line } } };
guide.getRange('F12:F13').format.numberFormat = 'yyyy-mm-dd';
guide.getRange('L12:M13').format.numberFormat = 'yyyy-mm-dd';
guide.getRange('A15:D23').values = [
  ['Campo', 'Requerido', 'Valores admitidos', 'Uso principal'],
  ['Código de miembro', 'Sí', 'Único por persona', 'Evita duplicados y permite actualizar'],
  ['Sexo', 'Sí', 'Femenino, Masculino, No especificado', 'Rosters ministeriales autorizados'],
  ['Fecha de nacimiento', 'No', 'AAAA-MM-DD', 'Edad, rangos y cumpleaños'],
  ['Estado civil', 'No', 'Soltero/a, Casado/a, Viudo/a, Divorciado/a, Separado/a, No especificado', 'Segmentación pastoral autorizada'],
  ['Estado de membresía', 'Sí', 'Miembro, Visitante, Inactivo, Trasladado', 'Estado del padrón'],
  ['Correo, teléfono, WhatsApp', 'No', 'Texto', 'Comunicación autorizada'],
  ['Fecha de bautismo e ingreso', 'No', 'AAAA-MM-DD', 'Historia de membresía'],
  ['Foto', 'Después de importar', 'JPG o PNG, máximo 5 MB', 'Identificación visual protegida']
];
guide.getRange('A15:D15').format = { fill: gold, font: { name: font, size: 10, bold: true, color: '#3C300C' }, horizontalAlignment: 'center', verticalAlignment: 'center' };
guide.getRange('A16:D23').format = { font: { name: font, size: 10, color: '#19352F' }, wrapText: true, verticalAlignment: 'top', borders: { bottom: { style: 'thin', color: line } } };
guide.getRange('A25:D26').values = [
  ['Privacidad', 'El padrón se almacena únicamente en la base de datos del tenant y respeta los permisos de administración.', '', ''],
  ['Sincronización', 'Las mujeres activas se incorporan automáticamente al roster del Ministerio de la Mujer con edad y cumpleaños.', '', '']
];
guide.getRange('A25:D26').format = { fill: soft, font: { name: font, size: 10, color: green }, wrapText: true, verticalAlignment: 'center', borders: { preset: 'outside', style: 'thin', color: '#A8CEC4' } };
guide.getRange('A4:A26').format.columnWidth = 24;
guide.getRange('B4:B26').format.columnWidth = 62;
guide.getRange('C11:P23').format.columnWidth = 18;
guide.getRange('A11:P13').format.rowHeight = 42;
guide.freezePanes.freezeRows(4);
guide.tabColor = '#8FBDB1';

workbook.recalculate();
const mainCheck = await workbook.inspect({ kind: 'table', range: 'Padrón!A2:P8', include: 'values,formulas', tableMaxRows: 8, tableMaxCols: 16, maxChars: 8000 });
const guideCheck = await workbook.inspect({ kind: 'table', range: 'Guía!A2:P26', include: 'values,formulas', tableMaxRows: 26, tableMaxCols: 16, maxChars: 12000 });
const errors = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 100 }, summary: 'final formula error scan' });
console.log(mainCheck.ndjson);
console.log(guideCheck.ndjson);
console.log(errors.ndjson);
await fs.mkdir(outputDir, { recursive: true });
for (const sheetName of ['Padrón', 'Guía']) {
  const preview = await workbook.render({ sheetName, autoCrop: 'all', scale: 1, format: 'png' });
  await fs.writeFile(`${outputDir}/${sheetName === 'Padrón' ? 'padron-preview' : 'guia-preview'}.png`, new Uint8Array(await preview.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/plantilla-padron-iglesia.xlsx`);
