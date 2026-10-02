import ExcelJS from '../../services/identity-service/node_modules/exceljs/excel.js';

const api = 'http://127.0.0.1:4000/api/v1';
const login = await fetch(`${api}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ tenant: 'central', email: 'admin@central.local', password: 'GestionChurch!2026' })
});
if (!login.ok) throw new Error(`Login XLSX smoke failed: ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Login XLSX smoke did not return a cookie.');

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('apps/web/public/templates/plantilla-padron-iglesia.xlsx');
const sheet = workbook.getWorksheet('Padrón');
if (!sheet) throw new Error('The official roster template has no Padrón sheet.');
const stamp = Date.now();
const memberCode = `XLSX-${stamp}`;
sheet.getRow(6).values = [
  memberCode, 'Plantilla', '', `Verificada ${stamp}`, 'Femenino', new Date('1991-08-14T00:00:00Z'),
  `xlsx.${stamp}@example.local`, '+18095550401', '+18095550401', 'Soltero/a', 'Miembro',
  new Date('2005-06-12T00:00:00Z'), new Date('2004-01-10T00:00:00Z'), 'Santo Domingo', '+18095550402', 'Smoke de la plantilla oficial'
];
const bytes = await workbook.xlsx.writeBuffer();
const form = new FormData();
form.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `plantilla-${stamp}.xlsx`);
const previewResponse = await fetch(`${api}/roster/imports/preview`, { method: 'POST', headers: { cookie }, body: form });
const preview = await previewResponse.json();
if (previewResponse.status !== 201 || preview.validRows !== 1 || preview.invalidRows !== 0) {
  throw new Error(`XLSX preview failed: ${previewResponse.status} ${JSON.stringify(preview)}`);
}
const commitResponse = await fetch(`${api}/roster/imports/${preview.id}/commit`, { method: 'POST', headers: { cookie } });
const committed = await commitResponse.json();
if (commitResponse.status !== 201 || committed.imported !== 1) {
  throw new Error(`XLSX commit failed: ${commitResponse.status} ${JSON.stringify(committed)}`);
}
const contextResponse = await fetch(`${api}/roster/context`, { headers: { cookie } });
const context = await contextResponse.json();
if (!contextResponse.ok || !context.members.some((member) => member.memberCode === memberCode)) {
  throw new Error(`XLSX context verification failed: ${contextResponse.status}`);
}
console.log(JSON.stringify({ status: 'passed', memberCode, preview: { validRows: preview.validRows, invalidRows: preview.invalidRows }, committed }));
