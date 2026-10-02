import { beforeAll, describe, expect, it } from 'vitest';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';
let adminCookie = '';
let leaderCookie = '';

async function login(email: string, password: string) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'central', email, password })
  });
  expect(response.status).toBe(201);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

async function request(path: string, options: RequestInit = {}, session = adminCookie) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { cookie: session, ...options.headers }
  });
  const body = (response.headers.get('content-type') ?? '').includes('json') ? await response.json() : await response.arrayBuffer();
  return { response, body };
}

beforeAll(async () => {
  adminCookie = await login('admin@central.local', 'GestionChurch!2026');
  leaderCookie = await login('jovenes@central.local', 'Actividad!2026');
});

describe('Padrón maestro de iglesia end-to-end', () => {
  it('restringe la administración del padrón al tenant admin', async () => {
    expect((await request('/roster/context', {}, leaderCookie)).response.status).toBe(403);
    const unauthorizedPhoto = new FormData();
    unauthorizedPhoto.append('file', new Blob([Buffer.from('not-an-image')], { type: 'image/png' }), 'foto.png');
    expect((await request('/files/member-photos/00000000-0000-4000-8000-000000000000', { method: 'POST', body: unauthorizedPhoto }, leaderCookie)).response.status).toBe(403);
  });

  it('previsualiza, confirma, sincroniza mujeres, sirve fotografías y registra auditoría', async () => {
    const stamp = Date.now();
    const femaleCode = `E2E-MUJER-${stamp}`;
    const maleCode = `E2E-HOMBRE-${stamp}`;
    const csv = [
      'Código de miembro,Nombres,Segundo nombre,Apellidos,Sexo,Fecha de nacimiento,Correo electrónico,Teléfono,WhatsApp,Estado civil,Estado de membresía,Fecha de bautismo,Fecha de ingreso,Dirección,Contacto de emergencia,Notas',
      `${femaleCode},Ana,María,Prueba,Femenino,1989-04-17,ana.${stamp}@example.local,+18095550101,+18095550101,Casada,Miembro,2004-05-15,2003-02-10,Santo Domingo,+18095550102,Importada desde el padrón maestro`,
      `${maleCode},Luis,,Prueba,Masculino,1977-11-09,luis.${stamp}@example.local,+18095550201,+18095550201,Casado,Miembro,1999-03-01,1998-01-01,Santo Domingo,+18095550202,Registro masculino`,
      `INVALID-${stamp},X,,Sinapellido,Valor inválido,fecha-invalida,,,,,Desconocido,,,,,,Fila intencionalmente inválida`
    ].join('\n');
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), `padron-${stamp}.csv`);

    const preview = await request('/roster/imports/preview', { method: 'POST', body: form });
    expect(preview.response.status).toBe(201);
    expect(preview.body).toMatchObject({ totalRows: 3, validRows: 2, invalidRows: 1 });
    const previewId = (preview.body as { id: string }).id;

    const committed = await request(`/roster/imports/${previewId}/commit`, { method: 'POST' });
    expect(committed.response.status).toBe(201);
    expect(committed.body).toMatchObject({ imported: 2, created: 2, skippedInvalid: 1, womenRosterSynchronized: true });

    const context = await request('/roster/context');
    expect(context.response.status).toBe(200);
    const members = (context.body as { members: Array<{ id: string; memberCode: string; displayName: string; ageBand: string; hasPhoto: boolean }> }).members;
    const woman = members.find((member) => member.memberCode === femaleCode)!;
    expect(woman).toMatchObject({ displayName: 'Ana María Prueba', ageBand: '26_39', hasPhoto: false });
    expect(members.some((member) => member.memberCode === maleCode)).toBe(true);

    const women = await request('/womens-ministry/context');
    expect(women.response.status).toBe(200);
    const synchronizedWoman = (women.body as { women: Array<{ churchMemberId: string | null; name: string; dateOfBirth: string }> }).women
      .find((item) => item.churchMemberId === woman.id);
    expect(synchronizedWoman).toMatchObject({ churchMemberId: woman.id, name: 'Ana María Prueba' });
    expect(synchronizedWoman?.dateOfBirth.slice(0, 10)).toBe('1989-04-17');

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const photoForm = new FormData();
    photoForm.append('file', new Blob([png], { type: 'image/png' }), 'ana-prueba.png');
    const photoUpload = await request(`/files/member-photos/${woman.id}`, { method: 'POST', body: photoForm });
    expect(photoUpload.response.status).toBe(201);
    expect(photoUpload.body).toMatchObject({ memberId: woman.id, hasPhoto: true, version: 1 });

    const photo = await request(`/files/member-photos/${woman.id}`);
    expect(photo.response.status).toBe(200);
    expect(photo.response.headers.get('content-type')).toBe('image/png');
    expect((photo.body as ArrayBuffer).byteLength).toBe(png.length);

    const afterPhoto = await request('/roster/context');
    const updated = (afterPhoto.body as { members: Array<{ id: string; hasPhoto: boolean }> }).members.find((member) => member.id === woman.id);
    expect(updated?.hasPhoto).toBe(true);

    const audit = await request('/audit/events?pageSize=100');
    expect(audit.response.status).toBe(200);
    const actions = (audit.body as { items: Array<{ action: string }> }).items.map((item) => item.action);
    expect(actions).toContain('church_roster.import.previewed');
    expect(actions).toContain('church_roster.import.committed');
    expect(actions).toContain('church_roster.photo.updated');
  });
});
