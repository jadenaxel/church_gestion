'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Logo } from '@/components/logo';
import { api, ApiError } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';

export default function ResetPasswordPage() {
  const { tr } = useExperience();

  const [form, setForm] = useState({ tenant: '', token: '', newPassword: '', confirm: '' });
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setForm((current) => ({ ...current, tenant: query.get('tenant') ?? '', token: query.get('token') ?? '' }));
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (form.newPassword !== form.confirm) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    try {
      await api('/auth/password/reset', { method: 'POST', body: JSON.stringify({ tenant: form.tenant, token: form.token, newPassword: form.newPassword }) });
      setDone(true);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'El enlace no es válido o ha vencido.'); }
    finally { setLoading(false); }
  }
  return <main className="auth-simple"><section className="login-card panel"><Logo /><span className="auth-icon"><KeyRound /></span><span className="eyebrow">{tr("Nueva credencial")}</span><h1>{tr("Crea una contraseña segura")}</h1>
    {done ? <div className="auth-success"><CheckCircle2 /><h2>{tr("Contraseña actualizada")}</h2><p>{tr("Todas tus sesiones anteriores fueron cerradas.")}</p><Link href="/login" className="button button-primary button-wide">{tr("Ingresar")}</Link></div> : !form.token ? <div className="auth-success"><p role="status">{tr("Necesitas un enlace de recuperación para cambiar tu contraseña.")}</p><Link href="/forgot-password" className="button button-primary button-wide">{tr("Solicitar enlace de recuperación")}</Link><Link href="/login" className="form-link">{tr("Volver al inicio de sesión")}</Link></div> : <form onSubmit={submit} aria-busy={loading}><label>{tr("Iglesia o código")}<input value={form.tenant} onChange={(event) => setForm({ ...form, tenant: event.target.value })} required /></label><label>{tr("Nueva contraseña")}<input type="password" minLength={12} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} autoComplete="new-password" required /><small>{tr("Mínimo 12 caracteres.")}</small></label><label>{tr("Confirmar contraseña")}<input type="password" minLength={12} value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} autoComplete="new-password" required /></label>{error && <div className="form-error" role="alert">{error}</div>}<button type="submit" className="button button-primary button-wide" disabled={loading || !form.token}>{loading ? tr("Actualizando…") : tr("Guardar contraseña")}</button></form>}
  </section></main>;
}
