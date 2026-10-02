import type { Metadata, Viewport } from 'next';
import './globals.css';
import './responsive.css';
import { ExperienceProvider } from '@/components/experience-provider';
import { UnsavedChangesProvider } from '@/components/unsaved-changes-provider';
import { SessionRecoveryProvider } from '@/components/session-recovery-provider';

export const metadata: Metadata = {
  title: { default: 'GestionChurch', template: '%s · GestionChurch' },
  description: 'Calendario y coordinación de actividades para iglesias.',
  applicationName: 'GestionChurch',
  icons: { icon: '/icon.svg', shortcut: '/icon.svg', apple: '/icon.svg' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  colorScheme: 'light'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body><ExperienceProvider><UnsavedChangesProvider><SessionRecoveryProvider>{children}</SessionRecoveryProvider></UnsavedChangesProvider></ExperienceProvider></body>
    </html>
  );
}
