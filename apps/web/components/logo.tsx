import { CalendarHeart } from 'lucide-react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" role="img" aria-label="GestionChurch">
      <span className="brand-mark"><CalendarHeart size={24} strokeWidth={1.8} /></span>
      {!compact && <span><strong>Gestion</strong>Church<small>coordinación con propósito</small></span>}
    </div>
  );
}
