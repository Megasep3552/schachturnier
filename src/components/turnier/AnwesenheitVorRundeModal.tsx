'use client';

import type { EntityId, Spieler } from '@/types';
import { Button } from '@/components/ui/Button';

interface AnwesenheitVorRundeModalProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  players: Spieler[];
  step?: 'attendance' | 'classification';
  absentPlayers?: Spieler[];
  attendance: Record<string, boolean>;
  excused: Record<string, boolean>;
  onToggle: (id: EntityId, present: boolean) => void;
  onSetAll: (present: boolean) => void;
  onToggleExcused: (id: EntityId, excused: boolean) => void;
  onClose: () => void;
  onConfirm: (attendance: Record<string, boolean>, excused: Record<string, boolean>) => void | Promise<void>;
}

export function AnwesenheitVorRundeModal({
  open,
  title,
  confirmLabel,
  players,
  step = 'attendance',
  absentPlayers = [],
  attendance,
  excused,
  onToggle,
  onSetAll,
  onToggleExcused,
  onClose,
  onConfirm,
}: AnwesenheitVorRundeModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="anwesenheit-dialog-title">
        <div className="mb-5">
          <h3 id="anwesenheit-dialog-title" className="text-xl font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{step === 'classification' ? 'Klassifiziere die abwesenden Spieler für die Turnierwertung.' : 'Prüfe die anwesenden Spieler, bevor die Auslosung startet.'}</p>
        </div>

        {step === 'attendance' && <div className="mb-4 flex gap-2">
          <Button type="button" variant="secondary" onClick={() => onSetAll(true)}>Alle anwesend</Button>
          <Button type="button" variant="secondary" onClick={() => onSetAll(false)}>Alle abwesend</Button>
        </div>}

        <div className="divide-y rounded-lg border border-slate-200">
          {(step === 'classification' ? absentPlayers : players).map((player) => {
            const present = attendance[String(player.id)] ?? player.anwesend;
            return (
              <label key={player.id} className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-slate-50">
                <span>
                  <span className="block font-medium text-slate-800">{player.name}</span>
                  <span className="text-xs text-slate-500">{player.gruppe || 'Leicht'}{player.dwz ? ` · DWZ ${player.dwz}` : ''}</span>
                </span>
                {step === 'classification' ? <span className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={excused[String(player.id)] ?? false} onChange={(event) => onToggleExcused(player.id, event.target.checked)} className="h-5 w-5 accent-amber-500" />Hat sich abgemeldet (1 Punkt)</span> : <input type="checkbox" checked={present} onChange={(event) => onToggle(player.id, event.target.checked)} className="h-5 w-5 accent-amber-500" />}
              </label>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-3 border-t pt-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Abbrechen</button>
          <Button type="button" onClick={() => void onConfirm(attendance, excused)}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
