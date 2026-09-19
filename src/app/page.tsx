'use client';

import { useEffect, useMemo, useState } from 'react';
import { History, Settings, Swords, Trophy, User } from 'lucide-react';
import { AktuelleRunde } from '@/components/turnier/AktuelleRunde';
import { Einstellungen } from '@/components/turnier/Einstellungen';
import { Rangliste } from '@/components/turnier/Rangliste';
import { SpielerVerwaltung } from '@/components/turnier/SpielerVerwaltung';
import { VergangeneRunden } from '@/components/turnier/VergangeneRunden';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { deleteAllRows, deleteRow, fetchRows, insertRows, insertSpieler, updateRow, upsertRows } from '@/lib/supabase';
import { calculateRankings, generatePairings } from '@/services/tournamentLogic';
import type { AuslosungVorschlag, EntityId, MatchResult, Partie, Spieler, StatusMessage, TabId, TurnierLiga } from '@/types';

const leagues: TurnierLiga[] = [
  { id: 'schwer', name: 'Schwer', reihenfolge: 1 },
  { id: 'mittel', name: 'Mittel', reihenfolge: 2 },
  { id: 'leicht', name: 'Leicht', reihenfolge: 3 },
];

const tabs: TabItem[] = [
  { id: 'aktuelle-runde', icon: Swords, label: 'Aktuelle Runde' },
  { id: 'vergangene-runden', icon: History, label: 'Vergangene Runden' },
  { id: 'tabelle', icon: Trophy, label: 'Rangliste' },
  { id: 'spieler', icon: User, label: 'Spieler' },
  { id: 'einstellungen', icon: Settings, label: 'Einstellungen' },
];

type AbsenceStatus = 'entschuldigt' | 'unentschuldigt';

export default function SchachturnierApp() {
  const [role, setRole] = useState<'visitor' | 'admin' | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState('');
  const [players, setPlayers] = useState<Spieler[]>([]);
  const [matches, setMatches] = useState<Partie[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [activeTab, setActiveTab] = useState<TabId>('aktuelle-runde');
  const [loading, setLoading] = useState(true);
  const [resetPassword, setResetPassword] = useState('');
  const [resetMessage, setResetMessage] = useState<StatusMessage | null>(null);
  const isAdmin = role === 'admin';

  const loadData = async () => {
    setLoading(true);
    try {
      const [loadedPlayers, loadedMatches] = await Promise.all([fetchRows<Spieler>('spieler'), fetchRows<Partie>('partien')]);
      setMatches(loadedMatches);
      setPlayers(calculateRankings(loadedPlayers, loadedMatches));
      setCurrentRound(loadedMatches.reduce((max, match) => Math.max(max, match.runde), 1));
    } catch (error) {
      setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Verbindungsfehler beim Laden.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const playerMap = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const currentMatches = useMemo(() => matches.filter((match) => match.runde === currentRound), [matches, currentRound]);
  const pastMatches = useMemo(() => matches.filter((match) => match.runde < currentRound), [matches, currentRound]);
  const rankings = useMemo(() => calculateRankings(players, matches), [players, matches]);

  const setResult = async (matchId: EntityId, result: Exclude<MatchResult, null>) => {
    if (!isAdmin) return;
    const updatedMatches = matches.map((match) => match.id === matchId ? { ...match, ergebnis: result, status: 'beendet' as const } : match);
    setMatches(updatedMatches);
    const updatedPlayers = calculateRankings(players, updatedMatches);
    setPlayers(updatedPlayers);
    try {
      await updateRow<Partie>('partien', { ergebnis: result, status: 'beendet' }, matchId);
      await Promise.all(updatedPlayers.map((player) => updateRow<Spieler>('spieler', { punkte: player.punkte, buchholz: player.buchholz }, player.id)));
    } catch (error) {
      setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Ergebnis konnte nicht gespeichert werden.' });
    }
  };

  const createNextRound = async (_proposal?: AuslosungVorschlag | null, playersForRound: Spieler[] = players, absenceResults: Record<string, AbsenceStatus> = {}) => {
    if (!isAdmin || currentMatches.some((match) => match.status === 'offen')) return;
    const nextRound = matches.reduce((max, match) => Math.max(max, match.runde), 0) + 1;
    const date = new Date().toLocaleDateString('de-DE');
    const pairings = generatePairings(playersForRound, { round: nextRound, date, strategy: 'swiss', leagues });
    const absenceMatches: Omit<Partie, 'id'>[] = Object.entries(absenceResults).map(([playerId, result]) => ({
      runde: nextRound, datum: date, weiss_id: playersForRound.find((player) => String(player.id) === playerId)?.id ?? playerId,
      schwarz_id: null, ergebnis: result, status: 'beendet',
    }));
    if (!pairings.length && !absenceMatches.length) return;
    setLoading(true);
    try {
      const inserted = await insertRows<Partie>('partien', [...absenceMatches, ...pairings]);
      setMatches((current) => [...current, ...inserted]);
      setCurrentRound(nextRound);
    } catch (error) {
      setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Fehler beim Erstellen der Runde.' });
    } finally { setLoading(false); }
  };

  const addPlayer = async (input: Omit<Spieler, 'id'>) => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const createdPlayer = await insertSpieler(input);
      setPlayers((current) => [...current, createdPlayer]);
    }
    catch (error) { setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Spieler konnte nicht angelegt werden.' }); }
    finally { setLoading(false); }
  };

  const updatePlayer = async (id: EntityId, updates: Partial<Spieler>) => {
    if (!isAdmin) return;
    setPlayers((current) => current.map((player) => player.id === id ? { ...player, ...updates } : player));
    try { await updateRow<Spieler>('spieler', updates, id); }
    catch (error) { setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Spielerdaten konnten nicht gespeichert werden.' }); }
  };

  const removePlayer = async (id: EntityId) => {
    if (!isAdmin) return;
    try { await deleteRow('spieler', id); setPlayers((current) => current.filter((player) => player.id !== id)); }
    catch (error) { setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Spieler konnte nicht entfernt werden.' }); }
  };

  const saveAttendance = async (attendance: Record<string, boolean>): Promise<Spieler[]> => {
    if (!isAdmin) return players;
    const updatedPlayers = players.map((player) => attendance[String(player.id)] === undefined ? player : { ...player, anwesend: attendance[String(player.id)] });
    try {
      await Promise.all(updatedPlayers.filter((player, index) => player.anwesend !== players[index]?.anwesend).map((player) => updateRow<Spieler>('spieler', { anwesend: player.anwesend }, player.id)));
      setPlayers(updatedPlayers);
      return updatedPlayers;
    } catch (error) { setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Anwesenheit konnte nicht gespeichert werden.' }); throw error; }
  };

  const addLateMatch = async (partie: Omit<Partie, 'id'>, replaceMatchId?: EntityId, removeMatchIds: EntityId[] = []) => {
    if (!isAdmin) return;
    try {
      await Promise.all(removeMatchIds.map((id) => deleteRow('partien', id)));
      if (replaceMatchId !== undefined) {
        await updateRow<Partie>('partien', { schwarz_id: partie.schwarz_id, ergebnis: partie.ergebnis, status: partie.status, isCompleted: false }, replaceMatchId);
        setMatches((current) => current.filter((match) => !removeMatchIds.includes(match.id)).map((match) => match.id === replaceMatchId ? { ...match, ...partie, id: match.id } : match));
      } else {
        const [created] = await insertRows<Partie>('partien', [partie]);
        if (created) setMatches((current) => [...current.filter((match) => !removeMatchIds.includes(match.id)), created]);
      }
    } catch (error) { setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Nachauslosung konnte nicht gespeichert werden.' }); }
  };

  const completeRound = async (round: number) => {
    if (!isAdmin) return;
    const roundMatches = matches.filter((match) => match.runde === round);
    await Promise.all(roundMatches.map((match) => updateRow<Partie>('partien', { isCompleted: true }, match.id)));
    setMatches((current) => current.map((match) => match.runde === round ? { ...match, isCompleted: true } : match));
  };

  const deleteRound = async (round: number) => {
    if (!isAdmin || !window.confirm(`Runde ${round} wirklich löschen?`)) return;
    const roundMatches = matches.filter((match) => match.runde === round);
    try {
      await Promise.all(roundMatches.map((match) => deleteRow('partien', match.id)));
      const followingMatches = matches.filter((match) => match.runde > round);
      await Promise.all(followingMatches.map((match) => updateRow<Partie>('partien', { runde: match.runde - 1 }, match.id)));
      setMatches((current) => current.filter((match) => match.runde !== round).map((match) => match.runde > round ? { ...match, runde: match.runde - 1 } : match));
      setCurrentRound((current) => Math.max(1, current - (current > round ? 1 : 0)));
    } catch (error) { setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Runde konnte nicht gelöscht werden.' }); }
  };

  const rerollCurrentRound = async (playersForRound: Spieler[]) => {
    if (!isAdmin) return;
    const old = matches.filter((match) => match.runde === currentRound);
    const pairings = generatePairings(playersForRound, { round: currentRound, date: new Date().toLocaleDateString('de-DE'), strategy: 'swiss', leagues });
    await Promise.all(old.map((match) => deleteRow('partien', match.id)));
    const inserted = await insertRows<Partie>('partien', pairings);
    setMatches((current) => [...current.filter((match) => match.runde !== currentRound), ...inserted]);
  };

  const smartAdjustRound = async (previousPlayers: Spieler[], updatedPlayers: Spieler[], statuses: Record<string, AbsenceStatus> = {}) => {
    if (!isAdmin) return;
    const current = matches.filter((match) => match.runde === currentRound);
    const removed = new Set(updatedPlayers.filter((player) => previousPlayers.find((old) => old.id === player.id)?.anwesend && !player.anwesend).map((player) => player.id));
    const added = updatedPlayers.filter((player) => !previousPlayers.find((old) => old.id === player.id)?.anwesend && player.anwesend);
    const next = new Map(current.map((match) => [String(match.id), match]));
    for (const match of current) {
      if (match.ergebnis === 'entschuldigt' || match.ergebnis === 'unentschuldigt') continue;
      const removedPlayer = removed.has(match.weiss_id) ? match.weiss_id : match.schwarz_id !== null && removed.has(match.schwarz_id) ? match.schwarz_id : null;
      if (removedPlayer === null) continue;
      const opponent = removedPlayer === match.weiss_id ? match.schwarz_id : match.weiss_id;
      if (opponent === null) { await deleteRow('partien', match.id); next.delete(String(match.id)); }
      else { const replacement = { ...match, weiss_id: opponent, schwarz_id: null, ergebnis: 'freispiel' as const, status: 'beendet' as const }; await updateRow<Partie>('partien', { weiss_id: opponent, schwarz_id: null, ergebnis: 'freispiel', status: 'beendet' }, match.id); next.set(String(match.id), replacement); }
    }
    for (const player of updatedPlayers.filter((candidate) => !candidate.anwesend)) {
      const result = statuses[String(player.id)] ?? 'unentschuldigt';
      const existing = current.find((match) => match.weiss_id === player.id && (match.ergebnis === 'entschuldigt' || match.ergebnis === 'unentschuldigt'));
      if (existing) { await updateRow<Partie>('partien', { ergebnis: result, status: 'beendet', schwarz_id: null }, existing.id); next.set(String(existing.id), { ...existing, ergebnis: result, status: 'beendet', schwarz_id: null }); }
      else { const [created] = await insertRows<Partie>('partien', [{ runde: currentRound, datum: new Date().toLocaleDateString('de-DE'), weiss_id: player.id, schwarz_id: null, ergebnis: result, status: 'beendet' }]); if (created) next.set(String(created.id), created); }
    }
    for (const player of added) {
      const [created] = await insertRows<Partie>('partien', [{ runde: currentRound, datum: new Date().toLocaleDateString('de-DE'), weiss_id: player.id, schwarz_id: null, ergebnis: 'freispiel', status: 'beendet' }]);
      if (created) next.set(String(created.id), created);
    }
    setMatches((currentMatches) => [...currentMatches.filter((match) => match.runde !== currentRound), ...next.values()]);
  };

  const resetSeason = async () => {
    if (!isAdmin || resetPassword.trim().toLowerCase() !== 'schachturnier') { if (isAdmin) setResetMessage({ type: 'error', text: "Bitte gib exakt 'Schachturnier' ein, um das Zurücksetzen zu bestätigen." }); return; }
    setLoading(true);
    try { await deleteAllRows('partien'); await Promise.all(players.map((player) => updateRow<Spieler>('spieler', { punkte: 0, buchholz: 0, anwesend: true }, player.id))); setPlayers(players.map((player) => ({ ...player, punkte: 0, buchholz: 0, anwesend: true }))); setMatches([]); setCurrentRound(1); setResetPassword(''); setResetMessage({ type: 'success', text: 'Saison zurückgesetzt!' }); }
    catch (error) { setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Fehler beim Zurücksetzen.' }); }
    finally { setLoading(false); }
  };

  const exportData = () => { const blob = new Blob([JSON.stringify({ spieler: players, partien: matches }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `vereinsmeisterschaft-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); };
  const importData = async (file: File) => { try { const imported = JSON.parse(await file.text()) as { spieler?: Spieler[]; partien?: Partie[] }; if (!Array.isArray(imported.spieler) || !Array.isArray(imported.partien)) throw new Error('Ungültiges Exportformat.'); const [loadedPlayers, loadedMatches] = await Promise.all([upsertRows<Spieler>('spieler', imported.spieler), upsertRows<Partie>('partien', imported.partien)]); setPlayers(calculateRankings(loadedPlayers, loadedMatches)); setMatches(loadedMatches); setCurrentRound(loadedMatches.reduce((max, match) => Math.max(max, match.runde), 1)); } catch (error) { setResetMessage({ type: 'error', text: error instanceof Error ? error.message : 'Import fehlgeschlagen.' }); } };

  if (!role) return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Trophy className="mx-auto h-16 w-16 text-amber-500" /><h1 className="mt-4 text-2xl font-bold text-slate-900">Vereinsmeisterschaft</h1><p className="mt-2 text-sm text-slate-500">Wähle den Zugriffsmodus.</p><div className="mt-6 grid gap-3"><button type="button" onClick={() => setRole('visitor')} className="rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50">Besucher</button><button type="button" onClick={() => setRole('admin')} className="rounded-lg bg-slate-800 px-4 py-3 font-semibold text-white hover:bg-slate-700">Admin</button></div></section></main>;

  const visibleTabs = tabs.filter((tab) => isAdmin || tab.id !== 'einstellungen');
  return <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800"><header className="sticky top-0 z-50 bg-slate-800 text-white shadow-md"><div className="mx-auto flex max-w-6xl items-center px-4 py-4"><div className="rounded-lg bg-amber-500 p-2 text-slate-900"><Trophy className="h-6 w-6" /></div><h1 className="ml-3 text-xl font-bold">Vereinsmeisterschaft</h1></div><Tabs items={visibleTabs.map((tab) => tab.id === 'aktuelle-runde' ? { ...tab, label: `Runde ${currentRound} der Vereinsmeisterschaft` } : tab)} activeTab={activeTab} onChange={setActiveTab} /></header><main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{activeTab === 'aktuelle-runde' && <AktuelleRunde key={`${currentRound}-${matches.length}`} round={currentRound} matches={currentMatches} allMatches={matches} spielerList={players} playerMap={playerMap} isAdmin={isAdmin} onNextRound={(proposal, playersForRound, absenceResults) => void createNextRound(proposal, playersForRound, absenceResults)} onSetErgebnis={(id, result) => void setResult(id, result)} onSaveAttendance={saveAttendance} onAddLateMatch={addLateMatch} onCompleteRound={completeRound} onRerollRound={rerollCurrentRound} onSmartAdjustRound={(previous, updated) => smartAdjustRound(previous, updated)} onClassifyAbsences={(previous, updated, statuses) => smartAdjustRound(previous, updated, statuses)} loading={loading} />}{activeTab === 'vergangene-runden' && <VergangeneRunden matches={pastMatches} playerMap={playerMap} isAdmin={isAdmin} onSetErgebnis={(id, result) => void setResult(id, result)} onDeleteRound={(round) => void deleteRound(round)} />}{activeTab === 'tabelle' && <Rangliste players={rankings} leagues={leagues} />}{activeTab === 'spieler' && <SpielerVerwaltung spielerList={players} allMatches={matches} playerMap={playerMap} isAdmin={isAdmin} onAddSpieler={(input) => void addPlayer(input)} onRemoveSpieler={(id) => void removePlayer(id)} onUpdateSpieler={(id, updates) => void updatePlayer(id, updates)} />}{activeTab === 'einstellungen' && isAdmin && <Einstellungen password={resetPassword} message={resetMessage} loading={loading} onPasswordChange={setResetPassword} onReset={() => void resetSeason()} onExport={exportData} onImport={(file) => void importData(file)} />}</main></div>;
}
