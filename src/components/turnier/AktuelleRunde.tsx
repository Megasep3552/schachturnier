'use client';

import React, { useState } from 'react';
import { CheckCircle2, Info, LockKeyhole, Trophy } from 'lucide-react';
import type { AuslosungVorschlag, EntityId, Partie, Spieler } from '@/types';
import { Button } from '@/components/ui/Button';
import { generiereAuslosungsVorschlaege } from '@/services/tournamentLogic';
import { AnwesenheitVorRundeModal } from '@/components/turnier/AnwesenheitVorRundeModal';

interface NachauslosungsOption {
  id: string;
  titel: string;
  beschreibung: string;
  partie: Omit<Partie, 'id'>;
  replaceMatchId?: EntityId;
  removeMatchIds?: EntityId[];
}

type AttendanceDecision = {
  players: Spieler[];
  previousPlayers: Spieler[];
};

type AbsenceClassification = {
  players: Spieler[];
  previousPlayers: Spieler[];
  updatedPlayers: Spieler[];
};

function ErgebnisButtons({
  partie,
  onSetErgebnis,
  readOnly = false,
}: {
  partie: Partie;
  onSetErgebnis: (id: EntityId, result: Exclude<Partie['ergebnis'], null>) => void;
  readOnly?: boolean;
}) {
  if (partie.schwarz_id === null) {
    return (
      <div className="mt-2 rounded bg-slate-100 py-2 text-center text-xs font-semibold text-slate-500">
        Freilos (1 Punkt)
      </div>
    );
  }

  return (
    <div className="mt-2 grid grid-cols-3 gap-1">
      {(['1-0', '0.5-0.5', '0-1'] as const).map((result) => (
        <button
          key={result}
          onClick={() => onSetErgebnis(partie.id, result)}
          disabled={readOnly}
          className={`rounded border py-1.5 text-xs font-medium ${
            partie.ergebnis === result
              ? 'border-emerald-600 bg-emerald-500 text-white'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {result === '0.5-0.5' ? '½-½' : result}
        </button>
      ))}
    </div>
  );
}

interface AktuelleRundeProps {
  round: number;
  matches: Partie[];
  allMatches: Partie[];
  playerMap: Map<EntityId, Spieler>;
  spielerList: Spieler[];
  onNextRound: (vorschlag?: AuslosungVorschlag | null, playersForRound?: Spieler[], absenceResults?: Record<string, 'entschuldigt' | 'unentschuldigt'>) => void;
  onSetErgebnis: (id: EntityId, result: Exclude<Partie['ergebnis'], null>) => void;
  onSaveAttendance: (attendance: Record<string, boolean>) => Promise<Spieler[]>;
  onAddLateMatch: (partie: Omit<Partie, 'id'>, replaceMatchId?: EntityId, removeMatchIds?: EntityId[]) => Promise<void>;
  onCompleteRound: (round: number) => Promise<void>;
  onRerollRound: (playersForRound: Spieler[]) => Promise<void>;
  onSmartAdjustRound: (previousPlayers: Spieler[], playersForRound: Spieler[]) => Promise<void>;
  onClassifyAbsences: (previousPlayers: Spieler[], playersForRound: Spieler[], statuses: Record<string, 'entschuldigt' | 'unentschuldigt'>) => void | Promise<void>;
  isAdmin: boolean;
  loading: boolean;
}

export function AktuelleRunde({
  round,
  matches,
  allMatches = [],
  playerMap,
  spielerList,
  onNextRound,
  onSetErgebnis,
  onSaveAttendance,
  onAddLateMatch,
  onCompleteRound,
  onRerollRound,
  onSmartAdjustRound,
  onClassifyAbsences,
  isAdmin,
  loading,
}: AktuelleRundeProps) {
  const [vorschlaege, setVorschlaege] = useState<AuslosungVorschlag[]>([]);
  const [selectedVorschlag, setSelectedVorschlag] = useState<AuslosungVorschlag | null>(null);
  const [attendanceMode, setAttendanceMode] = useState<'round' | 'late' | null>(null);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [nachauslosungen, setNachauslosungen] = useState<NachauslosungsOption[]>([]);
  const [selectedNachauslosung, setSelectedNachauslosung] = useState<NachauslosungsOption | null>(null);
  const [selectedRound, setSelectedRound] = useState(round);
  const [editingRound, setEditingRound] = useState<number | null>(null);
  const [playersForNextRound, setPlayersForNextRound] = useState<Spieler[] | null>(null);
  const [absenceStep, setAbsenceStep] = useState<'attendance' | 'classification'>('attendance');
  const [absentPlayers, setAbsentPlayers] = useState<Spieler[]>([]);
  const [excused, setExcused] = useState<Record<string, boolean>>({});
  const [absenceResults, setAbsenceResults] = useState<Record<string, 'entschuldigt' | 'unentschuldigt'>>({});
  const [attendanceDecision, setAttendanceDecision] = useState<AttendanceDecision | null>(null);
  const [absenceClassification, setAbsenceClassification] = useState<AbsenceClassification | null>(null);
  const [absenceStatuses, setAbsenceStatuses] = useState<Record<string, 'entschuldigt' | 'unentschuldigt'>>({});

  const roundNumbers = [...new Set([round, ...allMatches.map((match) => match.runde)])].sort((a, b) => a - b);
  const selectedMatches = allMatches.filter((match) => match.runde === selectedRound);
  const selectedDate = selectedMatches.find((match) => match.datum)?.datum || 'Kein Datum gespeichert';
  const selectedIsActive = selectedRound === round;
  const selectedIsCompleted = selectedMatches.length > 0 && selectedMatches.every((match) => match.isCompleted === true);
  const selectedHasAllResults = selectedMatches.length > 0 && selectedMatches.every((match) => match.schwarz_id === null || (match.status === 'beendet' && Boolean(match.ergebnis)));
  const selectedHistoricalCompleted = !selectedIsActive && selectedHasAllResults;
  const selectedReadOnly = selectedHistoricalCompleted && editingRound !== selectedRound;
  const latestRound = roundNumbers[roundNumbers.length - 1] ?? round;
  const latestRoundMatches = allMatches.filter((match) => match.runde === latestRound);
  const latestRoundCompleted = latestRoundMatches.length > 0 && latestRoundMatches.every((match) => match.isCompleted === true);
  const showCompletedActiveBanner = selectedIsActive && selectedRound === latestRound && latestRoundCompleted;
  const freispielMatches = selectedMatches.filter((match) => match.ergebnis === 'freispiel' || match.ergebnis === '1-0 (Freispiel)');
  const excusedMatches = selectedMatches.filter((match) => match.ergebnis === 'entschuldigt');
  const unexcusedMatches = selectedMatches.filter((match) => match.ergebnis === 'unentschuldigt');
  const regularMatches = selectedMatches.filter((match) => !['entschuldigt', 'unentschuldigt', 'freispiel', '1-0 (Freispiel)'].includes(match.ergebnis ?? ''));
  const getSpecialStatusNames = (specialMatches: Partie[]) => specialMatches.map((match) => playerMap.get(match.weiss_id)?.name || 'Unbekannt');
  const leagues = [...new Set(regularMatches.map((match) => playerMap.get(match.weiss_id)?.gruppe || 'Leicht'))];

  const openAttendanceModal = (mode: 'round' | 'late') => {
    if (!isAdmin) return;
    setAttendance(Object.fromEntries(spielerList.map((player) => [String(player.id), player.anwesend])));
    setAttendanceMode(mode);
    setAbsenceStep('attendance');
  };

  const handleAttendanceConfirm = async (confirmedAttendance: Record<string, boolean>, confirmedExcused: Record<string, boolean>) => {
    const mode = attendanceMode;
    const previousPlayers = spielerList;
    const updatedPlayers = await onSaveAttendance(confirmedAttendance);
    const anwesend = updatedPlayers.filter((player) => player.anwesend);
    const currentAbsentPlayers = updatedPlayers.filter((player) => !player.anwesend);

    if (mode === 'round' && absenceStep === 'attendance') {
      setAbsentPlayers(currentAbsentPlayers);
      setExcused(Object.fromEntries(currentAbsentPlayers.map((player) => [String(player.id), false])));
      setPlayersForNextRound(updatedPlayers);
      if (currentAbsentPlayers.length > 0) {
        setAbsenceStep('classification');
        return;
      }
    }

    setAttendanceMode(null);

    if (mode === 'late') {
      const removedPlayers = updatedPlayers.filter((player, index) => previousPlayers[index]?.anwesend && !player.anwesend);
      if (removedPlayers.length > 0) {
        setAbsenceClassification({ players: removedPlayers, previousPlayers, updatedPlayers });
        setAbsenceStatuses(Object.fromEntries(removedPlayers.map((player) => [String(player.id), 'unentschuldigt'])));
        return;
      }
      if (matches.length > 0 && updatedPlayers.some((player, index) => player.anwesend !== previousPlayers[index]?.anwesend)) {
        setAttendanceDecision({ players: updatedPlayers, previousPlayers });
        return;
      }
      const dummyMatches = matches.filter((match) => match.ergebnis === 'entschuldigt' || match.ergebnis === 'unentschuldigt');
      const matchedPlayerIds = new Set(matches.filter((match) => !dummyMatches.includes(match)).flatMap((match) => [match.weiss_id, match.schwarz_id].filter((id): id is EntityId => id !== null)));
      const nachzuegler = anwesend.filter((player) => !matchedPlayerIds.has(player.id));
      const freilosMatches = matches.filter((match) => match.schwarz_id === null && (match.ergebnis === '1-0 (Freispiel)' || match.ergebnis === null));
      const freilosSpieler = freilosMatches.map((match) => playerMap.get(match.weiss_id)).filter((player): player is Spieler => Boolean(player));
      const options: NachauslosungsOption[] = [];
      const date = matches.find((match) => match.datum)?.datum || new Date().toLocaleDateString('de-DE');

      if (freilosSpieler[0] && nachzuegler[0]) {
        options.push({
          id: 'freilos-nachzuegler',
          titel: 'Freilos-Spieler gegen Nachzügler paaren',
          beschreibung: `${freilosSpieler[0].name} spielt statt des Freiloses gegen ${nachzuegler[0].name}. Die bestehende Partie wird umgewandelt.`,
          partie: { runde: round, datum: date, weiss_id: freilosSpieler[0].id, schwarz_id: nachzuegler[0].id, ergebnis: null, status: 'offen' },
          replaceMatchId: freilosMatches[0]?.id,
          removeMatchIds: nachzuegler[0] ? matches.filter((match) => (match.ergebnis === 'entschuldigt' || match.ergebnis === 'unentschuldigt') && match.weiss_id === nachzuegler[0].id).map((match) => match.id) : [],
        });
      }
      if (nachzuegler.length >= 2) {
        options.push({
          id: 'nachzuegler-gegen-nachzuegler',
          titel: 'Nachzügler gegeneinander paaren',
          beschreibung: `${nachzuegler[0].name} spielt gegen ${nachzuegler[1].name}.`,
          partie: { runde: round, datum: date, weiss_id: nachzuegler[0].id, schwarz_id: nachzuegler[1].id, ergebnis: null, status: 'offen' },
          removeMatchIds: matches.filter((match) => (match.ergebnis === 'entschuldigt' || match.ergebnis === 'unentschuldigt') && (match.weiss_id === nachzuegler[0].id || match.weiss_id === nachzuegler[1].id)).map((match) => match.id),
        });
      }
      if (nachzuegler.length === 1 && freilosSpieler.length === 0) {
        const dummyMatch = matches.find((match) => (match.ergebnis === 'entschuldigt' || match.ergebnis === 'unentschuldigt') && match.weiss_id === nachzuegler[0].id);
        options.push({
          id: 'nachzuegler-freispiel',
          titel: 'Freispiel für den Nachzügler',
          beschreibung: `${nachzuegler[0].name} erhält ein Freispiel (4 Punkte).`,
          partie: { runde: round, datum: date, weiss_id: nachzuegler[0].id, schwarz_id: null, ergebnis: 'freispiel', status: 'beendet' },
          replaceMatchId: dummyMatch?.id,
        });
      }
      if (options.length > 0) {
        setNachauslosungen(options);
        setSelectedNachauslosung(options[0]);
      }
      return;
    }

    const nextAbsenceResults = Object.fromEntries(currentAbsentPlayers.map((player) => [String(player.id), confirmedExcused[String(player.id)] ? 'entschuldigt' : 'unentschuldigt'])) as Record<string, 'entschuldigt' | 'unentschuldigt'>;
    setAbsenceResults(nextAbsenceResults);
    setPlayersForNextRound(updatedPlayers);
    const options = generiereAuslosungsVorschlaege(anwesend, allMatches);

    if (options.length > 0) {
      setVorschlaege(options);
      setSelectedVorschlag(options[0]);
    } else {
      onNextRound(null, updatedPlayers, nextAbsenceResults);
    }
  };

  const fuehreAuslosungAus = (vorschlag: AuslosungVorschlag | null) => {
    setVorschlaege([]);
    onNextRound(vorschlag, playersForNextRound ?? undefined, absenceResults);
  };

  const fuehreNachauslosungAus = async () => {
    if (!selectedNachauslosung) return;
    await onAddLateMatch(selectedNachauslosung.partie, selectedNachauslosung.replaceMatchId, selectedNachauslosung.removeMatchIds);
    setNachauslosungen([]);
    setSelectedNachauslosung(null);
  };

  const completeSelectedRound = async () => {
    if (!selectedIsActive || !selectedHasAllResults) return;
    await onCompleteRound(selectedRound);
  };

  const handleReroll = async () => {
    if (!attendanceDecision) return;
    await onRerollRound(attendanceDecision.players);
    setAttendanceDecision(null);
  };

  const handleSmartAdjustment = async () => {
    if (!attendanceDecision) return;
    await onSmartAdjustRound(attendanceDecision.previousPlayers, attendanceDecision.players);
    setAttendanceDecision(null);
  };

  const confirmAbsenceClassification = async () => {
    if (!absenceClassification) return;
    await onClassifyAbsences(absenceClassification.previousPlayers, absenceClassification.updatedPlayers, absenceStatuses);
    setAbsenceClassification(null);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <label htmlFor="runde-auswahl" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Runde anzeigen</label>
            <select id="runde-auswahl" value={selectedRound} onChange={(event) => { setSelectedRound(Number(event.target.value)); setEditingRound(null); }} className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800">
              {roundNumbers.map((roundNumber) => <option key={roundNumber} value={roundNumber}>Runde {roundNumber}{roundNumber === round ? ' (aktiv)' : ''}</option>)}
            </select>
          </div>
          {!selectedIsActive && selectedIsCompleted && <button type="button" onClick={() => setEditingRound(selectedRound)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Runde {selectedRound} bearbeiten</button>}
          {isAdmin && selectedIsActive && selectedHasAllResults && !selectedIsCompleted && !showCompletedActiveBanner && <Button onClick={() => void completeSelectedRound()} disabled={loading} className="bg-emerald-600 text-white hover:bg-emerald-700">Runde {selectedRound} abschließen</Button>}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Runde {selectedRound} der Vereinsmeisterschaft + {selectedDate}</h2>
          <p className="mt-1 text-sm text-slate-500">{selectedIsActive ? 'Auslosung und Ergebnisse der aktiven Runde.' : selectedReadOnly ? 'Diese abgeschlossene Runde ist schreibgeschützt.' : 'Historische Runde bearbeiten.'}</p>
        </div>
        {isAdmin && selectedIsActive && !showCompletedActiveBanner && selectedMatches.length === 0 && spielerList.length > 0 && <Button onClick={() => openAttendanceModal('round')} disabled={loading} className="mt-5 w-full bg-amber-500 py-3 text-base font-semibold text-slate-950 hover:bg-amber-600">Runde {selectedRound} starten</Button>}
        {isAdmin && selectedIsActive && !showCompletedActiveBanner && selectedMatches.length > 0 && <Button onClick={() => openAttendanceModal('late')} disabled={loading} className="mt-5 w-full bg-blue-600 py-3 text-base font-semibold text-white hover:bg-blue-700">Anwesenheit nachbearbeiten</Button>}
      </div>

      {showCompletedActiveBanner && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 px-6 py-12 text-center shadow-sm">
          <Trophy className="h-32 w-32 text-amber-500" strokeWidth={1.25} aria-hidden="true" />
          <h3 className="mt-6 text-2xl font-bold text-slate-900">Runde {latestRound} ist abgeschlossen.</h3>
          <p className="mt-2 text-slate-600">Alle Ergebnisse wurden erfasst. Du kannst nun die nächste Runde vorbereiten.</p>
          {isAdmin && <Button onClick={() => openAttendanceModal('round')} disabled={loading} className="mt-6 px-6 py-3 text-base whitespace-nowrap">Runde {latestRound + 1} auslosen / starten</Button>}
        </div>
      )}

      {!showCompletedActiveBanner && selectedIsActive && <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <h3 className="font-bold">Freispiele (4 Pkt)</h3>
          <ul className="mt-2 list-disc pl-5 text-sm">{getSpecialStatusNames(freispielMatches).map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}{freispielMatches.length === 0 && <li className="list-none pl-0 text-emerald-700/70">Keine</li>}</ul>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-800">
          <h3 className="font-bold">Abgemeldet (1 Pkt)</h3>
          <ul className="mt-2 list-disc pl-5 text-sm">{getSpecialStatusNames(excusedMatches).map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}{excusedMatches.length === 0 && <li className="list-none pl-0 text-orange-700/70">Keine</li>}</ul>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <h3 className="font-bold">Unentschuldigt (0 Pkt)</h3>
          <ul className="mt-2 list-disc pl-5 text-sm">{getSpecialStatusNames(unexcusedMatches).map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}{unexcusedMatches.length === 0 && <li className="list-none pl-0 text-red-700/70">Keine</li>}</ul>
        </div>
      </div>}

      {!showCompletedActiveBanner && selectedMatches.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white py-10 text-center text-slate-500">
          Noch keine Partien für diese Runde gelost.
        </div>
      ) : !showCompletedActiveBanner ? (
        leagues.map((league) => (
          <section key={league}>
            <h3 className="mb-3 border-b pb-2 text-lg font-bold">Liga: {league}</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {regularMatches
                .filter((match) => (playerMap.get(match.weiss_id)?.gruppe || 'Leicht') === league)
                .map((match, index) => {
                  const white = playerMap.get(match.weiss_id);
                  const black = match.schwarz_id === null ? null : playerMap.get(match.schwarz_id);
                  return (
                    <div key={match.id} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-xs font-semibold text-slate-500">Brett {index + 1}</span>
                        <span className="text-xs text-slate-400">{match.datum || ''}</span>
                      </div>
                      <div className="mb-2 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold">{white?.name || 'Unbekannt'}</span>
                          <span>({white?.punkte ?? 0})</span>
                        </div>
                        <div className="text-center text-xs text-slate-400">vs</div>
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold">{black?.name || 'FREISPIEL'}</span>
                          <span>{black ? `(${black.punkte})` : '-'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedReadOnly && <LockKeyhole className="h-4 w-4 text-slate-400" aria-label="Schreibgeschützt" />}
                        <ErgebnisButtons partie={match} onSetErgebnis={onSetErgebnis} readOnly={selectedReadOnly || !isAdmin} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        ))
      ) : null}

      <AnwesenheitVorRundeModal
        open={attendanceMode !== null}
        title={attendanceMode === 'late' ? 'Anwesenheit anpassen' : absenceStep === 'classification' ? 'Fehlende Spieler klassifizieren' : `Anwesenheit für Runde ${round}`}
        confirmLabel={attendanceMode === 'late' ? 'Anwesenheit speichern' : absenceStep === 'classification' ? 'Auslosung endgültig starten' : 'Speichern & Auslosung starten'}
        players={spielerList}
        step={absenceStep}
        absentPlayers={absentPlayers}
        attendance={attendance}
        excused={excused}
        onToggle={(id, present) => setAttendance((current) => ({ ...current, [String(id)]: present }))}
        onSetAll={(present) => setAttendance(Object.fromEntries(spielerList.map((player) => [String(player.id), present])))}
        onToggleExcused={(id, isExcused) => setExcused((current) => ({ ...current, [String(id)]: isExcused }))}
        onClose={() => setAttendanceMode(null)}
        onConfirm={(confirmedAttendance, confirmedExcused) => handleAttendanceConfirm(confirmedAttendance, confirmedExcused)}
      />

      {attendanceDecision && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-xl space-y-5 rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="attendance-decision-title">
          <div><h3 id="attendance-decision-title" className="text-xl font-bold text-slate-900">Anwesenheit wurde geändert</h3><p className="mt-1 text-sm text-slate-600">Für diese Runde existieren bereits Partien. Wie sollen die Änderungen angewendet werden?</p></div>
          <div className="grid gap-3 md:grid-cols-2"><button type="button" onClick={() => void handleReroll()} className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-left hover:bg-amber-100"><span className="font-bold text-slate-900">Komplett neu auslosen</span><span className="mt-1 block text-sm text-slate-600">Alle Partien der Runde werden ersetzt und mit den aktuellen Anwesenden neu gelost.</span></button><button type="button" onClick={() => void handleSmartAdjustment()} className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4 text-left hover:bg-blue-100"><span className="font-bold text-slate-900">Intelligente Alternative finden</span><span className="mt-1 block text-sm text-slate-600">Freigewordene Gegner erhalten ein Freispiel oder werden mit Nachzüglern gepaart.</span></button></div>
          <div className="flex justify-end border-t pt-4"><button type="button" onClick={() => setAttendanceDecision(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Abbrechen</button></div>
        </div>
      </div>}

      {absenceClassification && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg space-y-5 rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="absence-classification-title">
          <div><h3 id="absence-classification-title" className="text-xl font-bold text-slate-900">Abwesenheit klassifizieren</h3><p className="mt-1 text-sm text-slate-600">War der Spieler entschuldigt abgemeldet?</p></div>
          <div className="space-y-3">{absenceClassification.players.map((player) => <div key={player.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3"><span className="font-medium text-slate-800">{player.name}</span><div className="flex gap-2"><button type="button" onClick={() => setAbsenceStatuses((current) => ({ ...current, [String(player.id)]: 'entschuldigt' }))} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${absenceStatuses[String(player.id)] === 'entschuldigt' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'}`}>Ja, entschuldigt</button><button type="button" onClick={() => setAbsenceStatuses((current) => ({ ...current, [String(player.id)]: 'unentschuldigt' }))} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${absenceStatuses[String(player.id)] === 'unentschuldigt' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Nein</button></div></div>)}</div>
          <div className="flex justify-end gap-3 border-t pt-4"><button type="button" onClick={() => setAbsenceClassification(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Abbrechen</button><Button type="button" onClick={() => void confirmAbsenceClassification()}>Anwesenheit speichern</Button></div>
        </div>
      </div>}

      {nachauslosungen.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl space-y-5 rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="nachauslosung-title">
            <div>
              <h3 id="nachauslosung-title" className="text-xl font-bold text-slate-900">Nachauslosung für Nachzügler</h3>
              <p className="mt-1 text-sm text-slate-500">Bestehende Partien bleiben unverändert. Es wird nur eine zusätzliche Partie angelegt.</p>
            </div>
            <div className="space-y-3">
              {nachauslosungen.map((option) => <button key={option.id} type="button" onClick={() => setSelectedNachauslosung(option)} className={`w-full rounded-xl border-2 p-4 text-left ${selectedNachauslosung?.id === option.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}><span className="font-bold text-slate-900">{option.titel}</span><span className="mt-1 block text-sm text-slate-600">{option.beschreibung}</span></button>)}
            </div>
            <div className="flex justify-end gap-3 border-t pt-4"><button type="button" onClick={() => { setNachauslosungen([]); setSelectedNachauslosung(null); }} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Ablehnen</button><Button type="button" onClick={() => void fuehreNachauslosungAus()}>Ausgewählte Partie anlegen</Button></div>
          </div>
        </div>
      )}

      {/* Modal mit Detail-Vorschau & Namensbegründungen */}
      {vorschlaege.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl space-y-5 rounded-2xl bg-white p-6 shadow-2xl">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Auslosungs-Optionen für ungerade Ligen</h3>
              <p className="text-xs text-slate-500 mt-1">
                Wähle eine Variante. Der Algorithmus hat Namens-Zuordnungen & Farb-Ausgleiche vorausberechnet:
              </p>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {vorschlaege.map((v) => {
                const isSelected = selectedVorschlag?.id === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVorschlag(v)}
                    className={`cursor-pointer rounded-xl border-2 p-4 transition ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-400'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`h-5 w-5 ${isSelected ? 'text-amber-600' : 'text-slate-300'}`} />
                        <span className="font-bold text-slate-900">{v.titel}</span>
                      </div>
                      {v.empfohlen && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                          Empfohlen
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 mb-3">{v.beschreibung}</p>

                    {/* Detaillierte Vorschau der Namenspaarungen */}
                    <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 space-y-2">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Info className="h-3.5 w-3.5 text-amber-600" />
                        Berechnete Schlüssel-Duelle & Begründungen:
                      </div>

                      {v.paarungen.map((p, idx) => (
                        <div key={idx} className="bg-white rounded p-2.5 border border-slate-200 text-xs space-y-1">
                          <div className="flex justify-between font-semibold text-slate-800">
                            <span>
                              ⚪ {p.weissName} <span className="text-slate-400 font-normal">vs.</span> {p.schwarzName ? `⚫ ${p.schwarzName}` : '❌ (Spielfrei)'}
                            </span>
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{p.liga}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 italic bg-amber-50/60 p-1.5 rounded border border-amber-100">
                            💡 {p.begruendung}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end space-x-3 border-t pt-4">
              <button
                onClick={() => setVorschlaege([])}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 font-medium"
              >
                Abbrechen
              </button>
              <button
                onClick={() => fuehreAuslosungAus(selectedVorschlag)}
                className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 shadow-md hover:bg-amber-600 transition"
              >
                Runde mit dieser Variante auslosen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}