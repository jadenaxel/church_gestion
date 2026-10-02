import fs from 'node:fs/promises';
import ExcelJS from '../../services/identity-service/node_modules/exceljs/excel.js';

const output = 'outputs/church-roster-template/plantilla-padron-iglesia.xlsx';
const workbook = new ExcelJS.Workbook();
workbook.creator = 'GestionChurch';
workbook.company = 'GestionChurch';
workbook.title = 'Plantilla oficial del padrón de iglesia';
workbook.subject = 'Importación protegida del padrón maestro por tenant';
workbook.created = new Date('2026-09-29T00:00:00Z');
workbook.modified = new Date('2026-09-29T00:00:00Z');

const colors = { green: '075E54', teal: '0F766E', gold: 'E5B84B', line: 'D7E5E0', soft: 'EFF8F5', ink: '19352F', muted: '526C65', cream: 'FFF9E8' };
const headers = [
  'Código de miembro *', 'Nombres *', 'Segundo nombre', 'Apellidos *', 'Sexo *', 'Fecha de nacimiento',
  'Correo electrónico', 'Teléfono', 'WhatsApp', 'Estado civil', 'Estado de membresía *',
  'Fecha de bautismo', 'Fecha de ingreso', 'Dirección', 'Contacto de emergencia', 'Notas'
];
const widths = [20, 21, 19, 25, 19, 21, 31, 19, 19, 21, 23, 20, 20, 35, 30, 38];
const border = { style: 'thin', color: { argb: colors.line } };

const roster = workbook.addWorksheet('Padrón', {
  views: [{ state: 'frozen', ySplit: 5 }],
  pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
});
roster.showGridLines = false;
roster.mergeCells('A2:P2');
roster.getCell('A2').value = 'Plantilla de padrón de iglesia';
roster.getCell('A2').font = { name: 'Arial', size: 18, bold: true, color: { argb: colors.green } };
roster.getCell('A2').alignment = { vertical: 'middle' };
roster.getRow(2).height = 30;
roster.mergeCells('A3:P3');
roster.getCell('A3').value = 'Complete una fila por persona. No cambie los nombres de las columnas. Los campos con * son obligatorios.';
roster.getCell('A3').font = { name: 'Arial', size: 10, italic: true, color: { argb: colors.muted } };
roster.getCell('A3').alignment = { vertical: 'middle' };
roster.getRow(3).height = 23;
roster.getRow(5).values = headers;
roster.getRow(5).height = 42;
roster.getRow(5).eachCell((cell) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
  cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = { bottom: { style: 'medium', color: { argb: colors.gold } }, right: { style: 'thin', color: { argb: 'FFFFFF' } } };
});
roster.autoFilter = 'A5:P5';
roster.columns.forEach((column, index) => { column.width = widths[index]; });

for (let rowNumber = 6; rowNumber <= 505; rowNumber++) {
  const row = roster.getRow(rowNumber);
  row.height = 23;
  for (let column = 1; column <= 16; column++) {
    const cell = row.getCell(column);
    cell.font = { name: 'Arial', size: 10, color: { argb: colors.ink } };
    cell.alignment = { vertical: 'middle' };
    cell.border = { bottom: border };
    if ([1, 2, 4, 5, 11].includes(column)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.cream } };
  }
  row.getCell(5).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Femenino,Masculino,No especificado"'], showErrorMessage: true, errorTitle: 'Valor no permitido', error: 'Seleccione un valor de la lista.' };
  row.getCell(10).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Soltero/a,Casado/a,Viudo/a,Divorciado/a,Separado/a,No especificado"'], showErrorMessage: true, errorTitle: 'Valor no permitido', error: 'Seleccione un valor de la lista.' };
  row.getCell(11).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Miembro,Visitante,Inactivo,Trasladado"'], showErrorMessage: true, errorTitle: 'Valor no permitido', error: 'Seleccione un valor de la lista.' };
  for (const column of [6, 12, 13]) row.getCell(column).numFmt = 'yyyy-mm-dd';
}
roster.getColumn(1).note = 'Código único y estable por persona. Permite actualizar sin crear duplicados.';
roster.getColumn(6).note = 'Use AAAA-MM-DD. Este dato habilita edad, rango generacional y cumpleaños.';
roster.getColumn(5).note = 'Este campo sincroniza los perfiles autorizados de los módulos ministeriales.';
roster.getColumn(11).note = 'Los estados Inactivo y Trasladado conservan historial, pero no cuentan en el padrón activo.';
roster.properties.tabColor = { argb: colors.green };

const guide = workbook.addWorksheet('Guía', { views: [{ state: 'frozen', ySplit: 4 }] });
guide.showGridLines = false;
guide.mergeCells('A2:P2');
guide.getCell('A2').value = 'Guía para importar el padrón';
guide.getCell('A2').font = { name: 'Arial', size: 18, bold: true, color: { argb: colors.green } };
guide.getRow(2).height = 30;
guide.addRows([]);
const steps = [
  ['Paso', 'Qué hacer'],
  ['1', 'Use la hoja Padrón y conserve los encabezados.'],
  ['2', 'Complete Código, Nombres, Apellidos, Sexo y Estado de membresía.'],
  ['3', 'Use fechas con formato AAAA-MM-DD. Ejemplo: 1985-07-24.'],
  ['4', 'Revise la previsualización en GestionChurch antes de confirmar.'],
  ['5', 'Las filas con errores no se importan; corrija el archivo y vuelva a cargarlo.']
];
steps.forEach((values, index) => { guide.getRow(4 + index).values = values; });
guide.getRow(4).eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } }; cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } }; cell.alignment = { horizontal: 'center' }; });
for (let row = 5; row <= 9; row++) guide.getRow(row).eachCell((cell) => { cell.font = { name: 'Arial', size: 10, color: { argb: colors.ink } }; cell.border = { bottom: border }; cell.alignment = { vertical: 'middle', wrapText: true }; });
guide.getRow(11).values = headers.map((value) => value.replace(' *', ''));
guide.getRow(11).eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.teal } }; cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } }; cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
guide.getRow(12).values = ['OZ-0001', 'Ana', 'María', 'Pérez', 'Femenino', new Date('1986-04-17T00:00:00Z'), 'ana.perez@example.org', '+18095550101', '+18095550101', 'Casado/a', 'Miembro', new Date('2001-06-10T00:00:00Z'), new Date('1998-01-15T00:00:00Z'), 'Dirección de ejemplo', 'Luis Pérez +18095550102', 'Ejemplo: no se importa desde la hoja Guía.'];
guide.getRow(13).values = ['OZ-0002', 'Samuel', null, 'Rodríguez', 'Masculino', new Date('1994-11-03T00:00:00Z'), null, '+18095550103', null, 'Soltero/a', 'Visitante', null, new Date('2026-02-01T00:00:00Z'), null, null, 'Ejemplo de campos opcionales vacíos.'];
for (let row = 12; row <= 13; row++) for (let column = 1; column <= 16; column++) { const cell = guide.getRow(row).getCell(column); cell.font = { name: 'Arial', size: 10, color: { argb: colors.ink } }; cell.alignment = { vertical: 'top', wrapText: true }; cell.border = { bottom: border }; if ([6, 12, 13].includes(column)) cell.numFmt = 'yyyy-mm-dd'; }
const catalog = [
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
catalog.forEach((values, index) => { guide.getRow(15 + index).values = values; });
guide.getRow(15).eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.gold } }; cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '3C300C' } }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; });
for (let row = 16; row <= 23; row++) guide.getRow(row).eachCell((cell) => { cell.font = { name: 'Arial', size: 10, color: { argb: colors.ink } }; cell.alignment = { vertical: 'top', wrapText: true }; cell.border = { bottom: border }; });
guide.getRow(25).values = ['Privacidad', 'El padrón se almacena únicamente en la base de datos del tenant y respeta los permisos de administración.'];
guide.getRow(26).values = ['Sincronización', 'Las mujeres activas se incorporan automáticamente al roster del Ministerio de la Mujer con edad y cumpleaños.'];
for (const rowNumber of [25, 26]) guide.getRow(rowNumber).eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.soft } }; cell.font = { name: 'Arial', size: 10, color: { argb: colors.green } }; cell.alignment = { vertical: 'middle', wrapText: true }; });
guide.getColumn(1).width = 25;
guide.getColumn(2).width = 64;
for (let column = 3; column <= 16; column++) guide.getColumn(column).width = 19;
for (const rowNumber of [11, 12, 13]) guide.getRow(rowNumber).height = 43;
guide.properties.tabColor = { argb: '8FBDB1' };

await fs.mkdir('outputs/church-roster-template', { recursive: true });
await workbook.xlsx.writeFile(output);
console.log(JSON.stringify({ status: 'created', output, sheets: workbook.worksheets.map((sheet) => sheet.name) }));
