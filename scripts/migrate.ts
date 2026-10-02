import { ensureControlDatabase, migrateControl, provisionTenantDatabase } from '@gc/database/migrations';
import { controlPool } from '@gc/database';

try {
  process.loadEnvFile?.('.env');
} catch {}

const adminUrl = process.env.POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
const controlUrl = process.env.CONTROL_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control';

await ensureControlDatabase(adminUrl);
await migrateControl(controlUrl);

const tenants = await controlPool.query<{ id: string }>('SELECT id FROM control.tenants');
for (const tenant of tenants.rows) await provisionTenantDatabase(adminUrl, tenant.id);

console.log(`Migraciones aplicadas: control + ${tenants.rowCount ?? 0} tenant(s).`);
await controlPool.end();
