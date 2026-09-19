'use client';

import { Calendar, LockKeyhole, Trash2 } from 'lucide-react';
import type { EntityId, MatchResult, Partie, Spieler } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface VergangeneRundenProps {
  matches: Partie[];
  playerMap: Map<EntityId, Spieler>;
  isAdmin: boolean;
  onSetErgebnis: (id: EntityId, result: Exclude<MatchResult, null>) => void;
  onDeleteRound: (round: number) => void;
}

export function VergangeneRunden({ matches, playerMap, isAdmin, onSetErgebnis, onDeleteRound }: VergangeneRundenProps) {
  const rounds = [...new Set(matches.map((match) => match.runde))].sort((a, b) => b - a);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-2 text-xl font-bold">Vergangene Runden & Archiv</h2>
        <p className="text-sm text-slate-500">{isAdmin ? 'Ergebnisse können korrigiert und komplette Runden gelöscht werden.' : 'Archivansicht im Besucher-Modus.'}</p>
      </div>
      {rounds.length === 0 && <div className="py-10 text-center text-slate-500">Noch keine vergangenen Runden vorhanden.</div>}
      {rounds.map((round) => {
        const roundMatches = matches.filter((match) => match.runde === round);
        const date = roundMatches.find((match) => match.datum)?.datum || 'Kein Datum gespeichert';
        return (
          <section key={round} className="rounded-xl border border-slate-200 bg-slate-100 p-5">
            <div className="mb-4 flex items-center justify-between border-b border-slate-300 pb-3">
              <div>
                <h3 className="text-lg font-bold">Runde {round} der Vereinsmeisterschaft + {date}</h3>
                <span className="flex items-center gap-1 text-sm text-slate-500"><Calendar className="h-4 w-4" />{date}</span>
              </div>
              {isAdmin && <Button variant="danger" onClick={() => onDeleteRound(round)} className="flex items-center gap-2"><Trash2 className="h-4 w-4" />Runde löschen</Button>}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {roundMatches.map((match) => {
                const white = playerMap.get(match.weiss_id);
                const black = match.schwarz_id === null ? null : playerMap.get(match.schwarz_id);
                const editable = isAdmin && match.schwarz_id !== null && match.ergebnis !== 'entschuldigt' && match.ergebnis !== 'unentschuldigt' && match.ergebnis !== 'freispiel' && match.ergebnis !== '1-0 (Freispiel)';
                return (
                  <div key={match.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center justify-between"><Badge>{white?.gruppe || 'Leicht'}</Badge>{!editable && <LockKeyhole className="h-4 w-4 text-slate-400" aria-label="Nur Anzeige" />}<span className="text-xs text-slate-400">{match.ergebnis || 'offen'}</span></div>
                    <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{white?.name || 'Unbekannt'}</span><span className="mx-2 text-xs">vs</span><span className="font-medium">{black?.name || 'Freispiel'}</span></div>
                    {editable ? <div className="grid grid-cols-3 gap-1">{(['1-0', '0.5-0.5', '0-1'] as const).map((result) => <button key={result} onClick={() => onSetErgebnis(match.id, result)} className={`rounded border py-1.5 text-xs ${match.ergebnis === result ? 'bg-emerald-500 text-white' : 'bg-slate-50 hover:bg-slate-200'}`}>{result}</button>)}</div> : <div className="rounded bg-slate-100 py-2 text-center text-xs text-slate-500">Nur Ergebnisanzeige</div>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
