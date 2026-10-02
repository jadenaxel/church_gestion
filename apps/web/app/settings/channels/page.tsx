'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageCircle,
  PlugZap,
  Save,
  Send,
  Server,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Logo } from '@/components/logo';
import { Shell } from '@/components/shell';
import { Notice, Spinner } from '@/components/ui';
import { useUnsavedChanges } from '@/components/unsaved-changes-provider';
import { api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';

type Principal = { name: string; roles: string[]; scope: 'global' | 'tenant' };
type Tenant = { id: string; slug: string; name: string };
type ChannelSettings = {
  smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpRequireTls: boolean; smtpUser: string | null;
  hasSmtpPassword: boolean; smtpFromName: string; smtpFromEmail: string;
  whatsappMode: 'simulated' | 'live'; whatsappPhoneNumberId: string | null; hasWhatsappAccessToken: boolean;
  hasWhatsappVerifyToken: boolean; hasWhatsappAppSecret: boolean; whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string; metaGraphVersion: string; webhookUrl: string;
  runtimeMode: 'development' | 'production'; dedicatedEncryptionKey: boolean; publicWebhookReady: boolean;
  emailLastTestStatus: string | null; emailLastTestMessage: string | null; emailLastTestAt: string | null;
  whatsappLastTestStatus: string | null; whatsappLastTestMessage: string | null; whatsappLastTestAt: string | null;
  smtpLastVerifiedStatus: string | null; smtpLastVerifiedMessage: string | null; smtpLastVerifiedAt: string | null;
  whatsappLastVerifiedStatus: string | null; whatsappLastVerifiedMessage: string | null; whatsappLastVerifiedAt: string | null;
  updatedAt: string | null;
};
type SettingsResponse = { tenant: Tenant; settings: ChannelSettings };
type ChannelResult = { channel: string; status: string; message: string; testedAt?: string; verifiedAt?: string };

function StatePill({ status, fallback = 'Sin probar' }: { status: string | null; fallback?: string }) {
  const value = status ?? fallback;
  return <span className={`channel-state ${value.toLowerCase().replaceAll('_', '-').replaceAll(' ', '-')}`}><i />{value}</span>;
}

function SecretInput({ label, value, onChange, configured, clear, onClear, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; configured: boolean; clear: boolean;
  onClear: (value: boolean) => void; placeholder: string;
}) {
  const { tr } = useExperience();

  const [visible, setVisible] = useState(false);
  return <div className="channel-secret-field"><span>{label}{configured && <em><ShieldCheck />{tr(" Configurado")}</em>}</span><div><input aria-label={label} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={configured ? tr("•••••••••••• (sin cambios)") : placeholder} autoComplete="new-password" /><button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? [tr("Ocultar "), label].join('') : [tr("Mostrar "), label].join('')}>{visible ? <EyeOff /> : <Eye />}</button></div>{configured && <label className="channel-clear-secret"><input type="checkbox" checked={clear} onChange={(event) => onClear(event.target.checked)} />{tr(" Eliminar credencial guardada")}</label>}</div>;
}

function ChannelConfiguration() {
  const { tr } = useExperience();

  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [secrets, setSecrets] = useState({ smtpPassword: '', whatsappAccessToken: '', whatsappVerifyToken: '', whatsappAppSecret: '' });
  const [clear, setClear] = useState({ smtpPassword: false, whatsappAccessToken: false, whatsappVerifyToken: false, whatsappAppSecret: false });
  const [testEmail, setTestEmail] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState<ChannelResult | null>(null);

  const suffix = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  useEffect(() => {
    const selectedTenant = new URLSearchParams(window.location.search).get('tenantId') ?? '';
    setTenantId(selectedTenant);
    Promise.all([
      api<{ user: Principal }>('/me'),
      api<SettingsResponse>(`/notifications/channels/settings${selectedTenant ? `?tenantId=${encodeURIComponent(selectedTenant)}` : ''}`)
    ]).then(([identity, response]) => {
      if (identity.user.scope === 'tenant' && !identity.user.roles.includes('TENANT_ADMIN')) throw new Error('Esta configuración está reservada para administradores del tenant.');
      setPrincipal(identity.user); setTenant(response.tenant); setSettings(response.settings);
      setTestEmail(response.settings.smtpFromEmail);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'No fue posible cargar la configuración de canales.'));
  }, []);

  const readiness = useMemo(() => ({
    email: Boolean(settings?.smtpHost && settings.smtpPort && settings.smtpFromEmail && settings.smtpLastVerifiedStatus === 'VERIFIED' && settings.emailLastTestStatus === 'SENT'),
    whatsapp: Boolean(settings?.whatsappMode === 'live' && settings.publicWebhookReady && settings.whatsappPhoneNumberId
      && settings.hasWhatsappAccessToken && settings.hasWhatsappVerifyToken && settings.hasWhatsappAppSecret
      && settings.whatsappTemplateName && settings.whatsappLastVerifiedStatus === 'VERIFIED'
      && ['SENT', 'DELIVERED', 'READ'].includes(settings.whatsappLastTestStatus ?? ''))
  }), [settings]);

  function change(patch: Partial<ChannelSettings>) {
    setSettings((current) => current ? { ...current, ...patch } : current);
    setDirty(true); setMessage(''); setError(''); setTestResult(null);
  }

  function changeSecret(key: keyof typeof secrets, value: string) {
    setSecrets((current) => ({ ...current, [key]: value }));
    setClear((current) => ({ ...current, [key]: false }));
    setDirty(true); setMessage('');
  }

  function clearSecret(key: keyof typeof clear, value: boolean) {
    setClear((current) => ({ ...current, [key]: value }));
    if (value) setSecrets((current) => ({ ...current, [key]: '' }));
    setDirty(true); setMessage('');
  }

  async function save() {
    if (!settings) return;
    setBusy('save'); setError(''); setMessage('');
    try {
      const payload = {
        smtpHost: settings.smtpHost, smtpPort: Number(settings.smtpPort), smtpSecure: settings.smtpSecure,
        smtpRequireTls: settings.smtpRequireTls, smtpUser: settings.smtpUser || null,
        smtpFromName: settings.smtpFromName, smtpFromEmail: settings.smtpFromEmail,
        whatsappMode: settings.whatsappMode, whatsappPhoneNumberId: settings.whatsappPhoneNumberId || null,
        whatsappTemplateName: settings.whatsappTemplateName || null, whatsappTemplateLanguage: settings.whatsappTemplateLanguage,
        metaGraphVersion: settings.metaGraphVersion,
        ...(secrets.smtpPassword ? { smtpPassword: secrets.smtpPassword } : {}), clearSmtpPassword: clear.smtpPassword,
        ...(secrets.whatsappAccessToken ? { whatsappAccessToken: secrets.whatsappAccessToken } : {}), clearWhatsappAccessToken: clear.whatsappAccessToken,
        ...(secrets.whatsappVerifyToken ? { whatsappVerifyToken: secrets.whatsappVerifyToken } : {}), clearWhatsappVerifyToken: clear.whatsappVerifyToken,
        ...(secrets.whatsappAppSecret ? { whatsappAppSecret: secrets.whatsappAppSecret } : {}), clearWhatsappAppSecret: clear.whatsappAppSecret
      };
      const response = await api<SettingsResponse>(`/notifications/channels/settings${suffix}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setSettings(response.settings); setSecrets({ smtpPassword: '', whatsappAccessToken: '', whatsappVerifyToken: '', whatsappAppSecret: '' });
      setClear({ smtpPassword: false, whatsappAccessToken: false, whatsappVerifyToken: false, whatsappAppSecret: false });
      setDirty(false); setMessage('Configuración cifrada y guardada. Valida la conexión y ejecuta una entrega real antes de publicar.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible guardar la configuración.'); }
    finally { setBusy(''); }
  }

  async function test(channel: 'email' | 'whatsapp') {
    if (dirty) { setError('Guarda los cambios antes de probar el canal.'); return; }
    setBusy(channel); setError(''); setMessage(''); setTestResult(null);
    try {
      const body = channel === 'email' ? { recipient: testEmail } : { phone: testPhone };
      const response = await api<ChannelResult>(`/notifications/channels/test/${channel}${suffix}`, { method: 'POST', body: JSON.stringify(body) });
      setTestResult(response);
      setSettings((current) => current ? { ...current,
        ...(channel === 'email' ? { emailLastTestStatus: response.status, emailLastTestMessage: response.message, emailLastTestAt: response.testedAt ?? null }
          : { whatsappLastTestStatus: response.status, whatsappLastTestMessage: response.message, whatsappLastTestAt: response.testedAt ?? null }) } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible ejecutar la prueba.'); }
    finally { setBusy(''); }
  }

  async function verify(channel: 'email' | 'whatsapp') {
    if (dirty) { setError('Guarda los cambios antes de validar la conexión.'); return; }
    setBusy(`verify-${channel}`); setError(''); setMessage(''); setTestResult(null);
    try {
      const response = await api<ChannelResult>(`/notifications/channels/verify/${channel}${suffix}`, { method: 'POST' });
      setTestResult(response);
      setSettings((current) => current ? { ...current,
        ...(channel === 'email'
          ? { smtpLastVerifiedStatus: response.status, smtpLastVerifiedMessage: response.message, smtpLastVerifiedAt: response.verifiedAt ?? null }
          : { whatsappLastVerifiedStatus: response.status, whatsappLastVerifiedMessage: response.message, whatsappLastVerifiedAt: response.verifiedAt ?? null })
      } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible validar la conexión.'); }
    finally { setBusy(''); }
  }

  async function copyWebhook() {
    if (!settings) return;
    await navigator.clipboard.writeText(settings.webhookUrl);
    setMessage('URL del webhook copiada al portapapeles.');
  }

  if (!settings && !error) return <div className="channel-loading"><Spinner /></div>;

  const content = <>
    {error && <Notice tone="danger" title={tr("No fue posible completar la acción")}>{error}</Notice>}
    {message && <Notice tone="success" title={tr("Configuración actualizada")}>{message}</Notice>}
    {testResult && <Notice tone={testResult.status === 'FAILED' ? 'danger' : testResult.status === 'SIMULATED' ? 'warning' : 'success'} title={[tr("Resultado: "), testResult.status.toLowerCase()].join('')}>{testResult.message}</Notice>}
    {settings && <>
      <section className="channel-hero">
        <div><span><Sparkles />{tr(" Centro de comunicaciones")}</span><h2>{tr("Configura, prueba y supervisa tus canales.")}</h2><p>{tr("Conecta la infraestructura de tu iglesia, valida cada proveedor y confirma una entrega real. Los secretos permanecen cifrados y cada operación queda auditada.")}</p></div>
        <div className="channel-hero-score"><ShieldCheck /><small>{tr("Entorno")}</small><strong>{settings.runtimeMode === 'production' ? tr("Producción") : tr("Desarrollo")}</strong><span>{settings.dedicatedEncryptionKey ? tr("Clave dedicada activa") : tr("Configura la clave de producción")}</span><span>{tr("Solo admins")}</span><span>{tr("Auditoría activa")}</span></div>
      </section>

      <section className="channel-summary-grid">
        <article><span className={`channel-summary-icon ${readiness.email ? 'ready' : ''}`}><Mail /></span><div><small>{tr("Correo transaccional")}</small><strong>{readiness.email ? tr("Operativo") : tr("Validación pendiente")}</strong><StatePill status={settings.smtpLastVerifiedStatus} fallback={tr("Sin validar")} /></div></article>
        <article><span className={`channel-summary-icon ${readiness.whatsapp ? 'ready' : ''}`}><MessageCircle /></span><div><small>{tr("WhatsApp Cloud API")}</small><strong>{settings.whatsappMode === 'live' ? readiness.whatsapp ? tr("Operativo") : tr("Validación pendiente") : tr("Desactivado")}</strong><StatePill status={settings.whatsappLastVerifiedStatus} fallback={tr("Sin validar")} /></div></article>
        <article><span className={`channel-summary-icon ${settings.dedicatedEncryptionKey ? 'ready' : ''}`}><LockKeyhole /></span><div><small>{tr("Protección")}</small><strong>{tr("AES-256-GCM")}</strong><span className={`channel-state ${settings.dedicatedEncryptionKey ? 'verified' : 'failed'}`}><i />{settings.dedicatedEncryptionKey ? tr("Clave dedicada") : tr("Clave requerida en producción")}</span></div></article>
      </section>

      <div className="channel-provider-grid">
        <section className="panel channel-provider-card">
          <header><span className="provider-mark email"><Mail /></span><div><span className="eyebrow">{tr("Proveedor SMTP")}</span><h2>{tr("Correo electrónico")}</h2><p>{tr("Compatible con Microsoft 365, Google Workspace, SendGrid, Mailgun y servidores SMTP.")}</p></div><StatePill status={settings.smtpLastVerifiedStatus} fallback={tr("Sin validar")} /></header>
          <div className="channel-form-grid">
            <label className="field-span">{tr("Servidor SMTP")}<input value={settings.smtpHost} onChange={(event) => change({ smtpHost: event.target.value })} placeholder={tr("smtp.office365.com")} /></label>
            <label>{tr("Puerto")}<input type="number" min={1} max={65535} value={settings.smtpPort} onChange={(event) => change({ smtpPort: Number(event.target.value) })} /></label>
            <label>{tr("Usuario")}<input value={settings.smtpUser ?? ''} onChange={(event) => change({ smtpUser: event.target.value || null })} placeholder={tr("notificaciones@iglesia.org")} /></label>
            <label className="field-span">{tr("Nombre del remitente")}<input value={settings.smtpFromName} onChange={(event) => change({ smtpFromName: event.target.value })} /></label>
            <label className="field-span">{tr("Correo remitente")}<input type="email" value={settings.smtpFromEmail} onChange={(event) => change({ smtpFromEmail: event.target.value })} /></label>
            <SecretInput label={tr("Contraseña o API key")} value={secrets.smtpPassword} onChange={(value) => changeSecret('smtpPassword', value)} configured={settings.hasSmtpPassword} clear={clear.smtpPassword} onClear={(value) => clearSecret('smtpPassword', value)} placeholder={tr("Credencial SMTP")} />
            <div className="channel-checks field-span"><label><input type="checkbox" checked={settings.smtpSecure} onChange={(event) => change({ smtpSecure: event.target.checked })} /><span><strong>{tr("SSL/TLS directo")}</strong><small>{tr("Usualmente puerto 465")}</small></span></label><label><input type="checkbox" checked={settings.smtpRequireTls} onChange={(event) => change({ smtpRequireTls: event.target.checked })} /><span><strong>{tr("Requerir STARTTLS")}</strong><small>{tr("Recomendado para puerto 587")}</small></span></label></div>
          </div>
          <footer className="channel-test-zone"><div><PlugZap /><span><strong>{tr("Verificación y entrega real")}</strong><small>{tr("Primero valida DNS, TLS y autenticación; luego confirma una entrega al destinatario.")}</small></span></div><div className="channel-test-actions"><input aria-label={tr("Destinatario de prueba SMTP")} type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder={tr("destinatario@correo.com")} /><button type="button" className="button button-secondary" disabled={busy !== ''} onClick={() => void verify('email')}><ShieldCheck /> {busy === 'verify-email' ? tr("Validando…") : tr("Validar conexión")}</button><button type="button" className="button button-primary" disabled={busy !== '' || !testEmail || settings.smtpLastVerifiedStatus !== 'VERIFIED'} onClick={() => void test('email')}><Send /> {busy === 'email' ? tr("Enviando…") : tr("Enviar correo real")}</button></div>{settings.smtpLastVerifiedMessage && <p>{settings.smtpLastVerifiedMessage}</p>}{settings.emailLastTestMessage && <p>{settings.emailLastTestMessage}</p>}</footer>
        </section>

        <section className="panel channel-provider-card">
          <header><span className="provider-mark whatsapp"><MessageCircle /></span><div><span className="eyebrow">{tr("Meta Cloud API")}</span><h2>{tr("WhatsApp")}</h2><p>{tr("Plantillas aprobadas, consentimiento E.164 y estados de entrega mediante webhook firmado.")}</p></div><StatePill status={settings.whatsappLastVerifiedStatus} fallback={tr("Sin validar")} /></header>
          <div className="channel-mode-toggle"><button type="button" className={settings.whatsappMode === 'simulated' ? 'active' : ''} onClick={() => change({ whatsappMode: 'simulated' })}>{tr("Desactivado ")}<small>{tr("No genera entregas externas")}</small></button><button type="button" className={settings.whatsappMode === 'live' ? 'active live' : ''} onClick={() => change({ whatsappMode: 'live' })}>{tr("Producción real ")}<small>{tr("Meta WhatsApp Cloud API")}</small></button></div>
          <div className="channel-form-grid">
            <label>{tr("Phone Number ID")}<input value={settings.whatsappPhoneNumberId ?? ''} onChange={(event) => change({ whatsappPhoneNumberId: event.target.value || null })} placeholder="123456789012345" /></label>
            <label>{tr("Versión Graph API")}<input value={settings.metaGraphVersion} onChange={(event) => change({ metaGraphVersion: event.target.value })} placeholder={tr("v23.0")} /></label>
            <label>{tr("Plantilla aprobada")}<input value={settings.whatsappTemplateName ?? ''} onChange={(event) => change({ whatsappTemplateName: event.target.value || null })} placeholder={tr("gestionchurch_alerta")} /></label>
            <label>{tr("Idioma")}<select value={settings.whatsappTemplateLanguage} onChange={(event) => change({ whatsappTemplateLanguage: event.target.value })}><option value="es">{tr("Español (es)")}</option><option value="es_DO">{tr("Español RD (es_DO)")}</option><option value="en_US">{tr("English (en_US)")}</option><option value="fr">{tr("Français (fr)")}</option></select></label>
            <SecretInput label={tr("Access token")} value={secrets.whatsappAccessToken} onChange={(value) => changeSecret('whatsappAccessToken', value)} configured={settings.hasWhatsappAccessToken} clear={clear.whatsappAccessToken} onClear={(value) => clearSecret('whatsappAccessToken', value)} placeholder={tr("Token permanente de Meta")} />
            <SecretInput label={tr("Verify token")} value={secrets.whatsappVerifyToken} onChange={(value) => changeSecret('whatsappVerifyToken', value)} configured={settings.hasWhatsappVerifyToken} clear={clear.whatsappVerifyToken} onClear={(value) => clearSecret('whatsappVerifyToken', value)} placeholder={tr("Token privado del webhook")} />
            <SecretInput label={tr("App secret")} value={secrets.whatsappAppSecret} onChange={(value) => changeSecret('whatsappAppSecret', value)} configured={settings.hasWhatsappAppSecret} clear={clear.whatsappAppSecret} onClear={(value) => clearSecret('whatsappAppSecret', value)} placeholder={tr("Secreto de la aplicación Meta")} />
            <div className={`channel-webhook field-span ${settings.publicWebhookReady ? 'ready' : 'warning'}`}><span><Server /><span><strong>{tr("Webhook HTTPS público del tenant")}</strong><small>{settings.webhookUrl}</small></span></span><button type="button" onClick={() => void copyWebhook()}><Copy />{tr(" Copiar")}</button><em>{settings.publicWebhookReady ? tr("Accesible por Meta") : tr("Configura PUBLIC_API_URL con HTTPS público")}</em></div>
          </div>
          <footer className="channel-test-zone"><div><PlugZap /><span><strong>{tr("Validación directa con Meta")}</strong><small>{tr("Confirma credenciales, número empresarial y una entrega real en formato E.164.")}</small></span></div><div className="channel-test-actions"><input aria-label={tr("Número de prueba WhatsApp")} value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="+18095551234" /><button type="button" className="button button-secondary" disabled={busy !== '' || settings.whatsappMode !== 'live' || !settings.publicWebhookReady} onClick={() => void verify('whatsapp')}><ShieldCheck /> {busy === 'verify-whatsapp' ? tr("Validando…") : tr("Validar con Meta")}</button><button type="button" className="button button-primary" disabled={busy !== '' || !testPhone || settings.whatsappLastVerifiedStatus !== 'VERIFIED'} onClick={() => void test('whatsapp')}><Send /> {busy === 'whatsapp' ? tr("Enviando…") : tr("Enviar WhatsApp real")}</button></div>{settings.whatsappLastVerifiedMessage && <p>{settings.whatsappLastVerifiedMessage}</p>}{settings.whatsappLastTestMessage && <p>{settings.whatsappLastTestMessage}</p>}</footer>
        </section>
      </div>

      <div className="channel-savebar"><div><KeyRound /><span><strong>{dirty ? tr("Hay cambios sin guardar") : tr("Configuración sincronizada")}</strong><small>{dirty ? tr("Guarda antes de ejecutar una prueba.") : tr("Las credenciales nunca se devuelven al navegador.")}</small></span></div><button type="button" className="button button-primary" disabled={!dirty || busy !== ''} onClick={() => void save()}><Save /> {busy === 'save' ? tr("Guardando…") : tr("Guardar configuración")}</button></div>
    </>}
  </>;

  if (principal?.scope === 'global') return <main className="global-page channel-global-page"><header className="global-header"><Logo /><div><span className="eyebrow">{tr("Administración global · ")}{tenant?.slug}</span><h1>{tr("Canales de ")}{tenant?.name}</h1></div><Link className="button button-secondary" href="/global"><ArrowLeft />{tr(" Volver a tenants")}</Link></header><div className="global-content">{content}</div></main>;
  return <Shell title={tr("Configuración")} eyebrow={[tr("Canales · "), tenant?.name ?? 'Tenant'].join('')}>{content}</Shell>;
}

export default function ChannelSettingsPage() {
  return <ChannelConfiguration />;
}
