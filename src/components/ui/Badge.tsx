import type { ReactNode } from 'react';

interface BadgeProps { children: ReactNode; tone?: 'green' | 'yellow' | 'red' | 'slate'; }
const tones = { green: 'bg-green-100 text-green-800', yellow: 'bg-yellow-100 text-yellow-800', red: 'bg-red-100 text-red-800', slate: 'bg-slate-100 text-slate-600' };
export function Badge({ children, tone = 'slate' }: BadgeProps) { return <span className={`px-2 py-0.5 text-xs font-semibold rounded ${tones[tone]}`}>{children}</span>; }

export function LigaBadge({ liga }: { liga: string }) {
  const normalized = liga.toLowerCase();
  return <Badge tone={normalized === 'schwer' ? 'red' : normalized === 'mittel' ? 'yellow' : 'green'}>{liga || 'Leicht'}</Badge>;
}