'use client';

import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { badgeStatusLabel } from '@/lib/i18n';
import { useExperience } from './experience-provider';

export function Badge({ status }: { status: string }) {
  const { tr } = useExperience();
  return <span className={`badge badge-${status.toLowerCase().replaceAll('_', '-')}`} data-status={status}>{tr(badgeStatusLabel(status))}</span>;
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title: string; children: React.ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : tone === 'danger' ? XCircle : Info;
  return <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'} aria-atomic="true"><Icon size={20} aria-hidden="true" /><div><strong>{title}</strong><div>{children}</div></div></div>;
}

export function Empty({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty">{icon}<h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Spinner() { const { tr } = useExperience(); return <div className="spinner" role="status" aria-label={tr('Cargando')} />; }
