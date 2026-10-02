import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing-page';

export const metadata: Metadata = {
  title: { absolute: 'GestionChurch · Coordinación con propósito' },
  description: 'Organiza el calendario, conecta los departamentos y da seguimiento a los programas de tu iglesia con GestionChurch.',
};

export default function Home() {
  return <LandingPage />;
}
