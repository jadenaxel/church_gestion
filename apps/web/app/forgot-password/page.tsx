'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Logo } from '@/components/logo';
import { api, ApiError } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';

export default function ForgotPasswordPage() {
  const { tr } = useExperience();

  const [form, setForm] = useState({ tenant: '', email: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await api<{ message: string }>('/auth/password/forgot', { method: 'POST', body: JSON.stringify(form) });
      setMessage(result.message);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'No fue posible procesar la solicitud.'); }
    finally { setLoading(false); }
  }
  return <main className="auth-simple"><section className="login-card panel"><Logo /><span className="auth-icon"><MailCheck /></span><span className="eyebrow">{tr("Recuperación segura")}</span><h1>{tr("Restablece tu contraseña")}</h1><p>{tr("Enviaremos un enlace de un solo uso con vigencia de 30 minutos.")}</p>
    {message ? <div className="notice notice-success" role="status"><MailCheck /><div><strong>{tr("Solicitud recibida")}</strong>{message}</div></div> : <form onSubmit={submit}><label>{tr("Iglesia o código")}<input value={form.tenant} onChange={(event) => setForm({ ...form, tenant: event.target.value })} required /></label><label>{tr("Correo electrónico")}<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required /></label>{error && <div className="form-error" role="alert">{error}</div>}<button type="submit" className="button button-primary button-wide" disabled={loading}>{loading ? tr("Enviando…") : tr("Enviar enlace seguro")}</button></form>}
    <Link href="/login" className="form-link"><ArrowLeft size={15} />{tr(" Volver al inicio de sesión")}</Link>
  </section></main>;
}
