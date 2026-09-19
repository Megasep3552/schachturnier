'use client';

import type { Spieler } from '@/types';
import { LigaBadge } from '@/components/ui/Badge';

export function Anwesenheit({ players, onToggle }: { players: Spieler[]; onToggle: (id: Spieler['id'], present: boolean) => void }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="mb-4 text-xl font-bold">Anwesenheit für die nächste Runde</h2><p className="mb-6 text-sm text-slate-500">Klicke auf einen Spieler, um ihn als abwesend zu markieren.</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">{players.map((player) => <button type="button" key={player.id} onClick={() => onToggle(player.id, !player.anwesend)} className={`flex items-center justify-between rounded-lg border p-3 text-left transition ${player.anwesend ? 'border-emerald-200 bg-emerald-50' : 'bg-slate-50 opacity-50 grayscale'}`}><span className="text-sm font-medium">{player.name}</span><LigaBadge liga={player.gruppe} /></button>)}</div></div>;
}