import { controlPool, tenantPoolFromId, closePools } from '../packages/database/src/index.js';
import { attachmentSecuritySql } from '../packages/database/src/attachment-security.js';

// Additive DDL only: does not rewrite users, departments, appointments or files.
try {
  const tenants = await controlPool.query<{ id: string }>(`SELECT id FROM control.tenants WHERE status='ACTIVE'`);
  for (const tenant of tenants.rows) {
    const { pool } = await tenantPoolFromId(tenant.id);
    await pool.query(attachmentSecuritySql);
  }
  console.log(JSON.stringify({ applied: true, tenants: tenants.rowCount, dataModified: false }));
} finally { await closePools(); }
