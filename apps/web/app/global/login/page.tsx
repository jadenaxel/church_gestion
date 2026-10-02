'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Logo } from '@/components/logo';
import { api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';

export default function GlobalLoginPage() {
  const { tr } = useExperience();

  const router = useRouter(); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [unlocked, setUnlocked] = useState({ email: false, password: false });
  function unlock(field: keyof typeof form) { setUnlocked((current) => current[field] ? current : ({ ...current, [field]: true })); }
  async function submit(e: React.FormEvent) { e.preventDefault(); setLoading(true); setError(''); try { await api('/auth/global/login', { method: 'POST', body: JSON.stringify(form) }); router.replace('/global'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Acceso denegado.'); } finally { setLoading(false); } }
  return <main className="simple-login"><form className="login-card" onSubmit={submit} autoComplete="off" aria-busy={loading}><Logo /><span className="eyebrow">{tr("Plano de control")}</span><h1>{tr("Administración global")}</h1><p>{tr("Acceso restringido a responsables de GestionChurch.")}</p><label>{tr("Usuario")}<input name="gc-global-user" type="text" value={form.email} placeholder={tr("Usuario")} readOnly={!unlocked.email} onFocus={() => unlock('email')} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" autoCapitalize="none" spellCheck={false} required /></label><label>{tr("Contraseña")}<input name="gc-global-access-key" type="password" value={form.password} placeholder={tr("Contraseña")} readOnly={!unlocked.password} onFocus={() => unlock('password')} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required /></label>{error && <div className="form-error" role="alert">{error}</div>}<button type="submit" className="button button-primary button-wide" disabled={loading}>{loading ? tr("Ingresando…") : <>{tr("Ingresar ")}<ArrowRight size={18} /></>}</button></form></main>;
}
