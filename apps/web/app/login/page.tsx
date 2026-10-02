'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Logo } from '@/components/logo';
import { useExperience } from '@/components/experience-provider';

export default function LoginPage() {
  const { tr } = useExperience();

  const router = useRouter();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ tenant: '', email: '', password: '' });
  const [unlocked, setUnlocked] = useState({ tenant: false, email: false, password: false });

  function unlock(field: keyof typeof form) {
    setUnlocked((current) => current[field] ? current : ({ ...current, [field]: true }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify(form) });
      router.replace('/dashboard');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'No fue posible iniciar sesión.');
    } finally { setLoading(false); }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <Logo />
        <div className="story-copy">
          <span className="overline">{tr("UNA IGLESIA · UN CALENDARIO")}</span>
          <h1>{tr("Más coordinación.")}<br />{tr("Más espacio para la ")}<em>{tr("misión.")}</em></h1>
          <p>{tr("Planifica las actividades de todos los departamentos, anticipa los conflictos y toma decisiones con claridad.")}</p>
          <div className="story-proof"><ShieldCheck /><span><strong>{tr("Datos aislados por iglesia")}</strong><small>{tr("Cada tenant maneja su propia base de datos.")}</small></span></div>
        </div>
        <span className="story-verse">{tr("“Pero hágase todo decentemente y con orden.” · 1 Corintios 14:40")}</span>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-login-logo"><Logo /></div>
          <span className="eyebrow">{tr("Bienvenido")}</span>
          <h2>{tr("Ingresa a tu iglesia")}</h2>
          <p>{tr("Usa tus credenciales de GestionChurch.")}</p>
          <form onSubmit={submit} autoComplete="off" aria-busy={loading}>
            <label>{tr("Iglesia o código")}<input name="gc-tenant-code" value={form.tenant} placeholder={tr("Iglesia o código")} readOnly={!unlocked.tenant} onFocus={() => unlock('tenant')} onChange={(e) => setForm({ ...form, tenant: e.target.value })} autoComplete="off" required /></label>
            <label>{tr("Usuario")}<input name="gc-user-id" type="text" value={form.email} placeholder={tr("Usuario")} readOnly={!unlocked.email} onFocus={() => unlock('email')} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" autoCapitalize="none" spellCheck={false} required /></label>
            <label>{tr("Contraseña")}<span className="password-field"><input name="gc-access-key" type={show ? 'text' : 'password'} value={form.password} placeholder={tr("Contraseña")} readOnly={!unlocked.password} onFocus={() => unlock('password')} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required /><button type="button" onClick={() => setShow(!show)} aria-label={show ? tr("Ocultar contraseña") : tr("Mostrar contraseña")}>{show ? <EyeOff /> : <Eye />}</button></span></label>
            <Link href="/forgot-password" className="form-link">{tr("¿Olvidaste tu contraseña?")}</Link>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button type="submit" className="button button-primary button-wide" disabled={loading}>{loading ? tr("Ingresando…") : <>{tr("Ingresar ")}<ArrowRight size={18} /></>}</button>
          </form>
          <div className="secure-note"><LockKeyhole size={16} />{tr(" Acceso protegido por sesión")}</div>
        </div>
      </section>
    </main>
  );
}
